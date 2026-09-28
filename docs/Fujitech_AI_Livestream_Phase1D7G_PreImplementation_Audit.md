# Phase 1D-7G: AI → TTS → AVATAR - Pre-Implementation Audit

## 1. Existing TTS Audit
- **Provider Abstraction**: `BaseTTSProvider` is cleanly defined in `backend/live_sessions/audio/tts.py`.
- **OpenAI Implementation**: `OpenAITTSProvider` correctly supports the OpenAI `tts-1` model, handles timeouts (`APITimeoutError`), and gracefully wraps exceptions into `TTSProviderException`.
- **Contract**: It correctly accepts `text` and `voice_config` and outputs an `AudioResult` containing `audio_bytes`, `mime_type` (e.g., `audio/mp3`), and `duration_ms`.
- **Vietnamese Support**: OpenAI's voices (`alloy`, `nova`, etc.) natively support Vietnamese text synthesis.

## 2. Audio Storage Audit
- **Implementation**: `LocalAudioStorageBackend` (`storage.py`) writes MP3 chunks to disk.
- **Tenant Isolation**: Files are securely partitioned via `MEDIA_ROOT/live_audio/{company_id}/{session_id}/{asset_id}.mp3`.
- **Security**: It uses Django's `TimestampSigner` to generate a `signed_url` with a 2-hour TTL.
- **Contract**: The returned dictionary perfectly matches the `AudioAsset` schema required by the protocol.

## 3. Protocol Audit
- **Command Schema**: `SpeechSpeakPayloadSerializer` (`commands.py`) enforces `command_id`, `text`, `audio_asset`, `interruptible`, and `priority`.
- **Envelope Schema**: `ProtocolEnvelopeSerializer` enforces `protocol_version`, `sequence_number`, `session_id`, etc.
- **Verdict**: The protocol is robust, platform-agnostic, and fully ready. No changes are needed.

## 4. Device Execution Core Audit
- **WebSocket & Dispatcher**: `DeviceAgentConsumer` receives commands and `ProtocolDispatcher` (`live_studio/core/dispatcher.py`) processes `speech.speak`.
- **Sequence & Dedup**: Sequence is validated. Duplicate commands return the existing ACK status via `DedupRegistry`.
- **Speech Queue**: `SpeechQueueManager` (`queue_manager.py`) uses an `asyncio.PriorityQueue` supporting `PRIORITY_HIGH` (0) and `PRIORITY_NORMAL` (1) with a strictly incrementing FIFO index to preserve temporal order.
- **Verdict**: The Execution Core is extremely robust and fully implements Phase 1D-3 requirements.

## 5. Avatar Engine Audit
- **Implementation**: `BaseAvatarEngine`, `Local2DAvatarEngine`, and `DummyAvatarEngine` are implemented in `live_studio/execution/avatar_engine.py`.
- **Lip-Sync**: `LipSyncAnalyzer` drives the mouth state based on the audio playback clock.
- **Verdict**: No redesign is necessary. It supports `idle`, `speaking`, and `interrupt` states flawlessly.

## 6. End-to-End Lifecycle
1. `LiveOrchestrator` receives comment → AI generates JSON (Intent: RESPOND).
2. `LiveOrchestrator` calls `OpenAITTSProvider.generate()`.
3. `LiveOrchestrator` calls `LocalAudioStorageBackend.store()` → gets `signed_url`.
4. `LiveOrchestrator` wraps it in a `speech.speak` command envelope and pushes via `channel_layer`.
5. `DeviceAgentConsumer` pushes to WebSocket.
6. `ProtocolDispatcher` (Local Studio) registers the command, enqueues it, and sends `ACK_RECEIVED`.
7. `AudioWorker` fetches the audio via `signed_url`, plays it, and updates `Local2DAvatarEngine`.
8. When playback ends, `ACK_COMPLETED` is sent back to the cloud.

## 7. Orchestrator Integration Point
- **Current State**: Phase 1D-7F left the TTS and Storage logic intact at the bottom of `LiveOrchestrator.process_comment`.
- **Adjustment Needed**: The integration is conceptually complete, but `voice_config` is currently hardcoded (`{"voice": "alloy", "speed": 1.0}`). In 1D-7G, we must map this to the actual `AiAgent`'s voice configuration. 

## 8. Human Takeover Behavior
- **Cloud-side**: Handled successfully in 1D-7F (blocks new comments).
- **Device-side**: When an admin triggers Human Takeover, the dashboard API must send a `session.control` command with `action="pause"` (or `stop`) to the device. 
- **Queue Behavior**: `ProtocolDispatcher._handle_session_control` correctly catches `pause`/`stop`, flushes the `SpeechQueueManager`, transitions the avatar to idle, and sends `ACK_FAILED` (CANCELLED_BY_HUMAN) for all flushed commands.

## 9. Failure Matrix
- **AI Core Fails**: TTS is skipped. Worker does not crash.
- **TTS Fails (Timeout/API)**: Orchestrator catches it, logs `tts_failure`, stops execution.
- **Storage Fails**: Orchestrator catches it, logs `storage_failure`.
- **Audio Download Fails**: Device sends `ACK_FAILED` and moves to the next queue item.

## 10. Performance & Cost Risks
- **TTS Latency**: TTS runs synchronously inside the Celery worker, blocking the thread for 2-5s per comment. High volume could exhaust Celery workers.
- **Audio Caching**: Identical replies (e.g., "Dạ em chào anh") currently generate duplicate TTS API calls and duplicate MP3 files. An MD5 hash cache for TTS could save significant costs.

## 11. Security
- API keys are protected and configurable via database fallbacks.
- Tenant isolation is strictly enforced at the audio file path level.
- `TimestampSigner` prevents unauthorized direct access to audio files.

## 12. Architecture Lock Recommendations (Answers)
- **A. Existing TTS**: Sufficient.
- **B. AudioAsset Protocol**: Sufficient.
- **C. Device Execution Core**: Sufficient.
- **D. Avatar Engine**: Sufficient.
- **E. TTS Call Point**: Keep inside `LiveOrchestrator.process_comment` after AI generation, but only if `action == RESPOND`.
- **F. Speech.speak Creation**: Keep inside `LiveOrchestrator` after storage.
- **G. ACK Propagation**: Currently logged by consumer. May need an `AckService` later to update UI, but sufficient for 1D-7G.
- **H. Human Takeover Interrupt**: Must send `session.control` command `pause`/`stop` from the dashboard.
- **I. 1D-7G Definition of Done**: Map `AiAgent.voice` settings to the TTS call, ensure E2E tests for TTS success/failures exist, and verify end-to-end integration without modifying the core AI or RAG logic.

**FINAL STATUS: AUDIT COMPLETED. READY FOR IMPLEMENTATION INSTRUCTIONS.**
