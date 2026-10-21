import asyncio
import time
import logging
import subprocess
import sys

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
        self._worker_task = None
        self._audio_queue = None
        self._stream_start_time = 0.0
        self.bytes_per_sec = clock.sample_rate * clock.channels * clock.sample_width

    def start(self):
        if self.is_streaming: return
        self.is_streaming = True
        self.clock.total_samples_written = 0
        self._stream_start_time = time.monotonic()
        self._audio_queue = asyncio.Queue(maxsize=300)
        self._pump_task = asyncio.create_task(self._silence_pump())
        self._worker_task = asyncio.create_task(self._audio_worker())
        logger.info("AudioStreamSink started")

    def stop(self):
        self.is_streaming = False
        if self._pump_task:
            self._pump_task.cancel()
            self._pump_task = None
        if self._worker_task:
            self._worker_task.cancel()
            self._worker_task = None
        self._audio_queue = None
        logger.info("AudioStreamSink stopped")

    def set_speaking(self, speaking: bool):
        self._is_speaking = speaking
        if speaking and self._audio_queue:
            # Drain any buffered silence chunks so voice audio starts immediately with 0ms queue latency!
            while not self._audio_queue.empty():
                try:
                    self._audio_queue.get_nowait()
                except Exception:
                    break

    def write_pcm(self, pcm_bytes: bytes):
        if not self.is_streaming:
            return
        # Advance the clock
        self.clock.add_bytes(len(pcm_bytes))
        if self._audio_queue:
            try:
                self._audio_queue.put_nowait(pcm_bytes)
            except asyncio.QueueFull:
                try:
                    self._audio_queue.get_nowait()
                    self._audio_queue.put_nowait(pcm_bytes)
                except Exception:
                    pass
        elif self.write_callback:
            try:
                asyncio.create_task(self.write_callback(pcm_bytes))
            except Exception as e:
                logger.error(f"Failed to dispatch audio chunk: {e}")

    async def _audio_worker(self):
        while self.is_streaming:
            try:
                if not self._audio_queue:
                    break
                chunk = await self._audio_queue.get()
                if self.write_callback:
                    await self.write_callback(chunk)
            except asyncio.CancelledError:
                break
            except Exception as e:
                logger.error(f"Audio worker error: {e}")

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
        
        Critical: caps silence injection to 200ms per tick to prevent audio timeline
        explosion when asyncio was blocked (GIL, avatar render, OS jitter).
        Without this cap, a 2s loop delay injects 2s of silence in one call,
        flooding the audio TCP pipe and causing HLS timeline drift / stutter.

        Also: waits for write_callback to be connected before starting.
        FFmpeg TCP transport takes 200-500ms after process spawn to connect.
        If silence is injected before connection, it pre-fills the queue and dumps
        all at once on connect — causing a timestamp burst that MediaMTX stutters on.
        """
        MAX_SILENCE_MS = 200  # Never inject more than 200ms silence per 100ms tick
        # Wait for write_callback (FFmpeg TCP) to be ready if configured to wait, up to 3s
        wait_elapsed = 0.0
        while self.is_streaming and getattr(self, '_waiting_for_encoder', False) and not self.write_callback and wait_elapsed < 3.0:
            await asyncio.sleep(0.05)
            wait_elapsed += 0.05
        # Sync start time to NOW (after connection) to avoid injecting backlogged silence
        if self.is_streaming:
            self._stream_start_time = time.monotonic() - self.clock.get_audio_pts()
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
                    # Clamp to MAX_SILENCE_MS: if loop was blocked for multiple seconds,
                    # injecting the full backlog at once would burst the audio pipe
                    silence_ms = min(int(lag_sec * 1000), MAX_SILENCE_MS)
                    self.write_silence(silence_ms)
        except asyncio.CancelledError:
            pass


def get_ffmpeg_binary() -> str:
    """Finds ffmpeg executable: bundled bin/ffmpeg.exe, system ffmpeg, or dist bin."""
    import sys, os
    if getattr(sys, 'frozen', False):
        base_dir = os.path.dirname(sys.executable)
    else:
        base_dir = os.path.dirname(os.path.dirname(__file__))
    candidates = [
        os.path.join(base_dir, "bin", "ffmpeg.exe"),
        os.path.join(base_dir, "bin", "ffmpeg", "ffmpeg.exe"),
        os.path.join(base_dir, "..", "..", "bin", "ffmpeg.exe"),
        os.path.join(base_dir, "..", "..", "bin", "ffmpeg", "ffmpeg.exe"),
        os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "bin", "ffmpeg.exe"),
        os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "bin", "ffmpeg", "ffmpeg.exe"),
        "ffmpeg"
    ]
    for c in candidates:
        if os.path.isfile(c):
            return os.path.abspath(c)
    return "ffmpeg"


class Mp3Decoder:
    """
    Decodes MP3 to s16le, 44100Hz, 2 channel PCM using FFmpeg subprocess.
    Designed to fail gracefully if FFmpeg is not installed (Phase 1E-1).
    Caches decoded PCM in memory by file path to eliminate redundant decodes.
    """
    _cache = {}
    _max_cache_size = 30

    @classmethod
    def decode_to_pcm(cls, filepath: str) -> bytes:
        if not filepath:
            return b""
        if filepath in cls._cache:
            logger.debug(f"[Mp3Decoder] Cache hit for {filepath}")
            return cls._cache[filepath]

        ffmpeg_bin = get_ffmpeg_binary()
        flags = 0x08000000 if sys.platform == 'win32' else 0
        startupinfo = None
        if sys.platform == 'win32':
            startupinfo = subprocess.STARTUPINFO()
            startupinfo.dwFlags |= subprocess.STARTF_USESHOWWINDOW
            startupinfo.wShowWindow = 0
        try:
            result = subprocess.run([
                ffmpeg_bin, '-y', '-i', filepath,
                '-f', 's16le', '-acodec', 'pcm_s16le',
                '-ar', '44100', '-ac', '2', '-'
            ], stdout=subprocess.PIPE, stderr=subprocess.PIPE, check=True, creationflags=flags, startupinfo=startupinfo)
            pcm = result.stdout
            if pcm:
                if len(cls._cache) >= cls._max_cache_size:
                    cls._cache.pop(next(iter(cls._cache)))
                cls._cache[filepath] = pcm
            return pcm
        except FileNotFoundError:
            logger.warning("FFmpeg not found. Cannot decode MP3 to PCM. Stream sink will receive empty chunks.")
            return b""
        except subprocess.CalledProcessError as e:
            logger.error(f"FFmpeg decode failed: {e.stderr.decode('utf-8', errors='ignore')}")
            return b""

    @classmethod
    def clear_cache(cls, filepath: str = None):
        if filepath:
            cls._cache.pop(filepath, None)
        else:
            cls._cache.clear()
