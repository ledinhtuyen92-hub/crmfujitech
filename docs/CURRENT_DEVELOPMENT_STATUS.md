# Fujitech AI Livestream - Current Development Status

Đây là tài liệu "bộ nhớ dự án" phản ánh trạng thái HIỆN TẠI của repository liên quan đến tính năng AI Livestream. Tài liệu này giúp lập trình viên/AI tiếp tục phát triển mà không phụ thuộc vào bối cảnh lịch sử hội thoại cũ.

==================================================
## 1. PROJECT OVERVIEW
==================================================
- **Project name:** Fujitech CRM
- **Backend architecture:** Django REST Framework (Python), monolithic, REST API.
- **Frontend architecture:** React (Vite) + React Router v6 + Ant Design.
- **Database:** PostgreSQL.
- **Cache & Message Broker:** Redis.
- **Background Tasks:** Celery + Celery Beat.
- **Real-time / WebSocket:** Django Channels.
- **Deployment:** Docker & Docker Compose.
- **AI Architecture:** Multi-provider LLM (OpenAI, Gemini, Anthropic), Vector RAG.
- **Multi-tenant architecture:** Cách ly dữ liệu dựa trên `company` (ForeignKey) ở mọi model quan trọng.

==================================================
## 2. AI LIVESTREAM ARCHITECTURE
==================================================
Kiến trúc chia làm 2 phần chính (Cloud & Local):

**Cloud (Backend CRM):**
- **AI Core:** Core điều phối model ngôn ngữ (OpenAI/Gemini/Anthropic).
- **RAG:** Cung cấp context từ tài liệu nội bộ dựa trên sản phẩm.
- **Product Truth:** Dữ liệu chuẩn xác về giá, SKU, kho từ hệ thống (tránh AI hallucination).
- **Live Context:** Sliding window chat history lưu trong Redis (`LiveContextService`).
- **Live Orchestrator:** Trái tim điều phối luồng (nhận comment -> RAG -> AI -> TTS -> WebSocket).
- **TTS:** Text-To-Speech provider (hiện tại là OpenAI TTS).
- **Platform Adapter:** Lớp trừu tượng giao tiếp với Shopee/TikTok (ShopeeAdapter).
- **Live Session Management:** Quản lý state machine (Draft, Ready, Running, Paused, Human Takeover).
- **Device Management:** Quản lý Live Studio (thiết bị vật lý).

**Local (Live Studio Device - `live_studio/`):**
- **Execution Core:** Điều phối quá trình chạy.
- **WebSocket Client:** Kết nối đến Django Channels bằng Device Token.
- **Protocol Dispatcher:** Phân luồng Command/Event/Ack.
- **Sequence Validator:** Đảm bảo thứ tự bản tin (không rớt/lặp).
- **Dedup Registry:** Chống trùng lặp xử lý command.
- **Speech Queue:** Hàng đợi phát âm thanh.
- **Audio Worker / Avatar Engine / Lip Sync:** Xử lý media (PyGame, PyAudio).
- **ACK Manager:** Phản hồi trạng thái về Cloud.

**Flow tổng thể:**
```text
Customer Comment
    ↓
Platform / Test Event (Celery polling)
    ↓
LiveCommentEvent
    ↓
handle_live_message (Celery Task)
    ↓
Live Orchestrator
    ↓
Product Truth (Database)
    ↓
RAG (Chroma/Vector)
    ↓
AI Core (Intent / Action)
    ↓
TTS (Audio creation)
    ↓
Audio Asset (Local Storage / Signed URL)
    ↓
speech.speak (Command Payload)
    ↓
WebSocket (Channels)
    ↓
Live Studio (Device)
    ↓
Audio / Avatar (Playback)
    ↓
ACK_COMPLETED -> Cloud
```

