import unittest
import asyncio
from unittest.mock import MagicMock, patch, AsyncMock
from live_studio.execution.stream_controller import StreamController, StreamState
from live_studio.execution.media_pipeline import MediaClock, AudioStreamSink
from live_studio.execution.frame_source import FrameQueue, Frame
from live_studio.protocol.envelopes import StreamStartPayload, StreamStopPayload

class TestStreamPipeline(unittest.IsolatedAsyncioTestCase):
    
    async def test_audio_sink_to_encoder_transport(self):
        clock = MediaClock()
        sink = AudioStreamSink(clock)
        controller = StreamController(audio_sink=sink)
        
        with patch.object(controller.locator, 'locate', return_value="fake_ffmpeg"):
            with patch('live_studio.execution.stream_controller.StreamEncoder') as mock_encoder_class:
                mock_encoder = AsyncMock()
                mock_encoder_class.return_value = mock_encoder
                
                payload = StreamStartPayload(command_id="cmd-1", stream_url="rtmp://secret")
                await controller.handle_start(payload)
                
                # Push some PCM data
                sink.write_pcm(b"\x00\x00")
                
                # Give the asyncio task time to run
                await asyncio.sleep(0.05)
                
                # Assert encoder received audio
                mock_encoder.write_audio.assert_called_with(b"\x00\x00")
                
                await controller.handle_stop(StreamStopPayload(command_id="cmd-2"))
                
    async def test_frame_queue_to_encoder_transport(self):
        queue = FrameQueue(maxsize=10)
        controller = StreamController(frame_queue=queue)
        
        with patch.object(controller.locator, 'locate', return_value="fake_ffmpeg"):
            with patch('live_studio.execution.stream_controller.StreamEncoder') as mock_encoder_class:
                mock_encoder = AsyncMock()
                mock_encoder_class.return_value = mock_encoder
                
                payload = StreamStartPayload(command_id="cmd-1", stream_url="rtmp://secret")
                await controller.handle_start(payload)
                
                # Push a frame
                frame = Frame(data=b"\xff\x00\x00", width=10, height=10, timestamp=0.0, index=1)
                queue.put(frame)
                
                # Give pump task time to process
                await asyncio.sleep(0.1)
                
                # Assert encoder received video
                mock_encoder.write_video.assert_called_with(b"\xff\x00\x00")
                
                await controller.handle_stop(StreamStopPayload(command_id="cmd-2"))
                
    async def test_pump_task_cleanup(self):
        queue = FrameQueue(maxsize=10)
        controller = StreamController(frame_queue=queue)
        
        with patch.object(controller.locator, 'locate', return_value="fake_ffmpeg"):
            with patch('live_studio.execution.stream_controller.StreamEncoder') as mock_encoder_class:
                mock_encoder = AsyncMock()
                mock_encoder_class.return_value = mock_encoder
                
                payload = StreamStartPayload(command_id="cmd-1", stream_url="rtmp://secret")
                await controller.handle_start(payload)
                
                self.assertIsNotNone(controller._frame_pump_task)
                self.assertFalse(controller._frame_pump_task.done())
                
                await controller.handle_stop(StreamStopPayload(command_id="cmd-2"))
                
                self.assertIsNone(controller._frame_pump_task)
