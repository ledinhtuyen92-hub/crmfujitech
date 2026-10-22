import base64
import time
from unittest.mock import patch, MagicMock

from django.test import TestCase
from users.models import Company
from ai_agents.models import CompanyAiKey, AiAgent
from live_sessions.audio.tts import (
    AudioResult,
    GoogleCloudTTSProvider,
    _execute_google_cloud_with_rotation,
    generate_tts_with_failover,
    _KEY_ROTATION_INDEX,
    _KEY_COOLDOWNS,
)
from live_sessions.audio.exceptions import TTSProviderException


class GoogleCloudTTSTests(TestCase):
    def setUp(self):
        self.company = Company.objects.create(
            name="Google TTS Co",
            workspace_id="ws_gtts",
            tax_code="tax_gtts",
            is_active=True
        )
        # Clear global rotation state for isolation
        _KEY_ROTATION_INDEX.clear()
        _KEY_COOLDOWNS.clear()

    def test_provider_empty_text_rejected(self):
        provider = GoogleCloudTTSProvider(api_key="AIzaSyFakeKey123")
        with self.assertRaises(TTSProviderException):
            provider.generate("")
        with self.assertRaises(TTSProviderException):
            provider.generate("   ")

    def test_provider_missing_api_key(self):
        with self.assertRaises(TTSProviderException):
            GoogleCloudTTSProvider(api_key="")

    @patch('requests.post')
    def test_provider_synthesize_success(self, mock_post):
        fake_audio_raw = b"fake_mp3_google_cloud_audio"
        fake_b64 = base64.b64encode(fake_audio_raw).decode('utf-8')

        mock_resp = MagicMock()
        mock_resp.status_code = 200
        mock_resp.json.return_value = {"audioContent": fake_b64}
        mock_post.return_value = mock_resp

        provider = GoogleCloudTTSProvider(api_key="AIzaSyFakeKey123")
        result = provider.generate(
            text="Chào bạn đến với livestream",
            voice_config={
                "voice": "vi-VN-Neural2-A",
                "speed": 1.15,
                "pitch": "+2.5st",
                "volume_gain_db": 1.5
            }
        )

        self.assertIsInstance(result, AudioResult)
        self.assertEqual(result.audio_bytes, fake_audio_raw)
        self.assertEqual(result.format, "mp3")
        self.assertEqual(result.mime_type, "audio/mpeg")

        # Verify request payload
        mock_post.assert_called_once()
        args, kwargs = mock_post.call_args
        self.assertIn("key=AIzaSyFakeKey123", args[0])
        json_data = kwargs["json"]
        self.assertEqual(json_data["input"]["text"], "Chào bạn đến với livestream")
        self.assertEqual(json_data["voice"]["name"], "vi-VN-Neural2-A")
        self.assertEqual(json_data["voice"]["languageCode"], "vi-VN")
        self.assertEqual(json_data["voice"]["ssmlGender"], "FEMALE")
        self.assertAlmostEqual(json_data["audioConfig"]["speakingRate"], 1.15)
        self.assertAlmostEqual(json_data["audioConfig"]["pitch"], 2.5)
        self.assertAlmostEqual(json_data["audioConfig"]["volumeGainDb"], 1.5)

    @patch('requests.post')
    def test_provider_quota_error_raises_exception(self, mock_post):
        mock_resp = MagicMock()
        mock_resp.status_code = 429
        mock_resp.json.return_value = {
            "error": {
                "code": 429,
                "message": "Resource has been exhausted (e.g. check quota).",
                "status": "RESOURCE_EXHAUSTED"
            }
        }
        mock_post.return_value = mock_resp

        provider = GoogleCloudTTSProvider(api_key="AIzaSyFakeKey123")
        with self.assertRaises(TTSProviderException) as cm:
            provider.generate("Test error")
        self.assertIn("hết quota hoặc bị giới hạn", str(cm.exception))

    @patch('requests.post')
    def test_multi_key_rotation_and_failover_on_quota(self, mock_post):
        # Create 2 CompanyAiKeys
        key1 = CompanyAiKey.objects.create(
            company=self.company,
            provider="google_cloud",
            api_key="AIzaSyKeyOne_429Exhausted",
            priority=10,
            is_active=True
        )
        key2 = CompanyAiKey.objects.create(
            company=self.company,
            provider="google_cloud",
            api_key="AIzaSyKeyTwo_ValidAndWorking",
            priority=5,
            is_active=True
        )

        fake_audio_raw = b"audio_from_key_two"
        fake_b64 = base64.b64encode(fake_audio_raw).decode('utf-8')

        # First call (key1) returns 429 RESOURCE_EXHAUSTED
        # Second call (key2) returns 200 OK
        resp_429 = MagicMock()
        resp_429.status_code = 429
        resp_429.json.return_value = {
            "error": {"code": 429, "message": "Quota exceeded", "status": "RESOURCE_EXHAUSTED"}
        }

        resp_200 = MagicMock()
        resp_200.status_code = 200
        resp_200.json.return_value = {"audioContent": fake_b64}

        mock_post.side_effect = [resp_429, resp_200]

        result = _execute_google_cloud_with_rotation(
            company=self.company,
            text="Hôm nay có deal hot!",
            voice_config={"voice": "vi-VN-Neural2-D", "speed": 1.0}
        )

        self.assertEqual(result.audio_bytes, fake_audio_raw)
        # Verify 2 post calls were made
        self.assertEqual(mock_post.call_count, 2)
        # Verify key1 is placed in cooldown
        self.assertTrue(key1.api_key in _KEY_COOLDOWNS)
        self.assertGreater(_KEY_COOLDOWNS[key1.api_key], time.time())

        # Next call should directly use key2 (since key1 is in cooldown)
        mock_post.reset_mock()
        mock_post.side_effect = [resp_200]
        result2 = _execute_google_cloud_with_rotation(
            company=self.company,
            text="Tiếp tục mua sắm nào!",
            voice_config={"voice": "vi-VN-Neural2-D", "speed": 1.0}
        )
        self.assertEqual(result2.audio_bytes, fake_audio_raw)
        # Only 1 post call made because key1 was skipped due to cooldown
        self.assertEqual(mock_post.call_count, 1)
        self.assertIn(f"key={key2.api_key}", mock_post.call_args[0][0])

    @patch('live_sessions.audio.tts.MicrosoftEdgeTTSProvider.generate')
    @patch('requests.post')
    def test_failover_to_edge_when_all_google_keys_exhausted(self, mock_post, mock_edge):
        CompanyAiKey.objects.create(
            company=self.company,
            provider="google_cloud",
            api_key="AIzaSyExhaustedOnlyKey",
            priority=10,
            is_active=True
        )

        # Google returns 429
        resp_429 = MagicMock()
        resp_429.status_code = 429
        resp_429.json.return_value = {
            "error": {"code": 429, "message": "Quota exceeded", "status": "RESOURCE_EXHAUSTED"}
        }
        mock_post.return_value = resp_429

        mock_edge.return_value = AudioResult(
            audio_bytes=b"edge_fallback_bytes",
            mime_type="audio/mp3",
            format="mp3"
        )

        agent = AiAgent.objects.create(
            company=self.company,
            name="Test Bot",
            tts_provider="google_cloud",
            tts_voice="vi-VN-Neural2-A",  # Female voice
            tts_speed=1.2,
            tts_pitch="+2.0st",
            tts_volume_gain_db=2.0
        )

        audio_res, used_provider, is_fallback, reason = generate_tts_with_failover(
            text="Xin chào các bạn đang xem live",
            agent=agent,
            company=self.company
        )

        self.assertTrue(is_fallback)
        self.assertEqual(used_provider, "microsoft")
        self.assertEqual(audio_res.audio_bytes, b"edge_fallback_bytes")
        mock_edge.assert_called_once()
        call_voice_config = mock_edge.call_args[0][1]
        self.assertEqual(call_voice_config["speed"], 1.2)
        self.assertEqual(call_voice_config["voice"], "vi-VN-HoaiMyNeural")  # Preserved female
