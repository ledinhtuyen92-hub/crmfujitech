# Phase 1G-4 Stream Health — Audit & Design Plan

## 1. Existing Event Audit

### Complete Source-Verified Event Contracts

All events are wrapped by `LiveConsoleEventService` in the standard envelope:
```json
{
  "event_version": "1.0",
  "event_type": "<EVENT_TYPE>",
  "timestamp": "ISO-8601",
  "session_id": "UUID",
  "message_id": "UUID",
  "correlation_id": "UUID | null",
  "payload": { ... }
}
```

---

#### `live.device.heartbeat`
**Source**: `DeviceAgentConsumer.receive()` → `consumers.py:155–165`  
**Emitted by**: Backend when a `device.heartbeat` frame arrives from the Windows Local Studio.  
**Frequency**: Periodic — driven by the device runtime. Interval not hardcoded in backend; controlled by local runtime clock.
```json
{
  "uptime_seconds": 120,
  "execution_state": "idle | initializing | ready | playing | error",
  "capabilities_version": "1.0.0"
}
```
**Safe for frontend**: ✅ Yes. No credentials.  
**Security notes**: Capabilities payload (`capabilities`) is stripped from the safe payload. Only `uptime_seconds`, `execution_state`, `capabilities_version` are forwarded.

---

#### `live.stream.status`
**Source**: `DeviceAgentConsumer.receive()` → `consumers.py:167–180`  
**Emitted by**: Backend when a `stream.status` event is received from the Windows Local Studio (`main.py:_on_stream_state_change`).  
**Values**: The `state` field corresponds exactly to `StreamState` enum in `stream_controller.py`:
```json
{
  "state": "IDLE | STARTING | LIVE | STOPPING | STOPPED | ERROR | RECONNECTING"
}
```
**Safe for frontend**: ✅ Yes. No credentials.  
**Note**: This is the most authoritative stream health signal. It is emitted on *every* state transition of the `StreamController`.

---

#### `live.stream_start.dispatched`
**Source**: `LiveOrchestrator.dispatch_stream_start()` → `orchestrator.py:111`  
**Emitted by**: Backend cloud (not device) when it successfully sends `stream.start` command to device.
```json
{
  "command_id": "UUID"
}
```
**Safe for frontend**: ✅ Yes. No stream URL or credentials in this event.  
**Note**: Signals that the cloud has dispatched the command. Does NOT mean the stream is actually started. Stream confirmation only arrives via `live.stream.status: LIVE`.

---

#### `live.stream_stop.dispatched`
**Source**: `LiveOrchestrator.dispatch_stream_stop()` → `orchestrator.py:169`  
**Emitted by**: Backend cloud when it sends `stream.stop` command to device.
```json
{
  "command_id": "UUID"
}
```
**Safe for frontend**: ✅ Yes.  
**Note**: Similarly, confirmation only arrives via `live.stream.status: STOPPED`.

---

#### `live.session.status_changed`
**Source**: `LiveSession.change_status()` → `models.py` (Phase 1G-2)  
**Emitted by**: Backend on any session state machine transition.
```json
{
  "session_id": "UUID",
  "previous_status": "draft | ready | running | paused | human_takeover | stopped | error",
  "new_status": "..."
}
```
**Safe for frontend**: ✅ Yes.  
**Relevance to health**: If `new_status` is `stopped` or `error`, the stream is definitively terminated regardless of `live.stream.status` signals.

---

### NOT Yet Emitted (Gaps)

The Windows Local `StreamController` tracks all of these internally but **does NOT currently send any metrics upstream**:
- Bitrate (configured as a static target in `stream.start` payload; actual runtime bitrate not reported)
- FPS (same — configured, not reported at runtime)
- Dropped frames
- FFmpeg stderr / health log
- CPU / RAM usage
- Network latency to RTMP target

**Verdict**: None of these metrics are currently available in any backend event. They MUST NOT be displayed in the frontend.

---

## 2. Available Signals

### A. AVAILABLE NOW (from existing events)

