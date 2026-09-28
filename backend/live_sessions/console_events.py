import logging
import uuid
from typing import Any, Dict
from django.utils import timezone
from asgiref.sync import async_to_sync
from channels.layers import get_channel_layer

logger = logging.getLogger(__name__)

class LiveConsoleEventService:
    """
    Service chịu trách nhiệm emit các developer/observability events tới Admin WebSocket group.
    """
    
    @staticmethod
    def emit(session_id: str, event_type: str, payload: Dict[str, Any], correlation_id: str = None, message_id: str = None):
        """
        Emit một event tới group ws của admin cho session hiện tại.
        """
        channel_layer = get_channel_layer()
        if not channel_layer:
            return

        group_name = f"live_session_{session_id}_admin"
        
        # Build envelope theo chuẩn của yêu cầu
        envelope = {
            "event_version": "1.0",
            "event_type": event_type,
            "timestamp": timezone.now().isoformat(),
            "session_id": str(session_id),
            "message_id": message_id or str(uuid.uuid4()),
            "correlation_id": correlation_id,
            "payload": payload
        }
        
        try:
            async_to_sync(channel_layer.group_send)(
                group_name,
                {
                    "type": "admin.event",
                    "envelope": envelope
                }
            )
        except Exception as e:
            logger.error(f"[ConsoleEventService] Failed to emit event {event_type} for session {session_id}: {e}")
