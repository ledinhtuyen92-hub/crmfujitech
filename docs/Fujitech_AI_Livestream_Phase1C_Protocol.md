# PHASE 1C: DEVICE AGENT PROTOCOL DESIGN (REVISION 2)

## 1. REPOSITORY AUDIT SUMMARY

### A. What already exists
- **Models**: `LivePlatformProduct`, `LiveDevice`, `LiveSession` exist in the `live_sessions` app.
- **IDs**: `LiveDevice` and `LiveSession` use `UUID4` natively.
- **Authentication**: `DeviceTokenAuthentication` handles device-specific authentication using the `Authorization: Device ldt_<device_id_hex>_<secret>` header format.
- **State Machine**: `LiveSession` implements a state machine with statuses: `draft`, `ready`, `running`, `paused`, `human_takeover`, `stopped`, `error`.
- **API Endpoints**: REST ViewSets (`LiveDeviceViewSet`, `LiveSessionViewSet`, `DeviceSessionViewSet`) provide CRUD operations and control endpoints (`heartbeat`, `status`).
- **Context Storage**: `LiveContextService` manages runtime state in Redis (DB 2) with a 24h TTL.
- **Conventions**: 
  - Standard DRF Pagination (`PageNumberPagination`, default 25/page).
  - Standard DRF Error formats (e.g., `{"detail": "..."}`).
  - No API version prefixes (`/api/live_sessions/...`).
  - Redis DB 0 for Channels (WebSockets), DB 1 for Celery, DB 2 for LiveContext.

### B. What Phase 1C can reuse
- **Authentication**: `DeviceTokenAuthentication` is secure, persistent, and perfectly suited for Device Agent <-> Cloud communication.
- **Session Lifecycle**: The existing `change_status` logic in `LiveSession`.
- **Control Endpoints**: `/api/live_sessions/device/sessions/<id>/heartbeat/` and `status` can be extended.
- **Redis & Celery Boundaries**: Defined logical separation of DBs for state, cache, and messaging.

### C. What does not exist
- Message envelope schema for bidirectional event/command streaming.
- Specific command structures (`speech.speak`, `avatar.action`).
- Event structures (`event.comment`).
- Command ID vs Message ID distinction.
- Sequence semantics and freshness guarantees.
- Structured Capability Negotiation protocol.

### D. What must NOT be introduced yet
- WebSocket consumers/Channels implementation.
- TTS generation logic or integrations.
- Avatar rendering or Lip Sync code.
- Actual platform scraping (TikTok/Shopee integration).
- AI Sales logic execution inside the Live Studio.

---

## 2. THE DEVICE AGENT ROLE & ARCHITECTURAL BOUNDARY

**Architectural Boundary Preservation:**
- **Cloud (Intelligence):** Responsible for AI Core, RAG, Product Truth, Sales Engine, Live Orchestrator, and business decisions. The Cloud dictates *what* to do.
- **Device Agent (Execution):** Strictly an execution client (Fujitech Live Studio, Cloud GPU Worker, Dedicated GPU Worker). The Device decides *how* to execute it locally.

**Device Agent Responsibilities:**
- Authenticate via Device Token.
- Establish connection to an assigned `LiveSession`.
- Report hardware/software health (heartbeat) and structured capabilities.
- Forward platform events (comments, likes, viewer joins) to the Cloud.
- Receive execution commands (speak, animate) from the Cloud.
- Acknowledge command receipt and report execution results.

**Explicit Non-Responsibilities:**
- Does **NOT** decide what to say.
- Does **NOT** fetch product information independently.
- Does **NOT** manage the overall business lifecycle of the session.

---

## 3. COMPONENT RESPONSIBILITIES

To maintain clean architecture, responsibilities are explicitly divided as follows:

1. **REST API Responsibility:**
   - Authentication (Device Token issuance & validation).
   - Session initialization, startup, and tear-down.
   - Heavy/infrequent control endpoints (Capability negotiation, periodic polling heartbeats, uploading large static logs).

2. **WebSocket Responsibility:**
   - Millisecond-latency bidirectional data plane.
   - Forwarding high-frequency events (`event.comment`, `event.like`).
   - Pushing real-time commands (`speech.speak`, `avatar.action`) and receiving ACKs.

3. **Redis Responsibility:**
   - **DB 0 (Channels):** Pub/Sub broker for WebSocket routing.
   - **DB 1 (Celery):** Background task queuing (e.g., async audio generation, RAG document processing).
   - **DB 2 (LiveContext):** Current runtime state snapshot (e.g., current product being discussed, current viewer count). *Note: LiveContext is strictly for state, it is NOT a command queue.*

4. **Celery Responsibility:**
   - Handling heavy, non-blocking asynchronous business logic (e.g., executing the AI Core to generate sales responses after receiving an event, triggering TTS remote generation).

---

## 4. MESSAGE ENVELOPE SCHEMA & IDENTIFIERS

All messages over the WebSocket (Command, Event, ACK) share a standardized envelope.

```json
{
    "protocol_version": "1.0",
    "type": "command | event | ack",
    "name": "namespace.action",
    "message_id": "uuid4",
    "timestamp": "iso8601",
    "sequence_number": 1234,
    "session_id": "uuid4",
    "payload": {}
}
```

