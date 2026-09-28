import uuid
from django.test import TestCase
from users.models import User, Company
from inventory.models import Product
from .models import LiveSession, LiveDevice, PlatformAccount, LivePlatformProduct
from django.utils import timezone

class LiveSessionSchemaTests(TestCase):
    def setUp(self):
        self.company = Company.objects.create(name="Live Company", tax_code=str(uuid.uuid4())[:15], workspace_id=str(uuid.uuid4()))
        self.device = LiveDevice.objects.create(
            company=self.company,
            name="Test Device",
            token_hash="fake_hash"
        )
        self.product = Product.objects.create(
            company=self.company,
            name="Live Product",
            price=100000
        )
        self.agent = self.company.ai_agents.create(
            name="Live Agent"
        )
        
    def test_livesession_external_fields(self):
        # Can save external_session_id and stream_url
        session = LiveSession.objects.create(
            company=self.company,
            device=self.device,
            platform=LivePlatformProduct.PLATFORM_SHOPEE,
            product=self.product,
            ai_agent=self.agent,
            external_session_id="shopee_session_123",
            stream_url="rtmp://shopee.live/push/123"
        )
        
        # Reload from db
        session.refresh_from_db()
        self.assertEqual(session.external_session_id, "shopee_session_123")
        self.assertEqual(session.stream_url, "rtmp://shopee.live/push/123")
        
    def test_livesession_backward_compatibility(self):
        # Existing behaviour without the new fields
        session = LiveSession.objects.create(
            company=self.company,
            device=self.device,
            platform=LivePlatformProduct.PLATFORM_SHOPEE,
            product=self.product,
            ai_agent=self.agent
        )
        
        session.refresh_from_db()
        self.assertIsNone(session.external_session_id)
        self.assertIsNone(session.stream_url)
        self.assertEqual(session.status, LiveSession.STATUS_DRAFT)
from unittest.mock import patch
from .platforms.shopee import ShopeeAdapter
from .platforms.capabilities import Capability
from .platforms.exceptions import CapabilityNotSupportedError, PlatformAuthError, PlatformAPIError, PlatformRateLimitError
import uuid

