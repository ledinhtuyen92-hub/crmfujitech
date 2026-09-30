# Fujitech AI Livestream - Phase 1E-3 StreamEncoder Foundation Report

## 1. FFmpeg Discovery
- Implemented `FfmpegLocator` to deterministically discover the FFmpeg executable.
- Path resolution priority:
  1. `override_path` (for local development or testing).
  2. `live_studio/bin/ffmpeg.exe` (for the final bundled production package).
  3. System `PATH` as a last resort.
- Fallback logic is extensively tested to handle cases where FFmpeg is unavailable gracefully.

## 2. StreamConfig
- A robust, validated `StreamConfig` dataclass encapsulates all AV parameters.
- Target MVP config defaults lock:
  - Resolution: 800x600 @ 30 FPS
  - Video format/codec: RGB24 input -> `libx264` output, 2500k bitrate
  - Audio format: `s16le` 44100Hz 2-channel input -> `aac` 128k output

## 3. A/V Clock and Timelines
- Created `AVTimeline` to maintain a unified monotonic clock derived from stream start.
- **Video PTS:** Derived logically via `frame_index / fps`.
- **Audio PTS:** Derived logically via `audio_samples_written / sample_rate`.
- To maintain synchronization under backpressure, FFmpeg consumes these streams as raw byte streams and relies on Python maintaining strict rate pacing, avoiding artificial FFmpeg time-stretching unless explicitly provided via container muxing.

## 4. Input Transport Architecture
- Evaluated methods for feeding FFmpeg on Windows:
  - **Named pipes** can easily deadlock in Python's `asyncio` loop on Windows without native Win32 wrappers.
  - **Standard Stdin** does not easily support multiple raw interleaved streams without container framing.
- **Chosen Architecture:** Local TCP sockets (`LocalTcpTransport`). 
- Python acts as a deterministic, asynchronous TCP server on dynamically allocated loopback ports. FFmpeg connects as the TCP client (e.g., `-i tcp://127.0.0.1:<port>`). 
- This guarantees reliable, non-blocking delivery of vast amounts of raw data (RGB24 and PCM), natively observable and deadlock-free.

## 5. Encoder Selection and Probing
- Built `HardwareEncoderProbe` to dynamically read FFmpeg's available encoders (`-encoders`).
- Scans for `h264_nvenc`, `h264_qsv`, `h264_amf`.
- Falls back to `libx264` seamlessly if hardware encoders are absent, ensuring ubiquitous compatibility.

## 6. Backpressure Policy
- FrameQueue drops oldest frames locally when bounded limits are hit.
- The `StreamEncoder`'s `write_video()` simply acts on frames pulled from the queue.
- **Why audio is prioritized:** Human perception detects minor audio stutters (pops, skips, clicks) instantly, drastically reducing stream quality. Dropped video frames merely appear as a momentary FPS dip (e.g., from 30 FPS to 24 FPS) which is vastly preferable.

## 7. Failure Detection
- `StreamEncoder._monitor_process()` continuously reads FFmpeg's `stderr` asynchronously.
- Write exceptions on TCP transports inherently catch Broken Pipe (`ConnectionResetError`) if FFmpeg crashes, safely calling `stop()` and preventing asyncio event loop hangs.

## 8. Tests and Live Studio Regression
- Added 7 robust unit tests validating Discovery, Configuration, A/V Timing, Graceful Startup/Shutdown, Broken Pipe detection, and Hardware Probing.
- Total test coverage executed: **60/60 tests passing**.
- A local FFmpeg fallback verification script correctly handled the absence of FFmpeg cleanly without failure.

## 9. Known Limitations
- The FFmpeg executable is still physically absent in the repository (by design) and must be bundled into `live_studio/bin` before final RTMP transmission begins.
- True RTMP transmission is mocked as `null` muxing when non-rtmp outputs are specified.

## 10. Next Step
Phase 1E-4: Integration. Tying the Audio Stream Sink and Frame Queue into the StreamEncoder and exposing `stream.start` functionality.
