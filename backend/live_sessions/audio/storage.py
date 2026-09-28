import os
import uuid
import logging
from abc import ABC, abstractmethod
from datetime import datetime, timedelta
from typing import Dict, Any, Optional
from django.conf import settings
from django.core.signing import TimestampSigner, BadSignature, SignatureExpired

from .tts import AudioResult
from .exceptions import AudioStorageException

logger = logging.getLogger(__name__)

class BaseAudioStorage(ABC):
    @abstractmethod
    def store(self, audio: AudioResult, company_id: str, session_id: str) -> Dict[str, Any]:
        """
        Store the audio result and return an AudioAsset representation.
        """
        pass
        
    @abstractmethod
    def get_audio_path(self, asset_id: str) -> Optional[str]:
        """
        Return the absolute file path for serving (if applicable).
        """
        pass

class LocalAudioStorageBackend(BaseAudioStorage):
    """
    Local filesystem storage for MVP.
    """
    def __init__(self):
        # Default to MEDIA_ROOT/live_audio if configured, else a fallback
        self.base_dir = os.path.join(getattr(settings, "MEDIA_ROOT", "/tmp"), "live_audio")
        os.makedirs(self.base_dir, exist_ok=True)
        self.signer = TimestampSigner(salt="live_audio_asset")

    def store(self, audio: AudioResult, company_id: str, session_id: str) -> Dict[str, Any]:
        try:
            asset_id = str(uuid.uuid4())
            filename = f"{asset_id}.{audio.format}"
            
            # Store grouped by company and session to avoid flat directory scaling issues
            company_dir = os.path.join(self.base_dir, str(company_id))
            session_dir = os.path.join(company_dir, str(session_id))
            os.makedirs(session_dir, exist_ok=True)
            
            file_path = os.path.join(session_dir, filename)
            
            with open(file_path, "wb") as f:
                f.write(audio.audio_bytes)
                
            # Create a signed payload for secure access
            payload = f"{company_id}:{session_id}:{asset_id}:{audio.format}"
            signed_token = self.signer.sign(payload)
            
            # Use Django settings to build URL, fallback to relative
            base_url = getattr(settings, "SITE_URL", "")
            signed_url = f"{base_url}/api/v1/live_sessions/audio/{signed_token}/"
            
            expires_at = datetime.utcnow() + timedelta(hours=2) # 2 hours TTL for MVP
            
            return {
                "asset_id": asset_id,
                "signed_url": signed_url,
                "expires_at": expires_at.isoformat() + "Z",
                "mime_type": audio.mime_type,
                "size_bytes": len(audio.audio_bytes),
                "duration_ms": audio.duration_ms,
                "codec": audio.format,
                "sample_rate": audio.sample_rate,
                "channels": audio.channels,
            }
        except Exception as e:
            logger.error(f"Failed to store audio: {e}")
            raise AudioStorageException(f"Failed to store audio: {e}")

    def verify_token(self, signed_token: str, max_age: int = 7200) -> Optional[Dict[str, str]]:
        """
        Verify the signed token and return the payload components.
        """
        try:
            # max_age in seconds (default 2 hours)
            payload = self.signer.unsign(signed_token, max_age=max_age)
            parts = payload.split(":")
            if len(parts) == 4:
                return {
                    "company_id": parts[0],
                    "session_id": parts[1],
                    "asset_id": parts[2],
                    "format": parts[3]
                }
        except SignatureExpired:
            logger.warning("Audio token expired.")
        except BadSignature:
            logger.warning("Invalid audio token signature.")
        except Exception as e:
            logger.error(f"Error verifying token: {e}")
        return None

    def get_audio_path(self, payload_dict: Dict[str, str]) -> Optional[str]:
        """
        Reconstruct the file path from the verified payload.
        """
        company_id = payload_dict["company_id"]
        session_id = payload_dict["session_id"]
        asset_id = payload_dict["asset_id"]
        fmt = payload_dict["format"]
        
        file_path = os.path.join(self.base_dir, str(company_id), str(session_id), f"{asset_id}.{fmt}")
        if os.path.exists(file_path):
            return file_path
        return None
