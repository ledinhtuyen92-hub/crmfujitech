from django.test import TestCase
from unittest.mock import patch, MagicMock
from django.contrib.auth import get_user_model

from users.models import Company
from live_sessions.models import LiveDevice, LiveSession, LivePlatformProduct, LiveSessionProduct, LiveSessionVoucher
from ai_agents.models import AiAgent
from live_sessions.services import LiveProductMatchingService, LiveVoucherMatchingService, LiveContextService
from live_sessions.orchestrator import LiveOrchestrator

import uuid
User = get_user_model()

class Phase2OrchestrationTests(TestCase):
    def setUp(self):
        self.company = Company.objects.create(name="Fuji Company", is_active=True, workspace_id="ws_fuji", tax_code="TAX_FUJI")
        self.user = User.objects.create_user(
            username="streamer_fuji", email="streamer@fuji.com", password="password", company=self.company
        )
        self.device = LiveDevice.objects.create(company=self.company, name="Stream PC", is_active=True)
        self.agent = AiAgent.objects.create(company=self.company, name="MC AI Mai Linh", model_name="gpt-4o-mini")

        self.session = LiveSession.objects.create(
            company=self.company,
            device=self.device,
            ai_agent=self.agent,
            platform=LivePlatformProduct.PLATFORM_SHOPEE,
            status=LiveSession.STATUS_RUNNING
        )

        self.p1 = LiveSessionProduct.objects.create(
            session=self.session,
            item_index=1,
            name="Nồi chiên không dầu Lock&Lock",
            sku="LOCK-AIR-01",
            original_price=2500000,
            live_price=1490000,
            stock=30,
            selling_points="Dung tích 5.5L, công nghệ Rapid Air giảm 80% dầu mỡ",
            duration_minutes=2
        )
        self.p2 = LiveSessionProduct.objects.create(
            session=self.session,
            item_index=2,
            name="Bình giữ nhiệt Elmich Smart",
            sku="ELMICH-500",
            original_price=500000,
            live_price=299000,
            stock=50,
            selling_points="Inox 316 cao cấp, giữ nhiệt 24 giờ",
            duration_minutes=2
        )

        self.voucher = LiveSessionVoucher.objects.create(
            session=self.session,
            voucher_code="FUJI50K",
            discount_text="Giảm 50K cho đơn từ 300K",
            min_order_value=300000,
            is_active=True
        )

    def test_match_product_by_index(self):
        """Test comment matching product by index (mã 1, mã 02, sp 2, #1)."""
        test_cases = [
            ("Mã 2 còn hàng không shop?", self.p2),
            ("Cho em xem mã 01 với ạ", self.p1),
            ("sp 2 dung tích bao nhiêu?", self.p2),
            ("sản phẩm số 1 có bảo hành không?", self.p1),
            ("#2 giữ nhiệt được lâu không?", self.p2),
        ]
        for comment, expected_prod in test_cases:
            matched = LiveProductMatchingService.match_product(self.session, comment)
            self.assertIsNotNone(matched, f"Failed to match: {comment}")
            self.assertEqual(matched.id, expected_prod.id)

    def test_match_product_by_sku_and_name(self):
        """Test comment matching product by SKU or name keywords."""
        m1 = LiveProductMatchingService.match_product(self.session, "mẫu LOCK-AIR-01 có màu đen không")
        self.assertEqual(m1.id, self.p1.id)

        m2 = LiveProductMatchingService.match_product(self.session, "bình giữ nhiệt elmich có quai xách không")
        self.assertEqual(m2.id, self.p2.id)

    def test_match_and_pin_voucher(self):
        """Test comment inquiring about vouchers pins the active voucher."""
        matched_v = LiveVoucherMatchingService.match_and_pin_voucher(self.session, "shop ơi có mã giảm giá nào không?")
        self.assertIsNotNone(matched_v)
        self.assertEqual(matched_v.voucher_code, "FUJI50K")
        self.voucher.refresh_from_db()
        self.assertTrue(self.voucher.is_pinned)

    @patch('live_sessions.orchestrator.generate_ai_reply')
    @patch('live_sessions.orchestrator.generate_tts_with_failover')
    def test_process_comment_triggers_instant_pin_and_truth(self, mock_tts, mock_ai):
        """Test that process_comment recognizes product #2, pins it, and includes it in prompt."""
        mock_ai.return_value = {
            "reply": "Dạ em vừa ghim mã số 2 bình giữ nhiệt Elmich lên màn hình rồi ạ, hàng sẵn giao ngay bạn nhé!",
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
                result = orchestrator.process_comment(str(self.session.id), "mã 02 có màu xanh không shop?")

        self.assertEqual(result.get("status"), "success")
        self.p1.refresh_from_db()
        self.p2.refresh_from_db()
        self.assertFalse(self.p1.is_pinned)
        self.assertTrue(self.p2.is_pinned)

        # Verify AI prompt contained product truth of product 2
        call_args = mock_ai.call_args[0]
        history = call_args[1]
        system_prompts = [msg['content'] for msg in history if msg['role'] == 'system']
        joined_prompt = "\n".join(system_prompts)
        self.assertIn("Bình giữ nhiệt Elmich Smart", joined_prompt)
        self.assertIn("Mã số 2", joined_prompt)
        self.assertIn("299,000", joined_prompt)

    def test_carousel_rotation_engine(self):
        """Test carousel engine rotates through products and steps when live is silent."""
        orchestrator = LiveOrchestrator()
        context_data = {}

        # Step 0: Product 1 - Pitch 0 (Intro & Pin)
        pitch0 = orchestrator.generate_proactive_sales_pitch(None, self.session, context_data)
        self.p1.refresh_from_db()
        self.assertTrue(self.p1.is_pinned)
        self.assertIn("mã số 1", pitch0.lower())
        self.assertIn("Nồi chiên không dầu", pitch0)

        # Simulate 5 steps for Product 1
        updated_context = LiveContextService.get_context(str(self.company.id), str(self.session.id))
        updated_context["carousel_step_idx"] = 5  # Completed 5 steps for product 1

        # Next trigger should rotate to Product 2 and pin it!
        pitch_next = orchestrator.generate_proactive_sales_pitch(None, self.session, updated_context)
        self.p1.refresh_from_db()
        self.p2.refresh_from_db()
        self.assertFalse(self.p1.is_pinned)
        self.assertTrue(self.p2.is_pinned)
        self.assertIn("mã số 2", pitch_next.lower())
        self.assertIn("Bình giữ nhiệt Elmich", pitch_next)
