# Phase 1D-7H: Real E2E Validation - Pre-Validation Audit

## 1. Environment Availability
**AVAILABLE**:
- Django backend, PostgreSQL, Redis, Celery, Channels (WebSocket layer).
- Local Execution Core (Fujitech Live Studio python module).
- OpenAI TTS & AI Provider integrations (code is ready, requires actual API keys in DB or settings).
- Infrastructure to create Test Company, Test Product, Test Agent, Test Device, Test Session.

**REQUIRES MANUAL CONFIGURATION**:
- Real OpenAI API Key (`OPENAI_API_KEY`) for Level 2 testing.
- Running instance of the `Live Studio` device client to connect to WebSocket.

**NOT AVAILABLE / REQUIRES REAL PLATFORM ACCOUNT**:
- Real Shopee LIVE active session.
- Real Shopee OAuth Token.
- Real Shopee Webhooks/Polling data.

## 2. E2E Test Levels
**LEVEL 1 — Fully Mocked E2E (AVAILABLE NOW)**
- Shopee API mocked.
- AI & TTS mocked via `unittest.mock`.
- Real Django/Redis/Celery/Channels.
- Validates internal wiring, queueing, state transitions, and context memory.

**LEVEL 2 — Semi-real E2E (AVAILABLE NOW)**
- Synthetic `LiveCommentEvent` injected directly into the Celery task.
- Real AI Provider (OpenAI).
- Real TTS Provider (OpenAI).
- Real Device Execution Core (Live Studio connected via WebSocket).
- Validates real AI → real TTS → Audio download → Avatar lip-sync.

**LEVEL 3 — Real Shopee E2E (BLOCKED BY EXTERNAL DEPENDENCY)**
- Real Shopee LIVE session with real comments.
- Cannot be executed without a real active Shopee Livestream and authorized OAuth session.

## 3. Test Data
**Test Product**:
- Name: "Sofa Gỗ Cao Cấp"
- SKU: `SOFA-01`
- Standard Price: 15,000,000
- Live Price: 12,000,000 (Product Truth Override)
- Stock: 10

**Test Agent**:
- Name: "AI Chốt Sale"
- System Prompt: "Bạn là nhân viên chốt sale thân thiện."
- Voice: `nova`
- Speed: `1.1`

**Test Session**:
- Company: "Test Company"
- LiveDevice: "Studio PC 1"
- Platform: `shopee`
- Status: `RUNNING`

**Test Comments**:
1. *Product question*: "Sản phẩm này làm bằng gỗ gì?"
2. *Price question*: "Đang live giá bao nhiêu thế?"
3. *Spam*: "djfaskldfjasd"
4. *Follow-up*: "Mình lấy 2 bộ có freeship không?" (Context check)

## 4. End-to-End Flow
1. Shopee Comment Polling (or synthetic injection)
2. Normalized `LiveCommentEvent`
3. `handle_live_message` Celery Task
4. `LiveOrchestrator.process_comment()`
5. Fetch Product Truth & RAG
6. AI Agent Inference (`generate_ai_reply`)
7. Intent / Action routing (`RESPOND` / `IGNORE`)
8. Context Sliding Window Persistence
9. TTS Generation (`OpenAITTSProvider`)
10. Audio Storage (`LocalAudioStorageBackend`)
11. Send `speech.speak` via WebSocket
12. Device receives command, queues it.
13. Device sends `ACK_RECEIVED`.
14. Device downloads audio, updates Avatar Lip-Sync.
15. Device sends `ACK_COMPLETED`.

## 5. E2E Assertions (Normal Question)
- [ ] Comment is normalized.
- [ ] Product Truth loaded correctly.
- [ ] AI Core generates structured JSON response.
- [ ] Intent is classified correctly; Action == `RESPOND`.
- [ ] LiveContext stores user comment and AI response.
- [ ] TTS called using Agent's voice/speed.
- [ ] AudioAsset created (signed URL valid).
- [ ] `speech.speak` envelope created with valid `sequence_number`.
- [ ] WebSocket delivers command to Device.
- [ ] Device responds with `ACK_RECEIVED`.
- [ ] Device `AudioWorker` downloads audio payload successfully.
- [ ] Avatar enters `speaking` state; lip-sync active.
- [ ] Avatar returns to `idle` upon completion.
- [ ] Device sends `ACK_COMPLETED`.

## 6. IGNORE Assertion (Spam)
- Comment: "djfaskldfjasd"
- AI outputs action == `IGNORE`.
- Assert **NO TTS** API call is made.
- Assert **NO speech.speak** command is sent over WebSocket.
- Assert Avatar remains `idle`.

