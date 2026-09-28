import json
import uuid
import datetime
from unittest.mock import patch, MagicMock
from django.test import TestCase
from django.urls import reverse
from django.utils import timezone
from django.core.cache import cache
from users.models import User, Company
from .models import PlatformAccount, LivePlatformProduct
from rest_framework.test import APIClient

class ShopeeOAuthTests(TestCase):
    def setUp(self):
        self.company = Company.objects.create(name="OAuth Company")
        self.user = User.objects.create(
            username="oauth_user", 
            company=self.company, 
            is_active=True
        )
        self.client = APIClient()
        self.client.force_authenticate(user=self.user)
        self.unauth_client = APIClient()

    def test_connect_endpoint_generates_valid_state(self):
        with patch('live_sessions.oauth_views.SHOPEE_PARTNER_ID', 'test_pid'), \
             patch('live_sessions.oauth_views.SHOPEE_PARTNER_KEY', 'test_key'):
             
            url = reverse('shopee-connect')
            response = self.client.get(url)
            self.assertEqual(response.status_code, 200)
            
            # Should return an auth URL
            auth_link = response.data.get('url')
            self.assertTrue(auth_link.startswith('https://partner.test-stable.shopeemobile.com'))
            self.assertIn('partner_id=test_pid', auth_link)
            self.assertIn('sign=', auth_link)
            self.assertIn('state=', auth_link)
            
            # Extract state
            import urllib.parse
            parsed = urllib.parse.urlparse(auth_link)
            qs = urllib.parse.parse_qs(parsed.query)
            
            redirect_url = qs.get('redirect')[0]
            redirect_parsed = urllib.parse.urlparse(redirect_url)
            redirect_qs = urllib.parse.parse_qs(redirect_parsed.query)
            
            state = redirect_qs.get('state')[0]
            
            # Check cache
            cached_company_id = cache.get(f"shopee_oauth_state_{state}")
            self.assertEqual(cached_company_id, self.company.id)

    def test_callback_endpoint_invalid_state(self):
        url = reverse('shopee-callback')
        # Missing state
        response = self.unauth_client.get(f"{url}?code=123&shop_id=456")
        self.assertEqual(response.status_code, 302)
        self.assertIn("error=invalid_callback", response.url)
        
        # Invalid state
        response = self.unauth_client.get(f"{url}?code=123&shop_id=456&state=invalid_state")
        self.assertEqual(response.status_code, 302)
        self.assertIn("error=invalid_state", response.url)

    @patch('live_sessions.oauth_views.requests.post')
    @patch('live_sessions.oauth_views.SHOPEE_PARTNER_ID', 'test_pid')
    @patch('live_sessions.oauth_views.SHOPEE_PARTNER_KEY', 'test_key')
    # Mock encryption key so saving PlatformAccount doesn't crash
    @patch('live_sessions.platforms.security.get_encryption_key')
    def test_callback_success(self, mock_get_key, mock_post):
        from cryptography.fernet import Fernet
        mock_get_key.return_value = Fernet.generate_key()
        
        # Setup mock response from Shopee
        mock_resp = MagicMock()
        mock_resp.raise_for_status.return_value = None
        mock_resp.json.return_value = {
            "access_token": "shopee_access",
            "refresh_token": "shopee_refresh",
            "expire_in": 14400
        }
        mock_post.return_value = mock_resp
        
        # Setup state in cache
        state = str(uuid.uuid4())
        cache.set(f"shopee_oauth_state_{state}", self.company.id, 600)
        
        url = reverse('shopee-callback')
        response = self.unauth_client.get(f"{url}?code=shopee_code&shop_id=12345&state={state}")
        
        self.assertEqual(response.status_code, 302)
        self.assertIn("success=1", response.url)
        
        # State should be consumed (single use)
        self.assertIsNone(cache.get(f"shopee_oauth_state_{state}"))
        
        # Account should be created and tokens encrypted
        account = PlatformAccount.objects.get(company=self.company, account_id="12345")
        self.assertEqual(account.platform, LivePlatformProduct.PLATFORM_SHOPEE)
        
        # Check DB value is encrypted
        self.assertTrue(account.access_token.startswith('gAAAAA'))
        
        # Check decryption works via get_decrypted_access_token
        self.assertEqual(account.get_decrypted_access_token(), "shopee_access")
        self.assertEqual(account.get_decrypted_refresh_token(), "shopee_refresh")
