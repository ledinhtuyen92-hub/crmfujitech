import logging
from live_studio.protocol.constants import (
    STATE_DISCONNECTED, STATE_CONNECTING, STATE_CONNECTED, 
    STATE_SYNCHRONIZED, STATE_PAUSED, STATE_RUNNING, STATE_STOPPED, STATE_ERROR
)

logger = logging.getLogger(__name__)

class DeviceRuntimeState:
    def __init__(self):
        self.state = STATE_DISCONNECTED
        
    def transition(self, new_state: str):
        valid_states = [
            STATE_DISCONNECTED, STATE_CONNECTING, STATE_CONNECTED, 
            STATE_SYNCHRONIZED, STATE_PAUSED, STATE_RUNNING, 
            STATE_STOPPED, STATE_ERROR
        ]
        if new_state not in valid_states:
            logger.error(f"Invalid state transition attempted: {new_state}")
            return
            
        logger.info(f"State transition: {self.state} -> {new_state}")
        self.state = new_state

    def is_accepting_speech(self) -> bool:
        return self.state in [STATE_SYNCHRONIZED, STATE_RUNNING]

    def is_paused(self) -> bool:
        return self.state == STATE_PAUSED
