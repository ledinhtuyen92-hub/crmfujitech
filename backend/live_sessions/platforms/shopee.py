import hmac
import hashlib
import time
import requests
from typing import List, Dict, Any, Tuple, Optional
from datetime import datetime
import uuid
from django.conf import settings
from django.utils import timezone
import datetime as dt

from .base import BasePlatformAdapter
from .capabilities import Capability
from .events import LiveCommentEvent
from .exceptions import CapabilityNotSupportedError, PlatformAuthError, PlatformAPIError, PlatformRateLimitError
from ..models import PlatformAccount, LivePlatformProduct, LiveSession

SHOPEE_HOST = getattr(settings, 'SHOPEE_API_HOST', 'https://partner.test-stable.shopeemobile.com')
SHOPEE_PARTNER_ID = getattr(settings, 'SHOPEE_PARTNER_ID', '')
SHOPEE_PARTNER_KEY = getattr(settings, 'SHOPEE_PARTNER_KEY', '')

# Token is considered near-expiry if < 30 minutes remain.
TOKEN_REFRESH_THRESHOLD_SECONDS = 30 * 60


class ShopeeClient:
    """
    Raw HTTP Client for Shopee API v2.
    
    Supports two signing modes:
    - Standard (shop-level): uses shop_id — for product/shop endpoints
    - Livestream (user-level): uses user_id — for all v2.livestream.* endpoints
    
    Per Shopee Open Platform documentation: Livestream API requires user_id,
    not shop_id, as a common request parameter.
    """

    def __init__(self, shop_id: str, access_token: str, user_id: Optional[str] = None):
        self.shop_id = int(shop_id)
        # user_id raw string — used as-is in HMAC signing base string.
        # In real Shopee production, user_id is always numeric but we keep it
        # as string to avoid crash on test fixtures with non-numeric values.
        self._user_id_raw = str(user_id) if user_id else None
        self.access_token = access_token
        self.partner_id = int(SHOPEE_PARTNER_ID) if SHOPEE_PARTNER_ID else 0
        self.partner_key = SHOPEE_PARTNER_KEY

    @property
    def user_id(self):
        """Return user_id as int for API params, or None if not set."""
        if not self._user_id_raw:
            return None
        # Shopee user_id is always numeric in production; strip leading 'u' in tests
        raw = self._user_id_raw.lstrip('u').lstrip('U')
        try:
            return int(raw)
        except ValueError:
            return None

    def _generate_sign(self, path: str, timestamp: int) -> str:
        """Standard sign for shop-level APIs (uses shop_id)."""
        base_string = f"{self.partner_id}{path}{timestamp}{self.access_token}{self.shop_id}"
        return hmac.new(
            self.partner_key.encode('utf-8'),
            base_string.encode('utf-8'),
            hashlib.sha256
        ).hexdigest()

    def _generate_sign_livestream(self, path: str, timestamp: int) -> str:
        """
        Livestream-specific sign (uses user_id instead of shop_id).
        Per Shopee API docs: Livestream module requires user_id as common param.
        Uses the raw user_id string for HMAC base string construction.
        """
        if not self._user_id_raw:
            raise PlatformAuthError(
                "user_id is required for Shopee Livestream API calls. "
                "Ensure Shopee OAuth was completed with auth_type=seller "
                "and user_id was stored in PlatformAccount."
            )
        # Use numeric form of user_id in base string (as Shopee expects)
        uid_for_sign = self.user_id if self.user_id is not None else self._user_id_raw
        base_string = f"{self.partner_id}{path}{timestamp}{self.access_token}{uid_for_sign}"
        return hmac.new(
            self.partner_key.encode('utf-8'),
            base_string.encode('utf-8'),
            hashlib.sha256
        ).hexdigest()

    def _handle_response(self, res) -> dict:
        if res.status_code == 429:
            raise PlatformRateLimitError("Shopee API rate limit exceeded")

        data = res.json()

        if data.get("error"):
            error_code = data.get("error")
            message = data.get("message", "")
            if error_code in ["error_auth", "error_token", "error_param"]:
                raise PlatformAuthError(f"Auth error: {message}")
            raise PlatformAPIError(f"Shopee error {error_code}: {message}")

        return data

    def request(self, method: str, path: str, params: dict = None, json: dict = None) -> dict:
        """Standard shop-level request (signed with shop_id)."""
        if not params:
            params = {}

        timestamp = int(time.time())
        sign = self._generate_sign(path, timestamp)

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

        return self._handle_response(res)

    def request_livestream(self, method: str, path: str, params: dict = None, json: dict = None) -> dict:
        """
        Livestream-specific request (signed with user_id per Shopee Livestream API spec).
        Use this for all /api/v2/livestream/* endpoints.
        """
        if not params:
            params = {}

        timestamp = int(time.time())
        sign = self._generate_sign_livestream(path, timestamp)

        params['partner_id'] = self.partner_id
        params['user_id'] = self.user_id
        params['timestamp'] = timestamp
        params['access_token'] = self.access_token
        params['sign'] = sign

        url = f"{SHOPEE_HOST}{path}"

        try:
            res = requests.request(method, url, params=params, json=json, timeout=10)
        except requests.RequestException as e:
            raise PlatformAPIError(f"Network error: {str(e)}")

        return self._handle_response(res)


