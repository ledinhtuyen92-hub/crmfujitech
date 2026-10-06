import json
import logging
import uuid
from datetime import timedelta

from django.utils import timezone
from channels.generic.websocket import AsyncWebsocketConsumer
from channels.db import database_sync_to_async

from .models import LiveSession
from .services import LiveContextService
from .protocol.envelope import ProtocolEnvelopeSerializer
from .console_events import LiveConsoleEventService

logger = logging.getLogger(__name__)

class DeviceAgentConsumer(AsyncWebsocketConsumer):
    
    async def connect(self):
        self.device = self.scope.get("device")
        self.is_synchronized = False
        
        if not self.device or not self.device.is_authenticated:
            logger.warning("Device WS rejected: unauthenticated.")
            await self.close(code=4001)
            return

        self.session_id = self.scope['url_route']['kwargs']['session_id']
        self.connection_id = str(uuid.uuid4())
        
        # Verify Session
        try:
            self.session = await self.get_session(self.session_id)
        except LiveSession.DoesNotExist:
            logger.warning(f"Device WS rejected: session {self.session_id} not found.")
            await self.close(code=4004)
            return

        if self.session.device_id != self.device.id:
            logger.warning(f"Device WS rejected: Forbidden (cross-device). Session {self.session_id}, Device {self.device.id}")
            await self.close(code=4003)
            return

        if self.session.status in ['error']:
            logger.warning(f"Device WS rejected: Session {self.session_id} is in terminal state ({self.session.status}).")
            await self.close(code=4004)
            return

        self.group_name = f"live_session_{self.session_id}_device"
        
        # Handle Single Active Connection
        await self.handle_single_active_connection()

        await self.channel_layer.group_add(
            self.group_name,
            self.channel_name,
        )

        await self.accept()
        
        logger.info(
            f"Device WS connected: session_id={self.session_id} device_id={self.device.id} connection_id={self.connection_id}"
        )

    @database_sync_to_async
    def get_session(self, session_id):
        return LiveSession.objects.get(id=session_id)

    async def handle_single_active_connection(self):
        # Read from LiveContextService
        context = await database_sync_to_async(LiveContextService.get_context)(self.session.company_id, self.session_id)
        active_channel = context.get('active_channel_name')
        
        if active_channel and active_channel != self.channel_name:
            # Send eviction targeted message to the old connection
            logger.info(f"Evicting old connection {active_channel} for session {self.session_id}")
            await self.channel_layer.send(active_channel, {
                "type": "device.evicted",
                "message": "Replaced by a newer active connection."
            })
            
        # Register new connection
        updates = {
            'active_connection_id': self.connection_id,
            'active_channel_name': self.channel_name
        }
        await database_sync_to_async(LiveContextService.update_context)(self.session.company_id, self.session_id, updates)

    async def disconnect(self, close_code):
        if hasattr(self, 'group_name'):
            await self.channel_layer.group_discard(
                self.group_name,
                self.channel_name,
            )
        logger.info(f"Device WS disconnected: session_id={getattr(self, 'session_id', 'unknown')} code={close_code}")

    async def device_evicted(self, event):
        """Called when a newer connection replaces this one."""
        logger.warning(f"Connection {self.connection_id} evicted by newer connection.")
        await self.close(code=4009)

    async def device_revoked(self, event):
        """Called when admin revokes the device runtime."""
        logger.warning(f"Device {getattr(self, 'device', None)} revoked. Terminating connection {self.connection_id}.")
        await self.close(code=4001)

    async def receive(self, text_data):
        try:
            data = json.loads(text_data)
        except json.JSONDecodeError:
            logger.warning("Received malformed JSON.")
            await self.send_error(None, 'INVALID_SCHEMA', 'Malformed JSON payload.')
            return

        serializer = ProtocolEnvelopeSerializer(data=data)
        if not serializer.is_valid():
            await self.send_error(
                data.get("message_id"), 
                'INVALID_SCHEMA', 
                json.dumps(serializer.errors)
            )
            return

        envelope = serializer.validated_data
        
        # Check freshness
        timestamp = envelope['timestamp']
        if abs(timezone.now() - timestamp) > timedelta(seconds=30):
            await self.send_error(envelope['message_id'], 'COMMAND_EXPIRED', 'Message is too old.')
            return

        # Route payload
        msg_type = envelope['type']
        msg_name = envelope['name']
        payload = envelope['payload']

        if msg_type == 'event' and msg_name == 'event.comment':
            logger.info(f"Dispatching comment to Celery: {payload.get('comment_id')}")
            # Dispatch Celery task
            from .tasks import handle_live_message
            handle_live_message.delay(
                session_id=self.session_id,
                user_message=payload.get('text', ''),
                correlation_id=envelope['message_id']
            )
        elif msg_type == 'event' and msg_name == 'device.heartbeat':
            updates = {
                'uptime_seconds': payload['uptime_seconds'],
                'execution_state': payload['execution_state']
            }
            await database_sync_to_async(LiveContextService.update_context)(
                self.session.company_id, self.session_id, updates
            )
            
            # Emit safe payload to admin console
            safe_payload = {
                'uptime_seconds': payload.get('uptime_seconds'),
                'execution_state': payload.get('execution_state'),
                'capabilities_version': payload.get('capabilities_version')
            }
            await LiveConsoleEventService.aemit(
                session_id=self.session_id,
                event_type="live.device.heartbeat",
                payload=safe_payload,
                correlation_id=envelope['message_id']
            )
        elif msg_type == 'event' and msg_name in ('stream.status', 'live.stream.status'):
            state = payload.get('state')
            hls_url = payload.get('hls_url', '')
            updates = {
                'stream_state': state
            }
            if hls_url:
                updates['hls_url'] = hls_url
            await database_sync_to_async(LiveContextService.update_context)(
                self.session.company_id, self.session_id, updates
            )
            
            # Rewrite the device-local HLS URL to a backend proxy URL
            # so the browser can access the stream without direct device access
            proxy_hls_url = hls_url
            if hls_url and ('127.0.0.1' in hls_url or 'localhost' in hls_url):
                from urllib.parse import urlparse
                parsed = urlparse(hls_url)
                # Extract path: /live/index.m3u8 -> live/index.m3u8
                path = parsed.path.lstrip('/')
                proxy_hls_url = f"/api/live_sessions/sessions/{self.session_id}/hls-proxy/{path}"
            
            await LiveConsoleEventService.aemit(
                session_id=self.session_id,
                event_type="live.stream.status",
                payload={"state": state, "hls_url": proxy_hls_url},
                correlation_id=envelope['message_id']
            )
        elif msg_type == 'command' and msg_name == 'session.sync':
            logger.info(f"Session Sync: {payload}")
            # Mark the connection as ready to receive/send commands
            self.is_synchronized = True
            
            # Respond to device to unblock its state
            sync_response = {
                "protocol_version": "1.0",
                "type": "command",
                "name": "session.sync",
                "message_id": str(uuid.uuid4()),
                "timestamp": timezone.now().isoformat(),
                "sequence_number": 0,
                "session_id": self.session_id,
                "payload": {
                    "cloud_to_device_sequence": 0,
                    "device_to_cloud_sequence": payload.get('device_to_cloud_sequence', 0),
                    "status": "synchronized"
                }
            }
            await self.send(text_data=json.dumps(sync_response))
            
        elif msg_type == 'ack':
            logger.info(f"Received ACK for command {payload.get('command_id')}: {payload.get('status')}")

    async def send_command(self, event):
        """
        Called when cloud wants to send a command down to device.
        Expects event["envelope"] to be a valid dict.
        """
        envelope = event["envelope"]
        
        # Gating: Prevent sending normal commands before sync
        if not getattr(self, 'is_synchronized', False):
            msg_type = envelope.get("type")
            msg_name = envelope.get("name")
            if not (msg_type == "command" and msg_name == "session.sync"):
                logger.warning(f"Dropping {msg_name} because connection is not yet synchronized.")
                return
                
        await self.send(text_data=json.dumps(envelope))

    async def send_error(self, reference_message_id, error_code, detail):
        error_envelope = {
            "protocol_version": "1.0",
            "type": "error",
            "name": "error",
            "message_id": str(uuid.uuid4()),
            "timestamp": timezone.now().isoformat(),
            "sequence_number": 0, # Errors can bypass sequence validation
            "session_id": str(getattr(self, 'session_id', uuid.uuid4())),
            "reference_message_id": str(reference_message_id) if reference_message_id else None,
            "payload": {
                "error_code": error_code,
                "detail": detail
            }
        }
        await self.send(text_data=json.dumps(error_envelope))

