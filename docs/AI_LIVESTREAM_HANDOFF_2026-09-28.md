# Fujitech AI Livestream - Handoff Document
**Date:** 2026-09-28
**Branch:** V2

This document is the definitive handoff artifact for the next development session. It details the exact architecture, what has been completed, current state, and the critical rules to maintain system integrity.

==================================================
## 1. PROJECT OVERVIEW
==================================================
Fujitech CRM is extending its capabilities with an AI Livestream platform. The system allows an AI agent to read live customer comments, generate context-aware responses using RAG, and convert them to speech (TTS) which is then streamed to a local device (Live Studio) running an avatar. 

==================================================
## 2. CURRENT ARCHITECTURE
==================================================
The architecture is strictly divided into **Cloud** (Django Backend) and **Device** (Live Studio running on Windows).
The Cloud handles ALL business logic, AI decisions, RAG, and TTS generation. The Device handles execution, audio playback, lip-sync rendering, and stream encoding. They communicate asynchronously via Django Channels WebSocket using a strict Protocol Envelope format.

==================================================
## 3. CLOUD RESPONSIBILITIES
==================================================
- **Multi-Tenant State Management:** Managing `LiveSession` (Draft -> Ready -> Running).
- **Polling & Event Ingestion:** Pulling comments from Shopee/TikTok and deduplicating them.
- **RAG & Product Truth:** Overriding knowledge base with real-time price from DB.
- **AI Orchestration:** Generating responses via OpenAI/Gemini/Anthropic.
- **TTS Generation:** Generating audio with OpenAI and storing it locally with Signed URLs.
- **Command Dispatch:** Sending `speech.speak` to the Device websocket.

==================================================
## 4. LIVE STUDIO RESPONSIBILITIES
==================================================
- **WebSocket Client:** Connects securely using `DeviceTokenAuthentication`.
- **Queue Management:** Buffers incoming commands and enforces sequence.
- **Execution:** Downloads Audio from Cloud using signed URLs and plays it via Pygame.
- **Avatar Sync:** Translates audio progress into Avatar lip-sync (to be fully integrated).
- **ACK Management:** Sends `ACK_COMPLETED`, `ACK_FAILED` back to Cloud.
- **Streaming (Future):** Capturing the screen and sending RTMP to Shopee/TikTok.

==================================================
## 5. COMPLETED PHASES
==================================================
- RAG & AI Core integration.
- Multi-tenant database design.
- Shopee OAuth & Product Mappings.
- LiveSession lifecycle (Start, Pause, Resume, Human Takeover).
- Live Console UI (React) with real-time Event Timeline.
- WebSocket Protocol & Channels infrastructure.
- OpenAI TTS integrated with `CompanyAiKey` credentials.
- Device Audio Storage and secure delivery via signed URLs.
- Live Studio Windows E2E Audio execution.

==================================================
## 6. CURRENT GREEN E2E PATH
==================================================
React Live Console -> Synthetic Comment -> Celery `handle_live_message` -> RAG -> AI Core -> Product Truth -> CompanyAiKey credential resolution -> OpenAI TTS -> Audio Storage (Signed URL) -> Django Channels (`send.command`) -> Live Studio WebSocket -> Sequence Validator -> Queue Manager -> Audio Download -> Pygame Playback -> File Cleanup -> ACK completed.

==================================================
## 7. IMPORTANT FILES / MODULES
==================================================
- `backend/live_sessions/orchestrator.py`: The heart of the AI Livestream flow.
- `backend/live_sessions/consumers.py`: WebSocket endpoints for Device and Admin Console.
- `backend/live_sessions/audio/storage.py`: Generates and verifies Signed URLs.
- `backend/live_sessions/views.py`: REST APIs for Console and Audio serving.
- `live_studio/main.py`: Entry point for the Windows device application.
- `live_studio/execution/audio_player.py`: Pygame audio handler.
- `frontend/src/pages/live-sessions/`: React console.

==================================================
## 8. DATABASE MODELS
==================================================
- `LiveSession`: Core entity linking device, product, platform, and agent.
- `LiveDevice`: The physical/virtual device (Live Studio) running the stream.
- `LivePlatformProduct`: Maps local products to platform products (e.g. Shopee).
- `CompanyAiKey`: Stores AI credentials used by RAG and TTS.

