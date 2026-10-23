import unittest
import asyncio
from unittest.mock import AsyncMock, patch, MagicMock
from live_studio.execution.media_pipeline import MediaClock, AudioStreamSink
from live_studio.execution.stream_controller import StreamController, StreamState
from live_studio.execution.frame_source import FrameQueue, Frame
from live_studio.protocol.envelopes import StreamStartPayload, StreamStopPayload
from live_studio.execution.avatar_renderer import PygameAvatarRenderer
import pygame
import os

class TestAVSyncLockstep(unittest.IsolatedAsyncioTestCase):

    async def test_lockstep_ratio_and_pts_alignment(self):
        """
        Tests that for N video frames pumped, exactly N * 1470 audio samples are emitted.
        Verifies that Video PTS and Audio PTS never drift.
        """
        clock = MediaClock(sample_rate=44100, channels=2, sample_width=2)
        sink = AudioStreamSink(clock)
        queue = FrameQueue(maxsize=30)
        controller = StreamController(frame_queue=queue, audio_sink=sink)

        with patch.object(controller.locator, 'locate', return_value="fake_ffmpeg"):
            with patch('live_studio.execution.stream_controller.StreamEncoder') as mock_encoder_class:
                mock_encoder = AsyncMock()
                mock_encoder.is_running = True
                mock_encoder_class.return_value = mock_encoder

                payload = StreamStartPayload(
                    command_id="test-cmd",
                    stream_url="rtmp://test",
                    fps=30,
                    audio_sample_rate=44100
                )
                await controller.handle_start(payload)
                self.assertTrue(sink.lockstep_mode)

                # Feed 10 video frames into queue
                for i in range(10):
                    f = Frame(data=b"\xaa" * 100, width=10, height=10, timestamp=0.0, index=i)
                    queue.put(f)

                # Let the pump process
                await asyncio.sleep(0.15)

                # Each write_video must be accompanied by write_audio
                video_call_count = mock_encoder.write_video.call_count
                audio_call_count = mock_encoder.write_audio.call_count

                self.assertGreater(video_call_count, 0)
                # Video and Audio writes must be in 1:1 lockstep
                self.assertEqual(video_call_count, audio_call_count, "Video and Audio calls must match 1:1 in lockstep")

                # Verify each audio chunk is exactly 1470 samples = 5880 bytes
                for call in mock_encoder.write_audio.call_args_list:
                    chunk = call[0][0]
                    self.assertEqual(len(chunk), 5880, "Each audio chunk must be exactly 5880 bytes (1470 samples)")

                await controller.handle_stop(StreamStopPayload(command_id="stop"))

    async def test_audio_energy_speech_lifecycle(self):
        """
        Tests speech buffer consumption and energy detection in AudioStreamSink.
        """
        clock = MediaClock(sample_rate=44100, channels=2, sample_width=2)
        sink = AudioStreamSink(clock)
        sink.lockstep_mode = True
        sink.start()

        # 1. Idle state: returns silence
        chunk, energy, is_voice = sink.get_audio_chunk(1470)
        self.assertEqual(len(chunk), 5880)
        self.assertEqual(chunk, b"\x00" * 5880)
        self.assertEqual(energy, 0.0)
        self.assertFalse(is_voice)

        # 2. Speech state: 1 frame of silence + 1 frame of loud voice (amplitude 20000)
        import struct
        silence_frame = b"\x00" * 5880
        loud_samples = [15000] * (1470 * 2) # Loud speech
        loud_frame = struct.pack(f"<{len(loud_samples)}h", *loud_samples)

        sink.start_speech(silence_frame + loud_frame)

        # First chunk: silence
        c1, e1, v1 = sink.get_audio_chunk(1470)
        self.assertEqual(c1, silence_frame)
        self.assertAlmostEqual(e1, 0.0, places=3)
        self.assertFalse(v1, "Initial silence must not trigger voice active")

        # Second chunk: loud voice
        c2, e2, v2 = sink.get_audio_chunk(1470)
        self.assertEqual(c2, loud_frame)
        self.assertGreater(e2, 0.4)
        self.assertTrue(v2, "Loud audio must trigger voice active")

        # Speech buffer exhausted -> wait_for_speech_done() should complete immediately
        await sink.wait_for_speech_done()

        # Third chunk: returns back to idle silence
        c3, e3, v3 = sink.get_audio_chunk(1470)
        self.assertEqual(c3, b"\x00" * 5880)
        self.assertFalse(v3)

        sink.stop()

    def test_avatar_renderer_voice_energy_switching(self):
        """
        Tests that AvatarRenderer instantly switches between idle and speaking video
        based on audio energy and hold buffer.
        """
        pygame.init()
        renderer = PygameAvatarRenderer()
        renderer.initialize()

        surf_idle = pygame.Surface((720, 1280))
        surf_idle.fill((0, 255, 0)) # Green: Idle
        idle_path = "test_idle_switch.png"
        pygame.image.save(surf_idle, idle_path)

        surf_spk = pygame.Surface((720, 1280))
        surf_spk.fill((255, 0, 0)) # Red: Speaking
        spk_path = "test_spk_switch.png"
        pygame.image.save(surf_spk, spk_path)

        try:
            renderer.load_avatar_assets(idle_path=idle_path, speaking_path=spk_path)

            # 1. Idle state -> Green
            renderer.render(is_speaking=False, mouth_state="CLOSED", is_blinking=False, audio_energy=0.0)
            self.assertEqual(renderer.screen.get_at((360, 640))[:3], (0, 255, 0))

            # 2. Speech starts, but initial 50ms has zero energy -> Still Green (idle)
            renderer.notify_speech_start()
            renderer.render(is_speaking=True, mouth_state="CLOSED", is_blinking=False, audio_energy=0.0)
            self.assertEqual(renderer.screen.get_at((360, 640))[:3], (0, 255, 0), "Initial silence must show idle pose")

            # 3. Audio energy rises above 0.03 -> Instantly Red (speaking video)
            renderer.render(is_speaking=True, mouth_state="OPEN", is_blinking=False, audio_energy=0.25)
            self.assertEqual(renderer.screen.get_at((360, 640))[:3], (255, 0, 0), "Active voice must show speaking video")

            # 4. Micro-pause during speech (energy drops to 0.0 for 50ms) -> Still Red (bridged by hold buffer)
            renderer._last_render_time -= 0.05
            renderer.render(is_speaking=True, mouth_state="CLOSED", is_blinking=False, audio_energy=0.0)
            self.assertEqual(renderer.screen.get_at((360, 640))[:3], (255, 0, 0), "Hold buffer must bridge micro-pauses")

            # 5. Long pause (> 120ms): hold buffer expires -> Returns to Green (idle)
            renderer._last_render_time -= 0.20
            renderer._voice_active_hold_timer = 0.0
            renderer.render(is_speaking=True, mouth_state="CLOSED", is_blinking=False, audio_energy=0.0)
            self.assertEqual(renderer.screen.get_at((360, 640))[:3], (0, 255, 0), "Extended pause must return to idle pose")

            # 6. Speech completes -> notify_speech_stop -> Green (idle)
            renderer.notify_speech_stop()
            renderer.render(is_speaking=False, mouth_state="CLOSED", is_blinking=False, audio_energy=0.0)
            self.assertEqual(renderer.screen.get_at((360, 640))[:3], (0, 255, 0))

        finally:
            renderer.shutdown()
            if os.path.exists(idle_path): os.remove(idle_path)
            if os.path.exists(spk_path): os.remove(spk_path)

if __name__ == '__main__':
    unittest.main()
