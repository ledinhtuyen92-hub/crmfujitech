"""
Phase 1E-8 Tests — Shopee Dual Connection Layer

Coverage:
A. Connection mode selection
B. Manual RTMP validation
C. Manual RTMP -> StreamTarget
D. API -> user_id usage
E. OAuth callback stores user_id
F. Token refresh
G. create_session called before start_session
H. push_url normalization
I. stream.start payload compatibility
J. Shopee 9:16 StreamConfig profile
K. Product add_item_list (attach to bag)
L. Product update_show_item (highlight/pin)
M. Comment cursor handling
N. Secret redaction (stream_key never in response)
O. Generic RTMP backward compatibility

All Shopee API calls are MOCKED.
No real Shopee credentials are used or required.
"""
import uuid
from unittest.mock import patch, MagicMock, PropertyMock
from django.test import TestCase
from rest_framework.test import APIClient
from django.urls import reverse

from users.models import User, Company
from inventory.models import Product
from live_sessions.models import PlatformAccount, LivePlatformProduct, LiveDevice, LiveSession
from live_sessions.platforms.shopee import ShopeeAdapter, ShopeeClient
from live_sessions.platforms.exceptions import PlatformAuthError, PlatformAPIError
from live_sessions.stream_providers import (
    ShopeeManualRtmpProvider,
    ShopeeApiStreamProvider,
    get_stream_provider,
    get_stream_profile,
    STREAM_PROFILE_SHOPEE,
    STREAM_PROFILE_GENERIC,
)
from live_sessions.serializers import ShopeeManualRtmpSetupSerializer


def make_company():
    return Company.objects.create(
        name=f"Test Co {uuid.uuid4().hex[:6]}",
        workspace_id=str(uuid.uuid4()),
        tax_code=str(uuid.uuid4())[:15]
    )


def make_platform_account(company, user_id="999"):
    from cryptography.fernet import Fernet
    key = Fernet.generate_key()
    with patch('live_sessions.platforms.security.get_encryption_key', return_value=key):
        return PlatformAccount.objects.create(
            company=company,
            platform=LivePlatformProduct.PLATFORM_SHOPEE,
            account_id="12345",
            display_name="Test Shop",
            access_token="mock_access",
            refresh_token="mock_refresh",
            status="connected",
            user_id=user_id,
        )


def make_session(company, device, product, agent, platform="shopee", stream_url=None, connection_mode=None):
    s = LiveSession.objects.create(
        company=company,
        device=device,
        platform=platform,
        product=product,
        ai_agent=agent,
        stream_url=stream_url,
        shopee_connection_mode=connection_mode,
    )
    return s


# ─────────────────────────────────────────────────────────────────────────────
# A/B/C — Connection Mode & Manual RTMP
# ─────────────────────────────────────────────────────────────────────────────

class TestConnectionModeModel(TestCase):
    def setUp(self):
        self.company = make_company()
        from ai_agents.models import AiAgent
        from django.contrib.auth.hashers import make_password
        import secrets

        self.product = Product.objects.create(
            company=self.company, name="Prod", sku="SKU", price=100
        )
        self.agent = AiAgent.objects.create(
            company=self.company,
            name="Bot",
            system_prompt="You are a bot",
            provider="openai",
            model_name="gpt-4o-mini",
        )
        raw_token = f"ldt_{uuid.uuid4().hex}_{secrets.token_urlsafe(32)}"
        self.device = LiveDevice.objects.create(
            company=self.company,
            name="Dev",
            token_hash=make_password(raw_token),
        )

    def test_shopee_connection_mode_api(self):
        """Session can be created with API connection mode."""
        session = LiveSession.objects.create(
            company=self.company,
            device=self.device,
            platform="shopee",
            product=self.product,
            ai_agent=self.agent,
            shopee_connection_mode=LiveSession.SHOPEE_CONNECTION_API,
        )
        self.assertEqual(session.shopee_connection_mode, "api")

    def test_shopee_connection_mode_manual_rtmp(self):
        """Session can be created with manual_rtmp connection mode."""
        session = LiveSession.objects.create(
            company=self.company,
            device=self.device,
            platform="shopee",
            product=self.product,
            ai_agent=self.agent,
            shopee_connection_mode=LiveSession.SHOPEE_CONNECTION_MANUAL_RTMP,
        )
        self.assertEqual(session.shopee_connection_mode, "manual_rtmp")

    def test_connection_mode_nullable(self):
        """shopee_connection_mode is nullable for backward compat."""
        session = LiveSession.objects.create(
            company=self.company,
            device=self.device,
            platform="shopee",
            product=self.product,
            ai_agent=self.agent,
        )
        self.assertIsNone(session.shopee_connection_mode)

    def test_non_shopee_session_has_null_connection_mode(self):
        """Non-Shopee sessions naturally have no shopee_connection_mode."""
        session = LiveSession.objects.create(
            company=self.company,
            device=self.device,
            platform="custom",
            product=self.product,
            ai_agent=self.agent,
        )
        self.assertIsNone(session.shopee_connection_mode)


