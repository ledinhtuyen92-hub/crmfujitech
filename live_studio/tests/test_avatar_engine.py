import unittest
from live_studio.execution.avatar_engine import DummyAvatarEngine

class TestAvatarEngine(unittest.TestCase):
    def test_no_cloud_dependencies(self):
        # We ensure importing avatar_engine does not bring in Django or backend code
        import sys
        self.assertNotIn("django", sys.modules)
        self.assertNotIn("live_sessions", sys.modules)
        
    def test_dummy_lifecycle(self):
        engine = DummyAvatarEngine()
        self.assertFalse(engine.is_initialized)
        
        engine.initialize()
        self.assertTrue(engine.is_initialized)
        self.assertEqual(engine.events[-1], ("initialize", None))
        
        engine.start_speech("test.wav", "Hello")
        self.assertTrue(engine.is_speaking)
        self.assertEqual(engine.events[-1], ("start_speech", {"filepath": "test.wav", "text": "Hello"}))
        
        engine.update(100)
        engine.update(200)
        
        # Verify updates were recorded
        update_events = [e for e in engine.events if e[0] == "update"]
        self.assertEqual(len(update_events), 2)
        self.assertEqual(update_events[0][1], 100)
        self.assertEqual(update_events[1][1], 200)
        
        engine.interrupt()
        self.assertFalse(engine.is_speaking)
        self.assertEqual(engine.events[-1], ("interrupt", None))
        
        # update should do nothing if interrupted/stopped
        engine.update(300)
        update_events = [e for e in engine.events if e[0] == "update"]
        self.assertEqual(len(update_events), 2) # Still 2
        
        engine.stop()
        self.assertEqual(engine.events[-1], ("stop", None))
        
        engine.shutdown()
        self.assertFalse(engine.is_initialized)
        self.assertEqual(engine.events[-1], ("shutdown", None))

    def test_local_2d_engine_lifecycle(self):
        from live_studio.execution.avatar_engine import Local2DAvatarEngine
        from live_studio.execution.lip_sync import LipSyncAnalyzer
        from live_studio.execution.avatar_renderer import DummyAvatarRenderer
        
        renderer = DummyAvatarRenderer()
        lip_sync = LipSyncAnalyzer()
        engine = Local2DAvatarEngine(renderer, lip_sync)
        
        # Test 1: Initialization
        engine.initialize()
        self.assertTrue(engine.is_initialized)
        self.assertTrue(renderer.is_initialized)
        
        # Test 3: Idle State
        # Initially not speaking, mouth is closed
        engine.update(0)
        self.assertFalse(engine.is_speaking)
        self.assertIsNotNone(renderer.last_state)
        self.assertEqual(renderer.last_state["mouth"], "CLOSED")
        
        # Test 4 & 5: Start Speech & Speaking State
        engine.start_speech("dummy.wav", "Hello")
        self.assertTrue(engine.is_speaking)
        # It should render immediately on start_speech
        self.assertTrue(renderer.last_state["speaking"])
        
        # Test 7 & 8: Audio-driven update & Clock synchronization
        # Check lip-sync varies by position (deterministic logic)
        engine.update(100)
        # Should be some state based on math.sin
        self.assertIn(renderer.last_state["mouth"], ["CLOSED", "SMALL", "MEDIUM", "OPEN"])
        
        # Test 9: Interrupt behavior
        engine.interrupt()
        self.assertFalse(engine.is_speaking)
        # Interrupt should return to idle state automatically
        self.assertEqual(renderer.last_state["mouth"], "CLOSED")
        self.assertFalse(renderer.last_state["speaking"])
        
        # Test 10: Stop behavior
        engine.start_speech("dummy2.wav", "Test")
        engine.stop()
        self.assertFalse(engine.is_speaking)
        self.assertEqual(renderer.last_state["mouth"], "CLOSED")
        self.assertFalse(renderer.last_state["speaking"])
        
        # Test 13 & 14: Second speech resets state and no stale animation
        engine.start_speech("dummy3.wav", "Test")
        engine.update(200) # moving mouth
        engine.stop() # stop clears speaking
        
        # Another update after stop should keep mouth closed
        engine.update(300)
        self.assertEqual(renderer.last_state["mouth"], "CLOSED")
        
        engine.shutdown()
        self.assertFalse(engine.is_initialized)
        self.assertFalse(renderer.is_initialized)

    def test_idle_blinking(self):
        from live_studio.execution.avatar_engine import Local2DAvatarEngine
        from live_studio.execution.lip_sync import LipSyncAnalyzer
        from live_studio.execution.avatar_renderer import DummyAvatarRenderer
        import time
        from unittest.mock import patch
        
        renderer = DummyAvatarRenderer()
        engine = Local2DAvatarEngine(renderer, LipSyncAnalyzer())
        engine.initialize()
        
        with patch('time.time') as mock_time:
            # Time 0
            mock_time.return_value = 0.0
            engine._last_blink_time = 0.0
            engine.update(0)
            self.assertFalse(renderer.last_state["blinking"])
            
            # Time 3.1s - trigger blink
            mock_time.return_value = 3.1
            engine.update(0)
            self.assertTrue(renderer.last_state["blinking"])
            
            # Time 3.2s - still blinking (needs >0.15s to clear)
            mock_time.return_value = 3.2
            engine.update(0)
            self.assertTrue(renderer.last_state["blinking"])
            
            # Time 3.3s - blink clears
            mock_time.return_value = 3.3
            engine.update(0)
            self.assertFalse(renderer.last_state["blinking"])

    def test_audio_video_synchronization_lock(self):
        """
        Verifies that before audio actually starts playing (is_audio_playing=False),
        the avatar mouth is locked strictly CLOSED with 0.0 audio energy,
        even if start_speech has been called with high amplitude PCM.
        """
        import struct
        from live_studio.execution.avatar_engine import Local2DAvatarEngine
        from live_studio.execution.lip_sync import LipSyncAnalyzer
        from live_studio.execution.avatar_renderer import DummyAvatarRenderer

        renderer = DummyAvatarRenderer()
        lip_sync = LipSyncAnalyzer()
        engine = Local2DAvatarEngine(renderer, lip_sync)
        engine.initialize()

        # Generate 1 second of loud audio (amplitude 30,000)
        loud_samples = [30000] * (44100 * 2)
        loud_pcm = struct.pack(f"<{len(loud_samples)}h", *loud_samples)

        # 1. Start speech with loud PCM
        engine.start_speech("dummy.wav", "Hello", pcm_data=loud_pcm)
        self.assertTrue(engine.is_speaking)
        # On start_speech, mouth MUST be held strictly CLOSED
        self.assertEqual(renderer.last_state["mouth"], "CLOSED")
        self.assertEqual(renderer.last_state["audio_energy"], 0.0)

        # 2. While audio is decoding / preparing (is_audio_playing=False),
        # render updates at pos=0 MUST keep mouth CLOSED
        engine.update(0, is_audio_playing=False)
        self.assertEqual(renderer.last_state["mouth"], "CLOSED")
        self.assertEqual(renderer.last_state["audio_energy"], 0.0)

        # 3. Once audio actually begins playing (is_audio_playing=True),
        # mouth immediately opens according to audio amplitude
        engine.update(0, is_audio_playing=True)
        self.assertIn(renderer.last_state["mouth"], ["SMALL", "MEDIUM", "OPEN"])
        self.assertGreater(renderer.last_state["audio_energy"], 0.5)

        engine.shutdown()
