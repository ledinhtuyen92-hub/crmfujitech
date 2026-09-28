# PHASE 1C-B: WEBSOCKET DATA PLANE DESIGN (REVISED)

## 1. EXISTING CHANNELS ARCHITECTURE
- **ASGI Router:** `core/asgi.py` wraps `django_asgi_app` for HTTP and `ProtocolTypeRouter` for WebSocket.
- **Middleware:** WebSockets currently use `JWTAuthMiddlewareStack` (from `notifications/middleware.py`) which reads a token from the `?token=` query parameter, validates the JWT, and assigns `scope["user"]`.
- **Consumers:** `notifications/consumers.py` implements `NotificationConsumer` (inheriting `AsyncWebsocketConsumer`), rejecting connections if `scope["user"]` is unauthenticated (closes with code 4001) and adding authenticated users to a Channel Layer Group (`user_{user.id}_notifications`).
- **Channel Layer:** Configured to use `channels_redis.core.RedisChannelLayer` on Redis DB0 (`redis:6379/0`).

## 2. EXISTING AUTHENTICATION ARCHITECTURE
- **REST Device Auth:** `DeviceTokenAuthentication` handles `Authorization: Device ldt_<id>_<secret>`. It splits the token, performs a database lookup on `LiveDevice` via the hex ID, validates `device.is_active` and `device.company.is_active`, and finally verifies the secret against the stored `token_hash` using `check_password`.
- **Result:** Returns `(None, device)` ensuring the device acts as the authentication principal rather than a User.

## 3. DEVICE WEBSOCKET AUTHENTICATION DESIGN
- **Mechanism:** A new `DeviceAuthMiddleware` will be created specifically for `live_sessions`. 
- **Token Delivery:** 
  - **Preferred:** `Authorization: Device ldt_<id>_<secret>` via HTTP Headers during the WebSocket handshake.
  - **Fallback:** Query string `?device_token=ldt_<id>_<secret>` (if the specific WebSocket client cannot reliably send custom headers).
  - **Security Trade-off & Logging:** If query string is used, the full URL MUST NOT be logged. The query parameters MUST be redacted in access/error logs to prevent token leakage.
- **Validation (Bridge):** The middleware performs validation logic identical to `DeviceTokenAuthentication`, wrapped in `database_sync_to_async`.
- **Scope Injection:** If successful, it injects `scope["device"] = device`. If failed (invalid, revoked, disabled company), it injects `scope["device"] = AnonymousDevice()` (or `None`). The Consumer handles the explicit rejection to send proper close codes.

## 4. SESSION BINDING DESIGN
- **Routing:** WebSocket URL pattern `ws/live_sessions/<uuid:session_id>/device/`.
- **Validation (in Consumer `connect()`):**
  1. Verify `scope["device"]` is authenticated. If not, close `4001`.
  2. Fetch `LiveSession` by `session_id`.
  3. Verify `session.device_id == scope['device'].id`. If not, close `4003` (Forbidden).
  4. Verify `session.status` is not terminal (`stopped` or `error`). If it is, close `4004`.
- **Binding:** The connection is added to the Channel Group `live_session_{session_id}_device`.

## 5. PROTOCOL INTEGRATION DESIGN
- **No Duplication:** Consumer will NOT manually parse JSON fields.
- **Flow:**
  1. `receive(text_data)` decodes raw JSON.
  2. Passes data to `ProtocolEnvelopeSerializer(data=data)`.
  3. If invalid, Consumer returns an `error` envelope (`INVALID_SCHEMA`) and drops the message.
  4. If valid, extracts `validated_data['payload']` and routes to internal handlers.

## 6. MESSAGE FLOW
- **Device $\rightarrow$ Cloud:**
  - `event.comment`: Consumer validates envelope and dispatches an asynchronous Celery task.
  - `device.heartbeat`: Consumer updates runtime state in `LiveContextService` (Redis DB2).
  - `command.ack`: Updates state tracking in Cloud.
- **Cloud $\rightarrow$ Device:**
  - AI/Celery calls `channel_layer.group_send("live_session_{id}_device", {"type": "send_command", "envelope": {...}})`.
  - Consumer `send_command` serializes to JSON and sends down the WebSocket.

## 7. ACK SEMANTICS
- **`received`:** Sent by Device immediately after parsing a command envelope.
- **`completed`:** Sent by Device when execution (e.g., audio playback) finishes.
- **`failed`:** Sent by Device if execution breaks.
- Cloud AI does not block waiting for ACKs. ACKs update asynchronous state.

## 8. DEDUPLICATION DESIGN
- **Cloud Side:** Does not deduplicate outgoing commands.
- **Device Side:** Maintains an LRU Cache of `command_id`s. Duplicate `command_id`s (even inside a new `message_id`) trigger a `command.ack (received)` but execution is skipped.

## 9. SEQUENCE & ORDERING DESIGN
- **Ordering Authority:** Redis Pub/Sub (`channels_redis`) acts ONLY as the transport layer and does NOT guarantee absolute business command ordering across multiple concurrent producers. 
- **Ordering Contract:** `sequence_number` is the authoritative ordering contract. The Device is responsible for final execution-side ordering validation.
- **Scope:** Sequences remain **session-scoped and directional** (Cloud $\rightarrow$ Device, Device $\rightarrow$ Cloud).
- **Reconnect Semantics:** Sequence numbers do NOT reset on reconnect. Instead, the Device and Cloud perform a lightweight sequence synchronization using a dedicated control message: `session.sync`.

