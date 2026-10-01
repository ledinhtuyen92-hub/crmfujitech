# NEXT SESSION START GUIDE

## State of the Project
- **Branch**: V2
- **Latest Commit**: `18b064c` — `feat(live): implement realtime AI timeline`
- **Module**: Fujitech AI Livestream — Phase 1G

## Current Completion State

| Phase | Status |
|---|---|
| 1E-8 (Backend Platform Integration) | ✅ COMMITTED |
| 1F (UX/UI System Redesign) | ✅ COMMITTED |
| 1G-1 (Realtime Device Heartbeat) | ✅ COMMITTED in a728754 |
| 1G-2 (Realtime Session Status) | ✅ COMMITTED in a728754 |
| 1G-3 (Realtime AI Timeline) | ✅ COMMITTED in 18b064c |
| 1G-4 (Stream Health) | ✅ IMPLEMENTED — **PENDING COMMIT** |
| Live Studio Beta menu item | ✅ IMPLEMENTED — **PENDING COMMIT** |
| 1G-5 (Video Preview) | 🔲 NOT STARTED |
| 1G-6 (Control Room) | 🔲 NOT STARTED |

## Pending Commit (1G-4 + menu fix)

Files modified / created, NOT yet committed:
- `frontend/src/pages/live/components/StreamHealthRow.jsx` (new)
- `frontend/src/pages/live/LiveStudioBeta.jsx` (modified)
- `frontend/src/components/MainLayout.jsx` ("Live Studio Beta" menu item)
- `docs/Fujitech_AI_Livestream_Phase1G_1G4_Stream_Health_Plan.md` (new)
- `docs/Fujitech_AI_Livestream_Phase1G_1G4_Stream_Health_Implementation_Report.md` (new)
- `docs/CURRENT_DEVELOPMENT_STATUS.md` (updated)
- `docs/NEXT_SESSION_START.md` (this file)

**First task at next session:** Audit + commit pending changes, then proceed to 1G-5.

## Your Immediate Next Task
**CHECKPOINT 5 — Phase 1G-5: Video Preview**

Investigate feasibility of WebRTC/HLS preview from the Windows Live Studio device within the browser interface.

Per the Phase 1G plan, this requires audit of:
- What output the Windows Local Studio currently exposes (RTMP only, or HLS/WebRTC?)
- Whether mediamtx can restream to HLS
- Browser compatibility
- Security implications (no stream key in frontend)

DO NOT code video preview without an audit + approved plan first.

## Constraints
- DO NOT change backend event contracts.
- DO NOT start with code — audit first.
- REST = commands, WebSocket = realtime state.
- `/live/console` diagnostic tool must remain functional.
- No bitrate/FPS metrics fabrication.

## Key References
- `docs/Fujitech_AI_Livestream_Phase1G_Realtime_Integration_Plan.md`
- `docs/Fujitech_AI_Livestream_Phase1G_1G4_Stream_Health_Implementation_Report.md`
- `frontend/src/pages/live/LiveStudioBeta.jsx` — Studio page
- `frontend/src/pages/live/components/StreamHealthRow.jsx` — health display
- `frontend/src/hooks/useLiveWebSocket.js` — realtime hook
- `live_studio/bin/mediamtx/` — local media server binary
