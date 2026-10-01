import logging
import struct
from .media_pipeline import Mp3Decoder

logger = logging.getLogger(__name__)

MOUTH_STATE_CLOSED = "CLOSED"
MOUTH_STATE_SMALL = "SMALL"
MOUTH_STATE_MEDIUM = "MEDIUM"
MOUTH_STATE_OPEN = "OPEN"

class LipSyncAnalyzer:
    """
    Analyzes audio to derive mouth states using real PCM amplitude analysis.
    Decodes MP3 on the fly and caches PCM in memory for the duration of the speech.
    """
    def __init__(self):
        self._is_speaking = False
        self._pcm_data = b""
        self._sample_rate = 44100
        self._channels = 2
        self._bytes_per_sample = 2
        self._bytes_per_sec = self._sample_rate * self._channels * self._bytes_per_sample
        # Smoothing state
        self._last_state_idx = 0
        self._state_map = [MOUTH_STATE_CLOSED, MOUTH_STATE_SMALL, MOUTH_STATE_MEDIUM, MOUTH_STATE_OPEN]

    def prepare(self, audio_filepath: str, text: str):
        """
        Prepares analysis for a given audio file by decoding it to raw PCM.
        """
        self._is_speaking = True
        try:
            self._pcm_data = Mp3Decoder.decode_to_pcm(audio_filepath)
            logger.info(f"LipSyncAnalyzer prepared, decoded {len(self._pcm_data)} bytes of PCM for: {audio_filepath}")
        except Exception as e:
            logger.error(f"Failed to decode audio for lip sync: {e}")
            self._pcm_data = b""

    def stop(self):
        self._is_speaking = False

    def get_mouth_state(self, position_ms: int) -> str:
        """
        Returns the derived mouth state at the given playback position
        using max amplitude and smoothing.
        """
        if not self._is_speaking or not self._pcm_data:
            self._last_state_idx = 0
            return MOUTH_STATE_CLOSED

        # Find the byte index for position_ms
        start_byte = int((position_ms / 1000.0) * self._bytes_per_sec)
        
        # Analyze a 50ms window
        window_ms = 50
        end_byte = start_byte + int((window_ms / 1000.0) * self._bytes_per_sec)

        # Align to sample boundaries
        start_byte -= start_byte % (self._channels * self._bytes_per_sample)
        end_byte -= end_byte % (self._channels * self._bytes_per_sample)

        chunk = self._pcm_data[start_byte:end_byte]
        if not chunk:
            self._last_state_idx = 0
            return MOUTH_STATE_CLOSED

        # Calculate max amplitude for efficiency
        num_samples = len(chunk) // 2
        try:
            samples = struct.unpack(f"<{num_samples}h", chunk)
            max_amp = max((abs(s) for s in samples), default=0)
            
            # Normalize amplitude to 0.0 - 1.0 (16-bit max is 32768)
            norm_amp = max_amp / 32768.0
            
            # Map amplitude to target state index
            if norm_amp < 0.05:  # Noise floor threshold
                target_idx = 0
            elif norm_amp < 0.2:
                target_idx = 1
            elif norm_amp < 0.5:
                target_idx = 2
            else:
                target_idx = 3

            # Apply smoothing: prevent jitter by moving at most 1 state per update,
            # except when closing the mouth (snapping closed is more natural for pauses).
            if target_idx == 0:
                self._last_state_idx = 0
            elif target_idx > self._last_state_idx:
                self._last_state_idx += 1
            elif target_idx < self._last_state_idx:
                self._last_state_idx -= 1

            return self._state_map[self._last_state_idx]

        except Exception as e:
            logger.error(f"Error analyzing audio chunk: {e}")
            self._last_state_idx = 0
            return MOUTH_STATE_CLOSED
