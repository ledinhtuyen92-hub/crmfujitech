import logging
import math

logger = logging.getLogger(__name__)

MOUTH_STATE_CLOSED = "CLOSED"
MOUTH_STATE_SMALL = "SMALL"
MOUTH_STATE_MEDIUM = "MEDIUM"
MOUTH_STATE_OPEN = "OPEN"

class LipSyncAnalyzer:
    """
    Analyzes audio to derive mouth states.
    Currently implements a deterministic fallback algorithm because MP3/Audio
    decoding requires external dependencies (like pydub/ffmpeg) not yet approved.
    """
    def __init__(self):
        self._is_speaking = False
        self._current_text = ""

    def prepare(self, audio_filepath: str, text: str):
        """
        Prepares analysis for a given audio file.
        Without external dependencies, we cannot decode MP3 to PCM here.
        We store the state and use a deterministic simulation based on time.
        """
        self._is_speaking = True
        self._current_text = text
        logger.info(f"LipSyncAnalyzer prepared for: {audio_filepath}")

    def stop(self):
        self._is_speaking = False

    def get_mouth_state(self, position_ms: int) -> str:
        """
        Returns the derived mouth state at the given playback position.
        """
        if not self._is_speaking:
            return MOUTH_STATE_CLOSED

        # MVP deterministic simulation:
        # Since we cannot read real MP3 amplitude without a dependency,
        # we generate a deterministic "amplitude" wave based on position_ms.
        # A real implementation would lookup the amplitude of the PCM audio buffer at `position_ms`.
        
        # Simple varying amplitude based on sine waves to look like talking
        # Base frequency ~ 3Hz for syllables, combined with a faster jitter
        t = position_ms / 1000.0
        val = math.sin(2 * math.pi * 3 * t) * 0.5 + math.sin(2 * math.pi * 7 * t) * 0.5
        amplitude = abs(val)

        if amplitude < 0.2:
            return MOUTH_STATE_CLOSED
        elif amplitude < 0.5:
            return MOUTH_STATE_SMALL
        elif amplitude < 0.8:
            return MOUTH_STATE_MEDIUM
        else:
            return MOUTH_STATE_OPEN