==================================================
## 9. PROTOCOL / WEBSOCKET CONTRACT
==================================================
All websocket messages are enveloped:
```json
{
  "protocol_version": "1.0",
  "type": "command",
  "name": "speech.speak",
  "message_id": "<uuid>",
  "timestamp": "<iso8601>",
  "sequence_number": 1,
  "session_id": "<uuid>",
  "payload": { ... }
}
```
**Important:** Commands are serialized purely to primitive types to avoid MsgPack `UUID` serialization crashes.

==================================================
## 10. TTS CREDENTIAL ARCHITECTURE
==================================================
`OpenAITTSProvider` uses `get_api_keys(company, "openai")` to dynamically resolve the API key for the current tenant. It no longer relies on a global `settings.OPENAI_API_KEY`.

==================================================
## 11. LIVE CONSOLE ARCHITECTURE
==================================================
The Admin Console uses React. It sends HTTP requests to manage the session (e.g., `test-comment`). It listens to the `AdminConsoleConsumer` WebSocket for read-only real-time events emitted by `LiveConsoleEventService`.

==================================================
## 12. TEST STATUS
==================================================
- **Targeted Console Tests:** 7/7 PASS (GREEN)
- **Live Studio E2E Execution:** GREEN
- **Full `live_sessions` module:** YELLOW (Due to unrelated legacy failures in older tests).

==================================================
## 13. KNOWN TECHNICAL DEBT
==================================================
- `handle_live_message` Celery task uses synchronous API calls to OpenAI TTS, which blocks the worker until audio is fully downloaded.
- Sequence validation logic might drop packets if `sequence_number` gaps are too large.

==================================================
## 14. KNOWN LEGACY TEST FAILURES
==================================================
Some older tests in `live_sessions` module (especially legacy Shopee OAuth and device websockets tests) may fail due to test pollution or outdated mock signatures. Do NOT spend time fixing them unless they block current development.

==================================================
## 15. SECURITY RULES
==================================================
- **NEVER** expose Device Tokens (`ldt_***`).
- **NEVER** expose OpenAI API keys or Shopee Access Tokens in logs or code.
- Always use `CompanyAiKey` for credentials, never hardcode in `.env`.
- Audio assets must be downloaded using Signed URLs with `DeviceTokenAuthentication`.

==================================================
## 16. CURRENT BLOCKERS
==================================================
None. The critical path is completely GREEN and unblocked.

==================================================
## 17. EXACT CURRENT STOP POINT
==================================================
The system successfully dispatches AI-generated audio to the Live Studio Windows client, which plays it via Pygame and returns an `ACK_COMPLETED`.
The integration stops right after audio playback. Video generation and RTMP streaming have NOT been implemented yet.

==================================================
## 18. NEXT DEVELOPMENT STAGE
==================================================
**Live Streaming Execution Layer.**
The focus shifts to how the Live Studio will generate video (Avatar lip-sync to the audio) and push the combined A/V stream to an RTMP server (Shopee/TikTok).

==================================================
## 19. RECOMMENDED NEXT TASKS
==================================================
- Audit Live Studio video output capabilities (e.g., OpenCV, Pygame rendering).
- Investigate encoder architecture (FFmpeg subprocess or PyAV).
- Investigate RTMP execution and platform streaming adapters.
- Validate TikTok/Shopee live streaming constraints.

==================================================
## 20. "DO NOT BREAK" ARCHITECTURE RULES
==================================================
- **Tenant Isolation:** ALWAYS filter by `company`.
- **Cloud logic:** DO NOT put AI or Business logic in `live_studio/`.
- **Protocol Envelope:** DO NOT bypass the Envelope schema or `sequence_number`.
- **Audio Download:** DO NOT remove the `DeviceTokenAuthentication` from `serve_audio_asset`.

==================================================
## 21. HOW TO VALIDATE BEFORE CODING
==================================================
Run targeted tests:
`docker compose exec web python manage.py test live_sessions.tests_console`
Test the E2E flow using the React UI -> Connect Admin WebSocket -> Send Synthetic Comment -> Watch `live_studio_output.log` for Pygame playback.

==================================================
## 22. GIT / BRANCH STATE
==================================================
- Branch: `V2`
- Checkpoint: `feat(live): complete cloud-to-live-studio audio e2e`
