import threading
import logging

logger = logging.getLogger(__name__)

class DeviceSequenceCounter:
    """
    Monotonic thread-safe sequence counter for Device -> Cloud messages.
    Starts at 1. Never returns 0.
    Survives WebSocket reconnects during the process lifetime because
    it lives in the application state, not the connection state.
    """
    def __init__(self):
        self._counter = 0
        self._lock = threading.Lock()

    def next(self) -> int:
        with self._lock:
            self._counter += 1
            return self._counter

    def get_current(self) -> int:
        with self._lock:
            return self._counter
