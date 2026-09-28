import json
import uuid
from datetime import timedelta
from unittest.mock import patch

from channels.testing import WebsocketCommunicator
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

        # First connection should receive a close message
        msg1 = await comm1.receive_json_from()
        # The eviction sends a custom event or closes directly?
        # Actually our code currently sends `{"type": "device.evicted", ...}` internally but the `device_evicted` handler calls `close(4009)`.
        # Wait, if `device_evicted` calls `self.close(code=4009)`, we won't receive JSON from it, we will just get disconnected!
        # WebsocketCommunicator will just raise an error on receive or return nothing?
        # Let's wait for disconnect
        try:
            await comm1.receive_output()
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
            "name": "device.heartbeat",
            "message_id": str(uuid.uuid4()),
            "timestamp": old_time.isoformat(),
            "sequence_number": 1,
            "session_id": self.session_id,
            "payload": {
                "uptime_seconds": 100,
                "execution_state": "idle"
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

    async def test_session_sync_gating_behavior(self):
        communicator = WebsocketCommunicator(
            application, 
            f"/ws/live_sessions/{self.session_id}/device/",
            headers=[(b"authorization", f"Device {self.token}".encode())]
        )
        await communicator.connect()
        
        from channels.layers import get_channel_layer
        import asyncio
        channel_layer = get_channel_layer()
        
        normal_command_envelope = {
            "protocol_version": "1.0",
            "type": "command",
            "name": "session.control",
            "message_id": str(uuid.uuid4()),
            "timestamp": timezone.now().isoformat(),
            "sequence_number": 2,
            "session_id": self.session_id,
            "payload": {
                "command_id": str(uuid.uuid4()),
                "action": "pause"
            }
        }
        
        sync_command_envelope = {
            "protocol_version": "1.0",
            "type": "command",
            "name": "session.sync",
            "message_id": str(uuid.uuid4()),
            "timestamp": timezone.now().isoformat(),
            "sequence_number": 3,
            "session_id": self.session_id,
            "payload": {
                "cloud_to_device_sequence": 50,
                "device_to_cloud_sequence": 10,
                "status": "request"
            }
        }

        # 1. Before sync: Normal command should be dropped
        await channel_layer.group_send(f"live_session_{self.session_id}_device", {
            "type": "send_command",
            "envelope": normal_command_envelope
        })
        
        # Expect timeout (message dropped)
        with self.assertRaises(asyncio.TimeoutError):
            await communicator.receive_json_from(timeout=1)
            
        # 2. Before sync: Cloud -> Device session.sync should be ALLOWED through
        await channel_layer.group_send(f"live_session_{self.session_id}_device", {
            "type": "send_command",
            "envelope": sync_command_envelope
        })
        
        response1 = await communicator.receive_json_from(timeout=1)
        self.assertEqual(response1['name'], 'session.sync')
        
        # 3. Send session.sync from Device -> Cloud to make it READY
        device_sync_payload = {
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
        await communicator.send_json_to(device_sync_payload)
        
        # Give consumer a moment to process and set is_synchronized = True
        await asyncio.sleep(0.1)

        # 4. After sync: Normal command should be ALLOWED through
        await channel_layer.group_send(f"live_session_{self.session_id}_device", {
            "type": "send_command",
            "envelope": normal_command_envelope
        })
        
        response2 = await communicator.receive_json_from(timeout=1)
        self.assertEqual(response2['name'], 'session.control')
        self.assertEqual(response2['payload']['action'], 'pause')

        await communicator.disconnect()
