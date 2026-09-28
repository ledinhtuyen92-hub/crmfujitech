import hmac
import hashlib
import time
import requests
from typing import List, Dict, Any, Tuple
from datetime import datetime
import uuid
from django.conf import settings

from .base import BasePlatformAdapter
from .capabilities import Capability
from .events import LiveCommentEvent
from .exceptions import CapabilityNotSupportedError, PlatformAuthError, PlatformAPIError, PlatformRateLimitError
from ..models import PlatformAccount, LivePlatformProduct, LiveSession

SHOPEE_HOST = getattr(settings, 'SHOPEE_API_HOST', 'https://partner.test-stable.shopeemobile.com')
SHOPEE_PARTNER_ID = getattr(settings, 'SHOPEE_PARTNER_ID', '')
SHOPEE_PARTNER_KEY = getattr(settings, 'SHOPEE_PARTNER_KEY', '')

class ShopeeClient:
    """Raw HTTP Client for Shopee API v2"""
    
    def __init__(self, shop_id: str, access_token: str):
        self.shop_id = int(shop_id)
        self.access_token = access_token
        self.partner_id = int(SHOPEE_PARTNER_ID) if SHOPEE_PARTNER_ID else 0
        self.partner_key = SHOPEE_PARTNER_KEY

    def _generate_sign(self, path: str, timestamp: int) -> str:
        base_string = f"{self.partner_id}{path}{timestamp}{self.access_token}{self.shop_id}"
        return hmac.new(
            self.partner_key.encode('utf-8'),
            base_string.encode('utf-8'),
            hashlib.sha256
        ).hexdigest()

    def request(self, method: str, path: str, params: dict = None, json: dict = None) -> dict:
        if not params:
            params = {}
            
        timestamp = int(time.time())
        sign = self._generate_sign(path, timestamp)
        
        # Inject standard auth params
        params['partner_id'] = self.partner_id
        params['shop_id'] = self.shop_id
        params['timestamp'] = timestamp
        params['access_token'] = self.access_token
        params['sign'] = sign
        
        url = f"{SHOPEE_HOST}{path}"
        
        try:
            res = requests.request(method, url, params=params, json=json, timeout=10)
        except requests.RequestException as e:
            raise PlatformAPIError(f"Network error: {str(e)}")
            
        if res.status_code == 429:
            raise PlatformRateLimitError("Shopee API rate limit exceeded")
            
        data = res.json()
        
        # Shopee error normalization
        if data.get("error"):
            error_code = data.get("error")
            message = data.get("message", "")
            
            if error_code in ["error_auth", "error_token", "error_param"]:
                raise PlatformAuthError(f"Auth error: {message}")
            raise PlatformAPIError(f"Shopee error {error_code}: {message}")
            
        return data


