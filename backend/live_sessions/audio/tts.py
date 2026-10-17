import logging
import asyncio
import io
import time
import concurrent.futures
from abc import ABC, abstractmethod
from typing import Optional, Dict, Any, Tuple
from dataclasses import dataclass
from django.conf import settings
import requests

from openai import OpenAI, APITimeoutError, APIError

from .exceptions import TTSTimeoutException, TTSProviderException

logger = logging.getLogger(__name__)

# Circuit breaker cache: maps (company_id, provider) -> timestamp until when to skip
_CIRCUIT_BREAKER: Dict[Tuple[str, str], float] = {}
_CIRCUIT_BREAKER_COOLDOWN = 300.0  # 5 minutes


def _run_async(coro):
    """
    Helper to safely run an async coroutine from any sync or async context.
    Works in sync Django views, Celery workers, and async Daphne loops.
    """
    try:
        loop = asyncio.get_event_loop()
        if loop.is_running():
            with concurrent.futures.ThreadPoolExecutor(max_workers=1) as pool:
                return pool.submit(asyncio.run, coro).result()
        else:
            return loop.run_until_complete(coro)
    except RuntimeError:
        return asyncio.run(coro)


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


class MicrosoftEdgeTTSProvider(BaseTTSProvider):
    """
    Microsoft Edge Neural TTS Provider.
    Zero API keys required, 100% free, natural Vietnamese voices.
    Voices:
      - 'vi-VN-HoaiMyNeural' (Female, very smooth & expressive)
      - 'vi-VN-NamMinhNeural' (Male, deep & clear)
    """
    def generate(self, text: str, voice_config: Optional[Dict[str, Any]] = None) -> AudioResult:
        if not text or not text.strip():
            raise TTSProviderException("Text cannot be empty.")

        clean_text = text.replace("[STOP]", "").strip()
        if not clean_text:
            clean_text = "Dạ xin chào mọi người đang xem live ạ"

        config = voice_config or {}
        voice = config.get("voice") or "vi-VN-HoaiMyNeural"
        # Normalize voice if passed as short name or OpenAI voice
        v_low = voice.lower()
        if v_low in ("hoaimy", "hoài my", "female", "nova", "shimmer", "alloy"):
            voice = "vi-VN-HoaiMyNeural"
        elif v_low in ("namminh", "nam minh", "male", "onyx", "echo", "fable", "ash", "sage"):
            voice = "vi-VN-NamMinhNeural"
        elif not voice.startswith("vi-VN-"):
            voice = "vi-VN-HoaiMyNeural"

        speed = float(config.get("speed", 1.0))
        # Convert speed multiplier (e.g. 1.15) to rate string (e.g. "+15%")
        rate_pct = int(round((speed - 1.0) * 100))
        rate_str = f"{rate_pct:+d}%" if rate_pct != 0 else "+0%"

        pitch = config.get("pitch") or "+0Hz"
        if not pitch.endswith("Hz"):
            pitch = f"{pitch}Hz"

        logger.info(f"[MicrosoftEdgeTTS] Generating audio (voice={voice}, rate={rate_str}, pitch={pitch}): {clean_text[:60]}...")

        try:
            import edge_tts

            async def _synthesize():
                comm = edge_tts.Communicate(clean_text, voice, rate=rate_str, pitch=pitch)
                data = b""
                async for chunk in comm.stream():
                    if chunk["type"] == "audio":
                        data += chunk["data"]
                return data

            audio_bytes = _run_async(_synthesize())

            if not audio_bytes:
                raise TTSProviderException("Microsoft Edge TTS returned empty audio bytes.")

            return AudioResult(
                audio_bytes=audio_bytes,
                mime_type="audio/mp3",
                format="mp3",
                sample_rate=24000,
                channels=1
            )
        except Exception as e:
            logger.error(f"[MicrosoftEdgeTTS] Generation failed: {e}")
            raise TTSProviderException(f"Microsoft Edge TTS failed: {e}")


