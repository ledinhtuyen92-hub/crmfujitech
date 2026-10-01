# NEXT SESSION START GUIDE

## State of the Project
- **Branch**: V2
- **Module**: Fujitech AI Livestream
- **Phase 1F - UX/UI System Implementation**: COMPLETE.
- The Live module now features a professional SaaS workspace (Dashboard, Sessions, Platforms, Devices).
- Shared React components (`LiveStatusBadge`, `StreamCard`, `DeviceStatusWidget`) are implemented.
- Secure connection logic (API vs RTMP) is fully represented in the UI without exposing secrets.
- Backend logic (Phase 1E-8) remains intact and green (154/154 PASS).

## Your Immediate Next Task:
**PHASE 1G - Live Studio Realtime Integration**

The goal is to move from the current `LiveStudioBeta` placeholder to the actual real-time Studio interface where the AI Copilot and video feeds operate.

## Constraints to follow:
- **Design Alignment**: Continue using the Phase 1F design system (`#1649c9`, established statuses).
- **Video Feed**: Investigate WebRTC/HLS for real-time Windows Live Studio preview.
- **AI Copilot**: Integrate the real-time AI thought process and manual override ("Human Takeover").
- **Backend Sync**: Ensure the Studio UI communicates efficiently with the backend WebSocket (`DeviceWebSocket`).

## References:
- `docs/Fujitech_AI_Livestream_Phase1F_UX_UI_System_Plan.md`
- `docs/Fujitech_AI_Livestream_Phase1F_UX_UI_Implementation_Report.md`
