import asyncio
import logging
import time

logger = logging.getLogger(__name__)

class BaseAudioPlayer:
    async def play(self, filepath: str) -> bool:
        """
        Plays the audio file. Returns True if completed normally, False if failed/interrupted.
        """
        raise NotImplementedError

    def stop(self):
        """
        Interrupts/stops current playback.
        """
        raise NotImplementedError

    def get_position_ms(self) -> int:
        """
        Returns the monotonic execution playback position in milliseconds.
        During playback, returns current position.
        When stopped/completed, returns the last meaningful position.
        Before first play, returns 0.
        """
        raise NotImplementedError


class DummyAudioPlayer(BaseAudioPlayer):
    """
    Mock audio player used for automated tests.
    Does not require a sound card or pygame.
    """
    def __init__(self):
        self._is_playing = False
        self._stop_event = asyncio.Event()
        self._start_time = 0.0
        self._last_position_ms = 0

    async def play(self, filepath: str) -> bool:
        self._is_playing = True
        self._stop_event.clear()
        self._start_time = time.monotonic()
        self._last_position_ms = 0
        
        logger.info(f"[DummyPlayer] Playing audio: {filepath}")
        
        try:
            # Simulate playback duration
            # Wait for 1 second or until stop_event is set
            await asyncio.wait_for(self._stop_event.wait(), timeout=1.0)
            # If wait_for completes without timeout, it means stop() was called
            self._is_playing = False
            self._last_position_ms = int((time.monotonic() - self._start_time) * 1000)
            logger.info(f"[DummyPlayer] Interrupted: {filepath}")
            return False
        except asyncio.TimeoutError:
            # Playback completed naturally
            self._is_playing = False
            self._last_position_ms = int((time.monotonic() - self._start_time) * 1000)
            logger.info(f"[DummyPlayer] Completed: {filepath}")
            return True

    def stop(self):
        if self._is_playing:
            self._last_position_ms = int((time.monotonic() - self._start_time) * 1000)
            self._is_playing = False
            self._stop_event.set()

    def get_position_ms(self) -> int:
        if self._is_playing:
            return int((time.monotonic() - self._start_time) * 1000)
        return self._last_position_ms


class PygameAudioPlayer(BaseAudioPlayer):
    """
    Real audio playback using pygame.mixer.
    Can be used on Windows without requiring heavy compilers or VLC.
    """
    def __init__(self):
        try:
            import pygame
            pygame.mixer.init()
            self._available = True
        except ImportError:
            logger.error("pygame not installed. Audio playback will not work.")
            self._available = False
            
        self._is_playing = False
        self._start_time = 0.0
        self._last_position_ms = 0

    async def play(self, filepath: str) -> bool:
        if not self._available:
            logger.error("Cannot play audio: pygame not installed")
            return False
            
        import pygame
        try:
            pygame.mixer.music.load(filepath)
            pygame.mixer.music.play()
            self._is_playing = True
            
            # Record start time for monotonic execution clock fallback
            # pygame.mixer.music.get_pos() is unreliable when paused/stopped
            self._start_time = time.monotonic()
            self._last_position_ms = 0
            
            # Poll playback state
            while pygame.mixer.music.get_busy() and self._is_playing:
                self._last_position_ms = pygame.mixer.music.get_pos()
                if self._last_position_ms < 0:
                    # Fallback if pygame returns -1
                    self._last_position_ms = int((time.monotonic() - self._start_time) * 1000)
                await asyncio.sleep(0.01) # Faster poll for tighter sync
                
            # If stopped via stop(), get_busy() becomes False
            completed = self._is_playing
            self._is_playing = False
            return completed
        except Exception as e:
            logger.error(f"Pygame playback error: {e}")
            self._is_playing = False
            return False

    def stop(self):
        if not self._available:
            return
            
        import pygame
        if self._is_playing:
            self._is_playing = False
            pygame.mixer.music.stop()

    def get_position_ms(self) -> int:
        """
        pygame backend currently provides an estimated playback clock.
        pygame.mixer.music.get_pos() returns ms since playback started.
        """
        if self._is_playing and self._available:
            import pygame
            pos = pygame.mixer.music.get_pos()
            if pos >= 0:
                return pos
            return int((time.monotonic() - self._start_time) * 1000)
        return self._last_position_ms
