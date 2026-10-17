import os
import unittest
import pygame
from live_studio.execution.avatar_renderer import VideoFrameSequence, PygameAvatarRenderer
from live_studio.execution.avatar_engine import Local2DAvatarEngine
from live_studio.execution.lip_sync import LipSyncAnalyzer

class TestDualLoopAvatar(unittest.TestCase):
    def setUp(self):
        pygame.init()
        self.test_video = "backend/media/live_assets/2026/10/modeo_AI.mp4"
        self.ffmpeg_bin = "live_studio/bin/ffmpeg.exe"

    def test_image_sequence(self):
        # Create a dummy image
        surf = pygame.Surface((100, 100))
        surf.fill((255, 0, 0))
        img_path = "test_temp_avatar.jpg"
        pygame.image.save(surf, img_path)
        
        try:
            seq = VideoFrameSequence(img_path, target_width=720, target_height=1280)
            self.assertEqual(len(seq), 1)
            frame = seq.get_frame(0.0)
            self.assertIsNotNone(frame)
            self.assertEqual(frame.get_size(), (720, 1280))
            seq.cleanup()
        finally:
            if os.path.exists(img_path):
                os.remove(img_path)

    def test_video_sequence_extraction(self):
        if not os.path.exists(self.test_video):
            self.skipTest("Test video not found")
            
        seq = VideoFrameSequence(self.test_video, target_width=720, target_height=1280, ffmpeg_bin=self.ffmpeg_bin, fps=25)
        self.assertGreater(len(seq), 0)
        
        frame0 = seq.get_frame(0.0)
        self.assertIsNotNone(frame0)
        self.assertEqual(frame0.get_size(), (720, 1280))
        
        frame1 = seq.get_frame(1.0)
        self.assertIsNotNone(frame1)
        self.assertEqual(frame1.get_size(), (720, 1280))
        seq.cleanup()

    def test_dual_loop_renderer_switching(self):
        renderer = PygameAvatarRenderer()
        renderer.initialize()
        
        # Create dummy idle and speaking images to test switching
        surf_idle = pygame.Surface((720, 1280))
        surf_idle.fill((0, 255, 0)) # Green
        idle_path = "test_idle.png"
        pygame.image.save(surf_idle, idle_path)
        
        surf_spk = pygame.Surface((720, 1280))
        surf_spk.fill((255, 0, 0)) # Red
        spk_path = "test_speaking.png"
        pygame.image.save(surf_spk, spk_path)
        
        try:
            renderer.load_avatar_assets(idle_path=idle_path, speaking_path=spk_path)
            
            # 1. Idle render
            renderer.notify_speech_stop()
            renderer.render(is_speaking=False, mouth_state="CLOSED", is_blinking=False)
            color_at_center = renderer.screen.get_at((360, 640))[:3]
            self.assertEqual(color_at_center, (0, 255, 0), "Idle frame should be green")
            
            # 2. Speaking render
            renderer.notify_speech_start()
            renderer.render(is_speaking=True, mouth_state="OPEN", is_blinking=False)
            color_at_center = renderer.screen.get_at((360, 640))[:3]
            self.assertEqual(color_at_center, (255, 0, 0), "Speaking frame should be red")
            
            # 3. Back to Idle
            renderer.notify_speech_stop()
            renderer.render(is_speaking=False, mouth_state="CLOSED", is_blinking=False)
            color_at_center = renderer.screen.get_at((360, 640))[:3]
            self.assertEqual(color_at_center, (0, 255, 0), "Should return to green idle frame")
            
        finally:
            renderer.shutdown()
            if os.path.exists(idle_path):
                os.remove(idle_path)
            if os.path.exists(spk_path):
                os.remove(spk_path)

    def test_audio_energy_gating_micro_pauses(self):
        renderer = PygameAvatarRenderer()
        renderer.initialize()

        surf_idle = pygame.Surface((720, 1280))
        surf_idle.fill((0, 255, 0)) # Green: Idle
        idle_path = "test_idle_energy.png"
        pygame.image.save(surf_idle, idle_path)

        surf_spk = pygame.Surface((720, 1280))
        surf_spk.fill((255, 0, 0)) # Red: Speaking
        spk_path = "test_speaking_energy.png"
        pygame.image.save(surf_spk, spk_path)

        try:
            renderer.load_avatar_assets(idle_path=idle_path, speaking_path=spk_path)

            # 1. Speech active with high audio energy -> Red speaking frame
            renderer.notify_speech_start()
            renderer.render(is_speaking=True, mouth_state="OPEN", is_blinking=False, audio_energy=0.5)
            color = renderer.screen.get_at((360, 640))[:3]
            self.assertEqual(color, (255, 0, 0), "High energy speaking should be red")

            # 2. Audio falls into micro-pause (silence / taking breath between clauses)
            # Even though is_speaking is True, energy drops to 0 and hold buffer expires -> Green idle frame
            import time
            renderer._voice_active_hold_timer = 0.0 # Force hold buffer expiry to simulate >120ms pause
            renderer._speech_blend_weight = 0.0 # Blended back to idle
            renderer.render(is_speaking=True, mouth_state="CLOSED", is_blinking=False, audio_energy=0.0)
            color = renderer.screen.get_at((360, 640))[:3]
            self.assertEqual(color, (0, 255, 0), "Micro-pause during speech should render closed mouth idle frame")

        finally:
            renderer.shutdown()
            if os.path.exists(idle_path):
                os.remove(idle_path)
            if os.path.exists(spk_path):
                os.remove(spk_path)

if __name__ == '__main__':
    unittest.main()