class ElevenLabsTTSProvider(BaseTTSProvider):
    """
    ElevenLabs TTS Provider for Voice Cloning and highly expressive speech.
    Requires ElevenLabs API Key.
    """
    def __init__(self, api_key: str):
        if not api_key:
            raise TTSProviderException("ElevenLabs API key is missing.")
        self.api_key = api_key

    def generate(self, text: str, voice_config: Optional[Dict[str, Any]] = None) -> AudioResult:
        if not text or not text.strip():
            raise TTSProviderException("Text cannot be empty.")

        clean_text = text.replace("[STOP]", "").strip()
        if not clean_text:
            clean_text = "Dạ xin chào mọi người đang xem live ạ"

        config = voice_config or {}
        # Default voice_id: 21m00Tcm4TlvDq8ikWAM (Rachel) or custom cloned voice_id
        voice_id = config.get("voice") or "21m00Tcm4TlvDq8ikWAM"
        speed = float(config.get("speed", 1.0))
        # ElevenLabs speed range is typically 0.7 - 1.2
        clamped_speed = max(0.7, min(1.2, speed))

        stability = float(config.get("stability", 0.5))
        similarity_boost = float(config.get("similarity_boost", 0.75))
        style = float(config.get("style", 0.0))

        url = f"https://api.elevenlabs.io/v1/text-to-speech/{voice_id}?output_format=mp3_44100_128"
        headers = {
            "xi-api-key": self.api_key,
            "Content-Type": "application/json"
        }
        payload = {
            "text": clean_text,
            "model_id": "eleven_multilingual_v2",
            "voice_settings": {
                "stability": stability,
                "similarity_boost": similarity_boost,
                "style": style,
                "use_speaker_boost": True,
                "speed": clamped_speed
            }
        }

        logger.info(f"[ElevenLabsTTS] Generating audio (voice_id={voice_id}, speed={clamped_speed}): {clean_text[:60]}...")
        try:
            resp = requests.post(url, json=payload, headers=headers, timeout=12.0)
            if resp.status_code == 429:
                err_msg = resp.text
                logger.error(f"[ElevenLabsTTS] Quota exceeded (429): {err_msg}")
                raise TTSProviderException(f"ElevenLabs Quota Exceeded (429): {err_msg}")
            elif resp.status_code == 401:
                logger.error("[ElevenLabsTTS] Invalid API key (401)")
                raise TTSProviderException("ElevenLabs API Key is invalid (401).")
            elif resp.status_code != 200:
                logger.error(f"[ElevenLabsTTS] Error {resp.status_code}: {resp.text}")
                raise TTSProviderException(f"ElevenLabs API Error {resp.status_code}: {resp.text}")

            audio_bytes = resp.content
            if not audio_bytes:
                raise TTSProviderException("ElevenLabs returned empty audio.")

            return AudioResult(
                audio_bytes=audio_bytes,
                mime_type="audio/mp3",
                format="mp3",
                sample_rate=44100,
                channels=1
            )
        except requests.exceptions.Timeout:
            logger.error("[ElevenLabsTTS] Request timed out.")
            raise TTSTimeoutException("ElevenLabs request timed out.")
        except TTSProviderException:
            raise
        except Exception as e:
            logger.error(f"[ElevenLabsTTS] Unexpected error: {e}")
            raise TTSProviderException(f"ElevenLabs failed: {e}")


class GoogleStudioTTSProvider(BaseTTSProvider):
    """
    Google AI Studio (Gemini 2.0 Audio) Provider.
    Supports natural prompt-based voice customization.
    Uses Google Gemini API key.
    """
    def __init__(self, api_key: str):
        if not api_key:
            raise TTSProviderException("Google Gemini API key is missing.")
        self.api_key = api_key

    def generate(self, text: str, voice_config: Optional[Dict[str, Any]] = None) -> AudioResult:
        if not text or not text.strip():
            raise TTSProviderException("Text cannot be empty.")

        clean_text = text.replace("[STOP]", "").strip()
        if not clean_text:
            clean_text = "Dạ xin chào mọi người đang xem live ạ"

        config = voice_config or {}
        style_prompt = config.get("style_prompt") or "Đọc với ngữ điệu tự nhiên, vui vẻ, rõ ràng cho buổi livestream bán hàng."

        logger.info(f"[GoogleStudioTTS] Generating audio via Gemini Audio: {clean_text[:60]}...")
        try:
            from google import genai
            from google.genai import types

            client = genai.Client(api_key=self.api_key)
            # Gemini 2.0 Flash supports audio modality response
            prompt_content = f"Chỉ đọc chính xác văn bản sau đây thành giọng nói, không thêm bớt từ ngữ nào: \"{clean_text}\""
            
            response = client.models.generate_content(
                model="gemini-2.0-flash",
                contents=prompt_content,
                config=types.GenerateContentConfig(
                    response_mime_type="audio/mp3",
                    system_instruction=f"Bạn là bộ đọc văn bản AI (TTS). Phong cách: {style_prompt}"
                )
            )

            # Check if inline audio data was returned
            audio_bytes = None
            if hasattr(response, "candidates") and response.candidates:
                for part in response.candidates[0].content.parts:
                    if hasattr(part, "inline_data") and part.inline_data:
                        audio_bytes = part.inline_data.data
                        break

            if not audio_bytes:
                raise TTSProviderException("Gemini did not return inline audio data.")

            return AudioResult(
                audio_bytes=audio_bytes,
                mime_type="audio/mp3",
                format="mp3",
                sample_rate=24000,
                channels=1
            )
        except Exception as e:
            logger.error(f"[GoogleStudioTTS] Gemini Audio generation failed: {e}")
            raise TTSProviderException(f"Google Studio Gemini Audio failed: {e}")