==================================================
## 3. DEVELOPMENT PHASE STATUS
==================================================
| Phase | Status | Description | Evidence / Notes |
|------|--------|-------------|------------------|
| Phase 1A | GREEN | Khởi tạo AI Core cơ bản | AI Agent, LLM Provider models (`models.py`). |
| Phase 1B | GREEN | Khởi tạo RAG cơ bản | Kiến thức dạng Document, Chunking (`rag_processor.py`). |
| Phase 1C-A | GREEN | Livestream Data Schema | Models ban đầu (LiveSession, LiveDevice). |
| Phase 1C-B | GREEN | Livestream Control API | Device Token Auth, Protocol envelope cơ sở. |
| Phase 1D-1 | GREEN | Audio/TTS Protocol | Giao thức truyền tải `speech.speak`, `LocalAudioStorageBackend`. |
| Phase 1D-2 | GREEN | Platform Product Mappings | `LivePlatformProduct` model, affiliate URLs. |
| Phase 1D-2.1 | GREEN | Local Device Core | `live_studio/` execution flow (Mock mode). |
| Phase 1D-3A | GREEN | Context Engine | `LiveContextService` Redis caching sliding window. |
| Phase 1D-3C | GREEN | Live Orchestrator | Base `LiveOrchestrator` flow. |
| Phase 1D-4 | GREEN | Multi-Platform Adapter | Lớp Interface chuẩn bị cho Shopee/TikTok. |
| Phase 1D-7A | GREEN | Credential Encryption | `PlatformAccount` security với Fernet encryption. |
| Phase 1D-7B | GREEN | Shopee OAuth Integration | OAuth2 flow, Refresh tokens, Partner Auth. |
| Phase 1D-7C | GREEN | Shopee Product Sync | Pull products, price override, mapping. |
| Phase 1D-7D | GREEN | Shopee Live Session Link | Gắn Session CRM với Shopee Live Session ID. |
| Phase 1D-7E | GREEN | Shopee Comment Polling | Celery Beat polling API Shopee, Deduplication. |
| Phase 1D-7F | GREEN | Live Response Pipeline | RAG + Product Truth + Intent/Action router. |
| Phase 1D-7G | GREEN | AI -> TTS -> Avatar | Ánh xạ cấu hình giọng nói AI sang Audio TTS. |
| Phase 1D-7H | YELLOW | Real E2E Validation | Level 1 (Mocked E2E) = GREEN (24/24 Tests). Level 2 (Real Environment) = BLOCKED (Thiếu Windows Host có Python/Audio driver + OpenAI DB credential config issue). |

==================================================
## 4. CURRENT VERIFIED CAPABILITIES
==================================================
- AI Agent & Multi-provider LLM.
- RAG & Product-scoped RAG.
- Product Truth (Live Price Override from Platform).
- Live Context (Sliding Window in Redis).
- Live Session & State Transitions.
- Live Device & Device token authentication.
- WebSocket Channels & Protocol envelope.
- Command sequence handling & Deduplication (Redis).
- Speech Queue, TTS Generation, Audio Storage & Signed URL serving.
- Human Takeover (State machine suppression).
- Shopee OAuth, Product Mapping, Live Comment polling.
- Platform Credentials Encryption.
- Tenant isolation (company-scoped models).

==================================================
## 5. TEST STATUS
==================================================
- **Relevant Test Suites:** `live_sessions/tests_*.py`, `live_studio/tests/test_*.py`
- **Unit Tests Coverage:** Hàng chục unit test cho Orchestrator, Auth, Platforms, Protocol, Websocket.
- **Latest E2E Test (Phase A/B Live Test Console):** 3/3 PASS (GREEN).
- **Validation Level 1 (Fully Mocked E2E):** GREEN.
- **Validation Level 2 (Real System/Device):** BLOCKED (thiếu môi trường).
- **Validation Level 3 (Real Shopee):** BLOCKED (phụ thuộc Level 2).

==================================================
## 6. CURRENT BLOCKERS
==================================================
| Blocker | Impact | Status | Resolution |
|----------|--------|--------|------------|
| Missing Windows Host | Thiết bị `live_studio/` không thể chạy trên môi trường Linux Docker (yêu cầu PyGame/PyAudio cho giao diện Avatar/Audio driver). | BLOCKED (Validation L2) | Developer cần chạy `live_studio/main.py` trên Windows Host thực tế. |
| OpenAI API Key | Database `CompanyAiKey` có key thật, nhưng `OpenAITTSProvider` trong `LiveOrchestrator` hiện tại lại đang dựa vào biến môi trường `settings.OPENAI_API_KEY` (Technical Discrepancy). | BLOCKED (Validation L2) | Yêu cầu user config biến môi trường hoặc refactor `OpenAITTSProvider` để đọc key từ Database như `generate_ai_reply()`. |

==================================================
## 7. TECHNICAL DEBT
==================================================
- **MVP Limitation:** Orchestrator hiện đang chờ phản hồi đồng bộ từ TTS API OpenAI (blocking operation bên trong ASGI/Celery).
- **MVP Limitation:** RAG đang dựa trên Google GenAI nhúng trực tiếp; ChromaDB nhúng; nên không tối ưu cho high-concurrency (nhưng phù hợp MVP).
- **Technical Debt:** `OpenAITTSProvider` bị cứng hóa phụ thuộc vào `settings.OPENAI_API_KEY`, không dùng chung luồng luân chuyển API Key đa tenant của hệ thống AI Core (đã ghi nhận trong blocker).