# ─────────────────────────────────────────────────────────────────────────────
# B — Manual RTMP Serializer Validation
# ─────────────────────────────────────────────────────────────────────────────

class TestManualRtmpSerializer(TestCase):
    def test_valid_data(self):
        data = {
            "server_url": "rtmp://live.shopee.vn/stream",
            "stream_key": "sk_abc123xyz"
        }
        s = ShopeeManualRtmpSetupSerializer(data=data)
        self.assertTrue(s.is_valid(), s.errors)

    def test_invalid_server_url_http(self):
        data = {
            "server_url": "http://live.shopee.vn/stream",
            "stream_key": "sk_abc123"
        }
        s = ShopeeManualRtmpSetupSerializer(data=data)
        self.assertFalse(s.is_valid())
        self.assertIn("server_url", s.errors)

    def test_invalid_server_url_empty(self):
        data = {"server_url": "", "stream_key": "sk_abc"}
        s = ShopeeManualRtmpSetupSerializer(data=data)
        self.assertFalse(s.is_valid())

    def test_stream_key_too_short(self):
        data = {"server_url": "rtmp://live.shopee.vn/", "stream_key": "ab"}
        s = ShopeeManualRtmpSetupSerializer(data=data)
        self.assertFalse(s.is_valid())
        self.assertIn("stream_key", s.errors)

    def test_rtmps_accepted(self):
        data = {
            "server_url": "rtmps://live.shopee.vn/stream",
            "stream_key": "sk_abc123"
        }
        s = ShopeeManualRtmpSetupSerializer(data=data)
        self.assertTrue(s.is_valid(), s.errors)

    def test_combined_url(self):
        data = {
            "server_url": "rtmp://live.shopee.vn/stream",
            "stream_key": "sk_key123"
        }
        s = ShopeeManualRtmpSetupSerializer(data=data)
        s.is_valid()
        combined = s.get_combined_rtmp_url()
        self.assertEqual(combined, "rtmp://live.shopee.vn/stream/sk_key123")

    def test_combined_url_strips_trailing_slash(self):
        data = {
            "server_url": "rtmp://live.shopee.vn/stream/",
            "stream_key": "sk_key999"
        }
        s = ShopeeManualRtmpSetupSerializer(data=data)
        s.is_valid()
        combined = s.get_combined_rtmp_url()
        self.assertEqual(combined, "rtmp://live.shopee.vn/stream/sk_key999")


# ─────────────────────────────────────────────────────────────────────────────
# C — Manual RTMP Provider → StreamTarget
# ─────────────────────────────────────────────────────────────────────────────

class TestShopeeManualRtmpProvider(TestCase):
    def _make_mock_session(self, stream_url, platform="shopee"):
        m = MagicMock()
        m.stream_url = stream_url
        m.platform = platform
        return m

    def test_valid_rtmp_returns_stream_target(self):
        session = self._make_mock_session("rtmp://live.shopee.vn/stream/sk_key")
        provider = ShopeeManualRtmpProvider()
        target = provider.get_stream_target(session)
        self.assertEqual(target["stream_url"], "rtmp://live.shopee.vn/stream/sk_key")
        self.assertIn("width", target)
        self.assertIn("height", target)

    def test_missing_stream_url_raises(self):
        session = self._make_mock_session(None)
        provider = ShopeeManualRtmpProvider()
        from live_sessions.platforms.exceptions import PlatformAPIError
        with self.assertRaises(PlatformAPIError):
            provider.get_stream_target(session)

    def test_invalid_url_raises(self):
        session = self._make_mock_session("http://not-rtmp.com/")
        provider = ShopeeManualRtmpProvider()
        from live_sessions.platforms.exceptions import PlatformAPIError
        with self.assertRaises(PlatformAPIError):
            provider.get_stream_target(session)

    def test_shopee_manual_uses_shopee_profile(self):
        session = self._make_mock_session("rtmp://live.shopee.vn/s/k", platform="shopee")
        provider = ShopeeManualRtmpProvider()
        target = provider.get_stream_target(session)
        self.assertEqual(target["width"], 720)
        self.assertEqual(target["height"], 1280)


# ─────────────────────────────────────────────────────────────────────────────
# J — Stream Config Profile (9:16 for Shopee)
# ─────────────────────────────────────────────────────────────────────────────

