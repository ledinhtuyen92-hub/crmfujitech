# Fujitech AI Livestream - Phase 1E: Streaming Architecture Lock

## 1. Architecture Decision
The Livestream Execution Layer will use an embedded FFmpeg subprocess (`StreamEncoder`) within the `LiveStudioApp`. Pygame frames will be extracted as raw RGB arrays and fed to FFmpeg alongside a continuous PCM audio stream. This ensures zero manual configuration for the customer (no OBS required) while maintaining the architectural boundary between the Cloud and the Device.

## 2. Protocol Contract
We introduce two new commands to the WebSocket protocol: `stream.start` and `stream.stop`. 

**Command:** `stream.start`
```json
{
  "protocol_version": "1.0",
  "type": "command",
  "name": "stream.start",
  "message_id": "<uuid>",
  "timestamp": "<iso8601>",
  "sequence_number": <int>,
  "session_id": "<uuid>",
  "payload": {
    "command_id": "<uuid>",
    "stream_url": "rtmp://...",
    "width": 1280,
    "height": 720,
    "fps": 30,
    "video_codec": "h264",
    "audio_sample_rate": 44100,
    "audio_channels": 2
  }
}
```

**Security Rules for `stream_url`:**
- Delivered exclusively via the `DeviceTokenAuthentication`-secured WebSocket.
- MUST NOT be logged to `live_studio.log`.
- MUST NOT be emitted via `LiveConsoleEventService` to the frontend timeline.
- MUST NOT be included in exception traces.

## 3. Frame Pipeline
- **Abstraction:** `BaseFrameSource` and `PygameFrameSource`.
- **Extraction:** Use `pygame.surfarray.pixels3d(surface)` or `pygame.image.tostring(surface, 'RGB')` to extract raw RGB bytes without blocking the asyncio loop.
- **Queueing:** Frames are pushed to an `asyncio.Queue` (maxsize=30, representing 1 second of buffer).
- **Backpressure:** If the queue is full, the frame is dropped (preventing OOM and asyncio starvation).

## 4. Audio Pipeline
Since FFmpeg requires a continuous audio stream for RTMP stability, and TTS arrives in intermittent MP3 chunks, we must redesign the audio execution without breaking the existing local playback:
- **Decoding:** MP3 is decoded to raw PCM (44100Hz, 16-bit) using a system FFmpeg call into memory.
- **Mixer/Playback:** The existing `PygameAudioPlayer` remains intact and handles local playback. A non-invasive observer, `AudioStreamSink`, is attached to it.
- **Routing:** During playback, the audio player slices the decoded PCM and pushes it to the `AudioStreamSink`. When idle, the sink's internal `_silence_pump` automatically injects zero-byte chunks to maintain the FFmpeg stream.

## 5. A/V Synchronization Strategy
- **Master Clock:** The `MediaClock` serves as the authoritative media clock, advanced solely by the `AudioStreamSink` receiving bytes.
- `audio_pts` = `samples_written / sample_rate`
- `video_pts` = `frames_written / fps`
- The frame extractor queries the Master Clock. It produces a frame only when `video_pts <= audio_pts`. This guarantees strict monotonic A/V sync and prevents drift, even if the event loop lags.

## 6. FFmpeg Process Model
- **Process Manager:** `StreamEncoder` uses `asyncio.create_subprocess_exec` to spawn FFmpeg.
- **I/O Architecture:** 
  - **Video:** Piped via `stdin` (`-f rawvideo -pix_fmt rgb24`).
  - **Audio:** Because `stdin` is used for video, audio is piped via a local UDP socket (`udp://127.0.0.1:<random_port>`) or Windows Named Pipes (`\\.\pipe\fujitech_audio`). UDP is preferred for asyncio non-blocking compatibility on Windows.
- **Monitoring:** The subprocess `stderr` is read asynchronously to detect crashes or encoder failures without blocking.

## 7. Encoder Selection
Upon Live Studio startup, `StreamEncoder` probes available hardware encoders by parsing `ffmpeg -hide_banner -encoders`.
- **Candidate Order:**
  1. `h264_nvenc` (NVIDIA)
  2. `h264_qsv` (Intel)
  3. `h264_amf` (AMD)
  4. `libx264` (CPU Fallback, `preset=veryfast`)
- The selected encoder is stored in the `StreamConfig` and reported back to the Cloud during the first heartbeat.

## 8. Stream State
- **Internal States:** `IDLE`, `STARTING`, `LIVE`, `STOPPING`, `ERROR`, `RECONNECTING`.
- **Cloud Mapping:** Streaming execution state is decoupled from the business `LiveSession` state. The Cloud orchestrator is `RUNNING` regardless of stream drops. Live Studio reports its streaming state via `device.heartbeat` (`execution_state.streaming_status`).

## 9. Failure and Recovery
- **FFmpeg Crash / Broken Pipe:** Detected via subprocess exit code. Transition to `RECONNECTING`.
- **Recovery:** Automatically attempt to restart the FFmpeg process 3 times with exponential backoff.
- **Failure:** If recovery fails, transition to `ERROR` and send an `ACK_FAILED` (if triggered by a command) or include the error in the next `device.heartbeat`.

## 10. Security Model
- No stream secrets are stored in the local SQLite/JSON files.
- FFmpeg process arguments containing the `stream_url` are scrubbed from local logs.

## 11. Customer Packaging Strategy
- **Distribution:** A pre-compiled `ffmpeg.exe` (Windows x64) is bundled in the `bin/` directory of the Live Studio distribution.
- **Discovery:** `StreamEncoder` explicitly uses `./bin/ffmpeg.exe` to prevent dependency on the customer's system PATH.
- **Customer Workflow:** Remains strictly Login → Device Connected → Start Live. Zero technical setup.

## 12. Test Strategy
- **Unit Tests:** 
  - `PygameFrameSource` extraction speed.
  - `ContinuousAudioMixer` clock monotonicity.
  - `StreamConfig` validation.
- **Integration Tests:** 
  - FFmpeg startup and encoder probing with a dummy `ffmpeg.exe`.
- **E2E Tests:** 
  - Feed dummy frames and audio to FFmpeg pointing to a local `null` output (`-f null -`) or local file to verify the pipeline doesn't crash, avoiding the need for a real RTMP server in CI.

## 13. Implementation Phases
- **Phase 1E-1: Media Pipeline Foundation** - Implement `ContinuousAudioMixer` and MP3->PCM decoding fallback.
- **Phase 1E-2: Frame Extraction** - Implement `BaseFrameSource` and `PygameFrameSource`.
- **Phase 1E-3: StreamEncoder Process** - FFmpeg bundling, encoder probing, and subprocess management.
- **Phase 1E-4: Protocol Integration** - Add `stream.start`/`stop` commands to serializers and WS dispatcher.
- **Phase 1E-5: E2E Assembly** - Connect the Renderer, Audio Mixer, and StreamEncoder.
- **Phase 1E-6: Failure/Recovery & Security** - Redact logs, implement auto-reconnect.

## 14. Open Questions
- Does `libx264` at 720p/30fps consume too much CPU on target minimum hardware if hardware encoding fails? *Action: Profile CPU usage on a low-end i3/i5 during Phase 1E-3.*

## 15. Explicit Non-Goals
- Do NOT modify `LiveSession` state logic.
- Do NOT alter Cloud AI, RAG, or TTS logic.
- Do NOT implement TikTok streaming logic (remains restricted).
- Do NOT build Cloud GPU rendering.
