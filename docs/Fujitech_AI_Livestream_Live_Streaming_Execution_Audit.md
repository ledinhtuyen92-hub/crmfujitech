# Fujitech AI Livestream - Live Streaming Execution Audit

## 1. Current Live Studio video architecture
The current architecture is a standalone Python application `live_studio/main.py`. The video output is purely local. It runs an asyncio event loop alongside a Pygame rendering loop. The rendering is decoupled via `BaseAvatarEngine` and `BaseAvatarRenderer` abstractions.

## 2. Current renderer
The renderer is `PygameAvatarRenderer`. It initializes an 800x600 Pygame window. It draws simple 2D shapes (rectangles, circles, ellipses) to simulate a head, body, and mouth. The background is filled with solid green `(0, 255, 0)` intended for Chroma Keying.

## 3. Current frame generation
Frame generation happens in `LiveStudioApp._avatar_render_loop()`. It loops continuously at approximately 30 FPS (`await asyncio.sleep(1/30.0)`). It calls `avatar_engine.update(pos)` which triggers `renderer.render()`. Frames are rendered directly to the Pygame display surface. They are not currently captured as raw frame buffers (e.g., NumPy arrays) or exposed via an API.

## 4. Current resolution/FPS
- **Resolution:** 800x600 (hardcoded in `PygameAvatarRenderer`)
- **FPS:** ~30 FPS (driven by `asyncio.sleep(1/30.0)` in the render loop)

## 5. Encoder availability
Absent. There is no encoder (H264/H265), streaming pipeline, or video capture logic currently implemented in the `live_studio` codebase.

## 6. FFmpeg availability
Absent. Searching the repository shows no FFmpeg binaries, `ffmpeg-python`, or `PyAV` dependencies. The `lip_sync.py` explicitly mentions that external dependencies like `ffmpeg` are "not yet approved."

## 7. RTMP availability
Absent in Live Studio. No RTMP injection or push logic exists in the client codebase.

## 8. Existing platform streaming capabilities
- **Shopee:** IMPLEMENTED. The `ShopeeAdapter` in `backend/live_sessions/platforms/shopee.py` successfully calls `/api/v2/livestream/start_session` and retrieves the `stream_url` (RTMP URL) and `external_session_id`. It stores the RTMP URL in the `LiveSession` model.
- **TikTok:** BLOCKED / RESTRICTED. Previous feasibility spikes indicate TikTok strictly guards its RTMP stream keys. Official API access is restricted to MCNs/partners.

## 9. Missing components
- A mechanism to extract the rendered frame buffer (e.g., RGB array) from the Pygame surface.
- An embedded video encoder (e.g., FFmpeg subprocess or PyAV).
- Audio loopback or audio mixing to combine the Avatar TTS audio with the video stream before encoding.
- The logic to fetch the `stream_url` from the Cloud backend to the Live Studio.

## 10. Candidate streaming architectures
1. **Option A: OBS Window Capture (MVP Fallback):** The user manually sets up OBS, captures the Pygame window with a chroma key, inputs the RTMP URL, and clicks "Start Streaming."
2. **Option B: Live Studio -> FFmpeg Subprocess -> RTMP:** Live Studio extracts RGB buffers from Pygame (e.g., via `pygame.surfarray`), mixes it with raw audio chunks, and pipes them to an embedded `ffmpeg` subprocess via stdin. FFmpeg encodes (x264/NVENC) and pushes to the RTMP URL.
3. **Option C: Live Studio -> PyAV (libav) -> RTMP:** Live Studio uses `PyAV` (Python bindings for FFmpeg) to encode frames and audio natively in Python and push to RTMP.
4. **Option D: Cloud Encoding:** Live Studio sends minimal data to the Cloud, and the Cloud uses GPU to render and stream.

## 11. Comparison of architectures
- **Option A (OBS):** Zero engineering effort, but fails the strict product requirement (Customer should NOT configure OBS/RTMP).
- **Option B (FFmpeg Subprocess):** Moderate engineering effort. Requires packaging `ffmpeg.exe` for Windows. Excellent performance and robust. Supports NVENC easily via command line arguments.
- **Option C (PyAV):** High engineering effort (complex timing and muxing in Python). Requires compiling binaries for Windows, which is notoriously difficult.
- **Option D (Cloud):** Violates the core architecture rule ("Không phụ thuộc vào cloud GPU để render avatar.").

## 12. Recommended implementation direction
**Option B (FFmpeg Subprocess)** is the most viable direction. It satisfies the requirement that the customer needs zero configuration. Live Studio will receive the RTMP URL via WebSocket, capture Pygame frames, mix the TTS audio, and pipe them directly into a bundled `ffmpeg.exe` subprocess.

## 13. Customer installation implications
The Windows Live Studio package must include a pre-compiled `ffmpeg.exe` binary. The customer will not need to install it manually; it will be part of the software distribution. The customer will experience a seamless "1-click Start Live" workflow.

## 14. Performance implications
Software encoding (libx264) at 720p/1080p 30FPS requires significant CPU overhead. On lower-end customer PCs, this could cause frame drops. The FFmpeg command should ideally probe for hardware encoders (e.g., `h264_nvenc` for NVIDIA, `h264_qsv` for Intel, `h264_amf` for AMD) and fallback to `libx264` with a `veryfast` preset if hardware acceleration is unavailable.

## 15. Security implications
The RTMP URL (which contains the stream key) must be securely transmitted over the authenticated WebSocket connection (already using `DeviceTokenAuthentication`) and never logged in plain text in `live_studio.log`.

## 16. Failure/recovery considerations
If the FFmpeg subprocess crashes or the RTMP connection drops, Live Studio must detect the broken pipe, halt playback, and attempt to reconnect or notify the Cloud (`ACK_FAILED`). The Cloud must then transition the session to `RECONNECTING` or `ERROR`.

## 17. Exact implementation phases
1. **Phase 1E-1:** Distribute/bundle `ffmpeg.exe` for the development environment.
2. **Phase 1E-2:** Modify `PygameAvatarRenderer` to extract frame buffers and push to an internal frame queue.
3. **Phase 1E-3:** Implement `StreamEncoder` class that spins up an `ffmpeg` subprocess reading raw video from stdin.
4. **Phase 1E-4:** Route audio chunks to the `StreamEncoder` (requires intercepting Pygame audio or decoding MP3 to PCM before playing).
5. **Phase 1E-5:** Update Protocol to send `stream_url` to the Device upon `session.start`.

## 18. Risks
- **Audio/Video Sync (Lip-sync drift):** Piping frames and audio independently to FFmpeg can lead to A/V desync if the timestamp generation is not strictly monotonic.
- **Performance:** Pygame surface extraction is CPU-bound. If it blocks the asyncio event loop, the entire WebSocket client might disconnect.

## 19. What must NOT be changed
- The `LiveSession` state machine and Cloud AI/business logic must not be altered.
- The `DeviceTokenAuthentication` and Protocol Envelope must remain intact.
- The existing GREEN path for audio downloading and ACK must not be broken.

## 20. Conclusion
The current architecture is completely decoupled and correctly stops at the local rendering boundary. To fulfill the "zero customer configuration" requirement, we must abandon the OBS Window Capture fallback and implement a bundled FFmpeg subprocess pipeline within `LiveStudioApp`. This is highly feasible but requires careful management of raw frame extraction and A/V synchronization.