class ShopeeAdapterLiveTests(TestCase):
    @patch('live_sessions.platforms.security.get_encryption_key')
    def setUp(self, mock_get_key):
        mock_get_key.return_value = b'MTIzNDU2Nzg5MDEyMzQ1Njc4OTAxMjM0NTY3ODkwMTI='
        self.company = Company.objects.create(name="Live Co 2", tax_code=str(uuid.uuid4())[:15], workspace_id=str(uuid.uuid4()))
        self.other_company = Company.objects.create(name="Other Co 2", tax_code=str(uuid.uuid4())[:15], workspace_id=str(uuid.uuid4()))
        
        self.account = PlatformAccount.objects.create(
            company=self.company,
            platform=LivePlatformProduct.PLATFORM_SHOPEE,
            account_id="123456",
            access_token="fake_access",
            status="connected"
        )
        
        self.device = LiveDevice.objects.create(
            company=self.company,
            name="Dev",
            token_hash="hash"
        )
        self.product = Product.objects.create(
            company=self.company,
            name="Prod",
            price=100
        )
        self.agent = self.company.ai_agents.create(name="Agent")
        
        self.session = LiveSession.objects.create(
            company=self.company,
            device=self.device,
            platform=LivePlatformProduct.PLATFORM_SHOPEE,
            product=self.product,
            ai_agent=self.agent
        )
        
        self.adapter = ShopeeAdapter(self.company.id)

    @patch('requests.request')
    @patch('live_sessions.platforms.security.get_encryption_key')
    def test_start_live_success(self, mock_get_key, mock_request):
        mock_get_key.return_value = b'MTIzNDU2Nzg5MDEyMzQ1Njc4OTAxMjM0NTY3ODkwMTI='
        mock_response = mock_request.return_value
        mock_response.status_code = 200
        mock_response.json.return_value = {
            "response": {
                "session_id": "ext_123",
                "push_url": "rtmp://shopee/123"
            }
        }
        
        res = self.adapter.start_live(str(self.session.id))
        self.assertEqual(res["external_session_id"], "ext_123")
        self.assertEqual(res["stream_url"], "rtmp://shopee/123")
        
        self.session.refresh_from_db()
        self.assertEqual(self.session.external_session_id, "ext_123")
        self.assertEqual(self.session.stream_url, "rtmp://shopee/123")
        
    @patch('requests.request')
    @patch('live_sessions.platforms.security.get_encryption_key')
    def test_start_live_api_error(self, mock_get_key, mock_request):
        mock_get_key.return_value = b'MTIzNDU2Nzg5MDEyMzQ1Njc4OTAxMjM0NTY3ODkwMTI='
        mock_response = mock_request.return_value
        mock_response.status_code = 200
        mock_response.json.return_value = {
            "error": "error_server",
            "message": "Internal error"
        }
        with self.assertRaises(PlatformAPIError):
            self.adapter.start_live(str(self.session.id))
            
    @patch('requests.request')
    @patch('live_sessions.platforms.security.get_encryption_key')
    def test_start_live_auth_error(self, mock_get_key, mock_request):
        mock_get_key.return_value = b'MTIzNDU2Nzg5MDEyMzQ1Njc4OTAxMjM0NTY3ODkwMTI='
        mock_response = mock_request.return_value
        mock_response.status_code = 200
        mock_response.json.return_value = {
            "error": "error_auth",
            "message": "Invalid token"
        }
        with self.assertRaises(PlatformAuthError):
            self.adapter.start_live(str(self.session.id))

    @patch('requests.request')
    @patch('live_sessions.platforms.security.get_encryption_key')
    def test_start_live_rate_limit(self, mock_get_key, mock_request):
        mock_get_key.return_value = b'MTIzNDU2Nzg5MDEyMzQ1Njc4OTAxMjM0NTY3ODkwMTI='
        mock_response = mock_request.return_value
        mock_response.status_code = 429
        with self.assertRaises(PlatformRateLimitError):
            self.adapter.start_live(str(self.session.id))
            
    @patch('requests.request')
    @patch('live_sessions.platforms.security.get_encryption_key')
    def test_start_live_missing_external_session_id(self, mock_get_key, mock_request):
        mock_get_key.return_value = b'MTIzNDU2Nzg5MDEyMzQ1Njc4OTAxMjM0NTY3ODkwMTI='
        mock_response = mock_request.return_value
        mock_response.status_code = 200
        mock_response.json.return_value = {
            "response": {
                # missing session_id
                "push_url": "rtmp://shopee/123"
            }
        }
        with self.assertRaises(PlatformAPIError):
            self.adapter.start_live(str(self.session.id))
            
    def test_start_live_cross_company(self):
        other_session = LiveSession.objects.create(
            company=self.other_company,
            device=LiveDevice.objects.create(company=self.other_company, name="Dev", token_hash="x"),
            platform=LivePlatformProduct.PLATFORM_SHOPEE,
            product=Product.objects.create(company=self.other_company, name="Prod", price=1),
            ai_agent=self.other_company.ai_agents.create(name="Agent")
        )
        with self.assertRaises(PlatformAPIError):
            self.adapter.start_live(str(other_session.id))

    @patch('requests.request')
    @patch('live_sessions.platforms.security.get_encryption_key')
    def test_get_live_status_success(self, mock_get_key, mock_request):
        mock_get_key.return_value = b'MTIzNDU2Nzg5MDEyMzQ1Njc4OTAxMjM0NTY3ODkwMTI='
        self.session.external_session_id = "ext_123"
        self.session.save()
        
        mock_response = mock_request.return_value
        mock_response.status_code = 200
        mock_response.json.return_value = {
            "response": {
                "status": "ONGOING"
            }
        }
        
        status = self.adapter.get_live_status(str(self.session.id))
        self.assertEqual(status, LiveSession.STATUS_RUNNING)
        
    def test_get_live_status_without_external_session_id(self):
        # self.session has no external_session_id yet
        with self.assertRaises(PlatformAPIError):
            self.adapter.get_live_status(str(self.session.id))
            
    @patch('requests.request')
    @patch('live_sessions.platforms.security.get_encryption_key')
    def test_get_live_status_unknown_state(self, mock_get_key, mock_request):
        mock_get_key.return_value = b'MTIzNDU2Nzg5MDEyMzQ1Njc4OTAxMjM0NTY3ODkwMTI='
        self.session.external_session_id = "ext_123"
        self.session.save()
        
        mock_response = mock_request.return_value
        mock_response.status_code = 200
        mock_response.json.return_value = {
            "response": {
                "status": "WEIRD_STATE"
            }
        }
        
        status = self.adapter.get_live_status(str(self.session.id))
        self.assertEqual(status, LiveSession.STATUS_ERROR)

    @patch('requests.request')
    @patch('live_sessions.platforms.security.get_encryption_key')
    def test_stop_live_success(self, mock_get_key, mock_request):
        mock_get_key.return_value = b'MTIzNDU2Nzg5MDEyMzQ1Njc4OTAxMjM0NTY3ODkwMTI='
        self.session.external_session_id = "ext_123"
        self.session.save()
        
        mock_response = mock_request.return_value
        mock_response.status_code = 200
        mock_response.json.return_value = {
            "response": {}
        }
        
        res = self.adapter.stop_live(str(self.session.id))
        self.assertTrue(res)

    def test_stop_live_without_external_session_id(self):
        with self.assertRaises(PlatformAPIError):
            self.adapter.stop_live(str(self.session.id))
            
    @patch('requests.request')
    @patch('live_sessions.platforms.security.get_encryption_key')
    def test_attach_product_success(self, mock_get_key, mock_request):
        mock_get_key.return_value = b'MTIzNDU2Nzg5MDEyMzQ1Njc4OTAxMjM0NTY3ODkwMTI='
        self.session.external_session_id = "ext_123"
        self.session.save()
        
        # create mapping
        LivePlatformProduct.objects.create(
            company=self.company,
            platform=LivePlatformProduct.PLATFORM_SHOPEE,
            platform_product_id="shopee_item_1",
            product=self.product,
            is_active=True
        )
        
        mock_response = mock_request.return_value
        mock_response.status_code = 200
        mock_response.json.return_value = {
            "response": {}
        }
        
        res = self.adapter.attach_product_to_live(str(self.session.id), "shopee_item_1")
        self.assertTrue(res)
        
    def test_attach_product_invalid_mapping(self):
        self.session.external_session_id = "ext_123"
        self.session.save()
        # no mapping created
        with self.assertRaises(PlatformAPIError):
            self.adapter.attach_product_to_live(str(self.session.id), "shopee_item_invalid")
            
    def test_attach_product_cross_company(self):
        self.session.external_session_id = "ext_123"
        self.session.save()
        
        LivePlatformProduct.objects.create(
            company=self.other_company,
            platform=LivePlatformProduct.PLATFORM_SHOPEE,
            platform_product_id="shopee_item_1",
            product=Product.objects.create(company=self.other_company, name="Prod", price=1),
            is_active=True
        )
        
        with self.assertRaises(PlatformAPIError):
            self.adapter.attach_product_to_live(str(self.session.id), "shopee_item_1")
            
    def test_capability_unsupported(self):
        with self.assertRaises(CapabilityNotSupportedError):
            self.adapter.send_comment_reply(str(self.session.id), "hello")