==================================================
## 8. SECURITY RULES
==================================================
- Multi-tenant isolation: Tất cả query `LiveSession`, `Product`, `LiveDevice` phải filter theo `company`.
- Device authentication: Websocket của Device dùng `ldt_<uuid>_<secret>` được hash tại backend.
- Platform credential encryption: `PlatformAccount` token được lưu trữ mã hóa 2 chiều an toàn bằng Fernet key.
- Signed audio URL: Tài nguyên audio chỉ được tải bởi chính thiết bị thuộc cùng `company` qua token dùng 1 lần/ký điện tử.
- API key protection: Frontend không bao giờ được chạm vào OPENAI_API_KEY hoặc Access Token của Shopee.

==================================================
## 9. IMPORTANT ARCHITECTURE RULES
==================================================
1. **Reuse existing AI Core:** Không tạo luồng API riêng gọi AI bên ngoài `generate_ai_reply()`.
2. **Reuse existing RAG:** Dùng `search_knowledge()`.
3. **Product Truth must come from authoritative runtime data:** Không lấy giá/tồn kho từ RAG; phải gọi từ database (ví dụ: `LivePlatformProduct.live_price_override`).
4. **LLM must not invent affiliate URLs:** Platform/URL mapping do hệ thống xử lý, không để AI tự bịa URL.
5. **Backend is source of truth for session state:** Frontend/Device không được tự đổi trạng thái. Mọi chuyển đổi (Play/Pause) phải đi qua Backend `change_status()`.
6. **Device is execution client, not business logic:** Thiết bị chỉ thực thi `speech.speak` và trả về `ACK`, không quyết định phản hồi khách hàng.
7. **Cloud owns AI/business decisions:** Orchestrator là trái tim logic.
8. **Admin/Test UI must not become part of core AI business logic:** Test UI (Console) chỉ emit event qua Channels, tách biệt khỏi luồng Livestream thật.
9. **Tenant isolation is mandatory.**
10. **Do not bypass protocol:** Websocket sử dụng Protocol Envelope chuẩn có sequence/command id.

==================================================
## 10. CURRENT FILE / MODULE MAP
==================================================
```
backend/
├── ai_agents/ (Core RAG & LLM Router)
│   ├── services.py
│   ├── rag_processor.py
│   └── models.py
├── live_sessions/ (Livestream Core)
│   ├── audio/ (TTS & Storage)
│   ├── platforms/ (Shopee/TikTok abstract adapters)
│   ├── protocol/ (Envelope/Command/Ack Serializers)
│   ├── consumers.py (Websockets: DeviceAgentConsumer, AdminConsoleConsumer)
│   ├── orchestrator.py (Trái tim: Xử lý comment -> AI -> TTS)
│   ├── tasks.py (Celery: handle_live_message, poll_shopee_live_comments)
│   ├── views.py (REST API: Start, Pause, HT, Test-Comment)
│   ├── models.py
│   ├── console_events.py (Admin Observability emitter)
│   └── routing.py
frontend/
├── src/
│   ├── App.jsx (Routes)
│   ├── pages/ (React Pages)
│   └── utils/ (API Client, Auth)
live_studio/ (Mã nguồn Device thực thi trên Windows Host)
├── core/
├── execution/ (Avatar, Lip-Sync, Queue, Audio)
└── main.py
```

==================================================
## 11. IMPORTANT DATABASE MODELS
==================================================
- **LiveSession:** State machine, kết nối `device`, `product`, `ai_agent`, `platform_account`. Filter by `company`.
- **LiveDevice:** Quản lý thiết bị trạm (Live Studio), chứa `token_hash`.
- **PlatformAccount:** Lưu trữ thông tin kết nối OAuth (Shopee) có mã hóa Token.
- **LivePlatformProduct:** Ánh xạ từ sản phẩm hệ thống sang nền tảng bán hàng, lưu giá Flash Sale (`live_price_override`).
- **AiAgent:** Cấu hình giọng nói TTS (`tts_voice`, `tts_speed`).

==================================================
## 12. API MAP
==================================================
**Admin REST:**
- `GET /api/live-sessions/devices/`
- `GET /api/live-sessions/sessions/`
- `POST /api/live-sessions/sessions/`
- `POST /api/live-sessions/sessions/{id}/start/`
- `POST /api/live-sessions/sessions/{id}/stop/`
- `POST /api/live-sessions/sessions/{id}/pause/`
- `POST /api/live-sessions/sessions/{id}/resume/`
- `POST /api/live-sessions/sessions/{id}/human-takeover/`
- `POST /api/live-sessions/sessions/{id}/test-comment/` (Synthetic comment injection)

