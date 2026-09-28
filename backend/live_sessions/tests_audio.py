import os
import shutil
import uuid
from unittest.mock import patch, MagicMock
from datetime import timedelta

from django.test import TestCase, override_settings
from django.conf import settings
from django.urls import reverse
from rest_framework.test import APIClient

from users.models import Company
from live_sessions.models import LiveDevice
from live_sessions.audio.tts import AudioResult, OpenAITTSProvider
from live_sessions.audio.exceptions import TTSProviderException
from live_sessions.audio.storage import LocalAudioStorageBackend

# A temp directory for tests
TEST_MEDIA_ROOT = os.path.join(settings.BASE_DIR, 'test_media')

@override_settings(MEDIA_ROOT=TEST_MEDIA_ROOT)
class AudioLayerTests(TestCase):
    def setUp(self):
        self.company = Company.objects.create(name="Audio Test Co", workspace_id="ws3", tax_code="tax3", is_active=True)
        self.company2 = Company.objects.create(name="Audio Other Co", workspace_id="ws4", tax_code="tax4", is_active=True)
        
        self.device = LiveDevice.objects.create(
            company=self.company,
            name="Test Device 3",
            token_hash="hash3",
            is_active=True
        )
        self.session_id = str(uuid.uuid4())
        
        # We need a proper token for DeviceTokenAuthentication
        self.raw_token = f"ldt_{self.device.id.hex}_secret3"
        from django.contrib.auth.hashers import make_password
        self.device.token_hash = make_password(self.raw_token)
        self.device.save()
        
        self.storage = LocalAudioStorageBackend()

    def tearDown(self):
        # Clean up temp media directory
        if os.path.exists(TEST_MEDIA_ROOT):
            shutil.rmtree(TEST_MEDIA_ROOT)

    @patch('live_sessions.audio.tts.OpenAI')
    def test_tts_generate_success(self, mock_openai):
        # Mock OpenAI response
        mock_client = MagicMock()
        mock_response = MagicMock()
        mock_response.content = b"fake_audio_bytes"
        mock_client.audio.speech.create.return_value = mock_response
        mock_openai.return_value = mock_client
        
        provider = OpenAITTSProvider(api_key="fake-key")
        result = provider.generate("Xin chào, tôi là AI", {"model": "tts-1", "response_format": "mp3"})
        
        self.assertIsInstance(result, AudioResult)
        self.assertEqual(result.audio_bytes, b"fake_audio_bytes")
        self.assertEqual(result.format, "mp3")
        self.assertEqual(result.mime_type, "audio/mp3")
        mock_client.audio.speech.create.assert_called_once()

    def test_tts_empty_text_rejected(self):
        provider = OpenAITTSProvider(api_key="fake-key")
        with self.assertRaises(TTSProviderException):
            provider.generate("")
        with self.assertRaises(TTSProviderException):
            provider.generate("   ")

    def test_audio_storage_store_and_retrieve(self):
        audio_result = AudioResult(
            audio_bytes=b"dummy_bytes",
            mime_type="audio/mp3",
            format="mp3"
        )
        
        company_id = str(self.company.id)
        
        asset = self.storage.store(audio_result, company_id, self.session_id)
        
        self.assertIn("asset_id", asset)
        self.assertIn("signed_url", asset)
        self.assertIn("expires_at", asset)
        self.assertEqual(asset["size_bytes"], len(b"dummy_bytes"))
        
        # Verify the file is actually on disk
        # We can extract the token from signed_url
        token = asset["signed_url"].rstrip("/").split("/")[-1]
        
        payload = self.storage.verify_token(token)
        self.assertIsNotNone(payload)
        self.assertEqual(payload["company_id"], company_id)
        self.assertEqual(payload["session_id"], self.session_id)
        self.assertEqual(payload["asset_id"], asset["asset_id"])
        
        file_path = self.storage.get_audio_path(payload)
        self.assertIsNotNone(file_path)
        self.assertTrue(os.path.exists(file_path))
        
        with open(file_path, "rb") as f:
            self.assertEqual(f.read(), b"dummy_bytes")

    def test_audio_storage_expired_token(self):
        audio_result = AudioResult(audio_bytes=b"123", mime_type="audio/mp3", format="mp3")
        asset = self.storage.store(audio_result, str(self.company.id), self.session_id)
        token = asset["signed_url"].rstrip("/").split("/")[-1]
        
        # Verify with 0 max_age should fail
        payload = self.storage.verify_token(token, max_age=-1)
        self.assertIsNone(payload)

    def test_audio_secure_endpoint_success(self):
        audio_result = AudioResult(audio_bytes=b"hello", mime_type="audio/mp3", format="mp3")
        asset = self.storage.store(audio_result, str(self.company.id), self.session_id)
        token = asset["signed_url"].rstrip("/").split("/")[-1]
        
        client = APIClient()
        client.credentials(HTTP_AUTHORIZATION=f'Device {self.raw_token}')
        
        url = reverse('serve-audio-asset', kwargs={'token': token})
        response = client.get(url)
        
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.headers.get("Content-Type"), "audio/mp3")
        
        # Test content
        self.assertEqual(b"".join(response.streaming_content), b"hello")

    def test_audio_secure_endpoint_tenant_isolation(self):
        audio_result = AudioResult(audio_bytes=b"hello", mime_type="audio/mp3", format="mp3")
        # Store for company 2
        asset = self.storage.store(audio_result, str(self.company2.id), self.session_id)
        token = asset["signed_url"].rstrip("/").split("/")[-1]
        
        # Access with Device 1 (company 1)
        client = APIClient()
        client.credentials(HTTP_AUTHORIZATION=f'Device {self.raw_token}')
        
        url = reverse('serve-audio-asset', kwargs={'token': token})
        response = client.get(url)
        
        # Should be forbidden
        self.assertEqual(response.status_code, 403)
        self.assertEqual(response.json()['detail'], 'Forbidden. Tenant mismatch.')