## 7. Context Assertion
- Send Comment 1: "Giá bộ sofa này bao nhiêu?"
- Wait for AI Response.
- Send Comment 2: "Nếu lấy 2 bộ thì có ưu đãi không?"
- Assert `LiveContextService` contains both turns.
- Assert AI response to Comment 2 correctly references "sofa" and its price.

## 8. Human Takeover Assertion
- Send a complex question to trigger long TTS playback.
- While speech is queued/playing, trigger `session.control` (action = `pause`).
- Assert queue is flushed.
- Assert current speech is interrupted.
- Assert Avatar returns to `idle`.
- Assert `ACK_FAILED` (or `ACK_INTERRUPTED`) is sent to Cloud.
- Assert new incoming comments immediately return `suppressed` (Human Takeover) without hitting AI.

## 9. Failure Scenarios
- **AI failure**: Handled safely. Error logged. No TTS/Speech command sent. Next comment can be processed.
- **TTS failure**: Catch timeout/API error. Response aborted. Next comment can be processed.
- **Storage failure**: Catch OS error. Response aborted. Next comment can be processed.
- **WebSocket/Device unavailable**: Command pushed to channel, but drops if no active consumer. Orchestrator completes normally.
- **Audio download failure (Device)**: Device sends `ACK_FAILED`, moves to next queue item.
- **Playback failure (Device)**: Device sends `ACK_FAILED`, returns to idle.
- **Human Takeover during speech**: Triggers interrupt, flushes queue, sends `ACK_FAILED` (Cancelled by Human).

## 10. Observability
- All events are tied by `message_id` (representing the comment event) and `correlation_id`.
- The `command_id` of `speech.speak` maps directly back to the `message_id` reference.
- By tracking `session_id` and `correlation_id` across Django logs, Celery logs, and Device logs, we can trace a comment entirely from ingestion to `ACK_COMPLETED`.

## 11. Performance Baseline
Measurements to establish (via logs timestamp diffs):
- **Comment Ingestion Latency**: Shopee timestamp vs DB insertion.
- **AI Latency**: `generate_ai_reply` start vs end (typically 1-3s).
- **TTS Latency**: `OpenAITTSProvider.generate` start vs end (typically 2-5s).
- **Network Latency**: Cloud `speech.speak` emit vs Device WS receive (typically < 100ms).
- **Audio Download Latency**: Device HTTP GET signed URL (typically < 500ms).
- **Total E2E Latency**: Time from comment creation to Avatar starting to speak.

## 12. Security Validation
- `DeviceAgentConsumer` verifies `LiveDevice` authentication and active session matching.
- `LiveContextService` strictly enforces `company_id` isolation.
- Signed URLs (`TimestampSigner`) prevent unauthorized audio access and expire in 2 hours.
- API credentials (OpenAI/Shopee) remain strictly on the backend, never transmitted in `speech.speak`.

## 13. Shopee External Dependency
**BLOCKED BY EXTERNAL DEPENDENCY**.
Real Shopee E2E (Level 3) requires a live Shopee Sandbox/Production account actively streaming to generate real webhook comments. This cannot be fully automated in CI without a live human/bot actively commenting on an authorized stream.

## 14. Test Artifacts
- **Automated Level 1 E2E Test**: A Django test case simulating the full Orchestrator -> Channel layer flow.
- **Level 2 Device Emulator Script**: A standalone python script representing `Live Studio` that connects to the local WebSocket, receives `speech.speak`, downloads the audio, and prints "Avatar Speaking...".

## 15. Definition of Done
- **LEVEL 1 GREEN**: Automated test confirms Orchestrator -> Channel Layer -> Mocked Device logic functions flawlessly.
- **LEVEL 2 GREEN**: Manual validation using a test script successfully triggers real OpenAI API -> real TTS -> WebSocket -> audio download.
- **LEVEL 3 GREEN**: (Deferred until External Dependencies are available).

## 16. Exact Validation Steps (Level 2)
1. Configure `OPENAI_API_KEY` in environment.
2. Run Django server and Celery worker.
3. Start the Device Emulator script (connects to WS).
4. Run a Django management command to inject a synthetic `LiveCommentEvent` into Celery.
5. Observe Celery logs (AI -> TTS -> Storage).
6. Observe Device Emulator logs (Command Received -> ACK -> Audio Downloaded -> Playback).
7. Inject a "Spam" comment -> Observe no command sent.
8. Inject a comment -> Trigger `session.control pause` -> Observe Device interrupt.
