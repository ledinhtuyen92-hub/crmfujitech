import uuid
from unittest.mock import patch, MagicMock

from django.test import SimpleTestCase

from live_sessions.sequence import LiveSequenceService

class LiveSequenceServiceTests(SimpleTestCase):
    def setUp(self):
        self.company_id = str(uuid.uuid4())
        self.session_id = str(uuid.uuid4())
        self.company_id_2 = str(uuid.uuid4())
        self.session_id_2 = str(uuid.uuid4())
        
        # Clear any existing keys if we're connected to real redis
        LiveSequenceService.clear_sequence(self.company_id, self.session_id)
        LiveSequenceService.clear_sequence(self.company_id_2, self.session_id_2)

    def tearDown(self):
        LiveSequenceService.clear_sequence(self.company_id, self.session_id)
        LiveSequenceService.clear_sequence(self.company_id_2, self.session_id_2)

    def test_first_command_gets_sequence_1(self):
        seq = LiveSequenceService.get_next_sequence(self.company_id, self.session_id)
        self.assertEqual(seq, 1)

    def test_sequence_increments(self):
        seq1 = LiveSequenceService.get_next_sequence(self.company_id, self.session_id)
        seq2 = LiveSequenceService.get_next_sequence(self.company_id, self.session_id)
        seq3 = LiveSequenceService.get_next_sequence(self.company_id, self.session_id)
        
        self.assertEqual(seq1, 1)
        self.assertEqual(seq2, 2)
        self.assertEqual(seq3, 3)

    def test_different_sessions_independent_counters(self):
        # Session A gets 3
        LiveSequenceService.get_next_sequence(self.company_id, self.session_id)
        LiveSequenceService.get_next_sequence(self.company_id, self.session_id)
        seq_a_3 = LiveSequenceService.get_next_sequence(self.company_id, self.session_id)
        
        # Session B starts at 1
        seq_b_1 = LiveSequenceService.get_next_sequence(self.company_id_2, self.session_id_2)
        seq_b_2 = LiveSequenceService.get_next_sequence(self.company_id_2, self.session_id_2)
        
        self.assertEqual(seq_a_3, 3)
        self.assertEqual(seq_b_1, 1)
        self.assertEqual(seq_b_2, 2)

    @patch('live_sessions.sequence.redis_client')
    def test_atomic_incr_called(self, mock_redis):
        mock_redis.incr.return_value = 1
        mock_redis.ttl.return_value = -1
        
        seq = LiveSequenceService.get_next_sequence(self.company_id, self.session_id)
        
        mock_redis.incr.assert_called_once_with(f"live:company:{self.company_id}:session:{self.session_id}:sequence:cloud_to_device")
        self.assertEqual(seq, 1)

    @patch('live_sessions.sequence.redis_client')
    def test_redis_failure_raises_exception(self, mock_redis):
        # If redis fails, sequence raises exception
        from live_sessions.sequence import SequenceUnavailableException
        mock_redis.incr.side_effect = Exception("Redis connection error")
        
        with self.assertRaises(SequenceUnavailableException):
            LiveSequenceService.get_next_sequence(self.company_id, self.session_id)