| Signal | Source Event | Field |
|---|---|---|
| Device is online | `live.device.heartbeat` received | Presence of event |
| Device uptime | `live.device.heartbeat` | `uptime_seconds` |
| Device execution state | `live.device.heartbeat` | `execution_state` |
| Stream is LIVE | `live.stream.status` | `state == "LIVE"` |
| Stream is STARTING | `live.stream.status` | `state == "STARTING"` |
| Stream is STOPPING | `live.stream.status` | `state == "STOPPING"` |
| Stream is STOPPED | `live.stream.status` | `state == "STOPPED"` |
| Stream is ERROR | `live.stream.status` | `state == "ERROR"` |
| Stream is RECONNECTING | `live.stream.status` | `state == "RECONNECTING"` |
| Stream is IDLE | `live.stream.status` | `state == "IDLE"` |
| Cloud dispatched start cmd | `live.stream_start.dispatched` | present |
| Cloud dispatched stop cmd | `live.stream_stop.dispatched` | present |
| Session status | `live.session.status_changed` | `new_status` |

### B. DERIVABLE SAFELY

| Derived Signal | How |
|---|---|
| "Last seen" heartbeat timestamp | Store `Date.now()` in React state on each heartbeat; compute seconds elapsed with `setInterval` in UI |
| Device is STALE / OFFLINE | If no heartbeat event for > **30 seconds**, mark device as stale (frontend-only heuristic) |
| Stream is "pending start" | `live.stream_start.dispatched` received but no `live.stream.status: LIVE` yet |

### C. NOT AVAILABLE (do not fabricate)

- Bitrate (runtime), FPS (runtime), dropped frames, CPU, RAM, network latency, RTMP server quality, viewer count

---

## 3. Health State Model

The health panel will compute a single **composite `healthState`** from the combination of device + stream signals.

```
HEALTHY       = device online + session running + stream LIVE
STARTING      = stream_start.dispatched OR stream.status == STARTING
RECONNECTING  = stream.status == RECONNECTING
DEGRADED      = device online, stream ERROR (but retry in progress)
ERROR         = stream.status == ERROR AND retry_count exhausted (max 3)
OFFLINE       = no heartbeat for > 30s OR device execution_state == "error"
STOPPED       = stream.status == STOPPED OR session.status == stopped
IDLE          = device online, stream IDLE (before start command)
```

**Priority rules** (when multiple signals exist):
1. Session `stopped/error` → override all → `STOPPED / ERROR`
2. `live.stream.status` is most authoritative for stream state
3. Heartbeat freshness governs device health independently

---

## 4. Heartbeat / Staleness Strategy

**Approach**: Frontend-only, no new backend infrastructure.

- On each `live.device.heartbeat` event → record `lastHeartbeatAt = Date.now()` in component state.
- A `useEffect` sets a `setInterval` at **5-second** cadence to compute `secondsSinceHeartbeat = (Date.now() - lastHeartbeatAt) / 1000`.
- If `secondsSinceHeartbeat > 30` → mark device as **STALE**.
- If `secondsSinceHeartbeat > 60` → mark device as **OFFLINE**.
- On reconnect (new heartbeat arrives), staleness is cleared immediately.

**No new backend infrastructure required.**

---

## 5. Frontend UX — Stream Health Panel

A compact, always-visible card at the top of the Live Studio page (alongside Device Health from 1G-1).

```
┌─────────────────────────────────────────────────┐
│  Stream Health                          ● Realtime │
│                                                   │
│  ● Device           Online (3s ago)               │
│  ● Execution        Playing                       │
│  ● Session          Đang LIVE                     │
│  ● Stream           LIVE ✓                        │
│                                                   │
│  Uptime: 1h 23m 15s                               │
└─────────────────────────────────────────────────┘
```

**States and their visual representation:**

