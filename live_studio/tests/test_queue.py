import unittest
import asyncio
from live_studio.execution.queue_manager import SpeechQueueManager
from live_studio.protocol.envelopes import SpeechSpeakPayload

class TestSpeechQueue(unittest.IsolatedAsyncioTestCase):
    def setUp(self):
        self.queue = SpeechQueueManager()

    async def test_fifo_same_priority(self):
        self.queue.enqueue(SpeechSpeakPayload(command_id="cmd1", text="1", priority="normal"), 1)
        self.queue.enqueue(SpeechSpeakPayload(command_id="cmd2", text="2", priority="normal"), 2)
        
        item1 = await self.queue.get_next()
        self.assertEqual(item1.payload.command_id, "cmd1")
        
        item2 = await self.queue.get_next()
        self.assertEqual(item2.payload.command_id, "cmd2")

    async def test_priority(self):
        self.queue.enqueue(SpeechSpeakPayload(command_id="cmd1", text="1", priority="normal"), 1)
        self.queue.enqueue(SpeechSpeakPayload(command_id="cmd2", text="2", priority="high"), 2)
        
        # High priority should be popped first
        item1 = await self.queue.get_next()
        self.assertEqual(item1.payload.command_id, "cmd2")
        
        item2 = await self.queue.get_next()
        self.assertEqual(item2.payload.command_id, "cmd1")

    async def test_flush(self):
        self.queue.enqueue(SpeechSpeakPayload(command_id="cmd1", text="1", priority="normal"), 1)
        self.queue.enqueue(SpeechSpeakPayload(command_id="cmd2", text="2", priority="normal"), 2)
        
        flushed = self.queue.flush()
        self.assertEqual(len(flushed), 2)
        self.assertEqual(flushed[0].payload.command_id, "cmd1")
        
        # Queue should be empty now
        self.assertTrue(self.queue._queue.empty())
