from dataclasses import dataclass, field
from typing import Dict, Any, Optional

@dataclass
class ProtocolEnvelope:
    type: str
    name: str
    message_id: str
    timestamp: str
    sequence_number: int
    session_id: str
    payload: Dict[str, Any]

@dataclass
class SpeechSpeakPayload:
    command_id: str
    text: str
    correlation_id: Optional[str] = None
    audio_asset: Optional[Dict[str, Any]] = None
    interruptible: bool = True
    priority: str = "normal"

@dataclass
class SessionControlPayload:
    command_id: str
    action: str

@dataclass
class SessionSyncPayload:
    cloud_to_device_sequence: int
    device_to_cloud_sequence: int
    status: str = "request"
