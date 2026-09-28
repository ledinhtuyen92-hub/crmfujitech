import unittest
import time
from live_studio.execution.dedup_registry import DedupRegistry
from live_studio.protocol.constants import ACK_RECEIVED, ACK_COMPLETED, ACK_FAILED

class TestDedupRegistry(unittest.TestCase):
    def setUp(self):
        self.registry = DedupRegistry(max_size=3, ttl_seconds=2)

    def test_first_execution(self):
        state = self.registry.register_or_get("cmd1", ACK_RECEIVED, 1)
        self.assertIsNone(state) # First time returns None
        self.assertEqual(self.registry.get_status("cmd1"), ACK_RECEIVED)

    def test_duplicate_while_received(self):
        self.registry.register_or_get("cmd1", ACK_RECEIVED, 1)
        state = self.registry.register_or_get("cmd1", ACK_RECEIVED, 1)
        self.assertIsNotNone(state)
        self.assertEqual(state["status"], ACK_RECEIVED)

    def test_duplicate_after_completed(self):
        self.registry.register_or_get("cmd1", ACK_RECEIVED, 1)
        self.registry.update_status("cmd1", ACK_COMPLETED)
        
        state = self.registry.register_or_get("cmd1", ACK_RECEIVED, 1)
        self.assertEqual(state["status"], ACK_COMPLETED)

    def test_duplicate_after_failed(self):
        self.registry.register_or_get("cmd1", ACK_RECEIVED, 1)
        self.registry.update_status("cmd1", ACK_FAILED)
        
        state = self.registry.register_or_get("cmd1", ACK_RECEIVED, 1)
        self.assertEqual(state["status"], ACK_FAILED)

    def test_ttl_expiration(self):
        self.registry.register_or_get("cmd1", ACK_RECEIVED, 1)
        time.sleep(2.1) # Wait for TTL to expire
        
        state = self.registry.register_or_get("cmd1", ACK_RECEIVED, 1)
        self.assertIsNone(state) # Treats as new because it expired

    def test_lru_eviction(self):
        self.registry.register_or_get("cmd1", ACK_RECEIVED, 1)
        self.registry.register_or_get("cmd2", ACK_RECEIVED, 2)
        self.registry.register_or_get("cmd3", ACK_RECEIVED, 3)
        self.registry.register_or_get("cmd4", ACK_RECEIVED, 4) # Should evict cmd1
        
        state = self.registry.get_status("cmd1")
        self.assertIsNone(state)
        self.assertEqual(self.registry.get_status("cmd2"), ACK_RECEIVED)
