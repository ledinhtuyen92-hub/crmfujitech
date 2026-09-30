import unittest
from unittest.mock import MagicMock, patch
import collections
from live_studio.execution.frame_source import Frame, PygameFrameSource, FrameQueue

class TestFrameQueue(unittest.TestCase):
    def test_bounded_queue_behavior(self):
        queue = FrameQueue(maxsize=3)
        self.assertIsNone(queue.get())
        
        # Test normal put/get
        f1 = Frame(b"1", 800, 600, 0.1, 1)
        queue.put(f1)
        self.assertEqual(queue.get(), f1)
        
    def test_frame_dropping_under_overflow(self):
        queue = FrameQueue(maxsize=3)
        for i in range(5):
            queue.put(Frame(b"data", 800, 600, 0.1 * i, i))
            
        # Oldest 2 should be dropped. Queue contains 2, 3, 4
        self.assertEqual(queue.dropped_frames, 2)
        f = queue.get()
        self.assertEqual(f.index, 2)
        f = queue.get()
        self.assertEqual(f.index, 3)
        f = queue.get()
        self.assertEqual(f.index, 4)
        self.assertIsNone(queue.get())
        
    def test_producer_never_blocks(self):
        # Even if queue is hammered, put should return immediately
        import time
        queue = FrameQueue(maxsize=3)
        start = time.time()
        for i in range(1000):
            queue.put(Frame(b"data", 800, 600, 0.1, i))
        end = time.time()
        self.assertTrue((end - start) < 0.5)

class TestPygameFrameSource(unittest.TestCase):
    def setUp(self):
        self.mock_renderer = MagicMock()
        
    def test_initialization(self):
        source = PygameFrameSource(self.mock_renderer)
        source.initialize()
        self.assertEqual(source._frame_index, 0)
        self.assertTrue(source._start_time > 0)
        
    def test_read_frame_rgb24_dimensions_and_metadata(self):
        source = PygameFrameSource(self.mock_renderer)
        
        # Mock pygame imports and surface
        import sys
        import types
        if 'pygame' not in sys.modules:
            mock_pygame = types.ModuleType('pygame')
            mock_image = types.ModuleType('image')
            mock_pygame.image = mock_image
            sys.modules['pygame'] = mock_pygame
        else:
            mock_pygame = sys.modules['pygame']
        
        source.initialize()
        source.pygame = mock_pygame
        
        mock_surface = MagicMock()
        mock_surface.get_size.return_value = (800, 600)
        self.mock_renderer.screen = mock_surface
        
        # Simulate tobytes returning exactly 800*600*3 bytes
        expected_bytes = b"0" * (800 * 600 * 3)
        source.pygame.image.tobytes = MagicMock(return_value=expected_bytes)
        
        frame1 = source.read_frame()
        self.assertIsNotNone(frame1)
        self.assertEqual(frame1.width, 800)
        self.assertEqual(frame1.height, 600)
        self.assertEqual(len(frame1.data), 800 * 600 * 3)
        self.assertEqual(frame1.index, 1)
        self.assertTrue(frame1.timestamp >= 0)
        
        # Verify ordering/index
        frame2 = source.read_frame()
        self.assertEqual(frame2.index, 2)
        self.assertTrue(frame2.timestamp >= frame1.timestamp)
        
        source.pygame.image.tobytes.assert_called_with(mock_surface, 'RGB')