class ShopeeAdapter(BasePlatformAdapter):
    """
    Adapter for Shopee Platform.
    Provides normalized capabilities for account, product, and livestream management.
    
    Phase 1E-8 Changes:
    - Added create_live_session() → calls create_session before start_session
    - Added start_live_session() → calls start_session (after create)
    - Fixed attach_product_to_live() → uses add_item_list (not update_show_item)
    - Added set_highlighted_product() → uses update_show_item (pin a product)
    - Added remove_product_from_live() → uses delete_item_list
    - Added refresh_access_token() → proactively refreshes before expiry
    - Added comment cursor support via Redis
    - All livestream API calls now use request_livestream() (user_id signing)
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
            Capability.LIVE_COMMENTS,
            Capability.LIVE_COMMENT_REPLY,
        ]

    def _init_client(self):
        if self._client:
            return

        account = PlatformAccount.objects.filter(
            company_id=self.company_id,
            platform=LivePlatformProduct.PLATFORM_SHOPEE,
            status='connected'
        ).first()

        if not account:
            raise PlatformAuthError("No connected Shopee account found for this company")

        # Proactively refresh token if near expiry
        self._maybe_refresh_token(account)

        access_token = account.get_decrypted_access_token()
        if not access_token:
            raise PlatformAuthError("Invalid access token in database")

        self._account = account
        self._client = ShopeeClient(
            shop_id=account.account_id,
            access_token=access_token,
            user_id=account.user_id
        )

    def _maybe_refresh_token(self, account: PlatformAccount):
        """
        Refresh access_token if it is expired or within TOKEN_REFRESH_THRESHOLD_SECONDS of expiry.
        Follows Shopee token refresh rules:
        - access_token: valid 4 hours
        - refresh_token: valid 30 days, one-time use (new pair returned each refresh)
        """
        if not account.token_expires_at:
            return

        seconds_remaining = (account.token_expires_at - timezone.now()).total_seconds()
        if seconds_remaining > TOKEN_REFRESH_THRESHOLD_SECONDS:
            return

        import logging
        logger = logging.getLogger(__name__)
        logger.info(f"[ShopeeAdapter] Token near-expiry ({seconds_remaining:.0f}s). Refreshing.")

        try:
            self.refresh_access_token(account)
        except Exception as e:
            logger.error(f"[ShopeeAdapter] Token refresh failed: {e}. Will attempt with existing token.")

    def refresh_access_token(self, account: Optional[PlatformAccount] = None) -> bool:
        """
        Refresh the Shopee access_token using the refresh_token.
        Updates account in place and saves to DB.
        
        Per Shopee docs:
        - Endpoint: /api/v2/auth/access_token/get
        - Returns new access_token + refresh_token pair
        - Old refresh_token is invalidated (one-time use)
        """
        import logging
        logger = logging.getLogger(__name__)

        if account is None:
            account = PlatformAccount.objects.filter(
                company_id=self.company_id,
                platform=LivePlatformProduct.PLATFORM_SHOPEE,
                status='connected'
            ).first()
            if not account:
                raise PlatformAuthError("No account to refresh")

        refresh_token = account.get_decrypted_refresh_token()
        if not refresh_token:
            raise PlatformAuthError("No refresh token available")

        path = "/api/v2/auth/access_token/get"
        timestamp = int(time.time())
        partner_id = int(SHOPEE_PARTNER_ID) if SHOPEE_PARTNER_ID else 0
        partner_key = SHOPEE_PARTNER_KEY

        base_string = f"{partner_id}{path}{timestamp}"
        sign = hmac.new(
            partner_key.encode('utf-8'),
            base_string.encode('utf-8'),
            hashlib.sha256
        ).hexdigest()

        url = f"{SHOPEE_HOST}{path}"
        params = {
            'partner_id': partner_id,
            'timestamp': timestamp,
            'sign': sign
        }
        payload = {
            'refresh_token': refresh_token,
            'partner_id': partner_id,
            'shop_id': int(account.account_id) if str(account.account_id).isdigit() else 0
        }

        try:
            res = requests.post(url, params=params, json=payload, timeout=10)
            res.raise_for_status()
            data = res.json()
        except requests.RequestException as e:
            raise PlatformAPIError(f"Token refresh network error: {e}")

        if data.get("error"):
            raise PlatformAuthError(f"Token refresh failed: {data.get('message', '')}")

        new_access_token = data.get("access_token")
        new_refresh_token = data.get("refresh_token")
        expire_in = data.get("expire_in", 14400)

        if not new_access_token or not new_refresh_token:
            raise PlatformAuthError("Token refresh response missing tokens")

        # Update account — save() will re-encrypt the tokens
        account.access_token = new_access_token
        account.refresh_token = new_refresh_token
        account.token_expires_at = timezone.now() + dt.timedelta(seconds=expire_in)
        account.save(update_fields=['access_token', 'refresh_token', 'token_expires_at'])

        logger.info(f"[ShopeeAdapter] Token refreshed successfully for account {account.account_id}")
        return True

    def get_account(self) -> Dict[str, Any]:
        self._check_capability(Capability.AUTH)
        self._init_client()

        data = self._client.request("GET", "/api/v2/shop/get_shop_info")

        return {
            "external_shop_id": str(self._account.account_id),
            "user_id": self._account.user_id,
            "name": data.get("response", {}).get("shop_name", "Shopee Shop"),
            "status": "connected",
            "metadata": {
                "region": data.get("response", {}).get("region")
            }
        }

    def get_products(self) -> List[Dict[str, Any]]:
        self._check_capability(Capability.PRODUCT_READ)
        self._init_client()

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

        info_params = {
            "item_id_list": ",".join(map(str, item_ids))
        }

        info_data = self._client.request("GET", "/api/v2/product/get_item_base_info", params=info_params)
        items_info = info_data.get("response", {}).get("item_list", [])

        normalized_products = []
        for item in items_info:
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
        self._check_capability(Capability.PRODUCT_MAPPING)
        raise NotImplementedError("Product mapping should be done via CRM models")

    def _get_live_session(self, session_id: str) -> LiveSession:
        try:
            return LiveSession.objects.get(id=session_id, company_id=self.company_id)
        except LiveSession.DoesNotExist:
            raise PlatformAPIError("LiveSession not found or permission denied")

    # ─────────────────────────────────────────────────────────────────────────
    # Phase 1E-8: Correct Shopee LIVE session lifecycle
    # ─────────────────────────────────────────────────────────────────────────

    def create_live_session(self, session_id: str) -> Dict[str, Any]:
        """
        Step 1 of Shopee LIVE API flow: create_session.
        
        This MUST be called before start_session.
        Returns push_url (RTMP ingest URL) and external_session_id.
        
        Per audit: push_url is returned by create_session, NOT start_session.
        Shopee API: /api/v2/livestream/create_session (uses user_id signing)
        """
        self._check_capability(Capability.LIVE_START)
        session = self._get_live_session(session_id)
        self._init_client()

        if not self._account.user_id:
            raise PlatformAuthError(
                "Shopee user_id is missing from PlatformAccount. "
                "Re-authorize Shopee via OAuth to obtain user_id."
            )

        payload = {
            "title": f"Fujitech AI Live - {session.id}",
            "description": "AI-powered Livestream by Fujitech",
            # cover_image_url is required by Shopee in production.
            # In sandbox/testing this may be optional. Production requires
            # calling v2.livestream.upload_image first.
        }

        data = self._client.request_livestream("POST", "/api/v2/livestream/create_session", json=payload)
        response_data = data.get("response", {})

        external_session_id = response_data.get("session_id")
        push_url = response_data.get("push_url")

        if not external_session_id:
            raise PlatformAPIError("Shopee create_session did not return session_id")

        # Persist for later stop/status/comment calls
        session.external_session_id = str(external_session_id)
        if push_url:
            session.stream_url = push_url
        session.save(update_fields=["external_session_id", "stream_url"])

        return {
            "external_session_id": str(external_session_id),
            "push_url": push_url,
            "stream_url": push_url,
        }

    def start_live_session(self, session_id: str) -> bool:
        """
        Step 2 of Shopee LIVE API flow: start_session.
        
        Must be called AFTER create_session.
        Officially begins the broadcast on Shopee's end.
        Shopee API: /api/v2/livestream/start_session (uses user_id signing)
        """
        self._check_capability(Capability.LIVE_START)
        session = self._get_live_session(session_id)

        if not session.external_session_id:
            raise PlatformAPIError(
                "Cannot start_session: external_session_id is missing. "
                "Call create_live_session first."
            )

        self._init_client()

        payload = {
            "session_id": session.external_session_id
        }

        self._client.request_livestream("POST", "/api/v2/livestream/start_session", json=payload)
        return True

    def start_live(self, session_id: str) -> Dict[str, Any]:
        """
        Legacy compatibility: deprecated in favour of ShopeeApiStreamProvider.
        Still supported for non-API mode callers (e.g. test fixtures).
        In API mode, ShopeeApiStreamProvider calls create_live_session() + start_live_session().
        """
        self._check_capability(Capability.LIVE_START)
        result = self.create_live_session(session_id)
        self.start_live_session(session_id)
        return result

    def get_live_status(self, session_id: str) -> str:
        self._check_capability(Capability.LIVE_STATUS)
        session = self._get_live_session(session_id)

        if not session.external_session_id:
            raise PlatformAPIError("Cannot get status: external_session_id is missing")

        self._init_client()
        params = {"session_id": session.external_session_id}

        data = self._client.request_livestream("GET", "/api/v2/livestream/get_session_detail", params=params)
        status_str = data.get("response", {}).get("status", "").upper()

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

        self._client.request_livestream("POST", "/api/v2/livestream/end_session", json=payload)
        return True

    # ─────────────────────────────────────────────────────────────────────────
    # Phase 1E-8: Corrected product management
    # ─────────────────────────────────────────────────────────────────────────

    def attach_product_to_live(self, session_id: str, platform_product_id: str) -> bool:
        """
        Add a product to the LIVE bag.
        
        Phase 1E-8 FIX: Previously used update_show_item (pin), which is incorrect.
        add_item_list adds the product to the Orange Bag so viewers can purchase.
        Shopee API: /api/v2/livestream/add_item_list
        """
        self._check_capability(Capability.PRODUCT_ATTACH)
        session = self._get_live_session(session_id)

        if not session.external_session_id:
            raise PlatformAPIError("Cannot attach product: external_session_id is missing")

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
            "item_list": [{"item_id": int(platform_product_id)}]
        }

        self._client.request_livestream("POST", "/api/v2/livestream/add_item_list", json=payload)
        return True

    def remove_product_from_live(self, session_id: str, platform_product_id: str) -> bool:
        """
        Remove a product from the LIVE bag.
        Shopee API: /api/v2/livestream/delete_item_list
        """
        self._check_capability(Capability.PRODUCT_ATTACH)
        session = self._get_live_session(session_id)

        if not session.external_session_id:
            raise PlatformAPIError("Cannot remove product: external_session_id is missing")

        self._init_client()

        payload = {
            "session_id": session.external_session_id,
            "item_list": [{"item_id": int(platform_product_id)}]
        }

        self._client.request_livestream("POST", "/api/v2/livestream/delete_item_list", json=payload)
        return True

    def set_highlighted_product(self, session_id: str, platform_product_id: str) -> bool:
        """
        Set the currently PINNED/SHOWN product during the broadcast.
        This is different from adding to the bag.
        Shopee API: /api/v2/livestream/update_show_item
        """
        self._check_capability(Capability.PRODUCT_ATTACH)
        session = self._get_live_session(session_id)

        if not session.external_session_id:
            raise PlatformAPIError("Cannot highlight product: external_session_id is missing")

        self._init_client()

        payload = {
            "session_id": session.external_session_id,
            "item_id": int(platform_product_id),
        }

        self._client.request_livestream("POST", "/api/v2/livestream/update_show_item", json=payload)
        return True

    # ─────────────────────────────────────────────────────────────────────────
    # Phase 1E-8: Comments with cursor tracking
    # ─────────────────────────────────────────────────────────────────────────

    def _get_comment_cursor_key(self, session_id: str) -> str:
        return f"live:comment_cursor:{self.company_id}:{session_id}"

    def _get_last_comment_time(self, session_id: str) -> Optional[int]:
        """Read last seen comment Unix timestamp from Redis. Returns None if not set."""
        try:
            from django.core.cache import cache
            val = cache.get(self._get_comment_cursor_key(session_id))
            return int(val) if val is not None else None
        except Exception:
            return None

    def _update_comment_cursor(self, session_id: str, last_time: int):
        """Store last seen comment Unix timestamp in Redis (TTL: 24h)."""
        try:
            from django.core.cache import cache
            cache.set(self._get_comment_cursor_key(session_id), last_time, timeout=86400)
        except Exception:
            pass

    def get_comments(self, session_id: str, offset: int = 0) -> Tuple[List[LiveCommentEvent], bool]:
        """
        Fetch recent comments for an active Shopee LIVE session.
        
        Phase 1E-8: Uses cursor (last seen comment_time) instead of always offset=0.
        The cursor is stored per-session in Redis and advanced after each successful poll.
        
        Shopee API: /api/v2/livestream/get_latest_comment_list (uses user_id signing)
        """
        self._check_capability(Capability.LIVE_COMMENTS)
        session = self._get_live_session(session_id)

        if not session.external_session_id:
            raise PlatformAPIError("Cannot get comments: external_session_id is missing")

        self._init_client()

        params = {
            "session_id": session.external_session_id,
        }

        # Use cursor (last seen timestamp) to avoid re-fetching all old comments
        last_time = self._get_last_comment_time(str(session.id))
        if last_time:
            params["start_time"] = last_time

        data = self._client.request_livestream("GET", "/api/v2/livestream/get_latest_comment_list", params=params)
        response_data = data.get("response", {})

        comment_list = response_data.get("comment_list", [])
        has_more = response_data.get("has_more", False)

        normalized_comments = []
        latest_timestamp = last_time or 0

        for c in comment_list:
            timestamp = c.get("comment_time")
            if timestamp:
                dt_obj = datetime.fromtimestamp(timestamp)
                if timestamp > latest_timestamp:
                    latest_timestamp = timestamp
            else:
                dt_obj = datetime.now()

            event = LiveCommentEvent(
                event_id=str(uuid.uuid4()),
                company_id=self.company_id,
                session_id=str(session.id),
                platform=LivePlatformProduct.PLATFORM_SHOPEE,
                platform_comment_id=str(c.get("comment_id")),
                user_id=str(c.get("user_id")),
                display_name=c.get("user_name", "Unknown"),
                text=c.get("comment_content", ""),
                created_at=dt_obj
            )
            normalized_comments.append(event)

        # Advance cursor if we got new comments
        if latest_timestamp and latest_timestamp > (last_time or 0):
            self._update_comment_cursor(str(session.id), latest_timestamp)

        return normalized_comments, has_more

    def send_comment_reply(self, session_id: str, text: str) -> bool:
        """Post a comment as the streamer. Shopee API: /api/v2/livestream/post_comment"""
        self._check_capability(Capability.LIVE_COMMENT_REPLY)
        session = self._get_live_session(session_id)

        if not session.external_session_id:
            raise PlatformAPIError("Cannot post comment: external_session_id is missing")

        self._init_client()

        payload = {
            "session_id": session.external_session_id,
            "content": text
        }

        self._client.request_livestream("POST", "/api/v2/livestream/post_comment", json=payload)
        return True