class TestStreamProfiles(TestCase):
    def test_shopee_profile_is_vertical(self):
        profile = get_stream_profile("shopee")
        self.assertEqual(profile["width"], 720)
        self.assertEqual(profile["height"], 1280)
        self.assertEqual(profile["fps"], 30)

    def test_generic_profile_for_custom(self):
        profile = get_stream_profile("custom")
        self.assertEqual(profile["width"], 800)
        self.assertEqual(profile["height"], 600)

    def test_unknown_platform_returns_generic(self):
        profile = get_stream_profile("youtube")
        self.assertEqual(profile, STREAM_PROFILE_GENERIC)

    def test_profile_is_copy_not_reference(self):
        p1 = get_stream_profile("shopee")
        p2 = get_stream_profile("shopee")
        p1["width"] = 0
        self.assertEqual(p2["width"], 720)  # must not be mutated

    def test_tiktok_uses_vertical_profile(self):
        profile = get_stream_profile("tiktok")
        self.assertEqual(profile["height"], 1280)


# ─────────────────────────────────────────────────────────────────────────────
# D — ShopeeClient uses user_id for livestream signing
# ─────────────────────────────────────────────────────────────────────────────

class TestShopeeClientLivestreamSigning(TestCase):
    def test_generate_sign_livestream_requires_user_id(self):
        client = ShopeeClient(shop_id="123", access_token="tok")
        # No user_id → should raise
        with self.assertRaises(PlatformAuthError):
            client._generate_sign_livestream("/api/v2/livestream/create_session", 1234)

    def test_generate_sign_livestream_with_user_id(self):
        with patch('live_sessions.platforms.shopee.SHOPEE_PARTNER_KEY', 'test_key'):
            with patch('live_sessions.platforms.shopee.SHOPEE_PARTNER_ID', '12345'):
                client = ShopeeClient(shop_id="100", access_token="abc", user_id="777")
                sign = client._generate_sign_livestream("/api/v2/livestream/create_session", 1000)
                self.assertIsInstance(sign, str)
                self.assertEqual(len(sign), 64)  # SHA256 hex = 64 chars

    def test_request_livestream_adds_user_id_param(self):
        with patch('live_sessions.platforms.shopee.SHOPEE_PARTNER_KEY', 'k'):
            with patch('live_sessions.platforms.shopee.SHOPEE_PARTNER_ID', '1'):
                with patch('live_sessions.platforms.shopee.requests.request') as mock_req:
                    mock_resp = MagicMock()
                    mock_resp.status_code = 200
                    mock_resp.json.return_value = {}
                    mock_req.return_value = mock_resp

                    client = ShopeeClient(shop_id="100", access_token="abc", user_id="999")
                    client.request_livestream("GET", "/api/v2/livestream/test")

                    call_kwargs = mock_req.call_args
                    params = call_kwargs[1].get('params') or call_kwargs[0][2]
                    self.assertIn('user_id', params)
                    self.assertEqual(params['user_id'], 999)  # int("999")
                    # shop_id must NOT be in livestream params
                    self.assertNotIn('shop_id', params)


# ─────────────────────────────────────────────────────────────────────────────
# E — OAuth callback stores user_id
# ─────────────────────────────────────────────────────────────────────────────

class TestOAuthCallbackStoresUserId(TestCase):
    def setUp(self):
        from cryptography.fernet import Fernet
        self.key = Fernet.generate_key()
        self.patcher = patch('live_sessions.platforms.security.get_encryption_key', return_value=self.key)
        self.patcher.start()

        self.company = make_company()
        self.user = User.objects.create(username=f"u_{uuid.uuid4().hex[:6]}", company=self.company)
        self.client = APIClient()
        self.client.force_authenticate(user=self.user)

    def tearDown(self):
        self.patcher.stop()

    @patch('live_sessions.oauth_views.requests.post')
    @patch('live_sessions.oauth_views.cache')
    def test_callback_stores_user_id(self, mock_cache, mock_post):
        from django.urls import reverse
        mock_cache.get.return_value = self.company.id
        mock_cache.delete.return_value = None

        mock_resp = MagicMock()
        mock_resp.raise_for_status.return_value = None
        mock_resp.json.return_value = {
            "access_token": "new_access",
            "refresh_token": "new_refresh",
            "expire_in": 14400,
            "user_id": 777888,  # ← Shopee returns user_id in token response
        }
        mock_post.return_value = mock_resp

        with patch('live_sessions.oauth_views.SHOPEE_PARTNER_ID', '9999'):
            with patch('live_sessions.oauth_views.SHOPEE_PARTNER_KEY', 'test_key'):
                callback_url = reverse('shopee-callback')
                response = self.client.get(
                    callback_url,
                    {
                        'code': 'test_code',
                        'shop_id': '99999',
                        'state': 'some_state',
                    }
                )

        # After OAuth callback, PlatformAccount should have user_id stored
        account = PlatformAccount.objects.filter(
            company=self.company,
            platform=LivePlatformProduct.PLATFORM_SHOPEE,
        ).first()
        self.assertIsNotNone(account)
        self.assertEqual(account.user_id, "777888")


# ─────────────────────────────────────────────────────────────────────────────
# F — Token Refresh
# ─────────────────────────────────────────────────────────────────────────────

