import unittest
import asyncio
from unittest.mock import MagicMock
from live_studio.execution.avatar_engine import DummyAvatarEngine, Local2DAvatarEngine
from live_studio.execution.avatar_renderer import DummyAvatarRenderer, PygameAvatarRenderer
from live_studio.main import LiveStudioApp
from live_studio.execution.audio_player import DummyAudioPlayer

class TestPinnedProductOverlay(unittest.TestCase):
    def test_dummy_avatar_pinned_product(self):
        engine = DummyAvatarEngine()
        payload = {
            "product_id": "prod-123",
            "item_index": 1,
            "name": "Áo Polo Nam Thể Thao",
            "live_price": "149000",
            "original_price": "299000",
            "selling_points": "Vải cá sấu thoáng khí"
        }
        engine.set_pinned_product(payload)
        self.assertEqual(engine.events[-1], ("set_pinned_product", payload))

        engine.clear_pinned_product()
        self.assertEqual(engine.events[-1], ("clear_pinned_product", None))

    def test_local_2d_engine_delegation(self):
        renderer = DummyAvatarRenderer()
        lip_sync = MagicMock()
        engine = Local2DAvatarEngine(renderer=renderer, lip_sync_analyzer=lip_sync)

        payload = {
            "product_id": "prod-456",
            "item_index": 2,
            "name": "Quần Short Thể Thao",
            "live_price": "99000"
        }
        engine.set_pinned_product(payload)
        self.assertEqual(renderer.pinned_product, payload)

        engine.clear_pinned_product()
        self.assertIsNone(renderer.pinned_product)

    def test_pygame_renderer_pinned_state(self):
        renderer = PygameAvatarRenderer()
        payload = {
            "product_id": "prod-789",
            "item_index": 3,
            "name": "Giày Thể Thao Sneaker",
            "live_price": "350000",
            "original_price": "500000",
            "selling_points": "Đế êm ái, bảo hành 12 tháng"
        }
        renderer.set_pinned_product(payload)
        self.assertEqual(renderer._pinned_product, payload)
        self.assertEqual(renderer._last_pinned_product_id, "prod-789")

        renderer.clear_pinned_product()
        self.assertIsNone(renderer._pinned_product)
        self.assertIsNone(renderer._last_pinned_product_id)

    def test_live_studio_app_on_message_pinned_event(self):
        async def run_async():
            engine = DummyAvatarEngine()
            audio = DummyAudioPlayer()
            app = LiveStudioApp(
                ws_url="ws://localhost:8000/ws/test/",
                token="dummy-token",
                session_id="session-xyz",
                audio_player=audio,
                avatar_engine=engine
            )

            # Test overlay.product_pinned event
            pin_envelope = {
                "protocol_version": "1.0",
                "type": "event",
                "name": "overlay.product_pinned",
                "session_id": "session-xyz",
                "payload": {
                    "product_id": "prod-abc",
                    "item_index": 5,
                    "name": "Sản phẩm test",
                    "live_price": "199000"
                }
            }
            await app._on_message(pin_envelope)
            self.assertEqual(engine.events[-1][0], "set_pinned_product")
            self.assertEqual(engine.events[-1][1]["product_id"], "prod-abc")

            # Test overlay.product_unpinned event
            unpin_envelope = {
                "protocol_version": "1.0",
                "type": "event",
                "name": "overlay.product_unpinned",
                "session_id": "session-xyz",
                "payload": {"product_id": "prod-abc"}
            }
            await app._on_message(unpin_envelope)
            self.assertEqual(engine.events[-1][0], "clear_pinned_product")

        asyncio.run(run_async())

if __name__ == '__main__':
    unittest.main()

