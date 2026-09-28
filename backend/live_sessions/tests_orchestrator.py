import uuid
from unittest.mock import patch, MagicMock

from django.test import TestCase, override_settings
from django.utils import timezone

from users.models import Company
from live_sessions.models import LiveDevice, LiveSession, LivePlatformProduct
from live_sessions.orchestrator import LiveOrchestrator
from ai_agents.models import AiAgent
from inventory.models import Product

@override_settings(OPENAI_API_KEY="dummy_key", CELERY_BROKER_URL="redis://localhost:6379/2")
class LiveOrchestratorTests(TestCase):
    def setUp(self):
        self.company = Company.objects.create(name="Test Company", workspace_id="ws1", tax_code="tax1", is_active=True)
        self.company2 = Company.objects.create(name="Company 2", workspace_id="ws2", tax_code="tax2", is_active=True)
        
        self.device = LiveDevice.objects.create(
            id=uuid.uuid4().hex,
            company=self.company,
            name="Test Device",
            is_active=True
        )
        self.product = Product.objects.create(
            company=self.company,
            name="Test Product",
            sku="SKU1",
            price=1000,
            description="Test Desc"
        )
        self.ai_agent = AiAgent.objects.create(
            company=self.company,
            name="Test Agent",
            tts_voice="nova",
            tts_speed=1.5
        )
        
        self.session = LiveSession.objects.create(
            company=self.company,
            device=self.device,
            product=self.product,
            ai_agent=self.ai_agent,
            status=LiveSession.STATUS_RUNNING,
            platform=LivePlatformProduct.PLATFORM_SHOPEE
        )
        self.session_id = str(self.session.id)
        self.orchestrator = LiveOrchestrator()
        
        # Clear redis context before each test
        from live_sessions.services import LiveContextService
        LiveContextService.clear_context(str(self.company.id), str(self.session.id))

    @patch('live_sessions.orchestrator.search_knowledge')
    @patch('live_sessions.orchestrator.generate_ai_reply')
    @patch('live_sessions.audio.tts.OpenAITTSProvider.generate')
    @patch('channels.layers.InMemoryChannelLayer.group_send')
    def test_orchestrator_success_flow(self, mock_group_send, mock_tts_generate, mock_ai_reply, mock_rag):
        # Mock RAG
        mock_rag.return_value = "This is a good product."
        
        # Mock AI Reply
        mock_ai_reply.return_value = {
            "thought": "I should say something.",
            "reply": "Hello from AI!",
            "sentiment": "neutral",
            "action": "RESPOND",
            "intent": "GREETING"
        }
        
        # Mock TTS
        from live_sessions.audio.tts import AudioResult
        mock_tts_generate.return_value = AudioResult(
            audio_bytes=b"dummyaudio",
            mime_type="audio/mp3",
            format="mp3",
            duration_ms=1000
        )
        
        # Run orchestrator
        result = self.orchestrator.process_comment(self.session_id, "User says hi")
        
        self.assertEqual(result["status"], "success")
        self.assertIn("command_id", result)
        self.assertIn("message_id", result)
        self.assertIn("audio_url", result)
        
        # Verify RAG was called with correct product_id
        mock_rag.assert_called_once()
        self.assertEqual(mock_rag.call_args[1].get('product_id'), self.product.id)
        
        # Verify AI was called
        mock_ai_reply.assert_called_once()
        
        # Check context injection
        conversation_history = mock_ai_reply.call_args[0][1]
        self.assertTrue(any("THÔNG TIN SẢN PHẨM ĐANG LIVE" in msg['content'] for msg in conversation_history))
        self.assertTrue(any("Test Product" in msg['content'] for msg in conversation_history))
        self.assertTrue(any("BẮT BUỘC: Bạn đang ở chế độ Livestream" in msg['content'] for msg in conversation_history))
        
        # Verify TTS was called
        mock_tts_generate.assert_called_once()
        self.assertEqual(mock_tts_generate.call_args[0][0], "Hello from AI!")
        expected_config = {"voice": "nova", "speed": 1.5}
        self.assertEqual(mock_tts_generate.call_args[0][1], expected_config)
        
        # Verify Context Persistence
        from live_sessions.services import LiveContextService
        context = LiveContextService.get_context(str(self.company.id), str(self.session.id))
        self.assertIn("recent_history", context)
        history = context["recent_history"]
        self.assertEqual(len(history), 2)
        self.assertEqual(history[0]["role"], "user")
        self.assertEqual(history[0]["content"], "User says hi")
        self.assertEqual(history[1]["role"], "assistant")
        self.assertEqual(history[1]["content"], "Hello from AI!")

    @patch('live_sessions.orchestrator.generate_ai_reply')
    def test_orchestrator_human_takeover(self, mock_ai_reply):
        self.session.status = LiveSession.STATUS_HUMAN_TAKEOVER
        self.session.save()
        
        result = self.orchestrator.process_comment(self.session_id, "Hello")
        
        self.assertEqual(result["status"], "suppressed")
        self.assertEqual(result["reason"], "human_takeover")
        mock_ai_reply.assert_not_called()

    @patch('live_sessions.orchestrator.generate_ai_reply')
    def test_orchestrator_not_running(self, mock_ai_reply):
        self.session.status = LiveSession.STATUS_DRAFT
        self.session.save()
        
        result = self.orchestrator.process_comment(self.session_id, "Hello")
        
        self.assertEqual(result["status"], "suppressed")
        self.assertEqual(result["reason"], "not_running")
        mock_ai_reply.assert_not_called()

    @patch('live_sessions.orchestrator.generate_ai_reply')
    @patch('live_sessions.audio.tts.OpenAITTSProvider.generate')
    def test_orchestrator_empty_ai_reply(self, mock_tts, mock_ai_reply):
        mock_ai_reply.return_value = {
            "reply": "[STOP]",
            "action": "RESPOND"
        }
        
        result = self.orchestrator.process_comment(self.session_id, "Ok")
        
        self.assertEqual(result["status"], "suppressed")
        self.assertEqual(result["reason"], "empty_reply")
        mock_tts.assert_not_called()
        
    @patch('live_sessions.orchestrator.search_knowledge')
    @patch('live_sessions.orchestrator.generate_ai_reply')
    @patch('live_sessions.audio.tts.OpenAITTSProvider.generate')
    def test_orchestrator_action_ignore(self, mock_tts, mock_ai_reply, mock_rag):
        mock_rag.return_value = ""
        mock_ai_reply.return_value = {
            "reply": "",
            "action": "IGNORE",
            "intent": "SPAM"
        }
        
        result = self.orchestrator.process_comment(self.session_id, "This is spam")
        
        self.assertEqual(result["status"], "suppressed")
        self.assertEqual(result["reason"], "ignored_by_ai")
        mock_tts.assert_not_called()
        
        # Verify Context was not persisted for IGNORE
        from live_sessions.services import LiveContextService
        context = LiveContextService.get_context(str(self.company.id), str(self.session.id))
        self.assertNotIn("recent_history", context)

    @patch('live_sessions.orchestrator.search_knowledge')
    @patch('live_sessions.orchestrator.generate_ai_reply')
    @patch('live_sessions.audio.tts.OpenAITTSProvider.generate')
    def test_orchestrator_tts_failure(self, mock_tts, mock_ai_reply, mock_rag):
        mock_rag.return_value = ""
        mock_ai_reply.return_value = {"reply": "Hi", "action": "RESPOND"}
        mock_tts.side_effect = Exception("TTS API Down")
        
        result = self.orchestrator.process_comment(self.session_id, "Hello")
        
        self.assertEqual(result["status"], "error")
        self.assertEqual(result["reason"], "tts_failure")

    @patch('live_sessions.orchestrator.search_knowledge')
    @patch('live_sessions.orchestrator.generate_ai_reply')
    @patch('live_sessions.audio.tts.OpenAITTSProvider.generate')
    @patch('channels.layers.InMemoryChannelLayer.group_send')
    def test_orchestrator_product_truth_live_override(self, mock_group_send, mock_tts, mock_ai_reply, mock_rag):
        mock_rag.return_value = ""
        mock_ai_reply.return_value = {"reply": "Hi", "action": "RESPOND"}
        from live_sessions.audio.tts import AudioResult
        mock_tts.return_value = AudioResult(audio_bytes=b"dummyaudio", mime_type="audio/mp3", format="mp3", duration_ms=1000)
        
        # Add LivePlatformProduct
        LivePlatformProduct.objects.create(
            company=self.company,
            product=self.product,
            platform=self.session.platform,
            live_price_override=888
        )
        
        result = self.orchestrator.process_comment(self.session_id, "Bao nhiêu?")
        
        mock_ai_reply.assert_called_once()
        conversation_history = mock_ai_reply.call_args[0][1]
        
        # Verify Flash sale price is injected
        self.assertTrue(any("FLASH SALE TRÊN LIVE: 888" in msg['content'] for msg in conversation_history))

    @patch('live_sessions.orchestrator.search_knowledge')
    @patch('live_sessions.orchestrator.generate_ai_reply')
    @patch('live_sessions.audio.tts.OpenAITTSProvider.generate')
    @patch('channels.layers.InMemoryChannelLayer.group_send')
    def test_orchestrator_sliding_window_context_retrieval(self, mock_group_send, mock_tts, mock_ai_reply, mock_rag):
        mock_rag.return_value = ""
        mock_ai_reply.return_value = {"reply": "Fine", "action": "RESPOND"}
        from live_sessions.audio.tts import AudioResult
        mock_tts.return_value = AudioResult(audio_bytes=b"dummyaudio", mime_type="audio/mp3", format="mp3", duration_ms=1000)
        
        # Seed context
        from live_sessions.services import LiveContextService
        LiveContextService.add_to_history(str(self.company.id), str(self.session.id), "user", "Old msg 1")
        LiveContextService.add_to_history(str(self.company.id), str(self.session.id), "assistant", "Old reply 1")
        
        result = self.orchestrator.process_comment(self.session_id, "New msg")
        
        mock_ai_reply.assert_called_once()
        conversation_history = mock_ai_reply.call_args[0][1]
        
        # Verify old messages are in history before the new message
        user_msgs = [m for m in conversation_history if m['role'] == 'user']
        assistant_msgs = [m for m in conversation_history if m['role'] == 'assistant']
        
        self.assertEqual(user_msgs[0]['content'], "Old msg 1")
        self.assertEqual(user_msgs[1]['content'], "New msg")
        self.assertEqual(assistant_msgs[0]['content'], "Old reply 1")
