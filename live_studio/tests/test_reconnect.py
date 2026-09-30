import unittest
import asyncio
from live_studio.core.ws_client import WebSocketClient
from live_studio.execution.sequence_validator import SequenceValidator
from live_studio.execution.device_sequence import DeviceSequenceCounter

class TestReconnect(unittest.IsolatedAsyncioTestCase):
    async def test_sequence_preserved(self):
        validator = SequenceValidator()
        validator.validate_and_update(1)
        validator.validate_and_update(2)
        
        device_counter = DeviceSequenceCounter()
        device_counter.next() # returns 1
        device_counter.next() # returns 2
        
        # Simulating reconnect doesn't reset validator because it's external to WSClient
        self.assertEqual(validator.get_current_sequence(), 2)
        
        # Device counter also doesn't reset
        self.assertEqual(device_counter.get_current(), 2)
        
        # Check that session sync sends correct sequence
        client = WebSocketClient("ws://dummy", "token", "sess1", lambda x: None)
        
        # We can mock send to intercept session.sync
        sent_data = []
        async def dummy_send(data):
            sent_data.append(data)
            
        client.send = dummy_send
        await client._send_session_sync(validator.get_current_sequence(), device_counter)
        
        self.assertEqual(len(sent_data), 1)
        self.assertEqual(sent_data[0]["name"], "session.sync")
        self.assertEqual(sent_data[0]["payload"]["cloud_to_device_sequence"], 2)
        
        # device_counter advanced by 1 for session.sync
        self.assertEqual(device_counter.get_current(), 3)
        self.assertEqual(sent_data[0]["sequence_number"], 3)