### Identifier Semantics
- `message_id`: A unique identifier for this specific transmission envelope. If a transmission fails and is retried, the *new* transmission gets a *new* `message_id`.
- `command_id` (Inside Payload): A stable identifier for the underlying business command (e.g., the specific action to speak "Hello"). Used for command idempotency and deduplication.
- `correlation_id` (Inside Payload): Binds an event (e.g., user comment) to its resulting command (e.g., AI reply) for tracing.

### Ordering & Sequence Semantics
- `sequence_number`: A strictly monotonically increasing integer.
- Sequences are scoped **per session, per direction** (e.g., one sequence counter for Cloud $\rightarrow$ Device commands, another for Device $\rightarrow$ Cloud events).
- Used to detect dropped packets or reorder out-of-order deliveries.

### Replay & Freshness Protection
- **Timestamp + Bounded Window:** Realtime messages have a freshness window (e.g., 30 seconds). If the `timestamp` is older than the window, the message is dropped.
- **Message Deduplication:** The receiving side maintains an LRU cache of recently processed `message_id`s to silently drop network-level duplicate transmissions.

---

## 5. DEVICE → CLOUD EVENTS

**1. `device.heartbeat` (via REST API)**
- **Purpose:** Liveness probe and capability negotiation.
- **Payload:**
  ```json
  {
      "uptime_seconds": 3600,
      "execution_state": "idle | initializing | ready | playing | error",
      "capabilities_version": "1.0",
      "capabilities": {
          "environment": {
              "type": "local_studio | cloud_gpu_worker | dedicated_gpu",
              "os": "windows_10"
          },
          "rendering": {
              "avatar_engine": "fujitech_v1",
              "max_resolution": "1080p",
              "lip_sync_supported": true
          },
          "audio": {
              "tts_mode": "remote",
              "local_models": []
          }
      }
  }
  ```

**2. `event.comment` (via Data Plane)**
- **Payload:**
  ```json
  {
      "platform": "tiktok",
      "comment_id": "123456789",
      "viewer_name": "user123",
      "text": "Sản phẩm này có màu đen không?",
      "product_context": "product_uuid_if_detected"
  }
  ```

**3. `command.ack` (via Data Plane)**
- **Purpose:** Acknowledge receipt or execution result of a command.
- **Payload:**
  ```json
  {
      "command_id": "uuid_of_business_command",
      "reference_message_id": "uuid_of_envelope_received",
      "status": "received | completed | failed",
      "error_detail": "null_or_string"
  }
  ```

---

## 6. CLOUD → DEVICE COMMANDS

**1. `session.control`**
- **Payload:** 
  ```json
  {
      "command_id": "uuid4",
      "action": "pause | resume | stop"
  }
  ```

**2. `speech.speak`**
- **Payload:**
  ```json
  {
      "command_id": "uuid4",
      "correlation_id": "uuid4_of_comment_event",
      "text": "Có bạn nhé, sản phẩm có màu đen.",
      "audio_asset": {
          "asset_id": "asset_uuid",
          "signed_url": "https://cdn.../temp-audio.mp3?sig=...",
          "expires_at": "iso8601"
      },
      "interruptible": true,
      "priority": "high | normal"
  }
  ```
  *(Note: Audio uses an abstraction `audio_asset` with signed/temporary URLs and expiration, avoiding assumptions of permanent public URLs).*

**3. `avatar.action`**
- **Payload:** 
  ```json
  {
      "command_id": "uuid4",
      "action": "point_left",
      "duration_ms": 2000
  }
  ```

---

## 7. COMMAND QUEUE & DELIVERY SEMANTICS

- **Deduplication (`command_id`):** `speech.speak` deduplication MUST use `command_id`. If the network drops an ACK, the Cloud may retry sending the same `command_id` inside a new envelope with a new `message_id`. The Device must recognize the `command_id` and silently ACK without executing it twice.
- **Expiration (`expires_at`):** Used in the audio asset or command itself to prevent executing stale commands if the device disconnects and reconnects later.

---

## 8. IDEMPOTENCY RULES

Idempotency is **state-aware**, not blindly infinite.

- **`session.control` (State-Aware Idempotency):**
  - Stop when already stopped $\rightarrow$ safe success (`already_stopped`).
  - Pause when already paused $\rightarrow$ safe success.
  - Resume when already running $\rightarrow$ safe success.
  - Invalid state transition (e.g., Pause when Stopped) $\rightarrow$ `INVALID_STATE` error.
- **`config.update`:** Idempotent (last-write-wins).
- **`avatar.action`:** Conditionally idempotent. Rely on `command_id` deduplication to avoid awkward visual glitches (e.g., waving twice).
- **`speech.speak`:** Non-idempotent inherently. **Must** be strictly deduplicated by the Device using `command_id`.

---

## 9. ERROR CONTRACT

Standardized error structure for WebSocket protocol errors:

```json
{
    "protocol_version": "1.0",
    "type": "error",
    "reference_message_id": "uuid_of_failed_message",
    "payload": {
        "error_code": "COMMAND_EXPIRED | INVALID_STATE | AUTH_FAILED | EXECUTION_FAILED | DUPLICATE_COMMAND",
        "detail": "Human readable description."
    }
}
```

---

## 10. PHASE 1C IMPLEMENTATION BOUNDARY

This document defines the protocol contract.

**DO NOT IMPLEMENT YET:**
- Do not modify source code.
- Do not create migrations.
- Do not create `schemas.py` or Pydantic models.
- Do not create WebSocket `consumers.py`.
- Do not implement AI logic, TTS, or scraping.

---

**PHASE 1C PROTOCOL SPECIFICATION VERIFIED**
