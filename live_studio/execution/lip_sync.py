import logging
import struct
from .media_pipeline import Mp3Decoder

logger = logging.getLogger(__name__)

MOUTH_STATE_CLOSED = "CLOSED"
MOUTH_STATE_SMALL = "SMALL"
MOUTH_STATE_MEDIUM = "MEDIUM"
MOUTH_STATE_OPEN = "OPEN"
MOUTH_STATE_ROUND = "ROUND"

class LipSyncAnalyzer:
    """
    Analyzes audio to derive mouth states using real PCM amplitude analysis.
    Decodes MP3 on the fly and caches PCM in memory for the duration of the speech.
    Supports continuous amplitude extraction (0.0 to 1.0), EMA smoothing, and VU meter waveform data.
    """
    def __init__(self, sensitivity: float = 1.5, smoothing: float = 0.3, noise_gate: float = 0.015):
        self._is_speaking = False
        self._pcm_data = b""
        self._sample_rate = 44100
        self._channels = 2
        self._bytes_per_sample = 2
        self._bytes_per_sec = self._sample_rate * self._channels * self._bytes_per_sample
        
        # Audio tuning parameters
        self.sensitivity = sensitivity
        self.smoothing = smoothing
        self.noise_gate = noise_gate
        
        # Continuous smoothed amplitude (0.0 - 1.0)
        self._smoothed_amp = 0.0
        
        # Smoothing state for discrete states
        self._last_state_idx = 0
        self._state_map = [MOUTH_STATE_CLOSED, MOUTH_STATE_SMALL, MOUTH_STATE_MEDIUM, MOUTH_STATE_OPEN, MOUTH_STATE_ROUND]

    def prepare(self, audio_filepath: str, text: str = ""):
        """
        Prepares analysis for a given audio file by decoding it to raw PCM.
        """
        self._is_speaking = True
        self._smoothed_amp = 0.0
        self._last_state_idx = 0
        try:
            self._pcm_data = Mp3Decoder.decode_to_pcm(audio_filepath)
            logger.info(f"LipSyncAnalyzer prepared, decoded {len(self._pcm_data)} bytes of PCM for: {audio_filepath}")
        except Exception as e:
            logger.error(f"Failed to decode audio for lip sync: {e}")
            self._pcm_data = b""

    def stop(self):
        self._is_speaking = False
        self._smoothed_amp = 0.0
        self._last_state_idx = 0

    def get_amplitude(self, position_ms: int) -> float:
        """
        Returns the continuous normalized mouth aperture / amplitude (0.0 to 1.0)
        using RMS energy and Exponential Moving Average (EMA) smoothing.
        """
        if not self._is_speaking or not self._pcm_data or position_ms < 0:
            self._smoothed_amp = max(0.0, self._smoothed_amp * 0.7)
            return self._smoothed_amp

        start_byte = int((position_ms / 1000.0) * self._bytes_per_sec)
        window_ms = 40
        end_byte = start_byte + int((window_ms / 1000.0) * self._bytes_per_sec)

        start_byte -= start_byte % (self._channels * self._bytes_per_sample)
        end_byte -= end_byte % (self._channels * self._bytes_per_sample)

        chunk = self._pcm_data[start_byte:end_byte]
        if not chunk:
            self._smoothed_amp = max(0.0, self._smoothed_amp * 0.7)
            return self._smoothed_amp

        num_samples = len(chunk) // 2
        try:
            samples = struct.unpack(f"<{num_samples}h", chunk)
            if not samples:
                return 0.0

            # Compute RMS energy for natural human speech dynamics
            sum_sq = sum(s * s for s in samples)
            rms = (sum_sq / len(samples)) ** 0.5 / 32768.0

            # Apply noise gate
            if rms < self.noise_gate:
                raw_amp = 0.0
            else:
                # Normal speech RMS is around 0.03 - 0.12. Map to 0.0 - 1.0
                raw_amp = min(1.0, (rms / 0.12) * self.sensitivity)

            # EMA Smoothing: smooth_amp = alpha * raw + (1 - alpha) * last
            # If closing (raw < last), snap closed faster to prevent trailing mouth
            alpha = self.smoothing if raw_amp >= self._smoothed_amp else min(0.6, self.smoothing * 1.8)
            self._smoothed_amp = alpha * raw_amp + (1.0 - alpha) * self._smoothed_amp
            return max(0.0, min(1.0, self._smoothed_amp))

        except Exception as e:
            logger.error(f"Error calculating amplitude: {e}")
            return 0.0

    def get_waveform_bars(self, position_ms: int, num_bars: int = 16) -> list:
        """
        Returns normalized bar heights (0.0 to 1.0) for a real-time VU meter / audio visualizer.
        """
        if not self._is_speaking or not self._pcm_data:
            return [0.0] * num_bars

        start_byte = int((position_ms / 1000.0) * self._bytes_per_sec)
        window_ms = 80
        end_byte = start_byte + int((window_ms / 1000.0) * self._bytes_per_sec)
        start_byte -= start_byte % (self._channels * self._bytes_per_sample)
        end_byte -= end_byte % (self._channels * self._bytes_per_sample)

        chunk = self._pcm_data[start_byte:end_byte]
        if not chunk:
            return [0.0] * num_bars

        num_samples = len(chunk) // 2
        try:
            samples = struct.unpack(f"<{num_samples}h", chunk)
            sub_len = max(1, len(samples) // num_bars)
            bars = []
            for b in range(num_bars):
                sub = samples[b * sub_len : (b + 1) * sub_len]
                if sub:
                    sub_rms = (sum(s * s for s in sub) / len(sub)) ** 0.5 / 32768.0
                    bars.append(min(1.0, (sub_rms / 0.12) * self.sensitivity))
                else:
                    bars.append(0.0)
            return bars
        except Exception:
            return [0.0] * num_bars

    def get_mouth_state(self, position_ms: int) -> str:
        """
        Returns the derived mouth state at the given playback position
        using continuous amplitude analysis and smoothing.
        """
        amp = self.get_amplitude(position_ms)

        if amp < 0.05:
            target_idx = 0  # CLOSED
        elif amp < 0.25:
            target_idx = 1  # SMALL
        elif amp < 0.55:
            target_idx = 2  # MEDIUM
        elif amp < 0.85:
            target_idx = 3  # OPEN
        else:
            target_idx = 4  # ROUND / WIDE

        # Apply smoothing transition
        if target_idx == 0:
            self._last_state_idx = 0
        elif target_idx > self._last_state_idx:
            self._last_state_idx += 1
        elif target_idx < self._last_state_idx:
            self._last_state_idx -= 1

        self._last_state_idx = max(0, min(len(self._state_map) - 1, self._last_state_idx))
        return self._state_map[self._last_state_idx]
