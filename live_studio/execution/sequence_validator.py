import logging

logger = logging.getLogger(__name__)

class SequenceValidator:
    def __init__(self):
        self.last_received_sequence = 0

    def validate_and_update(self, sequence_number: int) -> str:
        """
        Validates cloud_to_device sequence.
        Returns:
            "accept" - Normal sequential command or gap
            "drop"   - Old or duplicate command
        """
        expected = self.last_received_sequence + 1

        if sequence_number <= self.last_received_sequence:
            logger.warning(f"Old/Duplicate sequence dropped. Received {sequence_number}, Expected {expected}")
            return "drop"

        if sequence_number > expected:
            # Sequence Gap Detected = Message Loss
            logger.error(f"SEQUENCE_GAP_DETECTED: Expected {expected}, got {sequence_number}. Data may be lost.")
            
        # Accept normally or accept with gap
        self.last_received_sequence = sequence_number
        return "accept"

    def get_current_sequence(self) -> int:
        return self.last_received_sequence
