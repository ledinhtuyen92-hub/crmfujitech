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

@dataclass
class StreamStartPayload:
    command_id: str
    stream_url: str
    correlation_id: Optional[str] = None
    width: int = 800
    height: int = 600
    fps: int = 30
    video_codec: str = "h264"
    bitrate: str = "2500k"
    audio_sample_rate: int = 44100
    audio_channels: int = 2
    ai_agent_id: Optional[int] = None
    session_prompt: Optional[str] = None
    avatar_asset_url: Optional[str] = None
    background_asset_url: Optional[str] = None
    overlay_asset_url: Optional[str] = None
    audio_asset_url: Optional[str] = None

@dataclass
class StreamStopPayload:
    command_id: str
    correlation_id: Optional[str] = None
    reason: Optional[str] = None