class ShopeeAdapter(BasePlatformAdapter):
    """
    Adapter for Shopee Platform.
    Provides normalized capabilities for account and product read.
    """
    
    def __init__(self, company_id: int):
        super().__init__(company_id)
        self._client = None
        self._account = None

    def get_capabilities(self) -> List[Capability]:
        return [
            Capability.AUTH,
            Capability.PRODUCT_READ,
            Capability.PRODUCT_MAPPING,
            Capability.LIVE_START,
            Capability.LIVE_STATUS,
            Capability.LIVE_STOP,
            Capability.PRODUCT_ATTACH,
            Capability.LIVE_COMMENTS
        ]

    def _init_client(self):
        if self._client:
            return
            
        # Get active platform account for this company
        account = PlatformAccount.objects.filter(
            company_id=self.company_id, 
            platform=LivePlatformProduct.PLATFORM_SHOPEE,
            status='connected'
        ).first()
        
        if not account:
            raise PlatformAuthError("No connected Shopee account found for this company")
            
        access_token = account.get_decrypted_access_token()
        if not access_token:
            raise PlatformAuthError("Invalid access token in database")
            
        self._account = account
        self._client = ShopeeClient(account.account_id, access_token)

    def get_account(self) -> Dict[str, Any]:
        self._check_capability(Capability.AUTH)
        self._init_client()
        
        data = self._client.request("GET", "/api/v2/shop/get_shop_info")
        
        return {
            "external_shop_id": str(self._account.account_id),
            "name": data.get("response", {}).get("shop_name", "Shopee Shop"),
            "status": "connected",
            "metadata": {
                "region": data.get("response", {}).get("region")
            }
        }

    def get_products(self) -> List[Dict[str, Any]]:
        self._check_capability(Capability.PRODUCT_READ)
        self._init_client()
        
        # 1. Fetch item list
        list_params = {
            "offset": 0,
            "page_size": 50,
            "item_status": "NORMAL"
        }
        
        list_data = self._client.request("GET", "/api/v2/product/get_item_list", params=list_params)
        response_data = list_data.get("response", {})
        item_list = response_data.get("item", [])
        
        if not item_list:
            return []
            
        item_ids = [item["item_id"] for item in item_list]
        
        # 2. Fetch item base info for these IDs
        info_params = {
            "item_id_list": ",".join(map(str, item_ids))
        }
        
        info_data = self._client.request("GET", "/api/v2/product/get_item_base_info", params=info_params)
        items_info = info_data.get("response", {}).get("item_list", [])
        
        normalized_products = []
        for item in items_info:
            # Note: For simplicity in MVP, we just take the item level price/stock,
            # ignoring has_model complexity for now.
            price_info = item.get("price_info", [{}])[0]
            stock_info = item.get("stock_info", [{}])[0]
            
            normalized_products.append({
                "external_product_id": str(item.get("item_id")),
                "name": item.get("item_name"),
                "status": item.get("item_status"),
                "price": price_info.get("original_price", 0),
                "currency": price_info.get("currency", "VND"),
                "stock": stock_info.get("normal_stock", 0),
                "sku": item.get("item_sku", ""),
                "models": [],
                "metadata": {
                    "has_model": item.get("has_model", False)
                }
            })
            
        return normalized_products

    def map_product(self, product_id: str) -> str:
        # Mapping logic should be handled by a dedicated service, not directly by the adapter's network client,
        # but the adapter exposes the capability to list them.
        self._check_capability(Capability.PRODUCT_MAPPING)
        raise NotImplementedError("Product mapping should be done via CRM models")

    def _get_live_session(self, session_id: str) -> LiveSession:
        try:
            return LiveSession.objects.get(id=session_id, company_id=self.company_id)
        except LiveSession.DoesNotExist:
            raise PlatformAPIError("LiveSession not found or permission denied")

    def start_live(self, session_id: str) -> Dict[str, Any]:
        self._check_capability(Capability.LIVE_START)
        session = self._get_live_session(session_id)
        self._init_client()
        
        # In a real MVP, we might want to allow some title/description input,
        # but for now we create a basic session.
        payload = {
            "title": f"Fujitech AI Live {session_id}",
            "description": "Livestream from Fujitech AI",
            # Shopee may require cover image etc., this is a basic payload based on audit
        }
        
        data = self._client.request("POST", "/api/v2/livestream/start_session", json=payload)
        response_data = data.get("response", {})
        
        external_session_id = response_data.get("session_id")
        stream_url = response_data.get("push_url")
        
        if not external_session_id:
            raise PlatformAPIError("Missing session_id in Shopee start_session response")
            
        session.external_session_id = str(external_session_id)
        if stream_url:
            session.stream_url = stream_url
        session.save(update_fields=['external_session_id', 'stream_url'])
        
        return {
            "external_session_id": str(external_session_id),
            "stream_url": stream_url
        }

    def get_live_status(self, session_id: str) -> str:
        self._check_capability(Capability.LIVE_STATUS)
        session = self._get_live_session(session_id)
        
        if not session.external_session_id:
            raise PlatformAPIError("Cannot get status: external_session_id is missing")
            
        self._init_client()
        params = {"session_id": session.external_session_id}
        
        data = self._client.request("GET", "/api/v2/livestream/get_session_detail", params=params)
        status_str = data.get("response", {}).get("status", "").upper()
        
        # Normalize status
        if status_str in ["INIT", "PREPARING"]:
            return LiveSession.STATUS_READY
        elif status_str in ["LIVING", "ONGOING", "RUNNING"]:
            return LiveSession.STATUS_RUNNING
        elif status_str in ["END", "STOPPED"]:
            return LiveSession.STATUS_STOPPED
        else:
            return LiveSession.STATUS_ERROR

    def stop_live(self, session_id: str) -> bool:
        self._check_capability(Capability.LIVE_STOP)
        session = self._get_live_session(session_id)
        
        if not session.external_session_id:
            raise PlatformAPIError("Cannot stop live: external_session_id is missing")
            
        self._init_client()
        payload = {"session_id": session.external_session_id}
        
        self._client.request("POST", "/api/v2/livestream/end_session", json=payload)
        return True

    def attach_product_to_live(self, session_id: str, platform_product_id: str) -> bool:
        self._check_capability(Capability.PRODUCT_ATTACH)
        session = self._get_live_session(session_id)
        
        if not session.external_session_id:
            raise PlatformAPIError("Cannot attach product: external_session_id is missing")
            
        # Verify the platform_product_id actually belongs to this company
        mapping_exists = LivePlatformProduct.objects.filter(
            company_id=self.company_id,
            platform=LivePlatformProduct.PLATFORM_SHOPEE,
            platform_product_id=platform_product_id,
            is_active=True
        ).exists()
        
        if not mapping_exists:
            raise PlatformAPIError("Cannot attach product: invalid or unauthorized product mapping")
            
        self._init_client()
        
        payload = {
            "session_id": session.external_session_id,
            "item_id": platform_product_id,
            # "visible": True/False etc depending on Shopee spec, MVP just adds it
        }
        
        self._client.request("POST", "/api/v2/livestream/update_show_item", json=payload)
        return True

    def get_comments(self, session_id: str, offset: int = 0) -> Tuple[List[LiveCommentEvent], bool]:
        self._check_capability(Capability.LIVE_COMMENTS)
        session = self._get_live_session(session_id)
        
        if not session.external_session_id:
            raise PlatformAPIError("Cannot get comments: external_session_id is missing")
            
        self._init_client()
        params = {
            "session_id": session.external_session_id,
            "offset": offset
        }
        
        data = self._client.request("GET", "/api/v2/livestream/get_latest_comment_list", params=params)
        response_data = data.get("response", {})
        
        comment_list = response_data.get("comment_list", [])
        has_more = response_data.get("has_more", False)
        
        normalized_comments = []
        for c in comment_list:
            timestamp = c.get("comment_time")
            if timestamp:
                dt = datetime.fromtimestamp(timestamp)
            else:
                dt = datetime.now()
                
            event = LiveCommentEvent(
                event_id=str(uuid.uuid4()),
                company_id=self.company_id,
                session_id=str(session.id),
                platform=LivePlatformProduct.PLATFORM_SHOPEE,
                platform_comment_id=str(c.get("comment_id")),
                user_id=str(c.get("user_id")),
                display_name=c.get("user_name", "Unknown"),
                text=c.get("comment_content", ""),
                created_at=dt
            )
            normalized_comments.append(event)
            
        return normalized_comments, has_more

