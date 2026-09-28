import time
from collections import OrderedDict
from typing import Optional, Dict, Any

class DedupRegistry:
    """
    LRU/TTL Bounded Cache for Command Deduplication.
    Stores runtime state of commands to prevent double-execution and
    provide appropriate ACKs for duplicate commands.
    """
    def __init__(self, max_size: int = 1000, ttl_seconds: int = 3600):
        self.max_size = max_size
        self.ttl_seconds = ttl_seconds
        # OrderedDict maps command_id -> state dict
        self._cache: OrderedDict[str, Dict[str, Any]] = OrderedDict()

    def register_or_get(self, command_id: str, initial_status: str, sequence_number: int) -> Optional[Dict[str, Any]]:
        """
        If command_id exists and not expired, return its current state.
        Otherwise, register it with initial_status and return None.
        """
        current_time = time.time()
        
        if command_id in self._cache:
            state = self._cache[command_id]
            # Check TTL
            if current_time - state["updated_at"] <= self.ttl_seconds:
                # Move to end to mark as recently used
                self._cache.move_to_end(command_id)
                return state
            else:
                # Expired, treat as new
                del self._cache[command_id]

        # Register new
        self._cache[command_id] = {
            "command_id": command_id,
            "status": initial_status,
            "sequence_number": sequence_number,
            "updated_at": current_time
        }
        self._cache.move_to_end(command_id)
        
        # Enforce LRU bound
        if len(self._cache) > self.max_size:
            self._cache.popitem(last=False)
            
        return None

    def update_status(self, command_id: str, status: str):
        if command_id in self._cache:
            self._cache[command_id]["status"] = status
            self._cache[command_id]["updated_at"] = time.time()
            self._cache.move_to_end(command_id)

    def get_status(self, command_id: str) -> Optional[str]:
        if command_id in self._cache:
            state = self._cache[command_id]
            if time.time() - state["updated_at"] <= self.ttl_seconds:
                return state["status"]
            else:
                del self._cache[command_id]
        return None
