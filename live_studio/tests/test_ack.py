import unittest
from live_studio.execution.ack_manager import AckManager
from live_studio.execution.device_sequence import DeviceSequenceCounter
from live_studio.protocol.constants import ACK_RECEIVED, ACK_COMPLETED

class TestAckManager(unittest.TestCase):
    def test_build_ack(self):
        counter = DeviceSequenceCounter()
        manager = AckManager("sess1", counter)
        
        ack = manager.build_ack("cmd1", ACK_RECEIVED, "msg1")
        self.assertEqual(ack["type"], "ack")
        self.assertEqual(ack["name"], "ack")
        self.assertEqual(ack["session_id"], "sess1")
        self.assertEqual(ack["sequence_number"], 1)
        self.assertEqual(ack["reference_message_id"], "msg1")
        self.assertEqual(ack["payload"]["command_id"], "cmd1")
        self.assertEqual(ack["payload"]["status"], ACK_RECEIVED)
        self.assertNotIn("error_code", ack["payload"])
        
    def test_build_ack_with_error(self):
        counter = DeviceSequenceCounter()
        manager = AckManager("sess1", counter)
        
        ack = manager.build_ack("cmd1", "failed", "msg1", "SOME_ERROR")
        self.assertEqual(ack["payload"]["status"], "failed")
        self.assertEqual(ack["payload"]["error_code"], "SOME_ERROR")
