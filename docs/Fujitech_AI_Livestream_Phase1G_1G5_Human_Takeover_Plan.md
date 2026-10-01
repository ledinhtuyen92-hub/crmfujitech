# Phase 1G-5 Human Takeover & Live Controls — Audit & Design Plan

## 1. Endpoint Audit (Source-Verified)

All endpoints are registered under `live_sessions/sessions/` via DRF DefaultRouter.  
**Permission required for all actions**: `ai_agent.manage_agents`  
**Auth**: JWT (`IsAuthenticated`)  
**Tenant isolation**: `get_queryset()` filters by `request.user.company`

---

### `POST /live_sessions/sessions/:id/start/`
**View**: `LiveSessionViewSet.start()`  
**Allowed from**: `draft`, `ready` (auto-promotes draft→ready→running in one call)  
**Side effects**:
- Calls `change_status(RUNNING)`, sets `started_at`
- Calls `LiveOrchestrator.dispatch_stream_start()` → sends `stream.start` command to device
- Emits `live.stream_start.dispatched` + `live.session.status_changed`

**Response (200)**:
```json
{ "status": "running", "dispatch": { "status": "success", "command_id": "UUID", "message_id": "UUID" } }
```
**Response on invalid transition**: `django.core.exceptions.ValidationError` → **500** (not caught by view)  
**Response on dispatch failure**: 200 but `dispatch.status == "error"` with `reason`

---

### `POST /live_sessions/sessions/:id/stop/`
**View**: `LiveSessionViewSet.stop()`  
**Allowed from**: `running`, `paused`, `human_takeover`, `error`  
**Side effects**:
- Calls `change_status(STOPPED)`, sets `ended_at`
- Calls `LiveOrchestrator.dispatch_stream_stop()` → sends `stream.stop` command
- Emits `live.stream_stop.dispatched` + `live.session.status_changed`
- `STOPPED` is a **terminal state** — no further transitions possible

**Response (200)**:
```json
{ "status": "stopped", "dispatch": { "status": "success", ... } }
```
**Response on invalid transition**: **500**

---

### `POST /live_sessions/sessions/:id/pause/`
**View**: `LiveSessionViewSet.pause()`  
**Allowed from**: `running` only  
**Side effects**:
- Calls `change_status(PAUSED)`
- Emits `live.session.status_changed`
- Does NOT send any device command (AI engine pauses at session level)

**Response (200)**:
```json
{ "status": "paused" }
```
**Response on invalid transition**: **500**

---

### `POST /live_sessions/sessions/:id/human-takeover/`
**URL path**: `human-takeover` (note the hyphen, confirmed from `url_path='human-takeover'`)  
**View**: `LiveSessionViewSet.human_takeover()`  
**Allowed from**: `running` only  
**Side effects**:
- Calls `change_status(HUMAN_TAKEOVER)`
- Emits `live.session.status_changed`
- AI reply suppression handled by orchestrator's `live.ai.suppressed` path

**Response (200)**:
```json
{ "status": "human_takeover" }
```
**Response on invalid transition**: **500**

---

### `POST /live_sessions/sessions/:id/resume/`
**View**: `LiveSessionViewSet.resume()`  
**Allowed from**: `paused`, `human_takeover`  
**Side effects**:
- Calls `change_status(RUNNING)`
- Emits `live.session.status_changed`

**Response (200)**:
```json
{ "status": "running" }
```
**Response on invalid transition**: **500**

---

### Critical Finding: Error Response on Invalid Transitions

The view calls `change_status()` from `django.core.exceptions.ValidationError` directly, without a try/except in the view. DRF's default exception handler does **not** convert `django.core.exceptions.ValidationError` to a 400 — it results in a **500 Internal Server Error**.

**Frontend implication**: An invalid transition (e.g., clicking pause on an already-paused session due to stale UI) will return a 500. The frontend must:
1. Treat 500 as a "transition failed" scenario (not an application crash)
2. Reconcile state from the backend via a GET after any error response
3. Display a concise user-facing message without raw server text

---

## 2. State Transition Matrix

