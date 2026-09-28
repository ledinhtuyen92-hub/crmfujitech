import unittest
import asyncio
from live_studio.core.dispatcher import ProtocolDispatcher
from live_studio.core.state import DeviceRuntimeState
from live_studio.execution.sequence_validator import SequenceValidator
from live_studio.execution.dedup_registry import DedupRegistry
from live_studio.execution.queue_manager import SpeechQueueManager
from live_studio.execution.ack_manager import AckManager
from live_studio.execution.device_sequence import DeviceSequenceCounter
from live_studio.protocol.constants import STATE_SYNCHRONIZED, ACK_RECEIVED

class TestProtocolDispatcher(unittest.IsolatedAsyncioTestCase):
    def setUp(self):
        self.state = DeviceRuntimeState()
        self.state.transition(STATE_SYNCHRONIZED)
        self.sequence_validator = SequenceValidator()
        self.device_sequence_counter = DeviceSequenceCounter()
        self.dedup_registry = DedupRegistry()
        self.queue_manager = SpeechQueueManager()
        self.ack_manager = AckManager("sess1", self.device_sequence_counter)
        self.sent_acks = []

        async def dummy_send(data):
            self.sent_acks.append(data)

        self.dispatcher = ProtocolDispatcher(
            self.state, self.sequence_validator, self.dedup_registry,
            self.queue_manager, self.ack_manager, dummy_send
        )

    async def test_speech_speak_validation(self):
        envelope = {
            "type": "command",
            "name": "speech.speak",
            "message_id": "msg1",
            "sequence_number": 1,
            "session_id": "sess1",
            "payload": {
                "command_id": "cmd1",
                "text": "Hello",
                "priority": "normal"
            }
        }
        await self.dispatcher.dispatch(envelope)
        
        # Check queue
        item = self.queue_manager.get_item("cmd1")
        self.assertIsNotNone(item)
        self.assertEqual(item.payload.text, "Hello")
        
        # Check ACK sent
        self.assertEqual(len(self.sent_acks), 1)
        self.assertEqual(self.sent_acks[0]["payload"]["status"], ACK_RECEIVED)

    async def test_malformed_envelope_unknown_command(self):
        envelope = {
            "type": "command",
            "name": "unknown.command",
            "sequence_number": 1,
        }
        await self.dispatcher.dispatch(envelope)
        self.assertEqual(len(self.sent_acks), 0)

    async def test_avatar_action_ignored(self):
        envelope = {
            "type": "command",
            "name": "avatar.action",
            "sequence_number": 1,
        }
        await self.dispatcher.dispatch(envelope)
        self.assertEqual(len(self.sent_acks), 0)