**Device REST:**
- `POST /api/live-sessions/device/sessions/{id}/heartbeat/`
- `GET /api/live-sessions/audio/{token}/` (Signed Audio URL)

==================================================
## 13. WEBSOCKET MAP
==================================================
- **DEVICE WEBSOCKET:**
  - `ws/live_sessions/<session_id>/device/`
  - *Authentication:* Subprotocol Bearer token `ldt_***` (DeviceAuthMiddlewareStack).
  - *Consumer:* `DeviceAgentConsumer` (Full duplex, commands, events, acks).
- **ADMIN/CONTROL WEBSOCKET:**
  - `ws/live_sessions/<session_id>/admin/`
  - *Authentication:* JWT token standard (JWTAuthMiddlewareStack).
  - *Consumer:* `AdminConsoleConsumer` (Read-only, nhận real-time event logs từ `LiveConsoleEventService`).

==================================================
## 14. CURRENT DEVELOPMENT TARGET
==================================================
**NEXT DEVELOPMENT TARGET:** "Live Test Console V1" (Phase C/D)

Mục tiêu hiện tại là hoàn tất giao diện frontend cho Live Test Console V1 (Tạo Session, Chọn cấu hình, Gửi Synthetic Comment, và Quan sát Event Timeline từ Websocket Admin). 
Backend infrastructure cho tính năng này (Phase A và B) đã được thực hiện và TEST GREEN. 
Việc tiếp theo là Code React Page.

==================================================
## 15. PROPOSED NEXT IMPLEMENTATION PLAN
==================================================
- **Phase A (Backend Console Infra):** IMPLEMENTED (GREEN)
- **Phase B (Backend Unit Testing):** IMPLEMENTED (GREEN)
- **Phase C (React Frontend UI):** PLANNED / NOT IMPLEMENTED YET
- **Phase D (E2E Frontend Integration):** PLANNED / NOT IMPLEMENTED YET

==================================================
## 16. ENVIRONMENT REQUIREMENTS
==================================================
- **Python:** 3.11 (Container)
- **Node:** >= 18 (Frontend Vite)
- **Database:** PostgreSQL
- **Cache & Task:** Redis + Celery
- **OpenAI API Key:** Required in `.env` hoặc Database.
- **Windows Live Studio requirements:** Yêu cầu chạy trên Host Windows (Không qua Docker), có cài đặt `pygame`, `pyaudio`, cần display (GUI) và thiết bị phát thanh (Audio Driver) để chạy `live_studio/main.py`.

==================================================
## 17. NEW MACHINE / DEVELOPER BOOTSTRAP
==================================================
1. Clone repository từ nhánh hiện tại (e.g. `V2`).
2. Build và khởi động Docker: `docker compose up -d`
3. Cài đặt dependency frontend: `cd frontend && npm install`
4. Cạy frontend dev server: `npm run dev`
5. Migrate database: `docker compose exec web python manage.py migrate`
6. (Optional cho Livestream): Chạy thiết bị nội bộ trên Windows Host:
   - Cài đặt Python env cục bộ cho `live_studio`.
   - `pip install -r requirements.txt` (nếu có, hoặc thủ công cài pygame/pyaudio).
   - Verify: `python live_studio/main.py`.
7. Đọc tài liệu: `docs/CURRENT_DEVELOPMENT_STATUS.md` và `docs/Fujitech_AI_Livestream_Master_Development_Specification_v1.1.md`.

==================================================
## 18. KNOWN DISCREPANCIES
==================================================
| Source | Current Reality | Action |
|--------|-----------------|--------|
| Phase 1D-7H Plan | Môi trường test không hỗ trợ Windows Host và thiếu OPENAI_API_KEY env. | Đình chỉ E2E L2 Test. |
| AI Core Credentials | Hệ thống AI Core đọc từ DB (`CompanyAiKey`), nhưng `OpenAITTSProvider` lại đọc từ `settings.OPENAI_API_KEY`. | Đã log vào Blockers / Technical Debt để refactor sau. |

==================================================
## 19. LAST UPDATED
==================================================
- **Last Updated:** 2026-09-28
- **Updated By:** AI-assisted development (Antigravity/Gemini)
- **Current Branch:** V2
- **Current Commit:** 030d36277becfb4d87d769e1cf1788d4c1a994ca
- **Repository Status:** Có file sửa đổi (`consumers.py`, `orchestrator.py`, `routing.py`, `views.py`) và tạo mới (`console_events.py`, `tests_console.py`).
