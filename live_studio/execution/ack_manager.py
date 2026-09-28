import uuid
import datetime
import logging
from typing import Dict, Any, Optional
from live_studio.execution.device_sequence import DeviceSequenceCounter

logger = logging.getLogger(__name__)

class AckManager:
    """
    Formats command.ack envelopes for transmission to Cloud.
    """
    def __init__(self, session_id: str, sequence_counter: DeviceSequenceCounter):
        self.session_id = session_id
        self.sequence_counter = sequence_counter

    def build_ack(self, command_id: str, status: str, reference_message_id: str, error_code: Optional[str] = None) -> Dict[str, Any]:
        """
        Builds the ACK envelope.
        """
        payload = {
            "command_id": command_id,
            "status": status
        }
        if error_code:
            payload["error_code"] = error_code

        # Get the next monotonically increasing Device -> Cloud sequence number
        seq_num = self.sequence_counter.next()
        
        envelope = {
            "protocol_version": "1.0",
            "type": "ack",
            "name": "ack",
            "message_id": str(uuid.uuid4()),
            "timestamp": datetime.datetime.now(datetime.timezone.utc).isoformat(),
            "sequence_number": seq_num,
            "session_id": self.session_id,
            "reference_message_id": reference_message_id,
            "payload": payload
        }
        return envelope
