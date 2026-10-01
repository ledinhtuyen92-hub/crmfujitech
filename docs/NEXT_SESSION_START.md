# NEXT SESSION START GUIDE

## State of the Project
- **Branch**: V2
- **Latest Commit**: `a728754` — `feat(live): implement realtime device and session status`
- **Module**: Fujitech AI Livestream — Phase 1G

## Current Completion State

| Phase | Status |
|---|---|
| 1E-8 (Backend Platform Integration) | ✅ COMMITTED |
| 1F (UX/UI System Redesign) | ✅ COMMITTED |
| 1G-1 (Realtime Device Heartbeat) | ✅ COMMITTED in a728754 |
| 1G-2 (Realtime Session Status) | ✅ COMMITTED in a728754 |
| 1G-3 (Realtime AI Timeline) | ✅ IMPLEMENTED — **PENDING COMMIT** |
| 1G-4 (Stream Health) | 🔲 NOT STARTED |
| 1G-5 (Video Preview) | 🔲 NOT STARTED |
| 1G-6 (Control Room) | 🔲 NOT STARTED |

## Pending Commit (1G-3)

The following files are modified and NOT yet committed:
- `frontend/src/hooks/useLiveWebSocket.js` (bounded events buffer)
- `frontend/src/pages/live/components/AITimeline.jsx` (new)
- `frontend/src/pages/live/LiveStudioBeta.jsx` (integrated AITimeline)
- `docs/Fujitech_AI_Livestream_Phase1G_1G3_Realtime_AI_Timeline_Plan.md` (new)
- `docs/Fujitech_AI_Livestream_Phase1G_1G3_Realtime_AI_Timeline_Implementation_Report.md` (new)
- `docs/CURRENT_DEVELOPMENT_STATUS.md` (updated)
- `docs/NEXT_SESSION_START.md` (this file)

**First task at next session:** Audit + commit 1G-3 changes, then proceed to 1G-4.

## Your Immediate Next Task
**CHECKPOINT 4 — Phase 1G-4: Stream Health**

Implement realtime stream health indicators in the Live Studio:
- Bitrate
- FPS
- Drop rate
- RTMP connection state

Source: `live.stream.status` WebSocket events (already emitted by `DeviceAgentConsumer` when `stream.status` is received from the Windows device).

## Constraints
- Do NOT change backend event contracts.
- Do NOT start with code — audit first.
- All frontend state must come from WebSocket events.
- REST = commands, WebSocket = realtime state.
- `/live/console` diagnostic tool must remain functional.

## Key References
- `docs/Fujitech_AI_Livestream_Phase1G_Realtime_Integration_Plan.md`
- `docs/Fujitech_AI_Livestream_Phase1G_1G3_Realtime_AI_Timeline_Implementation_Report.md`
- `backend/live_sessions/consumers.py` — `stream.status` event handler
- `frontend/src/hooks/useLiveWebSocket.js` — existing realtime hook
- `frontend/src/pages/live/LiveStudioBeta.jsx` — main Studio page
