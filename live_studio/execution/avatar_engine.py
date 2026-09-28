import logging

logger = logging.getLogger(__name__)

class BaseAvatarEngine:
    """
    Abstract interface for Avatar Execution Layer.
    Provides execution lifecycle methods decoupled from Django, Cloud, and WebSocket.
    """
    def initialize(self):
        """
        Initializes avatar resources.
        """
        raise NotImplementedError

    def start_speech(self, audio_filepath: str, text: str):
        """
        Prepares the avatar for speech playback.
        """
        raise NotImplementedError

    def update(self, position_ms: int):
        """
        Updates the avatar state based on the audio playback clock.
        """
        raise NotImplementedError

    def interrupt(self):
        """
        Interrupts current speech/animation and returns to idle.
        """
        raise NotImplementedError

    def stop(self):
        """
        Stops the avatar and releases temporary resources if necessary.
        """
        raise NotImplementedError

    def shutdown(self):
        """
        Fully shuts down the avatar engine.
        """
        raise NotImplementedError


class DummyAvatarEngine(BaseAvatarEngine):
    """
    Dummy Avatar Engine used for tests to verify execution lifecycle.
    Records events to allow test assertions.
    """
    def __init__(self):
        self.events = []
        self.is_initialized = False
        self.is_speaking = False

    def initialize(self):
        self.is_initialized = True
        self.events.append(("initialize", None))
        logger.info("[DummyAvatar] Initialized")

    def start_speech(self, audio_filepath: str, text: str):
        self.is_speaking = True
        self.events.append(("start_speech", {"filepath": audio_filepath, "text": text}))
        logger.info(f"[DummyAvatar] Start speech: {audio_filepath}")

    def update(self, position_ms: int):
        if self.is_speaking:
            self.events.append(("update", position_ms))

    def interrupt(self):
        if self.is_speaking:
            self.is_speaking = False
            self.events.append(("interrupt", None))
            logger.info("[DummyAvatar] Interrupted")

    def stop(self):
        self.is_speaking = False
        self.events.append(("stop", None))
        logger.info("[DummyAvatar] Stopped")

    def shutdown(self):
        self.is_initialized = False
        self.events.append(("shutdown", None))
        logger.info("[DummyAvatar] Shutdown")


class Local2DAvatarEngine(BaseAvatarEngine):
    """
    Local 2D Avatar Engine running directly in the Studio application.
    Drives lip-sync and blinking, and outputs via the provided Renderer.
    """
    def __init__(self, renderer, lip_sync_analyzer):
        self.renderer = renderer
        self.lip_sync = lip_sync_analyzer
        self.is_initialized = False
        self.is_speaking = False
        self._last_blink_time = 0
        self._is_blinking = False

    def initialize(self):
        self.renderer.initialize()
        self.is_initialized = True
        logger.info("[Local2DAvatarEngine] Initialized")

    def start_speech(self, audio_filepath: str, text: str):
        self.is_speaking = True
        self.lip_sync.prepare(audio_filepath, text)
        # Force a render update immediately
        self.update(0)
        logger.info(f"[Local2DAvatarEngine] Start speech: {audio_filepath}")

    def update(self, position_ms: int):
        import time
        now = time.time()
        
        # Simple idle blinking logic
        # Blinks every ~3 seconds, lasting ~0.15 seconds
        if not self._is_blinking and (now - self._last_blink_time) > 3.0:
            self._is_blinking = True
            self._last_blink_time = now
        elif self._is_blinking and (now - self._last_blink_time) > 0.15:
            self._is_blinking = False
            self._last_blink_time = now
            
        mouth_state = "CLOSED"
        if self.is_speaking:
            mouth_state = self.lip_sync.get_mouth_state(position_ms)
            
        self.renderer.render(
            is_speaking=self.is_speaking,
            mouth_state=mouth_state,
            is_blinking=self._is_blinking
        )

    def interrupt(self):
        if self.is_speaking:
            self.is_speaking = False
            self.lip_sync.stop()
            self.update(0) # Re-render as idle
            logger.info("[Local2DAvatarEngine] Interrupted")

    def stop(self):
        self.is_speaking = False
        self.lip_sync.stop()
        self.update(0) # Re-render as idle
        logger.info("[Local2DAvatarEngine] Stopped")

    def shutdown(self):
        self.renderer.shutdown()
        self.is_initialized = False
        logger.info("[Local2DAvatarEngine] Shutdown")