class TestTokenRefresh(TestCase):
    def setUp(self):
        from cryptography.fernet import Fernet
        self.key = Fernet.generate_key()
        self.patcher = patch('live_sessions.platforms.security.get_encryption_key', return_value=self.key)
        self.patcher.start()
        self.company = make_company()
        self.account = make_platform_account(self.company)

    def tearDown(self):
        self.patcher.stop()

    @patch('live_sessions.platforms.shopee.requests.post')
    def test_refresh_updates_tokens(self, mock_post):
        mock_resp = MagicMock()
        mock_resp.raise_for_status.return_value = None
        mock_resp.json.return_value = {
            "access_token": "refreshed_access",
            "refresh_token": "refreshed_refresh",
            "expire_in": 14400,
        }
        mock_post.return_value = mock_resp

        with patch('live_sessions.platforms.shopee.SHOPEE_PARTNER_ID', '9999'):
            with patch('live_sessions.platforms.shopee.SHOPEE_PARTNER_KEY', 'test_key'):
                adapter = ShopeeAdapter(self.company.id)
                result = adapter.refresh_access_token(self.account)

        self.assertTrue(result)
        self.account.refresh_from_db()
        self.assertIsNotNone(self.account.token_expires_at)

    def test_maybe_refresh_not_called_when_token_fresh(self):
        from django.utils import timezone
        import datetime
        # Token expires in 2 hours → no refresh needed
        self.account.token_expires_at = timezone.now() + datetime.timedelta(hours=2)
        self.account.save(update_fields=['token_expires_at'])

        adapter = ShopeeAdapter(self.company.id)
        with patch.object(adapter, 'refresh_access_token') as mock_refresh:
            adapter._maybe_refresh_token(self.account)
            mock_refresh.assert_not_called()

    def test_maybe_refresh_called_when_token_near_expiry(self):
        from django.utils import timezone
        import datetime
        # Token expires in 10 minutes → should refresh
        self.account.token_expires_at = timezone.now() + datetime.timedelta(minutes=10)
        self.account.save(update_fields=['token_expires_at'])

        adapter = ShopeeAdapter(self.company.id)
        with patch.object(adapter, 'refresh_access_token') as mock_refresh:
            adapter._maybe_refresh_token(self.account)
            mock_refresh.assert_called_once_with(self.account)


# ─────────────────────────────────────────────────────────────────────────────
# G/H — create_session before start_session; push_url normalization
# ─────────────────────────────────────────────────────────────────────────────