### `session.sync` (Control Message)
- **Purpose:** Synchronize directional session-scoped sequence state after initial connection or reconnection.
- **Direction:** 
  - *Device $\rightarrow$ Cloud:* báo cáo sequence state cuối cùng mà Device đã biết/đã xử lý.
  - *Cloud $\rightarrow$ Device:* xác nhận authoritative sequence state của Cloud và Device.
- **Rules:**
  - Không reset `sequence_number` khi reconnect.
  - Sequence vẫn session-scoped và directional.
  - Không tạo distributed sequence counter.
  - Không sử dụng LiveContext làm command queue.
  - `session.sync` chỉ dùng để khôi phục protocol state. Nó dùng chung cấu trúc `ProtocolEnvelope` hiện có.
  - Normal command execution chỉ được tiếp tục sau khi synchronization hoàn tất.
  - Tuyệt đối không dùng `device.heartbeat` để thay thế `session.sync`. Heartbeat vẫn giữ đúng trách nhiệm health/runtime state như thiết kế hiện tại.

## 10. FRESHNESS DESIGN
- **Bounded Window:** Checked using `timestamp` + freshness window (e.g. 30 seconds) on the Consumer's `receive()`.
- **Logic:** `if abs(now - timestamp) > 30s: send_error('COMMAND_EXPIRED')`.
- Relies on WSS (TLS) for transport security without unnecessary cryptographic layers.

## 11. SINGLE ACTIVE CONNECTION & DISCONNECT/RECONNECT DESIGN
- **Connection Identity:** Each WebSocket connection generates a unique `connection_id` (`UUID4`).
- **Active Ownership:** The Cloud maintains a registry of the active connection ID for a session (e.g., `session_{id}_device_active_connection = connection_id` stored in LiveContext state). LiveContext is NOT a command queue, just a state registry.
- **Replacement:** A new connection replaces the previous connection. The Cloud targets the old connection explicitly via its specific `channel_name` (or a dedicated connection control group) and sends a termination command (`close(4009)`). Group broadcast (`group_send`) is insufficient for targeted eviction.
- **Session Stopped:** If the Cloud stops the session, it explicitly broadcasts a close control event to terminate the active sockets.

## 12. DEVICE REVOCATION
- **Connect Check:** Checked synchronously during initial connection.
- **Runtime Revocation:** If a device is revoked or disabled while actively connected, the system will NOT use continuous database polling inside the Consumer. Instead, the administration interface (or Celery task) triggering the revocation will fire a targeted channel-layer event (e.g., `device.revoked`) to the active `connection_id`, commanding the Consumer to immediately terminate the socket.

## 13. REDIS DB0 RESPONSIBILITY
- **DB 0:** Strictly `channels_redis` Layer. Handles Pub/Sub for WebSockets. NO persistent business state.
- **DB 1:** Celery Message Broker / Result Backend.
- **DB 2:** `LiveContextService` (Runtime state snapshots, Active Connection Registry).

## 14. SECURITY DESIGN
- **Tenant Isolation:** Guaranteed by the ORM lookup linking `LiveSession` and `LiveDevice`.
- **Payload Limits:** Natively handled by ASGI server max message size config.

## 15. ERROR / CLOSE CODE DESIGN
- `4001`: Unauthorized (Invalid or missing token).
- `4003`: Forbidden (Device does not own the Session).
- `4004`: Session Not Found or Terminal (Stopped/Error).
- `4009`: Conflict (Replaced by a newer active connection).
- Protocol errors (e.g., `INVALID_SCHEMA`) do NOT close the socket.

## 16. CONCURRENCY DESIGN
- **Simultaneous Messages:** ASGI `receive()` handles incoming messages sequentially per connection.
- **Outbound Racing:** Multiple Celery tasks sending commands concurrently will traverse the Channel Layer. The Device executes or rejects them based on `sequence_number` and its internal state rules.

## 17. OBSERVABILITY
- **Logging:** Consumer methods use `logger.info/debug` with `extra={'device_id': ..., 'session_id': ..., 'message_id': ..., 'command_id': ...}`.
- **Redaction:** Full private `audio_url` fields, `text` payload contents, and Device Tokens (especially in URLs) MUST be redacted or excluded to avoid log bloat and token leakage.

## 18. EXACT FILES TO MODIFY/CREATE (No code will be written in this design phase)
**Create:**
- `backend/live_sessions/middleware.py` (DeviceAuthMiddleware)
- `backend/live_sessions/consumers.py` (DeviceAgentConsumer)
- `backend/live_sessions/routing.py` (WS URLs)
- `backend/live_sessions/tests_websocket.py` (Tests)

**Modify:**
- `backend/core/asgi.py` (Include new routing and middleware stack)

## 19. TEST PLAN
- **Authentication:** Preferred Headers vs Query-string fallback. Redaction tests. Valid/Invalid token.
- **Authorization:** Connect to a session owned by another device.
- **Single Connection:** Connect twice, assert first connection receives a targeted close event.
- **Revocation:** Connect successfully, then trigger a channel-layer revocation event, assert socket closes.
- **Sequence Synchronization:** Assert connections resume sequence numbers safely.
- **Protocol Integration:** Send valid/malformed JSON, assert `ProtocolEnvelopeSerializer` rules apply.
- **Freshness:** Send stale messages, assert `COMMAND_EXPIRED`.
- **Regression:** Phase 1A, 1B, and 1C-A tests must continue to pass.

## 20. ABSOLUTE SCOPE EXCLUSION
- **NO** implementation of the Consumer code yet.
- **NO** ASGI modifications yet.
- **NO** migrations.
- **NO** AI, TTS, Avatar, or Platform implementations inside the Consumer.

---

**PHASE 1C-B DESIGN VERIFIED**
