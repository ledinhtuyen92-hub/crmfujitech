import asyncio
import time
import logging
import subprocess

logger = logging.getLogger(__name__)

class MediaClock:
    """
    Continuous media clock based on audio samples written.
    Ensures monotonic A/V synchronization.
    """
    def __init__(self, sample_rate: int = 44100, channels: int = 2, sample_width: int = 2):
        self.sample_rate = sample_rate
        self.channels = channels
        self.sample_width = sample_width
        self.total_samples_written = 0

    def add_bytes(self, byte_count: int):
        bytes_per_sample = self.channels * self.sample_width
        self.total_samples_written += byte_count // bytes_per_sample

    def get_audio_pts(self) -> float:
        """Returns the presentation timestamp (PTS) in seconds."""
        return self.total_samples_written / self.sample_rate


class AudioStreamSink:
    """
    Observer sink for the audio pipeline.
    Receives PCM data during playback and injects silence when idle,
    maintaining a continuous stream for future FFmpeg encoding.
    """
    def __init__(self, clock: MediaClock, write_callback=None):
        self.clock = clock
        self.write_callback = write_callback
        self.is_streaming = False
        self._is_speaking = False
        self._pump_task = None
        self._stream_start_time = 0.0
        self.bytes_per_sec = clock.sample_rate * clock.channels * clock.sample_width

    def start(self):
        if self.is_streaming: return
        self.is_streaming = True
        self.clock.total_samples_written = 0
        self._stream_start_time = time.monotonic()
        self._pump_task = asyncio.create_task(self._silence_pump())
        logger.info("AudioStreamSink started")

    def stop(self):
        self.is_streaming = False
        if self._pump_task:
            self._pump_task.cancel()
            self._pump_task = None
        logger.info("AudioStreamSink stopped")

    def set_speaking(self, speaking: bool):
        self._is_speaking = speaking

    def write_pcm(self, pcm_bytes: bytes):
        if not self.is_streaming:
            return
        # Advance the clock
        self.clock.add_bytes(len(pcm_bytes))
        if self.write_callback:
            try:
                # Dispatch audio data to encoder asynchronously without blocking PygameAudioPlayer
                asyncio.create_task(self.write_callback(pcm_bytes))
            except Exception as e:
                logger.error(f"Failed to dispatch audio chunk: {e}")

    def write_silence(self, duration_ms: int):
        if not self.is_streaming or duration_ms <= 0:
            return
        bytes_to_write = int((duration_ms / 1000.0) * self.bytes_per_sec)
        # Align to frame boundary
        bytes_to_write -= bytes_to_write % (self.clock.channels * self.clock.sample_width)
        if bytes_to_write > 0:
            silence_bytes = bytes(bytes_to_write)
            self.write_pcm(silence_bytes)

    async def _silence_pump(self):
        """
        Pumps silence if the stream is active but no speech is happening.
        Uses explicit timing to avoid tight CPU loops.
        """
        try:
            while self.is_streaming:
                await asyncio.sleep(0.1) # Check every 100ms
                
                if self._is_speaking:
                    # Sync our stream start time to prevent massive silence injection after speech ends
                    # if the speech clock was slightly slower than wall clock
                    self._stream_start_time = time.monotonic() - self.clock.get_audio_pts()
                    continue
                    
                elapsed_sec = time.monotonic() - self._stream_start_time
                current_pts = self.clock.get_audio_pts()
                
                lag_sec = elapsed_sec - current_pts
                if lag_sec > 0:
                    self.write_silence(int(lag_sec * 1000))
        except asyncio.CancelledError:
            pass


class Mp3Decoder:
    """
    Decodes MP3 to s16le, 44100Hz, 2 channel PCM using FFmpeg subprocess.
    Designed to fail gracefully if FFmpeg is not installed (Phase 1E-1).
    """
    @staticmethod
    def decode_to_pcm(filepath: str) -> bytes:
        try:
            result = subprocess.run([
                'ffmpeg', '-y', '-i', filepath,
                '-f', 's16le', '-acodec', 'pcm_s16le',
                '-ar', '44100', '-ac', '2', '-'
            ], stdout=subprocess.PIPE, stderr=subprocess.PIPE, check=True)
            return result.stdout
        except FileNotFoundError:
            logger.warning("FFmpeg not found. Cannot decode MP3 to PCM. Stream sink will receive empty chunks.")
            return b""
        except subprocess.CalledProcessError as e:
            logger.error(f"FFmpeg decode failed: {e.stderr.decode()}")
            return b""