| Current Status | `start` | `pause` | `human-takeover` | `resume` | `stop` |
|---|---|---|---|---|---|
| `draft` | ✅ → `running` | ❌ | ❌ | ❌ | ❌ |
| `ready` | ✅ → `running` | ❌ | ❌ | ❌ | ❌ |
| `running` | ❌ | ✅ → `paused` | ✅ → `human_takeover` | ❌ | ✅ → `stopped` |
| `paused` | ❌ | ❌ | ❌ | ✅ → `running` | ✅ → `stopped` |
| `human_takeover` | ❌ | ❌ | ❌ | ✅ → `running` | ✅ → `stopped` |
| `stopped` | ❌ | ❌ | ❌ | ❌ | ❌ (terminal) |
| `error` | ❌ | ❌ | ❌ | ❌ | ✅ → `stopped` |

---

## 3. Control Visibility Rules

Controls are shown/hidden based on `session.status`. The frontend **never enables a button for a transition the backend would reject**.

| Session Status | Visible Controls |
|---|---|
| `draft` | **Bắt đầu LIVE** |
| `ready` | **Bắt đầu LIVE** |
| `running` | **Tạm dừng AI**, **Human Takeover**, **Dừng LIVE** |
| `paused` | **Tiếp tục AI**, **Dừng LIVE** |
| `human_takeover` | **Tiếp tục AI (Giao AI)**, **Dừng LIVE** |
| `stopped` | *(no controls — terminal)* |
| `error` | **Dừng LIVE** (clear terminal state) |

**All controls hidden when `actionLoading` is true** (command in flight).

---

## 4. Human Takeover UX

### Design Intent
Human Takeover is **not destructive** — it pauses AI and lets the operator speak manually. It is different from stopping the stream. The button must be clear but not alarming.

### Button Design

**In `running` state, show two separate buttons:**

```
[ Tạm dừng AI ]      → pause (AI queue stops, stream continues)
[ 👤 Người kiểm soát ]  → human-takeover (stronger: operator takes full control)
[ Dừng LIVE ]         → stop (destructive, requires confirmation)
```

**Distinction between Pause and Human Takeover:**
- `pause` = AI temporarily paused. Operator can resume quickly.
- `human_takeover` = Operator explicitly takes control. Visually distinct (amber badge, different icon).

**In `human_takeover` state:**
- Show amber banner: "⚠ Bạn đang kiểm soát thủ công. AI đã bị tắt."
- Show: `[ ✅ Giao lại cho AI ]` button (maps to `resume`)
- Show: `[ Dừng LIVE ]` button

**In `paused` state:**
- Show blue banner: "AI đang tạm dừng."
- Show: `[ Tiếp tục AI ]` button
- Show: `[ Dừng LIVE ]` button

---

## 5. Stop Confirmation UX

`stop` is a **terminal action** — once stopped, a session cannot be restarted. This requires clear confirmation.

**Design**: Use `Popconfirm` (already in use) with a stronger warning:

```
Bạn có chắc chắn muốn kết thúc phiên Live?
Hành động này không thể hoàn tác. Phiên sẽ bị kết thúc vĩnh viễn.

[ Huỷ ]   [ Dừng LIVE ]
```

No separate "emergency stop" endpoint exists. The single `stop` endpoint handles all stop scenarios. Treat it as a destructive confirmation flow, not as an emergency.

---

## 6. Loading / Pending Behavior

The existing `actionLoading` boolean is a single shared lock. This is sufficient.

**Rule**: When `actionLoading === true`:
- All control buttons are disabled/loading
- This prevents double-click and racing (pause + stop race)
- The lock is released only in the `finally` block of `handleAction`

**Enhancement needed**: The current `handleAction` shows a generic `message.success('Gửi lệnh thành công')` even though the state hasn't changed yet — the WS event provides the real confirmation. This is misleading. 

**Corrected behavior**:
- On successful REST response (200): show `message.info('Đã gửi lệnh — đang chờ xác nhận...')` (not "thành công")
- On WS `live.session.status_changed`: the UI updates automatically (already implemented)
- Do NOT show a fake "success" before WS confirmation arrives

---

## 7. Error Handling

| HTTP Status | Cause | Frontend Behavior |
|---|---|---|
| 500 | Invalid state transition (e.g., pause from paused) | Show: "Trạng thái hiện tại không cho phép thao tác này." + reconcile from GET |
| 403 | Missing permission | Show: "Bạn không có quyền thực hiện thao tác này." |
| 400 | Bad request (malformed) | Show: `err.response?.data?.detail` (already exists) |
| 404 | Session not found | Show: "Phiên Live không tồn tại." |
| Network error | WS/API unreachable | Show: "Mất kết nối. Vui lòng thử lại." |

