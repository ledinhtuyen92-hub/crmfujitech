import hmac
import hashlib
import time
import uuid
import json
import requests
from django.conf import settings
from django.core.cache import cache
from rest_framework.views import APIView
from rest_framework.response import Response
from rest_framework.permissions import IsAuthenticated
from rest_framework.decorators import api_view, permission_classes
from django.http import HttpResponseRedirect
from .models import PlatformAccount, LivePlatformProduct
from django.utils import timezone
import datetime

SHOPEE_HOST = getattr(settings, 'SHOPEE_API_HOST', 'https://partner.test-stable.shopeemobile.com')
SHOPEE_PARTNER_ID = getattr(settings, 'SHOPEE_PARTNER_ID', '')
SHOPEE_PARTNER_KEY = getattr(settings, 'SHOPEE_PARTNER_KEY', '')

class ShopeeConnectView(APIView):
    """
    Generates Shopee authorization URL and redirects.
    """
    permission_classes = [IsAuthenticated]

    def get(self, request):
        company_id = request.user.company_id
        
        # 1. Generate secure state
        state = str(uuid.uuid4())
        
        # Store state in cache with 10 mins TTL
        cache_key = f"shopee_oauth_state_{state}"
        cache.set(cache_key, company_id, timeout=600)
        
        # 2. Build auth URL
        path = "/api/v2/shop/auth_partner"
        timestamp = int(time.time())
        
        if not SHOPEE_PARTNER_ID or not SHOPEE_PARTNER_KEY:
            return Response({"error": "Shopee credentials not configured"}, status=500)
            
        base_string = f"{SHOPEE_PARTNER_ID}{path}{timestamp}"
        sign = hmac.new(
            SHOPEE_PARTNER_KEY.encode('utf-8'),
            base_string.encode('utf-8'),
            hashlib.sha256
        ).hexdigest()
        
        # We need a frontend callback URL or backend callback URL.
        # It's better to use backend callback URL, which then redirects to frontend.
        redirect_url = f"{settings.SITE_URL}/api/live-sessions/platforms/shopee/callback/"
        
        auth_link = f"{SHOPEE_HOST}{path}?partner_id={SHOPEE_PARTNER_ID}&timestamp={timestamp}&sign={sign}&redirect={redirect_url}"
        
        # We append state manually to the redirect URL if Shopee doesn't support state param, 
        # wait, Shopee doesn't have a native 'state' param in standard v2 docs, 
        # so we append it to our redirect URL:
        # redirect_url = encode_url(redirect_url + "?state=" + state)
        # Actually Shopee passes back whatever is in the redirect URL.
        from urllib.parse import quote_plus
        callback_with_state = f"{redirect_url}?state={state}"
        encoded_redirect = quote_plus(callback_with_state)
        
        auth_link = f"{SHOPEE_HOST}{path}?partner_id={SHOPEE_PARTNER_ID}&timestamp={timestamp}&sign={sign}&redirect={encoded_redirect}"
        
        return Response({"url": auth_link})


class ShopeeCallbackView(APIView):
    """
    Handles Shopee OAuth callback, exchanges code for tokens, and saves PlatformAccount.
    """
    permission_classes = [] # Public endpoint, state verifies it

    def get(self, request):
        code = request.query_params.get('code')
        shop_id = request.query_params.get('shop_id')
        state = request.query_params.get('state')
        
        # In production, redirect to frontend instead of returning JSON
        FRONTEND_URL = getattr(settings, 'FRONTEND_URL', 'http://localhost:5173')
        
        if not code or not shop_id or not state:
            return HttpResponseRedirect(f"{FRONTEND_URL}/settings/integrations?error=invalid_callback")
            
        # 1. Validate State
        cache_key = f"shopee_oauth_state_{state}"
        company_id = cache.get(cache_key)
        
        if not company_id:
            return HttpResponseRedirect(f"{FRONTEND_URL}/settings/integrations?error=invalid_state")
            
        # Consume state (single-use)
        cache.delete(cache_key)
        
        # 2. Exchange code for token
        path = "/api/v2/auth/token/get"
        timestamp = int(time.time())
        base_string = f"{SHOPEE_PARTNER_ID}{path}{timestamp}"
        sign = hmac.new(
            SHOPEE_PARTNER_KEY.encode('utf-8'),
            base_string.encode('utf-8'),
            hashlib.sha256
        ).hexdigest()
        
        url = f"{SHOPEE_HOST}{path}?partner_id={SHOPEE_PARTNER_ID}&timestamp={timestamp}&sign={sign}"
        payload = {
            "code": code,
            "partner_id": int(SHOPEE_PARTNER_ID),
            "shop_id": int(shop_id)
        }
        
        try:
            res = requests.post(url, json=payload, timeout=10)
            res.raise_for_status()
            data = res.json()
        except requests.RequestException:
            return HttpResponseRedirect(f"{FRONTEND_URL}/settings/integrations?error=exchange_failed")
            
        if data.get("error"):
            # Don't log full response with tokens, but error is safe
            return HttpResponseRedirect(f"{FRONTEND_URL}/settings/integrations?error=api_error")
            
        access_token = data.get("access_token")
        refresh_token = data.get("refresh_token")
        expire_in = data.get("expire_in", 14400) # 4 hours usually
        
        if not access_token or not refresh_token:
            return HttpResponseRedirect(f"{FRONTEND_URL}/settings/integrations?error=invalid_response")
            
        expires_at = timezone.now() + datetime.timedelta(seconds=expire_in)
        
        # 3. Create or Update Platform Account
        account, created = PlatformAccount.objects.update_or_create(
            company_id=company_id,
            platform=LivePlatformProduct.PLATFORM_SHOPEE,
            account_id=str(shop_id),
            defaults={
                "display_name": f"Shopee Shop {shop_id}",
                "access_token": access_token,
                "refresh_token": refresh_token,
                "token_expires_at": expires_at,
                "status": "connected"
            }
        )
        
        return HttpResponseRedirect(f"{FRONTEND_URL}/settings/integrations?success=1")