class ShopeeAdapterCommentsTests(TestCase):
    @patch('live_sessions.platforms.security.get_encryption_key')
    def setUp(self, mock_get_key):
        mock_get_key.return_value = b'MTIzNDU2Nzg5MDEyMzQ1Njc4OTAxMjM0NTY3ODkwMTI='
        self.company = Company.objects.create(name="Live Co 3", tax_code=str(uuid.uuid4())[:15], workspace_id=str(uuid.uuid4()))
        self.account = PlatformAccount.objects.create(
            company=self.company,
            platform=LivePlatformProduct.PLATFORM_SHOPEE,
            account_id="123456",
            access_token="fake_access",
            status="connected"
        )
        self.session = LiveSession.objects.create(
            company=self.company,
            device=LiveDevice.objects.create(company=self.company, name="Dev", token_hash="hash"),
            platform=LivePlatformProduct.PLATFORM_SHOPEE,
            product=Product.objects.create(company=self.company, name="Prod", price=100),
            ai_agent=self.company.ai_agents.create(name="Agent"),
            external_session_id="ext_123"
        )
        self.adapter = ShopeeAdapter(self.company.id)

    @patch('requests.request')
    @patch('live_sessions.platforms.security.get_encryption_key')
    def test_get_comments_success(self, mock_get_key, mock_request):
        mock_get_key.return_value = b'MTIzNDU2Nzg5MDEyMzQ1Njc4OTAxMjM0NTY3ODkwMTI='
        mock_response = mock_request.return_value
        mock_response.status_code = 200
        mock_response.json.return_value = {
            "response": {
                "comment_list": [
                    {
                        "comment_id": "cmt1",
                        "comment_content": "hello",
                        "user_id": "u1",
                        "user_name": "user1",
                        "comment_time": 1700000000
                    }
                ],
                "has_more": True
            }
        }
        
        comments, has_more = self.adapter.get_comments(str(self.session.id))
        self.assertTrue(has_more)
        self.assertEqual(len(comments), 1)
        self.assertEqual(comments[0].platform_comment_id, "cmt1")
        self.assertEqual(comments[0].text, "hello")
        self.assertEqual(comments[0].user_id, "u1")
        self.assertEqual(comments[0].display_name, "user1")
        self.assertEqual(comments[0].platform, LivePlatformProduct.PLATFORM_SHOPEE)
        self.assertEqual(comments[0].session_id, str(self.session.id))
        self.assertEqual(comments[0].company_id, self.company.id)

    @patch('requests.request')
    @patch('live_sessions.platforms.security.get_encryption_key')
    def test_get_comments_empty(self, mock_get_key, mock_request):
        mock_get_key.return_value = b'MTIzNDU2Nzg5MDEyMzQ1Njc4OTAxMjM0NTY3ODkwMTI='
        mock_response = mock_request.return_value
        mock_response.status_code = 200
        mock_response.json.return_value = {
            "response": {
                "comment_list": [],
                "has_more": False
            }
        }
        
        comments, has_more = self.adapter.get_comments(str(self.session.id))
        self.assertFalse(has_more)
        self.assertEqual(len(comments), 0)

    @patch('requests.request')
    @patch('live_sessions.platforms.security.get_encryption_key')
    def test_get_comments_api_error(self, mock_get_key, mock_request):
        mock_get_key.return_value = b'MTIzNDU2Nzg5MDEyMzQ1Njc4OTAxMjM0NTY3ODkwMTI='
        mock_response = mock_request.return_value
        mock_response.status_code = 500
        mock_request.side_effect = requests.RequestException("Timeout")
        
        with self.assertRaises(PlatformAPIError):
            self.adapter.get_comments(str(self.session.id))

    @patch('requests.request')
    @patch('live_sessions.platforms.security.get_encryption_key')
    def test_get_comments_auth_error(self, mock_get_key, mock_request):
        mock_get_key.return_value = b'MTIzNDU2Nzg5MDEyMzQ1Njc4OTAxMjM0NTY3ODkwMTI='
        mock_response = mock_request.return_value
        mock_response.status_code = 200
        mock_response.json.return_value = {
            "error": "error_auth",
            "message": "expired"
        }
        
        with self.assertRaises(PlatformAuthError):
            self.adapter.get_comments(str(self.session.id))

    @patch('requests.request')
    @patch('live_sessions.platforms.security.get_encryption_key')
    def test_get_comments_rate_limit(self, mock_get_key, mock_request):
        mock_get_key.return_value = b'MTIzNDU2Nzg5MDEyMzQ1Njc4OTAxMjM0NTY3ODkwMTI='
        mock_response = mock_request.return_value
        mock_response.status_code = 429
        
        with self.assertRaises(PlatformRateLimitError):
            self.adapter.get_comments(str(self.session.id))

