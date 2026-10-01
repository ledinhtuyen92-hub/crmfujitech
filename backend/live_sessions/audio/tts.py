import logging
from abc import ABC, abstractmethod
from typing import Optional, Dict, Any
from dataclasses import dataclass
from django.conf import settings

from openai import OpenAI, APITimeoutError, APIError

from .exceptions import TTSTimeoutException, TTSProviderException

logger = logging.getLogger(__name__)

@dataclass
class AudioResult:
    audio_bytes: bytes
    mime_type: str
    format: str
    sample_rate: Optional[int] = None
    channels: Optional[int] = None
    duration_ms: Optional[int] = None

class BaseTTSProvider(ABC):
    @abstractmethod
    def generate(self, text: str, voice_config: Optional[Dict[str, Any]] = None) -> AudioResult:
        """
        Generate audio from text.
        """
        pass

class DummyTTSProvider(BaseTTSProvider):
    def generate(self, text: str, voice_config: Optional[Dict[str, Any]] = None) -> AudioResult:
        logger.info(f"DummyTTS generating audio for text: {text}")
        import os
        fallback = '/app/media/dummy.mp3'
        if not os.path.exists(fallback):
            # Just create a minimal valid mp3 header if possible, or an empty file 
            # Pygame mixer might crash on empty file, so we try to find any .mp3 in project
            audio_bytes = b''
        else:
            with open(fallback, 'rb') as f:
                audio_bytes = f.read()
                
        return AudioResult(
            audio_bytes=audio_bytes,
            mime_type="audio/mp3",
            format="mp3",
            sample_rate=24000,
            channels=1
        )

class OpenAITTSProvider(BaseTTSProvider):
    """
    OpenAI TTS Provider for MVP.
    Uses model tts-1 by default.
    """
    def __init__(self, api_key: Optional[str] = None):
        # We allow passing API key (e.g. from CompanyAiKey) or fallback to settings
        self.api_key = api_key or getattr(settings, "OPENAI_API_KEY", None)
        if not self.api_key:
            raise TTSProviderException("OpenAI API key is missing.")
        self.client = OpenAI(api_key=self.api_key)

    def generate(self, text: str, voice_config: Optional[Dict[str, Any]] = None) -> AudioResult:
        if not text or not text.strip():
            raise TTSProviderException("Text cannot be empty.")
            
        config = voice_config or {}
        model = config.get("model", "tts-1")
        voice = config.get("voice", "alloy") # alloy, echo, fable, onyx, nova, shimmer
        response_format = config.get("response_format", "mp3") # mp3, opus, aac, flac, wav, pcm
        speed = config.get("speed", 1.0)
        
        try:
            response = self.client.audio.speech.create(
                model=model,
                voice=voice,
                input=text,
                response_format=response_format,
                speed=speed,
                timeout=15.0 # 15 seconds timeout
            )
            
            # OpenAI doesn't natively return sample rate in the wrapper response without parsing the file,
            # but standard output for their mp3 is generally 24kHz. We'll leave it empty/dynamic if unknown.
            return AudioResult(
                audio_bytes=response.content,
                mime_type=f"audio/{response_format}",
                format=response_format,
                sample_rate=24000 if response_format == "mp3" else None,
                channels=1 # Usually mono
            )
            
        except APITimeoutError as e:
            logger.error(f"OpenAI TTS Timeout: {e}")
            raise TTSTimeoutException("Timeout while generating audio via OpenAI.")
        except APIError as e:
            logger.error(f"OpenAI TTS API Error: {e}")
            raise TTSProviderException(f"OpenAI API Error: {str(e)}")
        except Exception as e:
            logger.error(f"OpenAI TTS Unexpected Error: {e}")
            raise TTSProviderException(f"Unexpected error: {str(e)}")
