import unittest
import os
import pygame
from live_studio.execution.lip_sync import (
    LipSyncAnalyzer, MOUTH_STATE_CLOSED, MOUTH_STATE_SMALL,
    MOUTH_STATE_MEDIUM, MOUTH_STATE_OPEN, MOUTH_STATE_ROUND
)
from live_studio.execution.experimental_lip_sync_renderer import (
    ExperimentalLipSyncRenderer, MODE_HUMAN, MODE_MASCOT
)

class TestExperimentalLipSync(unittest.TestCase):
    def setUp(self):
        self.analyzer = LipSyncAnalyzer(sensitivity=1.5, smoothing=0.3, noise_gate=0.015)
        self.renderer = ExperimentalLipSyncRenderer(width=720, height=1280)

    def test_analyzer_defaults_and_parameters(self):
        self.assertEqual(self.analyzer.sensitivity, 1.5)
        self.assertEqual(self.analyzer.smoothing, 0.3)
        self.assertEqual(self.analyzer.noise_gate, 0.015)
        
        # When stopped, amplitude is 0.0 and state is CLOSED
        self.assertEqual(self.analyzer.get_amplitude(0), 0.0)
        self.assertEqual(self.analyzer.get_mouth_state(0), MOUTH_STATE_CLOSED)
        
        # Waveform bars return 0.0 when not speaking
        bars = self.analyzer.get_waveform_bars(0, num_bars=16)
        self.assertEqual(len(bars), 16)
        self.assertTrue(all(b == 0.0 for b in bars))

    def test_mascot_rendering(self):
        # Render mascot in various mouth states
        surf_closed = self.renderer.render_frame(MODE_MASCOT, 0.0, MOUTH_STATE_CLOSED)
        self.assertIsInstance(surf_closed, pygame.Surface)
        self.assertEqual(surf_closed.get_size(), (720, 1280))

        surf_open = self.renderer.render_frame(MODE_MASCOT, 0.8, MOUTH_STATE_OPEN)
        self.assertIsInstance(surf_open, pygame.Surface)

        # Get preview image
        pil_img = self.renderer.get_preview_pil_image(MODE_MASCOT, 0.5, MOUTH_STATE_MEDIUM, preview_w=360, preview_h=640)
        self.assertEqual(pil_img.size, (360, 640))

    def test_human_rendering_fallback(self):
        # Without human assets loaded, it cleanly falls back
        surf = self.renderer.render_frame(MODE_HUMAN, 0.5, MOUTH_STATE_MEDIUM)
        self.assertIsInstance(surf, pygame.Surface)
        self.assertEqual(surf.get_size(), (720, 1280))

    def test_human_rendering_with_assets(self):
        # Create small test surfaces
        test_idle = pygame.Surface((720, 1280))
        test_idle.fill((200, 180, 160))
        test_speak = pygame.Surface((720, 1280))
        test_speak.fill((210, 170, 150))
        
        self.renderer.human_idle_surf = test_idle
        self.renderer.human_speak_surf = test_speak
        
        # Test dual blend rendering
        surf = self.renderer.render_frame(MODE_HUMAN, 0.6, MOUTH_STATE_OPEN)
        self.assertIsInstance(surf, pygame.Surface)
        
        # Test preview generation
        preview = self.renderer.get_preview_pil_image(MODE_HUMAN, 0.6, MOUTH_STATE_OPEN, 360, 640)
        self.assertEqual(preview.size, (360, 640))

    def test_audio_amplitude_calculation(self):
        # Create fake stereo 16-bit PCM (sine wave)
        import struct, math
        sample_rate = 44100
        duration_s = 1.0
        num_samples = int(sample_rate * duration_s)
        pcm_bytes = bytearray()
        
        for i in range(num_samples):
            # 440 Hz tone with peak 16000 (~0.48 amplitude)
            val = int(16000 * math.sin(2 * math.pi * 440 * (i / sample_rate)))
            pcm_bytes.extend(struct.pack('<hh', val, val))
            
        self.analyzer._is_speaking = True
        self.analyzer._pcm_data = bytes(pcm_bytes)
        
        # At 200ms into the tone, amplitude should be > 0.0
        amp = self.analyzer.get_amplitude(200)
        self.assertGreater(amp, 0.1)
        self.assertLessEqual(amp, 1.0)
        
        # Mouth state should not be closed
        state = self.analyzer.get_mouth_state(200)
        self.assertIn(state, [MOUTH_STATE_SMALL, MOUTH_STATE_MEDIUM, MOUTH_STATE_OPEN, MOUTH_STATE_ROUND])

if __name__ == '__main__':
    unittest.main()