| Stream State | Color | Icon | Label |
|---|---|---|---|
| LIVE | green | `CheckCircleFilled` | Đang phát LIVE |
| STARTING | blue | `LoadingOutlined` (spin) | Đang khởi động... |
| STOPPING | orange | `LoadingOutlined` | Đang dừng... |
| STOPPED | gray | `StopOutlined` | Đã dừng |
| ERROR | red | `CloseCircleFilled` | Lỗi kết nối |
| RECONNECTING | yellow/amber | `SyncOutlined` (spin) | Đang kết nối lại... |
| IDLE | gray | `PauseCircleOutlined` | Chờ lệnh |
| Device STALE | amber | `ExclamationCircleOutlined` | Thiết bị không phản hồi |
| Device OFFLINE | red | `DisconnectOutlined` | Thiết bị ngoại tuyến |

**Layout decision**: Merge `StreamHealthCard` into the existing "Realtime Device Health" card in `LiveStudioBeta.jsx` as a second row. This avoids adding a third card and keeps the panel compact.

```
┌──────────────────────────────────────────────────────────────┐
│ Realtime Status                                ● WS Connected │
│                                                               │
│ ROW 1 — Device                                                │
│  [Device: Online]  [Execution: Playing]  [Uptime: 1h 23m]    │
│                                                               │
│ ROW 2 — Stream                                                │
│  [Stream: LIVE ●]  [Start: Dispatched]  [Last heartbeat: 3s] │
└──────────────────────────────────────────────────────────────┘
```

---

## 6. Required Backend Changes

**None.** All required events already exist:
- `live.stream.status` ✅
- `live.device.heartbeat` ✅
- `live.stream_start.dispatched` ✅
- `live.stream_stop.dispatched` ✅
- `live.session.status_changed` ✅

The backend is complete for this checkpoint.

---

## 7. Components to Create / Modify

| File | Action | Description |
|---|---|---|
| `frontend/src/pages/live/LiveStudioBeta.jsx` | Modify | Add stream health state tracking; expand Device Health card with stream row |
| `frontend/src/pages/live/components/StreamHealthRow.jsx` | New | Self-contained stream status row with stale-detection timer |

The `useLiveWebSocket` hook is already in place — no changes needed.

---

## 8. Tests Required

- No backend tests required (no backend changes).
- Frontend manual verification:
  1. When `live.stream.status: LIVE` arrives → stream row shows green "Đang phát LIVE"
  2. When `live.stream.status: RECONNECTING` arrives → amber spinner "Đang kết nối lại..."
  3. When `live.stream.status: ERROR` arrives → red "Lỗi kết nối"
  4. When no heartbeat for > 30s → device row shows amber "Thiết bị không phản hồi"
  5. When `live.stream_start.dispatched` arrives before `LIVE` → stream row shows "Đang khởi động..."
  6. `live.stream.status: STOPPED` → gray "Đã dừng"

---

## 9. Known Limitations

1. **No runtime bitrate/FPS**: The Windows `StreamController` does not emit these metrics upstream. They are intentionally excluded from the UI.
2. **RECONNECTING is transient**: The local Studio retries up to `max_retries=3`. After 3 failures it transitions to `ERROR`. The frontend will show `RECONNECTING` for the duration of the retry window (up to ~14 seconds at max backoff).
3. **Staleness heuristic only**: The 30s threshold for "STALE" is a frontend estimate. It cannot distinguish between a dead device and a slow network. The backend has no explicit device-offline event.
4. **WS disconnect masks stream health**: If the admin WebSocket drops, no new stream events can arrive. The health panel will remain showing the last known state until reconnect.

---

## 10. Acceptance Criteria

- [ ] Stream Health panel is visible on `/live/studio/:id`
- [ ] `live.stream.status` transitions reflected in ≤1s
- [ ] Device staleness detected client-side at 30s threshold
- [ ] No bitrate, FPS, CPU, RAM, or viewer metrics displayed (none available)
- [ ] No credentials, stream keys, or RTMP URLs displayed
- [ ] `/live/console` diagnostic tool unaffected
- [ ] `npm run build` passes
- [ ] No backend code changed
