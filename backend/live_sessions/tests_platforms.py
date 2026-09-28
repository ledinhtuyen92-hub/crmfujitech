import uuid
from django.test import TestCase
from django.core.exceptions import ValidationError
from users.models import User, Company
from inventory.models import Product
from ai_agents.models import AiAgent
from .models import LiveDevice, LiveSession, PlatformAccount, LivePlatformProduct
from .platforms.capabilities import Capability
from .platforms.mock import MockPlatformAdapter
from .platforms.events import LiveCommentEvent
from .platforms.exceptions import CapabilityNotSupportedError

class PlatformAdapterTests(TestCase):
    def setUp(self):
        self.company = Company.objects.create(name="Test Company")
        self.company2 = Company.objects.create(name="Another Company", workspace_id=str(uuid.uuid4()), tax_code=str(uuid.uuid4())[:15])
        
        self.account = PlatformAccount.objects.create(
            company=self.company,
            platform=LivePlatformProduct.PLATFORM_TIKTOK,
            account_id="tiktok_123",
            display_name="Test Shop",
            access_token="token_abc",
            refresh_token="refresh_abc"
        )
        
        self.device = LiveDevice.objects.create(
            company=self.company,
            name="Test Device"
        )
        self.product = Product.objects.create(
            company=self.company,
            name="Test Product",
            sku="SKU-1"
        )
        self.agent = AiAgent.objects.create(
            company=self.company,
            name="Test Agent"
        )

    def test_tenant_isolation(self):
        # Should raise validation error if platform_account is from another company
        account2 = PlatformAccount.objects.create(
            company=self.company2,
            platform=LivePlatformProduct.PLATFORM_TIKTOK,
            account_id="tiktok_123_2",
            display_name="Test Shop 2",
        )
        
        session = LiveSession(
            company=self.company,
            device=self.device,
            platform=LivePlatformProduct.PLATFORM_TIKTOK,
            platform_account=account2, # Wrong company
            product=self.product,
            ai_agent=self.agent
        )
        with self.assertRaises(ValidationError) as context:
            session.clean()
        self.assertIn("Tài khoản nền tảng không thuộc cùng công ty", str(context.exception))

    def test_platform_match_validation(self):
        # Should raise validation error if platform mismatch
        session = LiveSession(
            company=self.company,
            device=self.device,
            platform=LivePlatformProduct.PLATFORM_SHOPEE, # Mismatch
            platform_account=self.account,
            product=self.product,
            ai_agent=self.agent
        )
        with self.assertRaises(ValidationError) as context:
            session.clean()
        self.assertIn("không khớp với nền tảng của tài khoản", str(context.exception))

    def test_mock_adapter_capabilities(self):
        adapter = MockPlatformAdapter(company_id=self.company.id)
        caps = adapter.get_capabilities()
        self.assertIn(Capability.AUTH, caps)
        self.assertIn(Capability.LIVE_COMMENTS, caps)

    def test_mock_adapter_authenticate(self):
        adapter = MockPlatformAdapter(company_id=self.company.id)
        self.assertTrue(adapter.authenticate())
        
        account_info = adapter.get_account()
        self.assertEqual(account_info["account_id"], "mock_account_123")

    def test_mock_comment_injection(self):
        adapter = MockPlatformAdapter(company_id=self.company.id)
        session_id = str(uuid.uuid4())
        
        event = adapter.inject_mock_comment(
            session_id=session_id,
            user_id="user_1",
            display_name="Viewer",
            text="How much?"
        )
        
        self.assertIsInstance(event, LiveCommentEvent)
        self.assertEqual(event.text, "How much?")
        self.assertEqual(event.company_id, self.company.id)
        self.assertEqual(event.platform, "mock")

    def test_unsupported_capability(self):
        # Let's create an adapter with limited capabilities
        class LimitedAdapter(MockPlatformAdapter):
            def get_capabilities(self):
                return [Capability.AUTH]
                
        adapter = LimitedAdapter(company_id=self.company.id)
        
        # AUTH is supported
        self.assertTrue(adapter.authenticate())
        
        # LIVE_STATUS is not supported
        with self.assertRaises(CapabilityNotSupportedError):
            adapter.get_live_status("session_1")
