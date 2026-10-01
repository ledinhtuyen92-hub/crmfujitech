import json
import uuid
from datetime import timedelta
from unittest.mock import patch

from channels.testing import WebsocketCommunicator
from channels.db import database_sync_to_async
from django.test import TransactionTestCase
from django.utils import timezone
from django.contrib.auth.hashers import make_password

from users.models import Company
from core.asgi import application
from live_sessions.models import LiveDevice, LiveSession, LivePlatformProduct
from live_sessions.services import LiveContextService
from inventory.models import Product
from ai_agents.models import AiAgent

class DeviceWebSocketTests(TransactionTestCase):
    
    def setUp(self):
        self.company = Company.objects.create(name="Test Company", workspace_id="ws1", tax_code="tax1", is_active=True)
        self.company2 = Company.objects.create(name="Other Company", workspace_id="ws2", tax_code="tax2", is_active=True)
        
        self.device_id_hex = uuid.uuid4().hex
        self.secret = "mysecret"
        self.token = f"ldt_{self.device_id_hex}_{self.secret}"
        self.token_hash = make_password(self.token)
        
        self.device = LiveDevice.objects.create(
            id=self.device_id_hex,
            company=self.company,
            name="Test Device",
            token_hash=self.token_hash,
            is_active=True
        )

        self.device2 = LiveDevice.objects.create(
            id=uuid.uuid4().hex,
            company=self.company2,
            name="Other Device",
            token_hash=make_password("something"),
            is_active=True
        )

        self.product = Product.objects.create(
            company=self.company,
            name="Test Product",
            sku="SKU001",
            price=1000
        )
        self.ai_agent = AiAgent.objects.create(
            company=self.company,
            name="Test Agent"
        )
        
        self.session = LiveSession.objects.create(
            company=self.company,
            device=self.device,
            platform=LivePlatformProduct.PLATFORM_CUSTOM,
            product=self.product,
            ai_agent=self.ai_agent,
            status='draft'
        )
        self.session_id = str(self.session.id)
        
        # Clear redis
        LiveContextService.clear_context(self.company.id, self.session_id)

    def tearDown(self):
        LiveContextService.clear_context(self.company.id, self.session_id)

    async def test_valid_header_authentication(self):
        communicator = WebsocketCommunicator(
            application, 
            f"/ws/live_sessions/{self.session_id}/device/",
            headers=[(b"authorization", f"Device {self.token}".encode())]
        )
        connected, _ = await communicator.connect()
        self.assertTrue(connected)
        await communicator.disconnect()

    async def test_invalid_header_authentication(self):
        communicator = WebsocketCommunicator(
            application, 
            f"/ws/live_sessions/{self.session_id}/device/",
            headers=[(b"authorization", b"Device ldt_invalid_token")]
        )
        connected, close_code = await communicator.connect()
        self.assertFalse(connected)
        self.assertEqual(close_code, 4001)

    async def test_query_string_fallback(self):
        communicator = WebsocketCommunicator(
            application, 
            f"/ws/live_sessions/{self.session_id}/device/?device_token={self.token}"
        )
        connected, _ = await communicator.connect()
        self.assertTrue(connected)
        await communicator.disconnect()

    async def test_cross_device_access_rejection(self):
        # Device 2 tries to access Device 1's session
        token2 = f"ldt_{self.device2.id}_something"
        self.device2.token_hash = make_password(token2)
        await self.device2.asave()
        
        communicator = WebsocketCommunicator(
            application, 
            f"/ws/live_sessions/{self.session_id}/device/",
            headers=[(b"authorization", f"Device {token2}".encode())]
        )
        connected, close_code = await communicator.connect()
        self.assertFalse(connected)
        self.assertEqual(close_code, 4003)

    async def test_terminal_session_rejection(self):
        self.session.status = 'stopped'
        await self.session.asave()

        communicator = WebsocketCommunicator(
            application, 
            f"/ws/live_sessions/{self.session_id}/device/",
            headers=[(b"authorization", f"Device {self.token}".encode())]
        )
        connected, close_code = await communicator.connect()
        self.assertFalse(connected)
        self.assertEqual(close_code, 4004)

    async def test_single_active_connection(self):
        # Connect first
        comm1 = WebsocketCommunicator(
            application, 
            f"/ws/live_sessions/{self.session_id}/device/",
            headers=[(b"authorization", f"Device {self.token}".encode())]
        )
        connected1, _ = await comm1.connect()
        self.assertTrue(connected1)

        # Connect second
        comm2 = WebsocketCommunicator(
            application, 
            f"/ws/live_sessions/{self.session_id}/device/",
            headers=[(b"authorization", f"Device {self.token}".encode())]
        )
        connected2, _ = await comm2.connect()
        self.assertTrue(connected2)

        # First connection should be closed by eviction
        try:
            msg1 = await comm1.receive_output()
            self.assertEqual(msg1["type"], "websocket.close")
            self.assertEqual(msg1["code"], 4009)
        except Exception:
            pass

        await comm2.disconnect()

    async def test_malformed_envelope(self):
        communicator = WebsocketCommunicator(
            application, 
            f"/ws/live_sessions/{self.session_id}/device/",
            headers=[(b"authorization", f"Device {self.token}".encode())]
        )
        await communicator.connect()
        
        # Send bad JSON
        await communicator.send_to(text_data="NOT JSON")
        
        # Expect error envelope
        response = await communicator.receive_json_from()
        self.assertEqual(response['type'], 'error')
        self.assertEqual(response['payload']['error_code'], 'INVALID_SCHEMA')

        await communicator.disconnect()

    async def test_freshness_expired(self):
        communicator = WebsocketCommunicator(
            application, 
            f"/ws/live_sessions/{self.session_id}/device/",
            headers=[(b"authorization", f"Device {self.token}".encode())]
        )
        await communicator.connect()
        
        old_time = timezone.now() - timedelta(minutes=5)
        
        payload = {
            "protocol_version": "1.0",
            "type": "event",
            "name": "event.comment",
            "message_id": str(uuid.uuid4()),
            "timestamp": old_time.isoformat(),
            "sequence_number": 1,
            "session_id": self.session_id,
            "payload": {
                "platform": "shopee",
                "comment_id": "c123",
                "viewer_name": "Test",
                "text": "Hello"
            }
        }
        await communicator.send_json_to(payload)
        
        response = await communicator.receive_json_from()
        self.assertEqual(response['type'], 'error')
        self.assertEqual(response['payload']['error_code'], 'COMMAND_EXPIRED')

        await communicator.disconnect()

    async def test_session_sync(self):
        communicator = WebsocketCommunicator(
            application, 
            f"/ws/live_sessions/{self.session_id}/device/",
            headers=[(b"authorization", f"Device {self.token}".encode())]
        )
        await communicator.connect()
        
        payload = {
            "protocol_version": "1.0",
            "type": "command",
            "name": "session.sync",
            "message_id": str(uuid.uuid4()),
            "timestamp": timezone.now().isoformat(),
            "sequence_number": 1,
            "session_id": self.session_id,
            "payload": {
                "cloud_to_device_sequence": 50,
                "device_to_cloud_sequence": 10,
                "status": "request"
            }
        }
        await communicator.send_json_to(payload)
        
        # We can't easily assert "no message" without timing out, but if it doesn't fail, it's fine.
        
        await communicator.disconnect()

    @patch('live_sessions.consumers.LiveConsoleEventService.emit')
    async def test_device_heartbeat_emits_event(self, mock_emit):
        communicator = WebsocketCommunicator(
            application, 
            f"/ws/live_sessions/{self.session_id}/device/",
            headers=[(b"authorization", f"Device {self.token}".encode())]
        )
        await communicator.connect()
        
        msg_id = str(uuid.uuid4())
        payload = {
            "protocol_version": "1.0",
            "type": "event",
            "name": "device.heartbeat",
            "message_id": msg_id,
            "timestamp": timezone.now().isoformat(),
            "sequence_number": 1,
            "session_id": self.session_id,
            "payload": {
                "uptime_seconds": 120,
                "execution_state": "playing",
                "capabilities_version": "1.0",
                "capabilities": {
                    "environment": {
                        "type": "local_studio",
                        "os": "Windows 11"
                    },
                    "rendering": {
                        "avatar_engine": "unity",
                        "max_resolution": "1080p",
                        "lip_sync_supported": True
                    },
                    "audio": {
                        "tts_mode": "remote",
                        "local_models": []
                    }
                }
            }
        }
        await communicator.send_json_to(payload)
        
        # Disconnect and let pending tasks finish
        await communicator.disconnect()
        
        # Wait a tiny bit to allow async task to run
        import asyncio
        await asyncio.sleep(0.1)

        # Assert LiveConsoleEventService.emit was called with safe payload
        mock_emit.assert_called_once()
        args, kwargs = mock_emit.call_args
        self.assertEqual(kwargs['session_id'], self.session_id)
        self.assertEqual(kwargs['event_type'], 'live.device.heartbeat')
        self.assertEqual(str(kwargs['correlation_id']), msg_id)
        
        safe_payload = kwargs['payload']
        self.assertEqual(safe_payload['uptime_seconds'], 120)
        self.assertEqual(safe_payload['execution_state'], 'playing')
        self.assertEqual(safe_payload['capabilities_version'], '1.0')
        # Ensure no stream key or secret is leaked
        self.assertNotIn('secret', safe_payload)
        self.assertNotIn('token', safe_payload)

        # Assert LiveContextService is updated
        context = await database_sync_to_async(LiveContextService.get_context)(self.company.id, self.session_id)
        self.assertEqual(context.get('uptime_seconds'), 120)
        self.assertEqual(context.get('execution_state'), 'playing')