class TestShopeeApiLifecycle(TestCase):
    def setUp(self):
        from cryptography.fernet import Fernet
        from ai_agents.models import AiAgent
        from django.contrib.auth.hashers import make_password
        import secrets

        self.key = Fernet.generate_key()
        self.patcher = patch('live_sessions.platforms.security.get_encryption_key', return_value=self.key)
        self.patcher.start()

        self.company = make_company()
        self.account = make_platform_account(self.company, user_id="1234")
        self.product = Product.objects.create(company=self.company, name="P", sku="S", price=10)
        self.agent = AiAgent.objects.create(
            company=self.company, name="Bot", system_prompt="x",
            provider="openai", model_name="gpt-4o-mini"
        )
        raw_token = f"ldt_{uuid.uuid4().hex}_{secrets.token_urlsafe(32)}"
        self.device = LiveDevice.objects.create(
            company=self.company, name="D", token_hash=make_password(raw_token)
        )
        self.session = LiveSession.objects.create(
            company=self.company,
            device=self.device,
            platform="shopee",
            product=self.product,
            ai_agent=self.agent,
            shopee_connection_mode=LiveSession.SHOPEE_CONNECTION_API,
        )

    def tearDown(self):
        self.patcher.stop()

    @patch('live_sessions.platforms.shopee.requests.request')
    def test_create_session_returns_push_url(self, mock_req):
        """create_live_session returns push_url and stores external_session_id."""
        mock_resp = MagicMock()
        mock_resp.status_code = 200
        mock_resp.json.return_value = {
            "response": {
                "session_id": "ext_session_999",
                "push_url": "rtmp://live.shopee.vn/live/sk_secret"
            }
        }
        mock_req.return_value = mock_resp

        with patch('live_sessions.platforms.shopee.SHOPEE_PARTNER_ID', '9999'):
            with patch('live_sessions.platforms.shopee.SHOPEE_PARTNER_KEY', 'k'):
                adapter = ShopeeAdapter(self.company.id)
                result = adapter.create_live_session(str(self.session.id))

        self.assertEqual(result["external_session_id"], "ext_session_999")
        self.assertEqual(result["push_url"], "rtmp://live.shopee.vn/live/sk_secret")
        self.session.refresh_from_db()
        self.assertEqual(self.session.external_session_id, "ext_session_999")
        self.assertEqual(self.session.stream_url, "rtmp://live.shopee.vn/live/sk_secret")

    @patch('live_sessions.platforms.shopee.requests.request')
    def test_create_session_raises_without_user_id(self, mock_req):
        """create_live_session must raise PlatformAuthError if user_id is missing."""
        self.account.user_id = None
        self.account.save(update_fields=['user_id'])

        with patch('live_sessions.platforms.shopee.SHOPEE_PARTNER_ID', '9999'):
            with patch('live_sessions.platforms.shopee.SHOPEE_PARTNER_KEY', 'k'):
                adapter = ShopeeAdapter(self.company.id)
                with self.assertRaises(PlatformAuthError):
                    adapter.create_live_session(str(self.session.id))

    @patch('live_sessions.platforms.shopee.requests.request')
    def test_create_called_before_start_via_provider(self, mock_req):
        """ShopeeApiStreamProvider calls create_session then start_session in order."""
        call_order = []

        def side_effect(method, url, *args, **kwargs):
            resp = MagicMock()
            resp.status_code = 200
            if 'create_session' in url:
                call_order.append('create')
                resp.json.return_value = {
                    "response": {
                        "session_id": "sess_abc",
                        "push_url": "rtmp://live.shopee.vn/s/k"
                    }
                }
            elif 'start_session' in url:
                call_order.append('start')
                resp.json.return_value = {"response": {}}
            else:
                resp.json.return_value = {}
            return resp

        mock_req.side_effect = side_effect

        with patch('live_sessions.platforms.shopee.SHOPEE_PARTNER_ID', '9999'):
            with patch('live_sessions.platforms.shopee.SHOPEE_PARTNER_KEY', 'k'):
                provider = ShopeeApiStreamProvider()
                target = provider.get_stream_target(self.session)

        self.assertEqual(call_order, ['create', 'start'])
        self.assertEqual(target["stream_url"], "rtmp://live.shopee.vn/s/k")

    @patch('live_sessions.platforms.shopee.requests.request')
    def test_provider_returns_shopee_9_16_profile(self, mock_req):
        """ShopeeApiStreamProvider returns 720x1280 profile for Shopee sessions."""
        mock_resp = MagicMock()
        mock_resp.status_code = 200
        mock_resp.json.return_value = {
            "response": {
                "session_id": "s1",
                "push_url": "rtmp://live.shopee.vn/s/k"
            }
        }
        mock_req.return_value = mock_resp

        with patch('live_sessions.platforms.shopee.SHOPEE_PARTNER_ID', '9999'):
            with patch('live_sessions.platforms.shopee.SHOPEE_PARTNER_KEY', 'k'):
                provider = ShopeeApiStreamProvider()
                target = provider.get_stream_target(self.session)

        self.assertEqual(target["width"], 720)
        self.assertEqual(target["height"], 1280)


# ─────────────────────────────────────────────────────────────────────────────
# K/L — Product add_item_list vs update_show_item
# ─────────────────────────────────────────────────────────────────────────────

