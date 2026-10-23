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
    Maintains a continuous lock-step stream for FFmpeg encoding.
    When streaming, provides audio chunks in lock-step with video frames (1470 samples per frame at 30fps).
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
        self.lockstep_mode = False

        # Speech PCM buffer for lock-step consumption
        self._speech_pcm = b""
        self._speech_offset = 0
        self._speech_done_event = None

    def start(self, start_time: float = None):
        if self.is_streaming: return
        self.is_streaming = True
        self.clock.total_samples_written = 0
        self._stream_start_time = start_time if start_time is not None else time.monotonic()
        self._audio_queue = asyncio.Queue(maxsize=10)
        self._speech_pcm = b""
        self._speech_offset = 0
        self._is_speaking = False
        self._speech_done_event = asyncio.Event()
        self._speech_done_event.set()

        # Worker task dispatches any directly written PCM chunks to write_callback
        self._worker_task = asyncio.create_task(self._audio_worker())
        # In non-lockstep mode (legacy / standalone tests), run asynchronous silence pump
        if not self.lockstep_mode:
            self._pump_task = asyncio.create_task(self._silence_pump())
        logger.info(f"AudioStreamSink started (lockstep_mode={self.lockstep_mode})")

    def stop(self):
        self.is_streaming = False
        if self._pump_task:
            self._pump_task.cancel()
            self._pump_task = None
        if self._worker_task:
            self._worker_task.cancel()
            self._worker_task = None
        self._audio_queue = None
        self._speech_pcm = b""
        self._speech_offset = 0
        self._is_speaking = False
        if self._speech_done_event:
            self._speech_done_event.set()
        logger.info("AudioStreamSink stopped")

    def set_speaking(self, speaking: bool):
        self._is_speaking = speaking
        if speaking and self._audio_queue:
            while not self._audio_queue.empty():
                try:
                    self._audio_queue.get_nowait()
                except Exception:
                    break

    def start_speech(self, pcm_bytes: bytes):
        """Prepares speech PCM buffer for lock-step playback."""
        self._speech_pcm = pcm_bytes or b""
        self._speech_offset = 0
        self._is_speaking = bool(pcm_bytes)
        if self._speech_done_event is None:
            self._speech_done_event = asyncio.Event()
        if self._is_speaking:
            self._speech_done_event.clear()
        else:
            self._speech_done_event.set()
        logger.info(f"[AudioStreamSink] start_speech: {len(self._speech_pcm)} bytes ({round(len(self._speech_pcm)/self.bytes_per_sec, 2)}s)")

    async def wait_for_speech_done(self):
        """Awaits until speech buffer is completely consumed by frame pump."""
        if self._speech_done_event:
            await self._speech_done_event.wait()

    def interrupt_speech(self):
        """Interrupts speech immediately and clears buffer."""
        self._speech_pcm = b""
        self._speech_offset = 0
        self._is_speaking = False
        if self._speech_done_event:
            self._speech_done_event.set()
        logger.info("[AudioStreamSink] Speech interrupted")

    def get_speech_position_ms(self) -> int:
        """Returns elapsed speech playback in milliseconds based on samples sent."""
        if self.bytes_per_sec > 0:
            return int((self._speech_offset / self.bytes_per_sec) * 1000)
        return 0

    def get_audio_chunk(self, sample_count: int = 1470) -> tuple:
        """
        Pulls exact number of audio samples (1470 samples = 5880 bytes at 44100Hz stereo s16le).
        Returns: (chunk_bytes: bytes, audio_energy: float, is_voice_active: bool)
        Guarantees 1:1 mathematical synchronization with each video frame.
        """
        bytes_per_sample = self.clock.channels * self.clock.sample_width
        bytes_needed = sample_count * bytes_per_sample

        if not self.is_streaming:
            return (b'\x00' * bytes_needed, 0.0, False)

        if self._is_speaking and self._speech_pcm:
            avail = len(self._speech_pcm) - self._speech_offset
            if avail > 0:
                take_len = min(bytes_needed, avail)
                chunk = self._speech_pcm[self._speech_offset : self._speech_offset + take_len]
                self._speech_offset += take_len
                if self._speech_offset >= len(self._speech_pcm):
                    self._is_speaking = False
                    if self._speech_done_event and not self._speech_done_event.is_set():
                        self._speech_done_event.set()
                if take_len < bytes_needed:
                    chunk += b'\x00' * (bytes_needed - take_len)

                # Calculate peak amplitude energy from this chunk
                num_s = len(chunk) // 2
                import struct
                samples = struct.unpack(f"<{num_s}h", chunk)
                max_amp = max((abs(s) for s in samples), default=0)
                energy = max_amp / 32768.0
                is_voice = (energy >= 0.03)

                self.clock.add_bytes(len(chunk))
                return (chunk, energy, is_voice)
            else:
                self._is_speaking = False
                if self._speech_done_event:
                    self._speech_done_event.set()

        # Idle silence
        silence = b'\x00' * bytes_needed
        self.clock.add_bytes(len(silence))
        return (silence, 0.0, False)

    def write_pcm(self, pcm_bytes: bytes):
        if not self.is_streaming:
            return
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
                res = self.write_callback(pcm_bytes)
                if asyncio.iscoroutine(res):
                    asyncio.create_task(res)
            except Exception as e:
                logger.error(f"Failed to dispatch audio chunk: {e}")

    async def _audio_worker(self):
        while self.is_streaming:
            try:
                if not self._audio_queue:
                    break
                chunk = await self._audio_queue.get()
                if self.write_callback:
                    res = self.write_callback(chunk)
                    if asyncio.iscoroutine(res):
                        await res
            except asyncio.CancelledError:
                break
            except Exception as e:
                logger.error(f"Audio worker error: {e}")

    def write_silence(self, duration_ms: int):
        if not self.is_streaming or duration_ms <= 0:
            return
        bytes_to_write = int((duration_ms / 1000.0) * self.bytes_per_sec)
        bytes_to_write -= bytes_to_write % (self.clock.channels * self.clock.sample_width)
        if bytes_to_write > 0:
            silence_bytes = bytes(bytes_to_write)
            self.write_pcm(silence_bytes)

    async def _silence_pump(self):
        """
        Pumps silence in standalone mode (used for unit tests or fallback when frame pump is inactive).
        """
        wait_elapsed = 0.0
        while self.is_streaming and getattr(self, '_waiting_for_encoder', False) and not self.write_callback and wait_elapsed < 3.0:
            await asyncio.sleep(0.05)
            wait_elapsed += 0.05
        if self.is_streaming and self._stream_start_time <= 0.0:
            self._stream_start_time = time.monotonic() - self.clock.get_audio_pts()
        try:
            while self.is_streaming:
                await asyncio.sleep(0.02)
                if self._is_speaking:
                    self._stream_start_time = time.monotonic() - self.clock.get_audio_pts()
                    continue
                now = time.monotonic()
                expected_pts = now - self._stream_start_time
                current_pts = self.clock.get_audio_pts()
                lag_sec = expected_pts - current_pts
                if lag_sec >= 0.005:
                    if lag_sec > 0.15:
                        self._stream_start_time = now - (current_pts + 0.04)
                        lag_sec = 0.04
                    duration_ms = int(lag_sec * 1000.0)
                    if duration_ms > 0:
                        self.write_silence(duration_ms)
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
