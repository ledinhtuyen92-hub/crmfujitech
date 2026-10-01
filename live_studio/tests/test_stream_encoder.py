import unittest
import asyncio
from unittest.mock import MagicMock, patch, AsyncMock
from live_studio.execution.stream_encoder import (
    StreamConfig, FfmpegLocator, HardwareEncoderProbe, AVTimeline, StreamEncoder
)

class TestStreamEncoderFoundation(unittest.IsolatedAsyncioTestCase):
    
    async def test_stream_config_defaults(self):
        config = StreamConfig()
        self.assertEqual(config.width, 720)
        self.assertEqual(config.height, 1280)
        self.assertEqual(config.fps, 30)
        self.assertEqual(config.video_pixel_format, "rgb24")
        self.assertEqual(config.video_codec, "libx264")
        
    @patch('live_studio.execution.stream_encoder.asyncio.create_subprocess_exec')
    async def test_ffmpeg_discovery_success(self, mock_exec):
        mock_proc = AsyncMock()
        mock_proc.returncode = 0
        mock_proc.communicate.return_value = (b"", b"")
        mock_exec.return_value = mock_proc
        
        locator = FfmpegLocator(override_path="custom/ffmpeg")
        path = await locator.locate()
        self.assertEqual(path, "custom/ffmpeg")
        
    @patch('live_studio.execution.stream_encoder.asyncio.create_subprocess_exec')
    async def test_ffmpeg_unavailable_behavior(self, mock_exec):
        mock_exec.side_effect = FileNotFoundError()
        locator = FfmpegLocator()
        path = await locator.locate()
        self.assertIsNone(path)
        
    @patch('live_studio.execution.stream_encoder.asyncio.create_subprocess_exec')
    async def test_hardware_encoder_probe(self, mock_exec):
        mock_proc = AsyncMock()
        mock_proc.returncode = 0
        mock_proc.communicate.return_value = (b" V..... h264_nvenc \n V..... libx264 \n", b"")
        mock_exec.return_value = mock_proc
        
        probe = HardwareEncoderProbe("dummy_ffmpeg")
        pref, avail = await probe.probe()
        self.assertEqual(pref, "h264_nvenc")
        self.assertIn("h264_nvenc", avail)
        self.assertIn("libx264", avail)

    async def test_av_pts_monotonicity(self):
        timeline = AVTimeline(fps=30, sample_rate=44100)
        self.assertEqual(timeline.get_video_pts(0), 0.0)
        self.assertEqual(timeline.get_video_pts(30), 1.0)
        
        self.assertEqual(timeline.get_audio_pts(), 0.0)
        timeline.advance_audio(44100)
        self.assertEqual(timeline.get_audio_pts(), 1.0)
        timeline.advance_audio(22050)
        self.assertEqual(timeline.get_audio_pts(), 1.5)

    @patch('live_studio.execution.stream_encoder.asyncio.create_subprocess_exec')
    async def test_stream_encoder_startup_and_graceful_shutdown(self, mock_exec):
        mock_proc = AsyncMock()
        mock_proc.returncode = None
        mock_proc.terminate = MagicMock()
        mock_proc.kill = MagicMock()
        mock_proc.stderr.readline.side_effect = [b"frame=1\n", b""]
        mock_exec.return_value = mock_proc
        
        config = StreamConfig()
        encoder = StreamEncoder(config, "ffmpeg", "null_output")
        
        async def fake_ffmpeg_connect():
            await asyncio.sleep(0.1)
            import socket
            v_sock = socket.socket()
            v_sock.connect(('127.0.0.1', encoder.video_transport.port))
            a_sock = socket.socket()
            a_sock.connect(('127.0.0.1', encoder.audio_transport.port))
            v_sock.close()
            a_sock.close()

        asyncio.create_task(fake_ffmpeg_connect())
        await encoder.start()
        
        self.assertTrue(encoder.is_running)
        
        await encoder.write_video(b"0" * 800 * 600 * 3)
        await encoder.write_audio(b"0" * 4096)
        
        mock_proc.returncode = 0
        await encoder.stop()
        self.assertFalse(encoder.is_running)

    @patch('live_studio.execution.stream_encoder.asyncio.create_subprocess_exec')
    async def test_broken_pipe_detection(self, mock_exec):
        mock_proc = AsyncMock()
        mock_proc.returncode = None
        mock_proc.terminate = MagicMock()
        mock_proc.kill = MagicMock()
        mock_proc.stderr.readline.return_value = b""
        mock_exec.return_value = mock_proc
        
        config = StreamConfig()
        encoder = StreamEncoder(config, "ffmpeg", "null_output")
        
        async def fake_ffmpeg_connect():
            await asyncio.sleep(0.1)
            import socket
            v_sock = socket.socket()
            v_sock.connect(('127.0.0.1', encoder.video_transport.port))
            a_sock = socket.socket()
            a_sock.connect(('127.0.0.1', encoder.audio_transport.port))
            # Close immediately
            v_sock.close()
            a_sock.close()

        asyncio.create_task(fake_ffmpeg_connect())
        await encoder.start()
        
        await asyncio.sleep(0.2)
        
        with patch.object(encoder, 'stop', wraps=encoder.stop) as mock_stop:
            await encoder.write_video(b"0" * (800*600*3))
            await asyncio.sleep(0.1)
            
        await encoder.stop()
