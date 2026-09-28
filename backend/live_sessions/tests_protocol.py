import uuid
from django.test import TestCase
from django.utils import timezone
from datetime import timedelta
from rest_framework.exceptions import ValidationError

from live_sessions.protocol.envelope import ProtocolEnvelopeSerializer
from live_sessions.protocol.capabilities import CapabilitiesSerializer
from live_sessions.protocol.audio import AudioAssetSerializer


class ProtocolSchemaTests(TestCase):
    
    def setUp(self):
        self.session_id = str(uuid.uuid4())
        self.message_id = str(uuid.uuid4())
        self.command_id = str(uuid.uuid4())
        self.now = timezone.now()

    def _get_base_envelope(self, type_str, name_str, payload):
        return {
            "protocol_version": "1.0",
            "type": type_str,
            "name": name_str,
            "message_id": self.message_id,
            "timestamp": self.now.isoformat(),
            "sequence_number": 1,
            "session_id": self.session_id,
            "payload": payload
        }

    def test_valid_command_envelope(self):
        payload = {
            "command_id": self.command_id,
            "action": "pause"
        }
        data = self._get_base_envelope("command", "session.control", payload)
        serializer = ProtocolEnvelopeSerializer(data=data)
        self.assertTrue(serializer.is_valid(), serializer.errors)
        self.assertEqual(serializer.validated_data['payload']['action'], 'pause')

    def test_invalid_uuid(self):
        data = self._get_base_envelope("command", "session.control", {"command_id": self.command_id, "action": "stop"})
        data["message_id"] = "invalid-uuid"
        serializer = ProtocolEnvelopeSerializer(data=data)
        self.assertFalse(serializer.is_valid())
        self.assertIn("message_id", serializer.errors)

    def test_missing_required_fields(self):
        data = self._get_base_envelope("command", "session.control", {"command_id": self.command_id, "action": "stop"})
        del data["protocol_version"]
        del data["sequence_number"]
        serializer = ProtocolEnvelopeSerializer(data=data)
        self.assertFalse(serializer.is_valid())
        self.assertIn("protocol_version", serializer.errors)
        self.assertIn("sequence_number", serializer.errors)

    def test_invalid_sequence_number(self):
        data = self._get_base_envelope("command", "session.control", {"command_id": self.command_id, "action": "stop"})
        data["sequence_number"] = -1
        serializer = ProtocolEnvelopeSerializer(data=data)
        self.assertFalse(serializer.is_valid())
        self.assertIn("sequence_number", serializer.errors)

    def test_type_name_mismatch(self):
        payload = {
            "command_id": self.command_id,
            "action": "pause"
        }
        # command + event.comment is invalid
        data = self._get_base_envelope("command", "event.comment", payload)
        serializer = ProtocolEnvelopeSerializer(data=data)
        self.assertFalse(serializer.is_valid())
        self.assertIn("name", serializer.errors)

        # event + speech.speak is invalid
        data = self._get_base_envelope("event", "speech.speak", payload)
        serializer = ProtocolEnvelopeSerializer(data=data)
        self.assertFalse(serializer.is_valid())
        self.assertIn("name", serializer.errors)

    def test_valid_speech_speak_command(self):
        payload = {
            "command_id": self.command_id,
            "text": "Hello world",
            "audio_asset": {
                "asset_id": str(uuid.uuid4()),
                "signed_url": "https://example.com/audio.mp3",
                "expires_at": (self.now + timedelta(minutes=5)).isoformat()
            }
        }
        data = self._get_base_envelope("command", "speech.speak", payload)
        serializer = ProtocolEnvelopeSerializer(data=data)
        self.assertTrue(serializer.is_valid(), serializer.errors)

    def test_valid_avatar_action_command(self):
        payload = {
            "command_id": self.command_id,
            "action": "wave",
            "duration_ms": 2000
        }
        data = self._get_base_envelope("command", "avatar.action", payload)
        serializer = ProtocolEnvelopeSerializer(data=data)
        self.assertTrue(serializer.is_valid(), serializer.errors)

    def test_valid_heartbeat_event(self):
        payload = {
            "uptime_seconds": 3600,
            "execution_state": "playing",
            "capabilities_version": "1.0",
            "capabilities": {
                "environment": {"type": "local_studio", "os": "windows"},
                "rendering": {"avatar_engine": "v1", "max_resolution": "1080p"},
                "audio": {"tts_mode": "remote", "local_models": []},
                "future_field": "accepted" # Forward compatibility test
            }
        }
        data = self._get_base_envelope("event", "device.heartbeat", payload)
        serializer = ProtocolEnvelopeSerializer(data=data)
        self.assertTrue(serializer.is_valid(), serializer.errors)
        self.assertEqual(serializer.validated_data['payload']['capabilities']['future_field'], 'accepted')

    def test_valid_comment_event(self):
        payload = {
            "platform": "tiktok",
            "comment_id": "c123",
            "viewer_name": "John",
            "text": "How much?"
        }
        data = self._get_base_envelope("event", "event.comment", payload)
        serializer = ProtocolEnvelopeSerializer(data=data)
        self.assertTrue(serializer.is_valid(), serializer.errors)

    def test_missing_required_comment_text(self):
        payload = {
            "platform": "tiktok",
            "comment_id": "c123",
            "viewer_name": "John"
        }
        data = self._get_base_envelope("event", "event.comment", payload)
        serializer = ProtocolEnvelopeSerializer(data=data)
        self.assertFalse(serializer.is_valid())
        self.assertIn("payload", serializer.errors)
        self.assertIn("text", serializer.errors["payload"])

    def test_valid_ack(self):
        payload = {
            "command_id": self.command_id,
            "reference_message_id": str(uuid.uuid4()),
            "status": "completed"
        }
        data = self._get_base_envelope("ack", "command.ack", payload)
        serializer = ProtocolEnvelopeSerializer(data=data)
        self.assertTrue(serializer.is_valid(), serializer.errors)

    def test_valid_error(self):
        payload = {
            "error_code": "INVALID_STATE",
            "detail": "Cannot pause when stopped"
        }
        data = self._get_base_envelope("error", "error", payload)
        data["reference_message_id"] = str(uuid.uuid4())
        serializer = ProtocolEnvelopeSerializer(data=data)
        self.assertTrue(serializer.is_valid(), serializer.errors)

    def test_error_missing_reference_message_id(self):
        payload = {
            "error_code": "INVALID_STATE",
            "detail": "msg"
        }
        data = self._get_base_envelope("error", "error", payload)
        # Missing reference_message_id
        serializer = ProtocolEnvelopeSerializer(data=data)
        self.assertFalse(serializer.is_valid())
        self.assertIn("reference_message_id", serializer.errors)

    def test_audio_asset_validation(self):
        payload = {
            "asset_id": str(uuid.uuid4()),
            "signed_url": "https://url.com",
            "expires_at": self.now.isoformat()
        }
        serializer = AudioAssetSerializer(data=payload)
        self.assertTrue(serializer.is_valid())

    def test_serialization_roundtrip(self):
        payload = {
            "command_id": self.command_id,
            "action": "pause"
        }
        data = self._get_base_envelope("command", "session.control", payload)
        serializer = ProtocolEnvelopeSerializer(data=data)
        self.assertTrue(serializer.is_valid())
        
        output = serializer.data
        self.assertEqual(output['type'], 'command')
        self.assertEqual(output['name'], 'session.control')
        self.assertEqual(output['payload']['action'], 'pause')
        # Check UUIDs are serialized to string properly
        self.assertIsInstance(output['message_id'], str)
        self.assertIsInstance(output['session_id'], str)

    def test_session_sync_valid(self):
        payload = {
            "cloud_to_device_sequence": 150,
            "device_to_cloud_sequence": 20,
            "status": "request"
        }
        data = self._get_base_envelope("command", "session.sync", payload)
        serializer = ProtocolEnvelopeSerializer(data=data)
        self.assertTrue(serializer.is_valid(), serializer.errors)
        self.assertEqual(serializer.validated_data['payload']['status'], 'request')

    def test_session_sync_missing_sequence(self):
        payload = {
            "device_to_cloud_sequence": 20,
            "status": "request"
        }
        data = self._get_base_envelope("command", "session.sync", payload)
        serializer = ProtocolEnvelopeSerializer(data=data)
        self.assertFalse(serializer.is_valid())
        self.assertIn('payload', serializer.errors)
        self.assertIn('cloud_to_device_sequence', serializer.errors['payload'])