class OpenAITTSProvider(BaseTTSProvider):
    """
    OpenAI TTS Provider using model tts-1 or tts-1-hd.
    """
    def __init__(self, api_key: Optional[str] = None):
        self.api_key = api_key or getattr(settings, "OPENAI_API_KEY", None)
        if not self.api_key:
            raise TTSProviderException("OpenAI API key is missing.")
        self.client = OpenAI(api_key=self.api_key)

    def generate(self, text: str, voice_config: Optional[Dict[str, Any]] = None) -> AudioResult:
        if not text or not text.strip():
            raise TTSProviderException("Text cannot be empty.")

        clean_text = text.replace("[STOP]", "").strip()
        if not clean_text:
            clean_text = "Dạ xin chào mọi người đang xem live ạ"

        config = voice_config or {}
        model = config.get("model", "tts-1")
        voice = config.get("voice", "alloy")
        response_format = config.get("response_format", "mp3")
        speed = float(config.get("speed", 1.0))
        # OpenAI speed range is 0.25 to 4.0
        clamped_speed = max(0.25, min(4.0, speed))

        try:
            response = self.client.audio.speech.create(
                model=model,
                voice=voice,
                input=clean_text,
                response_format=response_format,
                speed=clamped_speed,
                timeout=12.0
            )

            return AudioResult(
                audio_bytes=response.content,
                mime_type=f"audio/{response_format}",
                format=response_format,
                sample_rate=24000 if response_format == "mp3" else None,
                channels=1
            )
        except APITimeoutError as e:
            logger.error(f"[OpenAITTS] Timeout: {e}")
            raise TTSTimeoutException("Timeout while generating audio via OpenAI.")
        except APIError as e:
            logger.error(f"[OpenAITTS] API Error: {e}")
            raise TTSProviderException(f"OpenAI API Error: {str(e)}")
        except Exception as e:
            logger.error(f"[OpenAITTS] Unexpected Error: {e}")
            raise TTSProviderException(f"OpenAI Unexpected error: {str(e)}")


class GoogleTTSProvider(BaseTTSProvider):
    """
    Google Translate TTS provider via gTTS.
    Zero API keys required, free, reliable basic fallback.
    """
    def generate(self, text: str, voice_config: Optional[Dict[str, Any]] = None) -> AudioResult:
        if not text or not text.strip():
            raise TTSProviderException("Text cannot be empty.")

        clean_text = text.replace("[STOP]", "").strip()
        if not clean_text:
            clean_text = "Dạ xin chào mọi người đang xem live ạ"

        logger.info(f"[GoogleTTS] generating audio for text: {clean_text[:60]}...")
        try:
            from gtts import gTTS
            lang = (voice_config or {}).get("lang", "vi")
            tts = gTTS(text=clean_text, lang=lang)
            fp = io.BytesIO()
            tts.write_to_fp(fp)
            audio_bytes = fp.getvalue()

            return AudioResult(
                audio_bytes=audio_bytes,
                mime_type="audio/mp3",
                format="mp3",
                sample_rate=24000,
                channels=1
            )
        except Exception as e:
            logger.error(f"[GoogleTTS] generation failed: {e}")
            raise TTSProviderException(f"Google TTS generation failed: {e}")