class TestShopeeProductManagement(TestCase):
    def setUp(self):
        from cryptography.fernet import Fernet
        from ai_agents.models import AiAgent
        from django.contrib.auth.hashers import make_password
        import secrets

        self.key = Fernet.generate_key()
        self.patcher = patch('live_sessions.platforms.security.get_encryption_key', return_value=self.key)
        self.patcher.start()

        self.company = make_company()
        self.account = make_platform_account(self.company, user_id="5678")
        self.product = Product.objects.create(company=self.company, name="P", sku="S", price=10)
        self.agent = AiAgent.objects.create(
            company=self.company, name="Bot", system_prompt="x",
            provider="openai", model_name="gpt-4o-mini"
        )
        raw_token = f"ldt_{uuid.uuid4().hex}_{secrets.token_urlsafe(32)}"
        self.device = LiveDevice.objects.create(
            company=self.company, name="D", token_hash=make_password(raw_token)
        )
        self.session = LiveSession.objects.create(
            company=self.company,
            device=self.device,
            platform="shopee",
            product=self.product,
            ai_agent=self.agent,
            external_session_id="ext_sess_1",
        )
        # Create product mapping with NUMERIC platform_product_id (Shopee item_id is always int)
        self.platform_product = LivePlatformProduct.objects.create(
            company=self.company,
            product=self.product,
            platform=LivePlatformProduct.PLATFORM_SHOPEE,
            platform_product_id="9001",
            is_active=True,
        )

    def tearDown(self):
        self.patcher.stop()

    @patch('live_sessions.platforms.shopee.requests.request')
    def test_attach_product_uses_add_item_list(self, mock_req):
        """Phase 1E-8: attach_product_to_live uses add_item_list, NOT update_show_item."""
        mock_resp = MagicMock()
        mock_resp.status_code = 200
        mock_resp.json.return_value = {"response": {}}
        mock_req.return_value = mock_resp

        with patch('live_sessions.platforms.shopee.SHOPEE_PARTNER_ID', '9999'):
            with patch('live_sessions.platforms.shopee.SHOPEE_PARTNER_KEY', 'k'):
                adapter = ShopeeAdapter(self.company.id)
                result = adapter.attach_product_to_live(str(self.session.id), "9001")

        self.assertTrue(result)
        # Verify the correct endpoint was called
        call_url = mock_req.call_args[0][1]
        self.assertIn("add_item_list", call_url)
        self.assertNotIn("update_show_item", call_url)

        # Verify payload contains item_list (not single item_id)
        call_json = mock_req.call_args[1].get('json') or mock_req.call_args[0][3]
        self.assertIn("item_list", call_json)

    @patch('live_sessions.platforms.shopee.requests.request')
    def test_set_highlighted_product_uses_update_show_item(self, mock_req):
        """set_highlighted_product uses update_show_item (pin a product during LIVE)."""
        mock_resp = MagicMock()
        mock_resp.status_code = 200
        mock_resp.json.return_value = {"response": {}}
        mock_req.return_value = mock_resp

        with patch('live_sessions.platforms.shopee.SHOPEE_PARTNER_ID', '9999'):
            with patch('live_sessions.platforms.shopee.SHOPEE_PARTNER_KEY', 'k'):
                adapter = ShopeeAdapter(self.company.id)
                result = adapter.set_highlighted_product(str(self.session.id), "9001")

        self.assertTrue(result)
        call_url = mock_req.call_args[0][1]
        self.assertIn("update_show_item", call_url)

    @patch('live_sessions.platforms.shopee.requests.request')
    def test_remove_product_uses_delete_item_list(self, mock_req):
        """remove_product_from_live uses delete_item_list."""
        mock_resp = MagicMock()
        mock_resp.status_code = 200
        mock_resp.json.return_value = {"response": {}}
        mock_req.return_value = mock_resp

        with patch('live_sessions.platforms.shopee.SHOPEE_PARTNER_ID', '9999'):
            with patch('live_sessions.platforms.shopee.SHOPEE_PARTNER_KEY', 'k'):
                adapter = ShopeeAdapter(self.company.id)
                result = adapter.remove_product_from_live(str(self.session.id), "9001")

        self.assertTrue(result)
        call_url = mock_req.call_args[0][1]
        self.assertIn("delete_item_list", call_url)


# ─────────────────────────────────────────────────────────────────────────────
# M — Comment cursor handling
# ─────────────────────────────────────────────────────────────────────────────

class TestCommentCursor(TestCase):
    def setUp(self):
        from cryptography.fernet import Fernet
        from ai_agents.models import AiAgent
        from django.contrib.auth.hashers import make_password
        import secrets

        self.key = Fernet.generate_key()
        self.patcher = patch('live_sessions.platforms.security.get_encryption_key', return_value=self.key)
        self.patcher.start()

        self.company = make_company()
        self.account = make_platform_account(self.company, user_id="u_cursor")
        self.product = Product.objects.create(company=self.company, name="P", sku="SK", price=10)
        self.agent = __import__('ai_agents.models', fromlist=['AiAgent']).AiAgent.objects.create(
            company=self.company, name="Bot", system_prompt="x",
            provider="openai", model_name="gpt-4o-mini"
        )
        raw_token = f"ldt_{uuid.uuid4().hex}_{secrets.token_urlsafe(32)}"
        self.device = LiveDevice.objects.create(
            company=self.company, name="D", token_hash=make_password(raw_token)
        )
        self.session = LiveSession.objects.create(
            company=self.company,
            device=self.device,
            platform="shopee",
            product=self.product,
            ai_agent=self.agent,
            external_session_id="ext_cursor_sess",
        )

    def tearDown(self):
        self.patcher.stop()

    @patch('live_sessions.platforms.shopee.requests.request')
    def test_cursor_advances_after_poll(self, mock_req):
        """After a successful comment poll, cursor is updated with latest comment_time."""
        mock_resp = MagicMock()
        mock_resp.status_code = 200
        mock_resp.json.return_value = {
            "response": {
                "comment_list": [
                    {
                        "comment_id": "c1",
                        "user_id": "u100",
                        "user_name": "Alice",
                        "comment_content": "hello",
                        "comment_time": 1700000100,
                    },
                    {
                        "comment_id": "c2",
                        "user_id": "u200",
                        "user_name": "Bob",
                        "comment_content": "hi",
                        "comment_time": 1700000200,  # ← latest
                    },
                ],
                "has_more": False,
            }
        }
        mock_req.return_value = mock_resp

        with patch('live_sessions.platforms.shopee.SHOPEE_PARTNER_ID', '9999'):
            with patch('live_sessions.platforms.shopee.SHOPEE_PARTNER_KEY', 'k'):
                adapter = ShopeeAdapter(self.company.id)
                comments, has_more = adapter.get_comments(str(self.session.id))

        self.assertEqual(len(comments), 2)

        # Cursor should now be 1700000200
        cursor_key = adapter._get_comment_cursor_key(str(self.session.id))
        from django.core.cache import cache
        cursor_val = cache.get(cursor_key)
        self.assertEqual(int(cursor_val), 1700000200)

    @patch('live_sessions.platforms.shopee.requests.request')
    def test_cursor_used_as_start_time(self, mock_req):
        """On second poll, stored cursor timestamp is sent as start_time param."""
        from django.core.cache import cache

        # Pre-set cursor
        adapter_pre = ShopeeAdapter(self.company.id)
        adapter_pre._update_comment_cursor(str(self.session.id), 1700000500)

        mock_resp = MagicMock()
        mock_resp.status_code = 200
        mock_resp.json.return_value = {
            "response": {"comment_list": [], "has_more": False}
        }
        mock_req.return_value = mock_resp

        with patch('live_sessions.platforms.shopee.SHOPEE_PARTNER_ID', '9999'):
            with patch('live_sessions.platforms.shopee.SHOPEE_PARTNER_KEY', 'k'):
                adapter = ShopeeAdapter(self.company.id)
                adapter.get_comments(str(self.session.id))

        # Check that start_time was sent
        call_params = mock_req.call_args[1].get('params') or {}
        self.assertIn('start_time', call_params)
        self.assertEqual(call_params['start_time'], 1700000500)