**After any error**: reconcile state with `GET /live_sessions/sessions/:id/` (already in existing code).  
**Never display raw stack traces or Python exception strings.**

Error message extraction priority:
1. `err.response?.data?.detail` (string)
2. `err.response?.data` (first value if object)
3. Fallback: static user-facing message based on HTTP status code

---

## 8. Race Condition Strategy

| Scenario | Protection |
|---|---|
| Double-click "Start" | `actionLoading` lock — second click disabled |
| Pause + Stop race | Same `actionLoading` lock — only one in flight |
| Resume immediately after Pause | `actionLoading` held until first REST response returns |
| Stale UI (WS missed) | After any error, GET reconciles real state from DB |
| Backend rejects due to wrong state | 500 caught → message shown → GET re-syncs → correct buttons shown |

**No second state machine on the frontend.** The backend DB is the single source of truth. Frontend buttons are derived from `session.status` which is updated via WS or REST reconciliation.

---

## 9. Security

None of the control endpoints require or return:
- Stream key ✅ (never exposed)
- RTMP URL ✅ (never in responses)
- Device token ✅ (not used by frontend JWT auth)
- Access/refresh tokens ✅

`start` response includes `dispatch.command_id` and `dispatch.message_id` (UUIDs) — safe to log but not displayed in UI.

---

## 10. Components / Files to Modify

| File | Change |
|---|---|
| `frontend/src/pages/live/LiveStudioBeta.jsx` | Refactor `handleAction` error handling; fix misleading success message; add per-status alert banner (human_takeover / paused); adjust stop `Popconfirm` text |

**No new component needed.** All changes are within the existing `LiveStudioBeta.jsx`. The control buttons are already rendered in the header toolbar. The improvements are:
1. Better error message extraction
2. Correct pending vs. confirmed messaging
3. Amber/blue status banners for human_takeover and paused states
4. Stronger stop confirmation text
5. Optionally: extract the button toolbar into a `LiveControlBar` sub-component for clarity

---

## 11. Tests Required

Frontend (manual verification):
1. `draft` state → only "Bắt đầu LIVE" button visible
2. `ready` state → only "Bắt đầu LIVE" visible
3. `running` state → "Tạm dừng AI", "Người kiểm soát", "Dừng LIVE" visible
4. `paused` state → "Tiếp tục AI", "Dừng LIVE" visible; blue banner shown
5. `human_takeover` state → "Giao lại cho AI", "Dừng LIVE" visible; amber banner shown
6. `stopped` state → no control buttons
7. `error` state → only "Dừng LIVE" visible
8. Clicking any button while another is in-flight → disabled (race condition)
9. REST 500 on invalid transition → error message shown, no fake state change, GET reconciles
10. Stop button → Popconfirm shown → Huỷ works → Dừng LIVE works
11. Human Takeover → amber banner → "Giao lại cho AI" returns to `running`
12. `/live/console` unaffected

Backend tests: Not required (no backend changes).

---

## 12. Acceptance Criteria

- [ ] Button visibility exactly matches state transition matrix
- [ ] `actionLoading` prevents all simultaneous commands
- [ ] No optimistic state update before WS confirmation
- [ ] REST 500 on invalid transition → concise user message + GET reconcile
- [ ] Stop uses destructive Popconfirm with clear irreversibility warning
- [ ] Human Takeover has amber visual banner
- [ ] Paused has blue visual banner
- [ ] No raw backend error text rendered
- [ ] No stream key / credentials displayed
- [ ] `npm run build` passes
- [ ] `/live/console` unaffected

---

## 13. Known Limitations

1. **500 on invalid transitions**: The backend does not return 400 for invalid state transitions — it throws `django.core.exceptions.ValidationError` which results in a 500. The frontend must handle this gracefully. This is a backend architectural gap but is **out of scope to fix** for this checkpoint.

2. **No optimistic UI**: Since state confirmation comes from WS, there is a brief delay between button click and visual feedback. The `actionLoading` state covers this window adequately.

3. **WS disconnect during command**: If the admin WebSocket disconnects between REST call and WS confirmation, the UI may appear "stuck in loading". The GET reconcile in the catch block partially mitigates this but only fires on REST error, not on WS silence.

4. **Human Takeover banner vs. Pause banner**: Both show a status banner. If the user loses WS connectivity, the banner may remain stale. This is acceptable — the session status from the initial GET load is always accurate.
