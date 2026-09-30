import unittest
import asyncio
import time
from unittest.mock import patch, MagicMock

from live_studio.execution.media_pipeline import MediaClock, AudioStreamSink, Mp3Decoder
from live_studio.execution.audio_player import PygameAudioPlayer

class TestMediaPipeline(unittest.IsolatedAsyncioTestCase):
    def setUp(self):
        self.media_clock = MediaClock(sample_rate=44100, channels=2, sample_width=2)
        self.stream_sink = AudioStreamSink(self.media_clock)

    def test_media_clock_monotonicity(self):
        self.assertEqual(self.media_clock.get_audio_pts(), 0.0)
        
        # Write 1 second of audio: 44100 samples * 2 channels * 2 bytes = 176400 bytes
        bytes_per_sec = 44100 * 2 * 2
        self.media_clock.add_bytes(bytes_per_sec)
        
        self.assertEqual(self.media_clock.total_samples_written, 44100)
        self.assertEqual(self.media_clock.get_audio_pts(), 1.0)

    async def test_audio_stream_sink_silence(self):
        self.stream_sink.start()
        self.assertTrue(self.stream_sink.is_streaming)
        self.assertEqual(self.stream_sink.clock.get_audio_pts(), 0.0)
        
        # Write 500ms of silence
        self.stream_sink.write_silence(500)
        
        # 0.5 sec = 22050 samples
        self.assertEqual(self.stream_sink.clock.total_samples_written, 22050)
        self.assertEqual(self.stream_sink.clock.get_audio_pts(), 0.5)
        
        self.stream_sink.stop()
        self.assertFalse(self.stream_sink.is_streaming)

    async def test_audio_stream_sink_pump(self):
        self.stream_sink.start()
        
        # Wait for 200ms. Silence pump should run and inject silence.
        await asyncio.sleep(0.25)
        
        pts = self.stream_sink.clock.get_audio_pts()
        self.assertGreater(pts, 0.05)
        
        self.stream_sink.stop()

    @patch('subprocess.run')
    def test_mp3_decoder_graceful_fail(self, mock_run):
        mock_run.side_effect = FileNotFoundError("ffmpeg not found")
        
        # Should not crash, should return empty bytes
        result = Mp3Decoder.decode_to_pcm("dummy.mp3")
        self.assertEqual(result, b"")

    @patch('subprocess.run')
    def test_mp3_decoder_success(self, mock_run):
        mock_run.return_value = MagicMock(stdout=b"pcmdata")
        
        result = Mp3Decoder.decode_to_pcm("dummy.mp3")
        self.assertEqual(result, b"pcmdata")

    async def test_audio_player_sink_failure_isolation(self):
        # If the sink raises an error, Pygame playback should NOT fail.
        class FaultySink:
            is_streaming = True
            bytes_per_sec = 176400
            
            def set_speaking(self, val):
                pass
                
            def write_pcm(self, data):
                raise RuntimeError("Sink failed!")

        sink = FaultySink()
        player = PygameAudioPlayer(stream_sink=sink)
        player._available = True
        
        with patch('live_studio.execution.audio_player.asyncio.to_thread', return_value=b"12345678"), \
             patch('pygame.mixer.music.load'), \
             patch('pygame.mixer.music.play'), \
             patch('pygame.mixer.music.get_busy', side_effect=[True, False]), \
             patch('pygame.mixer.music.get_pos', return_value=10):
            # Should not raise exception
            completed = await player.play("dummy.mp3")
            self.assertTrue(completed)

    @patch('live_studio.execution.audio_player.asyncio.to_thread')
    async def test_audio_player_non_blocking_decode(self, mock_to_thread):
        mock_to_thread.return_value = b"pcmdata"
        
        class DummySink:
            is_streaming = True
            bytes_per_sec = 176400
            def set_speaking(self, val): pass
            def write_pcm(self, data): pass
            
        player = PygameAudioPlayer(stream_sink=DummySink())
        player._available = True
        
        with patch('pygame.mixer.music.load'), \
             patch('pygame.mixer.music.play'), \
             patch('pygame.mixer.music.get_busy', return_value=False), \
             patch('pygame.mixer.music.get_pos', return_value=0):
            
            await player.play("dummy.mp3")
        
        # Verify that asyncio.to_thread was used to offload the MP3 decode
        self.assertTrue(mock_to_thread.called)
        args = mock_to_thread.call_args[0]
        self.assertEqual(args[0], Mp3Decoder.decode_to_pcm)
        self.assertEqual(args[1], "dummy.mp3")
