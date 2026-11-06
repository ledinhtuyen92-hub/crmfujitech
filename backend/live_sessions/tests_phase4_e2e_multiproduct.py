import uuid
from decimal import Decimal
from django.test import TestCase
from django.utils import timezone
from django.contrib.auth import get_user_model
from users.models import Company
from ai_agents.models import AiAgent
from live_sessions.models import LiveSession, LiveSessionProduct, LiveSessionVoucher, LiveDevice, LivePlatformProduct
from live_sessions.services import LiveProductMatchingService, LiveVoucherMatchingService, LiveContextService
from live_sessions.orchestrator import LiveOrchestrator
from unittest.mock import patch, MagicMock

User = get_user_model()

class Phase4E2EMultiProductLiveTestCase(TestCase):
    def setUp(self):
        self.company = Company.objects.create(name="E2E Live Brand", workspace_id="ws_e2e_live", tax_code="TAX_E2E_LIVE")
        self.user = User.objects.create_user(
            username="e2e_seller",
            email="e2e_seller@brand.vn",
            password="securepassword123",
            company=self.company
        )
        self.agent = AiAgent.objects.create(
            name="MC Thảo Linh AI",
            company=self.company,
            model_name="gpt-4o-mini"
        )
        self.device = LiveDevice.objects.create(
            name="PC Studio Phòng 1",
            company=self.company,
            is_active=True
        )
        self.session = LiveSession.objects.create(
            company=self.company,
            device=self.device,
            ai_agent=self.agent,
            platform=LivePlatformProduct.PLATFORM_SHOPEE,
            shopee_connection_mode="api",
            status=LiveSession.STATUS_RUNNING
        )

        # 3 Live Session Products
        self.p1 = LiveSessionProduct.objects.create(
            session=self.session,
            item_index=1,
            name="Áo Polo Thể Thao Nam Cao Cấp",
            sku="POLO-01",
            original_price=299000,
            live_price=149000,
            stock=50,
            selling_points="Vải cá sấu cotton, co giãn 4 chiều, không nhăn",
            duration_minutes=2
        )
        self.p2 = LiveSessionProduct.objects.create(
            session=self.session,
            item_index=2,
            name="Quần Short Gió Nam 2 Lớp",
            sku="SHORT-02",
            original_price=199000,
            live_price=99000,
            stock=30,
            selling_points="Khô nhanh trong 15 phút, có túi khóa zip tiện lợi",
            duration_minutes=2
        )
        self.p3 = LiveSessionProduct.objects.create(
            session=self.session,
            item_index=3,
            name="Giày Sneaker Chạy Bộ Siêu Nhẹ",
            sku="SNEAKER-03",
            original_price=599000,
            live_price=350000,
            stock=20,
            selling_points="Đế đệm khí êm ái, trợ lực khi chạy",
            duration_minutes=2
        )

        # 1 Live Voucher
        self.v1 = LiveSessionVoucher.objects.create(
            session=self.session,
            voucher_code="FREESHIP50K",
            discount_text="Miễn phí vận chuyển đơn từ 200k",
            min_order_value=200000,
            is_active=True
        )

    @patch('live_sessions.orchestrator.generate_ai_reply')
    @patch('live_sessions.orchestrator.generate_tts_with_failover')
    def test_e2e_comment_matching_and_instant_pin(self, mock_tts, mock_ai):
        """
        Khách bình luận hỏi 'mã 2 còn size L không em':
        - Regex nhận diện chính xác Sản phẩm #2.
        - Tự động gọi instant pin ghim SP #2 trên Shopee và trên DB.
        - System prompt của AI được nạp Product Truth chứa mã 2, giá live sale 99k, USP.
        """
        mock_ai.return_value = {
            "reply": "Dạ mã 02 Quần short gió nam bên em đang ghim trên màn hình còn đủ size L bác nha!",
            "intent": "PRODUCT_QUESTION",
            "action": "RESPOND"
        }
        mock_tts.return_value = (MagicMock(audio_bytes=b'1234', format='mp3'), 'edge', False, None)

        orchestrator = LiveOrchestrator()
        dummy_audio = {
            "asset_id": str(uuid.uuid4()),
            "signed_url": "http://audio.test/sample.mp3",
            "expires_at": "2026-12-31T23:59:59Z"
        }
        with patch.object(orchestrator.audio_storage, 'store', return_value=dummy_audio):
            with patch.object(orchestrator.channel_layer, 'group_send'):
                result = orchestrator.process_comment(
                    str(self.session.id),
                    "mã 2 còn size L không em",
                    correlation_id=str(uuid.uuid4())
                )

        # SP #2 được ghim, SP #1 và #3 không ghim
        self.assertEqual(result.get("status"), "success")
        self.p2.refresh_from_db()
        self.p1.refresh_from_db()
        self.assertTrue(self.p2.is_pinned)
        self.assertFalse(self.p1.is_pinned)

        # Xác minh AI prompt đã nhận đúng Product Truth của mã 2
        call_args = mock_ai.call_args[0]
        history = call_args[1]
        system_prompts = [msg['content'] for msg in history if msg['role'] == 'system']
        joined_prompt = "\n".join(system_prompts)
        self.assertIn("Quần Short Gió Nam 2 Lớp", joined_prompt)
        self.assertIn("Mã số 2", joined_prompt)
        self.assertIn("99,000", joined_prompt)

    def test_e2e_voucher_comment_matching(self):
        """
        Khách hỏi 'live này có voucher freeship không shop':
        - Regex nhận diện mã giảm giá.
        - Ghim voucher FREESHIP50K.
        """
        matched_v = LiveVoucherMatchingService.match_and_pin_voucher(
            self.session, 
            "live này có voucher freeship không shop"
        )
        self.assertIsNotNone(matched_v)
        self.assertEqual(matched_v.voucher_code, "FREESHIP50K")
        self.v1.refresh_from_db()
        self.assertTrue(self.v1.is_pinned)

    def test_e2e_proactive_carousel_pitch_rotation(self):
        """
        Khi live im lặng: AI tự động xoay vòng kịch bản 5 bước qua các sản phẩm trong túi live (0đ token).
        """
        orchestrator = LiveOrchestrator()
        context_data = {}

        # Bước 1: SP 1 chào mừng & ghim
        pitch_1 = orchestrator.generate_proactive_sales_pitch(None, self.session, context_data)
        self.assertIsNotNone(pitch_1)
        self.assertIn("mã số 1", pitch_1.lower())
        self.assertIn("Áo Polo Thể Thao Nam", pitch_1)
        self.p1.refresh_from_db()
        self.assertTrue(self.p1.is_pinned)

        # Giả lập hoàn thành 5 bước cho sản phẩm 1
        updated_context = LiveContextService.get_context(str(self.company.id), str(self.session.id))
        updated_context["carousel_step_idx"] = 5

        # Bước tiếp theo: Tự động chuyển sang SP 2
        pitch_next_prod = orchestrator.generate_proactive_sales_pitch(None, self.session, updated_context)
        self.assertIn("mã số 2", pitch_next_prod.lower())
        self.assertIn("Quần Short Gió Nam", pitch_next_prod)
        self.p1.refresh_from_db()
        self.p2.refresh_from_db()
        self.assertFalse(self.p1.is_pinned)
        self.assertTrue(self.p2.is_pinned)