# ─────────────────────────────────────────────────────────────────────────────
# N — Secret Redaction (stream_key never returned)
# ─────────────────────────────────────────────────────────────────────────────

class TestSecretRedaction(TestCase):
    def setUp(self):
        from cryptography.fernet import Fernet
        from ai_agents.models import AiAgent
        from django.contrib.auth.hashers import make_password
        import secrets as sec_mod

        self.key = Fernet.generate_key()
        self.patcher = patch('live_sessions.platforms.security.get_encryption_key', return_value=self.key)
        self.patcher.start()

        self.company = make_company()
        self.user = User.objects.create(
            username=f"u_{uuid.uuid4().hex[:6]}",
            company=self.company,
            is_active=True
        )
        # Grant ai_agent.manage_agents permission (required by ActionBasedPermission in LiveSessionViewSet)
        from django.contrib.auth.models import Permission
        try:
            perm = Permission.objects.get(codename='manage_agents')
            self.user.user_permissions.add(perm)
        except Permission.DoesNotExist:
            pass
        self.api_client = APIClient()
        self.api_client.force_authenticate(user=self.user)
        self.product = Product.objects.create(company=self.company, name="P", sku="SK", price=10)
        self.agent = AiAgent.objects.create(
            company=self.company, name="B", system_prompt="x",
            provider="openai", model_name="gpt-4o-mini"
        )
        raw_token = f"ldt_{uuid.uuid4().hex}_{sec_mod.token_urlsafe(32)}"
        self.device = LiveDevice.objects.create(
            company=self.company, name="D", token_hash=make_password(raw_token)
        )
        self.session = LiveSession.objects.create(
            company=self.company,
            device=self.device,
            platform="shopee",
            product=self.product,
            ai_agent=self.agent,
        )

    def tearDown(self):
        self.patcher.stop()

    def test_setup_manual_rtmp_endpoint_does_not_return_stream_key(self):
        """The setup-manual-rtmp response must NOT contain stream_key."""
        from django.urls import reverse
        url = reverse('sessions-setup-manual-rtmp', kwargs={'pk': str(self.session.id)})
        with patch('users.permissions.ActionBasedPermission.has_permission', return_value=True):
            response = self.api_client.post(url, {
                "server_url": "rtmp://live.shopee.vn/stream",
                "stream_key": "sk_super_secret_key"
            }, format="json")

        self.assertEqual(response.status_code, 200)
        data = response.json()
        self.assertNotIn("stream_key", data)
        self.assertNotIn("sk_super_secret_key", str(data))

    def test_session_list_does_not_return_stream_url(self):
        """GET /sessions/ must NOT return stream_url (write_only field)."""
        self.session.stream_url = "rtmp://live.shopee.vn/stream/sk_secret"
        self.session.save(update_fields=["stream_url"])

        with patch('users.permissions.ActionBasedPermission.has_permission', return_value=True):
            response = self.api_client.get("/api/live_sessions/sessions/")
        self.assertEqual(response.status_code, 200)
        for item in response.json().get("results", response.json()):
            self.assertNotIn("stream_url", item)

    def test_session_detail_does_not_return_stream_url(self):
        """GET /sessions/{id}/ must NOT return stream_url."""
        self.session.stream_url = "rtmp://live.shopee.vn/stream/sk_secret"
        self.session.save(update_fields=["stream_url"])

        with patch('users.permissions.ActionBasedPermission.has_permission', return_value=True):
            response = self.api_client.get(f"/api/live_sessions/sessions/{self.session.id}/")
        self.assertEqual(response.status_code, 200)
        self.assertNotIn("stream_url", response.json())