from live_sessions.tasks import poll_shopee_live_comments
from live_sessions.platforms.events import LiveCommentEvent
from live_sessions.services import LiveCommentDedupService, LivePollingLockService
import requests

class PollingTaskTests(TestCase):
    @patch('live_sessions.platforms.security.get_encryption_key')
    def setUp(self, mock_get_key):
        mock_get_key.return_value = b'MTIzNDU2Nzg5MDEyMzQ1Njc4OTAxMjM0NTY3ODkwMTI='
        self.company = Company.objects.create(name="Live Co 4", tax_code=str(uuid.uuid4())[:15], workspace_id=str(uuid.uuid4()))
        self.account = PlatformAccount.objects.create(
            company=self.company,
            platform=LivePlatformProduct.PLATFORM_SHOPEE,
            account_id="123456",
            access_token="fake_access",
            status="connected"
        )
        self.session = LiveSession.objects.create(
            company=self.company,
            device=LiveDevice.objects.create(company=self.company, name="Dev", token_hash="hash"),
            platform=LivePlatformProduct.PLATFORM_SHOPEE,
            product=Product.objects.create(company=self.company, name="Prod", price=100),
            ai_agent=self.company.ai_agents.create(name="Agent"),
            external_session_id="ext_123",
            status=LiveSession.STATUS_RUNNING
        )

    @patch('live_sessions.tasks.handle_live_message.delay')
    @patch('live_sessions.tasks.poll_shopee_live_comments.apply_async')
    @patch('live_sessions.platforms.shopee.ShopeeAdapter.get_comments')
    @patch('live_sessions.services.LivePollingLockService.acquire_lock')
    @patch('live_sessions.services.LiveCommentDedupService.is_new_comment')
    def test_polling_continues_when_running(self, mock_is_new, mock_lock, mock_get, mock_apply, mock_delay):
        mock_lock.return_value = True
        # Return 1 new comment
        mock_is_new.return_value = True
        mock_get.return_value = ([
            LiveCommentEvent(
                event_id="e1",
                company_id=self.company.id,
                session_id=str(self.session.id),
                platform="shopee",
                platform_comment_id="c1",
                user_id="u1",
                display_name="user",
                text="hello",
                created_at=timezone.now()
            )
        ], False)
        
        poll_shopee_live_comments(str(self.session.id))
        
        mock_get.assert_called_once()
        mock_delay.assert_called_once_with(session_id=str(self.session.id), user_message="hello", correlation_id="e1")
        mock_apply.assert_called_once_with(kwargs={"session_id": str(self.session.id)}, countdown=3)
        
    @patch('live_sessions.tasks.poll_shopee_live_comments.apply_async')
    @patch('live_sessions.platforms.shopee.ShopeeAdapter.get_comments')
    def test_polling_stops_when_session_not_running(self, mock_get, mock_apply):
        self.session.status = LiveSession.STATUS_STOPPED
        self.session.save()
        
        poll_shopee_live_comments(str(self.session.id))
        
        mock_get.assert_not_called()
        mock_apply.assert_not_called()

    @patch('live_sessions.tasks.poll_shopee_live_comments.apply_async')
    @patch('live_sessions.platforms.shopee.ShopeeAdapter.get_comments')
    @patch('live_sessions.services.LivePollingLockService.acquire_lock')
    def test_polling_lock_blocks_second_worker(self, mock_lock, mock_get, mock_apply):
        mock_lock.return_value = False
        
        poll_shopee_live_comments(str(self.session.id))
        
        mock_get.assert_not_called()
        mock_apply.assert_not_called()

    @patch('live_sessions.tasks.handle_live_message.delay')
    @patch('live_sessions.tasks.poll_shopee_live_comments.apply_async')
    @patch('live_sessions.platforms.shopee.ShopeeAdapter.get_comments')
    @patch('live_sessions.services.LivePollingLockService.acquire_lock')
    @patch('live_sessions.services.LiveCommentDedupService.is_new_comment')
    def test_duplicate_comment_filtered(self, mock_is_new, mock_lock, mock_get, mock_apply, mock_delay):
        mock_lock.return_value = True
        mock_is_new.return_value = False # Duplicate!
        mock_get.return_value = ([
            LiveCommentEvent(
                event_id="e1",
                company_id=self.company.id,
                session_id=str(self.session.id),
                platform="shopee",
                platform_comment_id="c1",
                user_id="u1",
                display_name="user",
                text="hello",
                created_at=timezone.now()
            )
        ], False)
        
        poll_shopee_live_comments(str(self.session.id))
        
        mock_delay.assert_not_called()
        
    @patch('live_sessions.tasks.handle_live_message.delay')
    @patch('live_sessions.tasks.poll_shopee_live_comments.apply_async')
    @patch('live_sessions.platforms.shopee.ShopeeAdapter.get_comments')
    @patch('live_sessions.services.LivePollingLockService.acquire_lock')
    @patch('live_sessions.services.LiveCommentDedupService.is_new_comment')
    def test_pagination_cap_50(self, mock_is_new, mock_lock, mock_get, mock_apply, mock_delay):
        mock_lock.return_value = True
        mock_is_new.return_value = True
        
        comments = []
        for i in range(60):
            comments.append(
                LiveCommentEvent(
                    event_id=f"e{i}",
                    company_id=self.company.id,
                    session_id=str(self.session.id),
                    platform="shopee",
                    platform_comment_id=f"c{i}",
                    user_id="u1",
                    display_name="user",
                    text="hello",
                    created_at=timezone.now()
                )
            )
        mock_get.return_value = (comments, True)
        
        poll_shopee_live_comments(str(self.session.id))
        
        # Should only process 50 comments
        self.assertEqual(mock_delay.call_count, 50)