class AdminConsoleConsumer(AsyncWebsocketConsumer):
    
    async def connect(self):
        user = self.scope.get("user")
        if not user or not user.is_authenticated:
            logger.warning("Admin WS rejected: unauthenticated.")
            await self.close(code=4001)
            return

        self.session_id = self.scope['url_route']['kwargs']['session_id']
        
        # Verify Session
        try:
            self.session = await database_sync_to_async(LiveSession.objects.get)(id=self.session_id, company_id=user.company_id)
        except LiveSession.DoesNotExist:
            logger.warning(f"Admin WS rejected: session {self.session_id} not found for company {user.company.id}.")
            await self.close(code=4004)
            return

        self.group_name = f"live_session_{self.session_id}_admin"
        
        await self.channel_layer.group_add(
            self.group_name,
            self.channel_name,
        )

        await self.accept()
        logger.info(f"Admin WS connected: session_id={self.session_id} user={user.id}")

    async def disconnect(self, close_code):
        if hasattr(self, 'group_name'):
            await self.channel_layer.group_discard(
                self.group_name,
                self.channel_name,
            )
        logger.info(f"Admin WS disconnected: session_id={getattr(self, 'session_id', 'unknown')} code={close_code}")

    async def receive(self, text_data):
        # Admin is strictly read-only for now via WS, commands are sent via REST
        logger.info(f"Admin WS received message (ignored): {text_data}")

    async def admin_event(self, event):
        """
        Called when backend wants to send a console event down to admin.
        """
        envelope = event["envelope"]
        await self.send(text_data=json.dumps(envelope))
