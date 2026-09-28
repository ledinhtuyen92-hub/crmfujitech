import unittest
import asyncio
from unittest.mock import patch, MagicMock
from live_studio.execution.audio_fetcher import AudioFetcher
from live_studio.execution.audio_player import DummyAudioPlayer

class TestAudio(unittest.IsolatedAsyncioTestCase):
    async def test_dummy_player(self):
        player = DummyAudioPlayer()
        self.assertEqual(player.get_position_ms(), 0)
        
        # Test play completes naturally
        completed = await player.play("dummy.mp3")
        self.assertTrue(completed)
        self.assertGreaterEqual(player.get_position_ms(), 0)
        
        # Test stop interrupts playback
        # Start playback in background
        task = asyncio.create_task(player.play("dummy2.mp3"))
        await asyncio.sleep(0.1) # Let it start
        player.stop()
        completed = await task
        self.assertFalse(completed)
        self.assertGreaterEqual(player.get_position_ms(), 0)

    async def test_dummy_player_clock(self):
        player = DummyAudioPlayer()
        
        with patch('time.monotonic') as mock_monotonic:
            mock_monotonic.return_value = 100.0
            player._is_playing = True
            player._start_time = 100.0
            
            mock_monotonic.return_value = 100.5
            self.assertEqual(player.get_position_ms(), 500)
            
            player.stop()
            self.assertEqual(player.get_position_ms(), 500)
            
            mock_monotonic.return_value = 101.0
            self.assertEqual(player.get_position_ms(), 500) # stays at 500

    @patch('aiohttp.ClientSession.get')
    async def test_audio_fetcher_success(self, mock_get):
        from unittest.mock import AsyncMock
        # Mock successful response
        mock_resp = AsyncMock()
        mock_resp.status = 200
        mock_resp.read = AsyncMock(return_value=b"dummy_audio_bytes")
        mock_resp.__aenter__ = AsyncMock(return_value=mock_resp)
        mock_resp.__aexit__ = AsyncMock(return_value=None)
        
        mock_context = AsyncMock()
        mock_context.__aenter__ = AsyncMock(return_value=mock_resp)
        mock_context.__aexit__ = AsyncMock(return_value=None)
        mock_get.return_value = mock_context
        
        fetcher = AudioFetcher("token")
        path = await fetcher.fetch("http://fake.url/audio.mp3")
        self.assertIsNotNone(path)
        
        import os
        self.assertTrue(os.path.exists(path))
        fetcher.cleanup(path)
        self.assertFalse(os.path.exists(path))

    @patch('aiohttp.ClientSession.get')
    async def test_audio_fetcher_failure(self, mock_get):
        from unittest.mock import AsyncMock
        # Mock failed response
        mock_resp = AsyncMock()
        mock_resp.status = 404
        mock_resp.__aenter__ = AsyncMock(return_value=mock_resp)
        mock_resp.__aexit__ = AsyncMock(return_value=None)
        
        mock_context = AsyncMock()
        mock_context.__aenter__ = AsyncMock(return_value=mock_resp)
        mock_context.__aexit__ = AsyncMock(return_value=None)
        mock_get.return_value = mock_context
        
        fetcher = AudioFetcher("token")
        path = await fetcher.fetch("http://fake.url/audio.mp3")
        self.assertIsNone(path)
