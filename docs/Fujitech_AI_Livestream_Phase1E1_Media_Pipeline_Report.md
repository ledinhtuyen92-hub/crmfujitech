# Fujitech AI Livestream - Phase 1E-1: Media Pipeline Foundation Report

## 1. Existing Audio Architecture
The current execution uses `PygameAudioPlayer` to directly load and play MP3 audio assets via `pygame.mixer.music`. This handles the audio entirely in the background (C level) and doesn't naturally expose the raw PCM bytes required for pushing to an RTMP stream encoder. The execution is currently GREEN, with full E2E traversal from the Cloud to Pygame playing the sound and responding with `ACK_COMPLETED`.

## 2. New AudioStreamSink
A new non-invasive observer, `AudioStreamSink`, was introduced. It acts as an optional hook alongside `PygameAudioPlayer`. 
When initialized and started, it receives chunks of PCM audio during speech. When idle, it autonomously injects silence to maintain a continuous stream. The sink avoids breaking existing playback by relying on `try/except` boundaries in `PygameAudioPlayer`.

## 3. PCM Format
The canonical PCM format for the streaming pipeline is strictly defined as:
- **Encoding:** s16le (Signed 16-bit little-endian)
- **Sample Rate:** 44100 Hz
- **Channels:** 2 (Stereo)

## 4. MP3 Decoding Method
To retrieve raw PCM without replacing Pygame's lightweight MP3 playback, a utility class `Mp3Decoder` was implemented. It executes a local `ffmpeg` subprocess to decode the MP3 file into raw `s16le` bytes in memory.
- **Graceful Degradation:** If FFmpeg is not found, the decoder logs a warning and returns empty bytes, keeping the system stable.
- **Non-Blocking Execution (Phase 1E-1.1):** `Mp3Decoder.decode_to_pcm` is a synchronous subprocess call. To prevent it from blocking the async `PygameAudioPlayer.play()` loop (which would freeze WebSocket heartbeats and the avatar render loop), the call is safely dispatched to a background thread using `await asyncio.to_thread(Mp3Decoder.decode_to_pcm, filepath)`.

## 5. Media Clock
A central `MediaClock` tracks monotonic time based strictly on the number of audio bytes written to the sink.
- **Formula:** `audio_pts = total_samples_written / sample_rate`
This decoupled clock guarantees that any future video frames will sync deterministically to the audio track, independent of the `asyncio` event loop wall-clock time.

## 6. Silence Strategy
Because FFmpeg RTMP pipelines crash or drift without continuous audio, `AudioStreamSink` includes an asynchronous `_silence_pump` task. 
- It wakes up every 100ms. 
- If the stream is active but no speech is occurring (`is_speaking == False`), it compares the wall-clock elapsed time with `audio_pts`. 
- If the `audio_pts` lags behind, it generates and pushes precise chunks of zero-byte silence to catch up.

## 7. Interaction with PygameAudioPlayer
`PygameAudioPlayer` now optionally accepts a `stream_sink` in its constructor. 
- When `play(filepath)` is called, it triggers `Mp3Decoder` to decode the asset. 
- During the `pygame.mixer.music` playback polling loop, it calculates the elapsed time and pushes the corresponding slice of the decoded PCM buffer to the `stream_sink`. 
- This preserves Pygame's E2E role while fulfilling the streaming requirement.

## 8. Failure Isolation
All calls to `stream_sink.write_pcm()` and `Mp3Decoder.decode_to_pcm()` inside `PygameAudioPlayer` are wrapped in `try/except` blocks. If the sink or FFmpeg decoding fails, the errors are logged, but the primary `pygame` playback and the critical `ACK_COMPLETED` workflow remain unaffected.

## 9. Tests
Focused tests were added in `test_media_pipeline.py`:
- Monotonic `audio_pts` calculation verification.
- `AudioStreamSink` silence generation and byte-alignment.
- Asynchronous silence pump lag detection.
- `Mp3Decoder` graceful failover when FFmpeg is absent.
- `PygameAudioPlayer` sink failure isolation (mocked to ensure `play()` still completes if the sink raises an exception).

## 10. Performance Considerations
- The MP3 is decoded entirely into memory (a 10-second TTS MP3 results in ~1.7MB of raw PCM), which is highly efficient.
- `asyncio.sleep(0.1)` in the silence pump avoids tight CPU loops.
- `PygameAudioPlayer` extracts and passes memory slices (`pcm_data[start:end]`) rather than deep copies.

## 11. Known Limitations
- The current MP3 decoder depends on a system-installed `ffmpeg` executable. Without it, the stream sink will receive silence. This is acceptable for Phase 1E-1 and will be solved when `ffmpeg.exe` is bundled.

## 12. Next Phase
**Phase 1E-2:** Frame Extraction Abstraction. Building `BaseFrameSource` and extracting `pygame.surfarray` to synchronize with the new `MediaClock`.
