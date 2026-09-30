import logging
import time
import collections
import threading
from typing import Optional

logger = logging.getLogger(__name__)

class Frame:
    """Represents a single extracted video frame."""
    def __init__(self, data: bytes, width: int, height: int, timestamp: float, index: int):
        self.data = data
        self.width = width
        self.height = height
        self.timestamp = timestamp
        self.index = index

class BaseFrameSource:
    """Abstract interface for extracting video frames from the renderer."""
    def initialize(self):
        raise NotImplementedError
        
    def read_frame(self) -> Optional[Frame]:
        """Extracts and returns the current frame. Does not block."""
        raise NotImplementedError
        
    def shutdown(self):
        raise NotImplementedError

class PygameFrameSource(BaseFrameSource):
    """Extracts RGB24 frames from a Pygame display surface."""
    def __init__(self, renderer):
        self.renderer = renderer
        self.pygame = None
        self._frame_index = 0
        self._start_time = 0.0

    def initialize(self):
        try:
            import pygame
            self.pygame = pygame
        except ImportError:
            self.pygame = None
            logger.error("Pygame not available. PygameFrameSource disabled.")
        self._start_time = time.monotonic()
        self._frame_index = 0

    def read_frame(self) -> Optional[Frame]:
        if not self.pygame or not getattr(self.renderer, 'screen', None):
            return None
            
        surface = self.renderer.screen
        width, height = surface.get_size()
        
        try:
            # Extract as contiguous RGB24 byte array (width * height * 3 bytes)
            frame_data = self.pygame.image.tobytes(surface, 'RGB')
        except Exception as e:
            logger.error(f"Failed to extract frame: {e}")
            return None
            
        self._frame_index += 1
        # Use monotonic time to prevent drift and protect against system clock changes
        timestamp = time.monotonic() - self._start_time
        
        return Frame(
            data=frame_data,
            width=width,
            height=height,
            timestamp=timestamp,
            index=self._frame_index
        )
        
    def shutdown(self):
        pass

class FrameQueue:
    """
    Bounded frame queue with newest-frame preference.
    If the queue is full, the oldest frame is dropped to prevent overflow
    from blocking the main asyncio event loop or rendering pipeline.
    """
    def __init__(self, maxsize: int = 30):
        self.maxsize = maxsize
        self._queue = collections.deque(maxlen=maxsize)
        self._lock = threading.Lock()
        self.dropped_frames = 0
        
    def put(self, frame: Frame):
        """Pushes a frame to the queue, dropping the oldest if full."""
        with self._lock:
            if len(self._queue) == self.maxsize:
                self.dropped_frames += 1
                # deque(maxlen) automatically drops the oldest item on append
            self._queue.append(frame)
            
    def get(self) -> Optional[Frame]:
        """Gets the oldest available frame, or None if empty."""
        with self._lock:
            if not self._queue:
                return None
            return self._queue.popleft()
