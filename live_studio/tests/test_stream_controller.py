import unittest
import asyncio
from unittest.mock import MagicMock, patch, AsyncMock
from live_studio.execution.stream_controller import StreamController, StreamState
from live_studio.protocol.envelopes import StreamStartPayload, StreamStopPayload

class TestStreamController(unittest.IsolatedAsyncioTestCase):
    
    async def test_successful_start_and_stop_lifecycle(self):
        controller = StreamController()
        self.assertEqual(controller.state, StreamState.IDLE)
        
        # Mock locator and encoder
        with patch.object(controller.locator, 'locate', return_value="fake_ffmpeg"):
            with patch('live_studio.execution.stream_controller.StreamEncoder') as mock_encoder_class:
                mock_encoder_instance = AsyncMock()
                mock_encoder_class.return_value = mock_encoder_instance
                
                payload = StreamStartPayload(
                    command_id="cmd-1",
                    stream_url="rtmp://secret",
                )
                
                success = await controller.handle_start(payload)
                self.assertTrue(success)
                self.assertEqual(controller.state, StreamState.LIVE)
                mock_encoder_instance.start.assert_called_once()
                
                # Test duplicate start (must fail gracefully)
                success_dup = await controller.handle_start(payload)
                self.assertFalse(success_dup)
                self.assertEqual(controller.state, StreamState.LIVE)
                
                # Test Stop
                stop_payload = StreamStopPayload(command_id="cmd-2")
                success_stop = await controller.handle_stop(stop_payload)
                self.assertTrue(success_stop)
                self.assertEqual(controller.state, StreamState.STOPPED)
                mock_encoder_instance.stop.assert_called_once()
                
                # Test duplicate stop
                success_dup_stop = await controller.handle_stop(stop_payload)
                self.assertTrue(success_dup_stop)
                self.assertEqual(controller.state, StreamState.STOPPED)

    async def test_ffmpeg_missing_startup(self):
        controller = StreamController()
        with patch.object(controller.locator, 'locate', return_value=None):
            payload = StreamStartPayload(command_id="cmd-1", stream_url="rtmp://secret")
            success = await controller.handle_start(payload)
            self.assertFalse(success)
            self.assertEqual(controller.state, StreamState.ERROR)

    async def test_startup_failure_to_error(self):
        controller = StreamController()
        with patch.object(controller.locator, 'locate', return_value="fake_ffmpeg"):
            with patch('live_studio.execution.stream_controller.StreamEncoder') as mock_encoder_class:
                mock_encoder_instance = AsyncMock()
                mock_encoder_instance.start.side_effect = Exception("Start failed")
                mock_encoder_class.return_value = mock_encoder_instance
                
                payload = StreamStartPayload(command_id="cmd-1", stream_url="rtmp://secret")
                success = await controller.handle_start(payload)
                self.assertFalse(success)
                self.assertEqual(controller.state, StreamState.ERROR)

    async def test_resource_cleanup_on_stop_error(self):
        controller = StreamController()
        with patch.object(controller.locator, 'locate', return_value="fake_ffmpeg"):
            with patch('live_studio.execution.stream_controller.StreamEncoder') as mock_encoder_class:
                mock_encoder_instance = AsyncMock()
                mock_encoder_instance.stop.side_effect = Exception("Stop failed")
                mock_encoder_class.return_value = mock_encoder_instance
                
                payload = StreamStartPayload(command_id="cmd-1", stream_url="rtmp://secret")
                await controller.handle_start(payload)
                
                stop_payload = StreamStopPayload(command_id="cmd-2")
                success_stop = await controller.handle_stop(stop_payload)
                self.assertTrue(success_stop) # True because it still gracefully sets state to STOPPED
                self.assertEqual(controller.state, StreamState.STOPPED)
                self.assertIsNone(controller.encoder)

    async def test_invalid_rtmp_url(self):
        controller = StreamController()
        payload = StreamStartPayload(command_id="cmd-1", stream_url="http://invalid")
        success = await controller.handle_start(payload)
        self.assertFalse(success)
        self.assertEqual(controller.state, StreamState.ERROR)
        
    async def test_health_monitor_detects_crash_and_reconnects(self):
        controller = StreamController()
        controller.max_retries = 1
        with patch.object(controller.locator, 'locate', return_value="fake_ffmpeg"):
            with patch('live_studio.execution.stream_controller.StreamEncoder') as mock_encoder_class:
                mock_encoder_instance = AsyncMock()
                mock_encoder_instance.is_running = True
                mock_encoder_class.return_value = mock_encoder_instance
                
                payload = StreamStartPayload(command_id="cmd-1", stream_url="rtmp://secret")
                await controller.handle_start(payload)
                self.assertEqual(controller.state, StreamState.LIVE)
                
                # Simulate crash
                mock_encoder_instance.is_running = False
                
                # Wait for health monitor to detect and start reconnect
                await asyncio.sleep(1.2)
                
                # State should be RECONNECTING because backoff is 2 seconds (2^1)
                self.assertEqual(controller.state, StreamState.RECONNECTING)
                
                # Stop cleanly
                await controller.handle_stop(StreamStopPayload(command_id="cmd-2"))
                self.assertEqual(controller.state, StreamState.STOPPED)