class DummyTTSProvider(BaseTTSProvider):
    def generate(self, text: str, voice_config: Optional[Dict[str, Any]] = None) -> AudioResult:
        logger.info(f"[DummyTTS] generating audio for text: {text[:60]}...")
        try:
            return MicrosoftEdgeTTSProvider().generate(text, voice_config)
        except Exception:
            return GoogleTTSProvider().generate(text, voice_config)


def _detect_gender(voice_name: str) -> str:
    """
    Detect whether a voice is male or female.
    Returns 'male' or 'female'. Defaults to 'female'.
    """
    v = (voice_name or "").lower()
    male_identifiers = ["namminh", "nam minh", "male", "onyx", "echo", "fable", "george", "charlie", "callum", "liam"]
    for m in male_identifiers:
        if m in v:
            return "male"
    return "female"


def generate_tts_with_failover(
    text: str,
    agent: Any,
    company: Any,
    session_id: Optional[str] = None,
    correlation_id: Optional[str] = None
) -> Tuple[AudioResult, str, bool, Optional[str]]:
    """
    Unified Multi-Tier TTS Engine with Automated Failover & Circuit Breaker.
    Returns:
      (audio_result, used_provider, is_fallback, fallback_reason)

    Failover Rules:
      1. Tries primary provider (ElevenLabs / OpenAI / Google Studio / Microsoft Edge).
      2. If primary fails (e.g. 429 quota exhausted, 401 invalid key, timeout):
         - Records circuit breaker cooldown.
         - Fallback 1: Microsoft Edge Neural TTS (Inheriting identical speed, pitch, and gender).
      3. If Microsoft Edge TTS fails:
         - Fallback 2: Google Translate TTS (gTTS).
    """
    from ai_agents.services import get_api_keys

    requested_provider = getattr(agent, "tts_provider", "microsoft") or "microsoft"
    configured_voice = getattr(agent, "tts_voice", "vi-VN-HoaiMyNeural") or "vi-VN-HoaiMyNeural"
    # Auto-route to OpenAI if the configured voice is an OpenAI voice and provider is still default microsoft
    if requested_provider == "microsoft" and configured_voice.lower() in ("nova", "alloy", "shimmer", "echo", "onyx", "fable", "ash", "coral", "sage"):
        requested_provider = "openai"

    configured_speed = float(getattr(agent, "tts_speed", 1.0) or 1.0)
    configured_pitch = getattr(agent, "tts_pitch", "+0Hz") or "+0Hz"
    configured_style_prompt = getattr(agent, "tts_style_prompt", "") or ""
    configured_stability = float(getattr(agent, "tts_stability", 0.5) or 0.5)
    configured_similarity = float(getattr(agent, "tts_similarity", 0.75) or 0.75)

    voice_config = {
        "voice": configured_voice,
        "speed": configured_speed,
        "pitch": configured_pitch,
        "style_prompt": configured_style_prompt,
        "stability": configured_stability,
        "similarity_boost": configured_similarity,
    }

    company_id_str = str(company.id) if company else "system"
    cb_key = (company_id_str, requested_provider)
    cache_key = f"tts_cb:{company_id_str}:{requested_provider}"
    now = time.time()

    # Check if primary provider is currently in Circuit Breaker cooldown
    circuit_broken = False
    fail_reason = None
    if requested_provider in ("openai", "elevenlabs", "google_studio"):
        from django.core.cache import cache
        try:
            cached_reason = cache.get(cache_key)
            if cached_reason:
                circuit_broken = True
                fail_reason = cached_reason
        except Exception:
            pass

        if not circuit_broken:
            cooldown_until = _CIRCUIT_BREAKER.get(cb_key, 0.0)
            if now < cooldown_until:
                circuit_broken = True
                fail_reason = f"Tài khoản {requested_provider} đang trong thời gian nghỉ do lỗi hết credit (Circuit Breaker)"

        if circuit_broken:
            logger.warning(
                f"[TTS Failover][Session: {session_id}] Circuit breaker active for '{requested_provider}'. "
                f"Skipping directly to Microsoft Edge TTS."
            )

    # 1. Attempt Primary Provider (if not circuit-broken and not microsoft/google_free)
    primary_failed = False
    fail_reason = None

    if not circuit_broken:
        try:
            if requested_provider == "elevenlabs":
                keys = get_api_keys(company, "elevenlabs") if company else []
                if not keys:
                    raise TTSProviderException("Chưa cấu hình API Key ElevenLabs trong Kho Key.")
                provider = ElevenLabsTTSProvider(api_key=keys[0])
                audio_res = provider.generate(text, voice_config)
                return audio_res, "elevenlabs", False, None

            elif requested_provider == "openai":
                keys = get_api_keys(company, "openai") if company else []
                resolved_key = keys[0] if keys else getattr(settings, "OPENAI_API_KEY", None)
                if getattr(settings, 'DEBUG', False) and resolved_key == 'dummy':
                    provider = DummyTTSProvider()
                elif resolved_key:
                    provider = OpenAITTSProvider(api_key=resolved_key)
                else:
                    raise TTSProviderException("Chưa cấu hình API Key OpenAI trong Kho Key.")
                openai_config = {"voice": configured_voice, "speed": configured_speed}
                audio_res = provider.generate(text, openai_config)
                return audio_res, "openai", False, None

            elif requested_provider == "google_studio":
                keys = get_api_keys(company, "gemini") if company else []
                if not keys:
                    raise TTSProviderException("Chưa cấu hình API Key Gemini trong Kho Key.")
                provider = GoogleStudioTTSProvider(api_key=keys[0])
                audio_res = provider.generate(text, voice_config)
                return audio_res, "google_studio", False, None

            elif requested_provider == "microsoft":
                provider = MicrosoftEdgeTTSProvider()
                audio_res = provider.generate(text, voice_config)
                return audio_res, "microsoft", False, None

            elif requested_provider == "google_free":
                provider = GoogleTTSProvider()
                audio_res = provider.generate(text, voice_config)
                return audio_res, "google_free", False, None

        except Exception as e:
            primary_failed = True
            fail_reason = str(e)
            logger.warning(f"[TTS Failover][Session: {session_id}] Primary provider '{requested_provider}' failed: {fail_reason}")

            # Trip circuit breaker for quota/auth errors
            err_lower = fail_reason.lower()
            if "429" in err_lower or "quota" in err_lower or "credit" in err_lower or "401" in err_lower:
                _CIRCUIT_BREAKER[cb_key] = now + _CIRCUIT_BREAKER_COOLDOWN
                try:
                    from django.core.cache import cache
                    cache.set(cache_key, f"Tài khoản {requested_provider} đang tạm nghỉ do lỗi hết credit / xác thực", timeout=int(_CIRCUIT_BREAKER_COOLDOWN))
                except Exception:
                    pass
                logger.info(f"[TTS Failover] Tripped circuit breaker for {cb_key} for {_CIRCUIT_BREAKER_COOLDOWN}s")
    else:
        primary_failed = True
        fail_reason = f"Tài khoản {requested_provider} đang trong thời gian nghỉ do lỗi hết credit (Circuit Breaker)"

    # 2. Fallback Tier 1: Microsoft Edge Neural TTS
    # INHERIT EXACT SPEED AND GENDER from primary voice!
    try:
        detected_gender = _detect_gender(configured_voice)
        fallback_voice = "vi-VN-NamMinhNeural" if detected_gender == "male" else "vi-VN-HoaiMyNeural"

        fallback_config = {
            "voice": fallback_voice,
            "speed": configured_speed,  # Preserves speed strictly!
            "pitch": configured_pitch,
        }

        logger.info(
            f"[TTS Failover][Session: {session_id}] Switching to Microsoft Edge TTS fallback "
            f"(voice={fallback_voice}, speed={configured_speed}x, pitch={configured_pitch})"
        )

        edge_provider = MicrosoftEdgeTTSProvider()
        audio_res = edge_provider.generate(text, fallback_config)
        return audio_res, "microsoft", True, fail_reason

    except Exception as edge_err:
        logger.error(f"[TTS Failover][Session: {session_id}] Microsoft Edge fallback failed: {edge_err}. Using Google gTTS.")

    # 3. Fallback Tier 2 (Ultimate Safety Net): Google Translate gTTS
    gtts_provider = GoogleTTSProvider()
    audio_res = gtts_provider.generate(text, {"lang": "vi"})
    return audio_res, "google_free", True, f"Edge TTS failed: {fail_reason}"
