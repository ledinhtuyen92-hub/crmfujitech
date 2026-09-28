import unittest
import asyncio
from live_studio.core.dispatcher import ProtocolDispatcher
from live_studio.core.state import DeviceRuntimeState
from live_studio.execution.sequence_validator import SequenceValidator
from live_studio.execution.dedup_registry import DedupRegistry
from live_studio.execution.queue_manager import SpeechQueueManager
from live_studio.execution.ack_manager import AckManager
from live_studio.execution.device_sequence import DeviceSequenceCounter
from live_studio.protocol.constants import STATE_SYNCHRONIZED, STATE_PAUSED, STATE_RUNNING, STATE_STOPPED

class TestHumanTakeover(unittest.IsolatedAsyncioTestCase):
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

    async def test_pause_flushes_queue(self):
        # Enqueue a command
        await self.dispatcher.dispatch({
            "type": "command", "name": "speech.speak", "sequence_number": 1,
            "payload": {"command_id": "cmd1", "text": "Hello"}
        })
        self.assertFalse(self.queue_manager._queue.empty())
        
        # Pause
        await self.dispatcher.dispatch({
            "type": "command", "name": "session.control", "sequence_number": 2,
            "payload": {"command_id": "pause1", "action": "pause"}
        })
        
        self.assertTrue(self.state.is_paused())
        self.assertTrue(self.queue_manager._queue.empty())
        
        # Check that it sent ACK_FAILED with CANCELLED_BY_HUMAN for the flushed command
        failed_acks = [ack for ack in self.sent_acks if ack["payload"].get("status") == "failed"]
        self.assertEqual(len(failed_acks), 1)
        self.assertEqual(failed_acks[0]["payload"]["command_id"], "cmd1")
        self.assertEqual(failed_acks[0]["payload"]["error_code"], "CANCELLED_BY_HUMAN")

    async def test_new_speech_blocked_while_paused(self):
        self.state.transition(STATE_PAUSED)
        
        await self.dispatcher.dispatch({
            "type": "command", "name": "speech.speak", "sequence_number": 1,
            "payload": {"command_id": "cmd1", "text": "Hello"}
        })
        
        self.assertTrue(self.queue_manager._queue.empty())
        
    async def test_resume_works(self):
        self.state.transition(STATE_PAUSED)
        
        await self.dispatcher.dispatch({
            "type": "command", "name": "session.control", "sequence_number": 2,
            "payload": {"command_id": "resume1", "action": "resume"}
        })
        
        self.assertFalse(self.state.is_paused())
        self.assertEqual(self.state.state, STATE_RUNNING)

    async def test_stop_works(self):
        self.state.transition(STATE_RUNNING)
        await self.dispatcher.dispatch({
            "type": "command", "name": "session.control", "sequence_number": 2,
            "payload": {"command_id": "stop1", "action": "stop"}
        })
        
        self.assertEqual(self.state.state, STATE_STOPPED)
