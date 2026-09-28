import unittest
from live_studio.execution.sequence_validator import SequenceValidator

class TestSequenceValidator(unittest.TestCase):
    def setUp(self):
        self.validator = SequenceValidator()

    def test_normal_sequence(self):
        action = self.validator.validate_and_update(1)
        self.assertEqual(action, "accept")
        self.assertEqual(self.validator.get_current_sequence(), 1)
        
        action = self.validator.validate_and_update(2)
        self.assertEqual(action, "accept")
        self.assertEqual(self.validator.get_current_sequence(), 2)

    def test_duplicate_sequence(self):
        self.validator.validate_and_update(1)
        self.validator.validate_and_update(2)
        
        # Duplicate 2
        action = self.validator.validate_and_update(2)
        self.assertEqual(action, "drop")
        self.assertEqual(self.validator.get_current_sequence(), 2)

    def test_old_sequence(self):
        self.validator.validate_and_update(1)
        self.validator.validate_and_update(2)
        self.validator.validate_and_update(3)
        
        # Old 1
        action = self.validator.validate_and_update(1)
        self.assertEqual(action, "drop")
        self.assertEqual(self.validator.get_current_sequence(), 3)

    def test_sequence_gap(self):
        self.validator.validate_and_update(1)
        self.validator.validate_and_update(2)
        
        # Gap: jump to 5
        action = self.validator.validate_and_update(5)
        self.assertEqual(action, "accept")
        self.assertEqual(self.validator.get_current_sequence(), 5)
