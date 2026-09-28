import unittest
import threading
from live_studio.execution.device_sequence import DeviceSequenceCounter

class TestDeviceSequenceCounter(unittest.TestCase):
    def setUp(self):
        self.counter = DeviceSequenceCounter()

    def test_starts_at_1(self):
        self.assertEqual(self.counter.next(), 1)

    def test_monotonic_increment(self):
        self.assertEqual(self.counter.next(), 1)
        self.assertEqual(self.counter.next(), 2)
        self.assertEqual(self.counter.next(), 3)

    def test_never_returns_zero(self):
        for _ in range(10):
            seq = self.counter.next()
            self.assertGreater(seq, 0)

    def test_concurrent_safety(self):
        results = []
        threads = []
        
        def worker():
            for _ in range(100):
                results.append(self.counter.next())
                
        # Start 10 threads doing 100 increments each = 1000 total
        for _ in range(10):
            t = threading.Thread(target=worker)
            threads.append(t)
            t.start()
            
        for t in threads:
            t.join()
            
        self.assertEqual(len(results), 1000)
        
        # Check that we have exactly 1000 unique values from 1 to 1000
        unique_results = set(results)
        self.assertEqual(len(unique_results), 1000)
        self.assertEqual(min(unique_results), 1)
        self.assertEqual(max(unique_results), 1000)
