import unittest
import asyncio
from unittest.mock import patch, AsyncMock
import time

from live_studio.main import LiveStudioApp
from live_studio.execution.audio_player import DummyAudioPlayer
from live_studio.execution.avatar_engine import Local2DAvatarEngine
from live_studio.execution.avatar_renderer import DummyAvatarRenderer
from live_studio.execution.lip_sync import LipSyncAnalyzer
from live_studio.protocol.constants import ACK_RECEIVED, ACK_COMPLETED, ACK_INTERRUPTED, ACK_FAILED

class TestIntegration(unittest.IsolatedAsyncioTestCase):
    async def asyncSetUp(self):
        self.renderer = DummyAvatarRenderer()
        self.lip_sync = LipSyncAnalyzer()
        self.avatar_engine = Local2DAvatarEngine(self.renderer, self.lip_sync)
        self.audio_player = DummyAudioPlayer()
        
        # Override the audio fetcher to simulate fast downloads without network
        self.fetcher_patch = patch('live_studio.main.AudioFetcher.fetch', new_callable=AsyncMock)
        self.mock_fetch = self.fetcher_patch.start()
        self.mock_fetch.return_value = "dummy.wav"
        
        # Mock WebSocket to inspect ACKs
        self.ws_patch = patch('live_studio.main.WebSocketClient.connect', new_callable=AsyncMock)
        self.mock_ws_connect = self.ws_patch.start()
        
        self.ws_send_patch = patch('live_studio.main.WebSocketClient.send', new_callable=AsyncMock)
        self.mock_ws_send = self.ws_send_patch.start()
        
        self.app = LiveStudioApp(
            ws_url="ws://dummy",
            token="token",
            session_id="session1",
            audio_player=self.audio_player,
            avatar_engine=self.avatar_engine
        )
        
        await self.app.start()
        
        # Manually transition state to SYNCHRONIZED to accept speech
        sync_cmd = {
            "type": "command",
            "name": "session.sync"
        }
        await self.app._on_message(sync_cmd)

    async def asyncTearDown(self):
        await self.app.stop()
        self.fetcher_patch.stop()
        self.ws_patch.stop()
        self.ws_send_patch.stop()

    async def test_full_speech_execution(self):
        # 1. speech.speak -> queue
        speech_cmd = {
            "type": "command",
            "name": "speech.speak",
            "sequence_number": 1,
            "payload": {
                "command_id": "cmd_1",
                "text": "Hello",
                "audio_asset": {"signed_url": "http://fake.url/audio.wav"},
                "interruptible": True,
                "priority": "normal"
            }
        }
        
        # Send message to app
        await self.app._on_message(speech_cmd)
        
        # Give it a moment to process queue, fetch, and start playing
        await asyncio.sleep(0.1)
        
        # 2. Verify ACK RECEIVED was sent
        # self.mock_ws_send.call_args_list should have ACK_RECEIVED
        acks_sent = [call.args[0] for call in self.mock_ws_send.call_args_list]
        received_ack = next((ack for ack in acks_sent if ack.get("payload", {}).get("status") == ACK_RECEIVED), None)
        self.assertIsNotNone(received_ack)
        
        # 3. audio playback -> avatar speaking
        self.assertTrue(self.audio_player._is_playing)
        self.assertTrue(self.avatar_engine.is_speaking)
        self.assertTrue(self.renderer.last_state["speaking"])
        
        # Wait for audio to naturally complete (DummyAudioPlayer takes ~1 second)
        await asyncio.sleep(1.1)
        
        # 6. playback completion -> avatar idle
        self.assertFalse(self.audio_player._is_playing)
        self.assertFalse(self.avatar_engine.is_speaking)
        self.assertEqual(self.renderer.last_state["mouth"], "CLOSED")
        
        # Verify ACK COMPLETED
        acks_sent = [call.args[0] for call in self.mock_ws_send.call_args_list]
        completed_ack = next((ack for ack in acks_sent if ack.get("payload", {}).get("status") == ACK_COMPLETED), None)
        self.assertIsNotNone(completed_ack)

    async def test_high_priority_interruption(self):
        # Command 1 (Normal)
        cmd_1 = {
            "type": "command", "name": "speech.speak", "sequence_number": 1,
            "payload": {
                "command_id": "cmd_1", "text": "Hello",
                "audio_asset": {"signed_url": "http://fake.url/audio1.wav"},
                "interruptible": True, "priority": "normal"
            }
        }
        await self.app._on_message(cmd_1)
        await asyncio.sleep(0.1) # cmd_1 is now playing
        
        self.assertTrue(self.avatar_engine.is_speaking)
        
        # Command 2 (High Priority)
        cmd_2 = {
            "type": "command", "name": "speech.speak", "sequence_number": 2,
            "payload": {
                "command_id": "cmd_2", "text": "Urgent",
                "audio_asset": {"signed_url": "http://fake.url/audio2.wav"},
                "interruptible": True, "priority": "high"
            }
        }
        
        # Dispatching cmd_2 should interrupt cmd_1 instantly
        await self.app._on_message(cmd_2)
        
        # Give worker loop a moment to finish cmd_1 interrupted flow and start cmd_2
        await asyncio.sleep(0.1)
        
        # cmd_1 should have gotten ACK_INTERRUPTED
        acks_sent = [call.args[0] for call in self.mock_ws_send.call_args_list]
        interrupted_ack = next((ack for ack in acks_sent if ack.get("payload", {}).get("command_id") == "cmd_1" and ack.get("payload", {}).get("status") == ACK_INTERRUPTED), None)
        self.assertIsNotNone(interrupted_ack)
        
        # cmd_2 should be playing now
        self.assertEqual(self.app._current_playing_command_id, "cmd_2")
        self.assertTrue(self.avatar_engine.is_speaking)

    async def test_human_takeover_interruption(self):
        # Start a speech
        cmd_1 = {
            "type": "command", "name": "speech.speak", "sequence_number": 1,
            "payload": {
                "command_id": "cmd_1", "text": "Hello",
                "audio_asset": {"signed_url": "http://fake.url/audio1.wav"}
            }
        }
        await self.app._on_message(cmd_1)
        await asyncio.sleep(0.1) # wait for playing
        
        self.assertTrue(self.avatar_engine.is_speaking)
        
        # Send human takeover pause
        pause_cmd = {
            "type": "command", "name": "session.control", "sequence_number": 2,
            "payload": {"action": "pause", "command_id": "pause_1"}
        }
        await self.app._on_message(pause_cmd)
        
        await asyncio.sleep(0.1)
        
        # Avatar should be idle
        self.assertFalse(self.avatar_engine.is_speaking)
        self.assertEqual(self.renderer.last_state["mouth"], "CLOSED")
        
        # System should be paused
        self.assertTrue(self.app.state.is_paused())
        
        # ACK_INTERRUPTED for cmd_1
        acks_sent = [call.args[0] for call in self.mock_ws_send.call_args_list]
        interrupted_ack = next((ack for ack in acks_sent if ack.get("payload", {}).get("command_id") == "cmd_1" and ack.get("payload", {}).get("status") == ACK_INTERRUPTED), None)
        self.assertIsNotNone(interrupted_ack)

    async def test_audio_download_failure(self):
        # Setup fetcher to fail
        self.mock_fetch.return_value = None
        
        speech_cmd = {
            "type": "command", "name": "speech.speak", "sequence_number": 1,
            "payload": {
                "command_id": "cmd_fail", "text": "Fail",
                "audio_asset": {"signed_url": "http://fake.url/broken.wav"}
            }
        }
        await self.app._on_message(speech_cmd)
        await asyncio.sleep(0.1)
        
        # Should be ACK_FAILED
        acks_sent = [call.args[0] for call in self.mock_ws_send.call_args_list]
        failed_ack = next((ack for ack in acks_sent if ack.get("payload", {}).get("command_id") == "cmd_fail" and ack.get("payload", {}).get("status") == ACK_FAILED), None)
        self.assertIsNotNone(failed_ack)
        
        # Avatar should never have spoken
        self.assertFalse(self.avatar_engine.is_speaking)
        if self.avatar_engine.renderer.last_state:
            self.assertFalse(self.avatar_engine.renderer.last_state["speaking"])

    async def test_no_duplicate_avatar_engine(self):
        # Verify app owns exactly one avatar engine and one renderer
        self.assertIsInstance(self.app.avatar_engine, Local2DAvatarEngine)
        self.assertEqual(self.app.avatar_engine, self.avatar_engine)
        self.assertEqual(self.app.avatar_engine.renderer, self.renderer)

    async def test_audio_playback_failure(self):
        # Simulate a technical failure in audio player
        with patch.object(self.audio_player, 'play', new_callable=AsyncMock) as mock_play:
            mock_play.return_value = False # play() returned False without being interrupted
            
            speech_cmd = {
                "type": "command", "name": "speech.speak", "sequence_number": 1,
                "payload": {
                    "command_id": "cmd_play_fail", "text": "Fail",
                    "audio_asset": {"signed_url": "http://fake.url/bad_audio.wav"}
                }
            }
            await self.app._on_message(speech_cmd)
            await asyncio.sleep(0.1)
            
            # Should be ACK_FAILED with PLAYBACK_ERROR
            acks_sent = [call.args[0] for call in self.mock_ws_send.call_args_list]
            failed_ack = next((ack for ack in acks_sent if ack.get("payload", {}).get("command_id") == "cmd_play_fail" and ack.get("payload", {}).get("status") == ACK_FAILED), None)
            
            self.assertIsNotNone(failed_ack)
            self.assertEqual(failed_ack.get("payload", {}).get("error_code"), "PLAYBACK_ERROR")
            
            # Avatar should be idle after interrupt
            self.assertFalse(self.avatar_engine.is_speaking)
