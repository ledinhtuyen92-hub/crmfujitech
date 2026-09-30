# Fujitech AI Livestream - Phase 1E-2 Frame Extraction Foundation Report

## 1. Current Renderer Architecture
- The system currently uses `PygameAvatarRenderer` for 2D avatar visualization.
- It initializes a Pygame window (`pygame.display.set_mode`) of 800x600 resolution.
- The renderer draws to `self.screen` directly.
- The render loop runs in `LiveStudioApp._avatar_render_loop` using an `asyncio.sleep(1/30.0)` targeting ~30 FPS.
- It's deeply coupled to Pygame but cleanly abstracted behind the `BaseAvatarEngine` contract.

## 2. Frame Source Architecture
We've introduced a `BaseFrameSource` and `PygameFrameSource` abstraction located in `live_studio/execution/frame_source.py`.
- **PygameFrameSource**: Reads the active display surface directly from `PygameAvatarRenderer.screen`. It prevents blocking the loop by immediately dumping the raw bytes.
- It leverages `pygame.image.tobytes(surface, 'RGB')` to pull frames directly from the Pygame internal structure safely.

## 3. Pixel Format
- **Color space:** RGB24 (Standard interleaved 8-bit R, G, B channels).
- **Dimensions:** Mirrors the renderer (currently 800x600).
- **Byte Length:** Guaranteed to be precisely `Width * Height * 3` bytes (e.g., `800 * 600 * 3 = 1,440,000` bytes).

## 4. Frame Metadata
Each frame is extracted as a `Frame` object containing:
- `data`: Raw RGB24 bytes.
- `width`: The extracted width.
- `height`: The extracted height.
- `timestamp`: Monotonic relative timestamp in seconds (prevents drift from system clock changes).
- `index`: Sequential frame index starting from 1.

## 5. Queue Policy
A `FrameQueue` manages the extracted frames using Python's `collections.deque`.
- **Capacity:** Bounded (maxsize = 30).
- **Overflow Policy:** "Newest-frame preference". When full, the queue automatically drops the oldest frame (FIFO eviction) to append the newest frame.
- **Concurrency:** Thread-safe via `threading.Lock()` enabling safe reading from a future background FFmpeg subprocess.
- **Safety:** It NEVER blocks the main `asyncio` event loop. It drops frames instead of blocking.

## 6. Performance Findings
- `pygame.image.tobytes` is a highly optimized C-level function built into SDL/Pygame. It executes virtually instantly in the context of a 30 FPS target.
- Memory allocation for the queue is strictly capped at `30 * 1.44MB ≈ 43.2MB`. This completely eliminates unbounded memory leaks.

## 7. Tests
We successfully added a full test suite in `test_frame_source.py`:
- `test_initialization`
- `test_read_frame_rgb24_dimensions_and_metadata`
- `test_bounded_queue_behavior`
- `test_frame_dropping_under_overflow`
- `test_producer_never_blocks`

## 8. Known Limitations
- The timestamp uses `time.monotonic()` from the moment `PygameFrameSource` initializes. FFmpeg stream timestamps will need to be properly synced with the Audio `MediaClock` during Phase 1E-3.
- Frame extraction directly ties to the display's rendering speed, so if the avatar loop lags, frame FPS drops (which is generally desired).

## 9. Next Step
Phase 1E-3: StreamEncoder (FFmpeg Subprocess Integration).