# ─────────────────────────────────────────────────────────────────────────────
# I — stream.start payload with Shopee profile
# ─────────────────────────────────────────────────────────────────────────────

class TestStreamStartPayload(TestCase):
    def setUp(self):
        from cryptography.fernet import Fernet
        from ai_agents.models import AiAgent
        from django.contrib.auth.hashers import make_password
        import secrets as sec_mod

        self.key = Fernet.generate_key()
        self.patcher = patch('live_sessions.platforms.security.get_encryption_key', return_value=self.key)
        self.patcher.start()

        self.company = make_company()
        self.product = Product.objects.create(company=self.company, name="P", sku="SK", price=10)
        self.agent = AiAgent.objects.create(
            company=self.company, name="B", system_prompt="x",
            provider="openai", model_name="gpt-4o-mini"
        )
        raw_token = f"ldt_{uuid.uuid4().hex}_{sec_mod.token_urlsafe(32)}"
        self.device = LiveDevice.objects.create(
            company=self.company, name="D", token_hash=make_password(raw_token)
        )
        self.session_shopee = LiveSession.objects.create(
            company=self.company,
            device=self.device,
            platform="shopee",
            product=self.product,
            ai_agent=self.agent,
            stream_url="rtmp://live.shopee.vn/s/k",
            shopee_connection_mode=LiveSession.SHOPEE_CONNECTION_MANUAL_RTMP,
        )
        self.session_generic = LiveSession.objects.create(
            company=self.company,
            device=self.device,
            platform="custom",
            product=self.product,
            ai_agent=self.agent,
            stream_url="rtmp://mediamtx.local/live",
        )

    def tearDown(self):
        self.patcher.stop()

    @patch('live_sessions.orchestrator.LiveSequenceService.get_next_sequence', return_value=1)
    @patch('live_sessions.orchestrator.async_to_sync')
    @patch('live_sessions.orchestrator.LiveConsoleEventService.emit')
    def test_shopee_stream_start_uses_9_16(self, mock_emit, mock_async, mock_seq):
        """dispatch_stream_start for Shopee session includes 720x1280 in payload."""
        mock_async.return_value = MagicMock()

        from live_sessions.orchestrator import LiveOrchestrator
        orch = LiveOrchestrator()
        result = orch.dispatch_stream_start(str(self.session_shopee.id))

        self.assertEqual(result["status"], "success")

        # Capture what was sent to channel layer
        send_call = mock_async.return_value.call_args
        envelope = send_call[0][1]["envelope"]
        payload = envelope["payload"]
        self.assertEqual(payload["width"], 720)
        self.assertEqual(payload["height"], 1280)

    @patch('live_sessions.orchestrator.LiveSequenceService.get_next_sequence', return_value=1)
    @patch('live_sessions.orchestrator.async_to_sync')
    @patch('live_sessions.orchestrator.LiveConsoleEventService.emit')
    def test_generic_stream_start_uses_default(self, mock_emit, mock_async, mock_seq):
        """dispatch_stream_start for generic/custom session uses 800x600 default."""
        mock_async.return_value = MagicMock()

        from live_sessions.orchestrator import LiveOrchestrator
        orch = LiveOrchestrator()
        result = orch.dispatch_stream_start(str(self.session_generic.id))

        self.assertEqual(result["status"], "success")

        send_call = mock_async.return_value.call_args
        envelope = send_call[0][1]["envelope"]
        payload = envelope["payload"]
        self.assertEqual(payload["width"], 800)
        self.assertEqual(payload["height"], 600)


# ─────────────────────────────────────────────────────────────────────────────
# O — Provider Factory selection
# ─────────────────────────────────────────────────────────────────────────────

class TestProviderFactory(TestCase):
    def _session(self, platform, mode=None):
        m = MagicMock()
        m.platform = platform
        m.shopee_connection_mode = mode
        return m

    def test_shopee_api_mode_returns_api_provider(self):
        session = self._session("shopee", mode=LiveSession.SHOPEE_CONNECTION_API)
        provider = get_stream_provider(session)
        self.assertIsInstance(provider, ShopeeApiStreamProvider)

    def test_shopee_manual_rtmp_returns_manual_provider(self):
        session = self._session("shopee", mode=LiveSession.SHOPEE_CONNECTION_MANUAL_RTMP)
        provider = get_stream_provider(session)
        self.assertIsInstance(provider, ShopeeManualRtmpProvider)

    def test_shopee_no_mode_returns_manual_provider(self):
        session = self._session("shopee", mode=None)
        provider = get_stream_provider(session)
        self.assertIsInstance(provider, ShopeeManualRtmpProvider)

    def test_custom_platform_returns_manual_provider(self):
        session = self._session("custom", mode=None)
        provider = get_stream_provider(session)
        self.assertIsInstance(provider, ShopeeManualRtmpProvider)
