# NEXT SESSION START GUIDE

## State of the Project
- **Branch**: V2
- **Module**: Fujitech AI Livestream
- **Phase 1E-8 Frontend Integration**: COMPLETE.
- Dual Connection UI (API mode vs Manual RTMP mode) is correctly built.
- `PlatformAccount` endpoints were securely created for frontend fetching without exposing secrets.

## Your Immediate Next Task:
**PHASE 1F - Fujitech Live UX/UI System**

The goal is to move beyond the current generic CRUD shell to a rich, Genpio-inspired Live Studio interface.

## Constraints to follow:
- **Design Alignment**: Use the Genpio UI benchmark for the layout (vibrant, space-efficient, professional).
- **Backend Rules**: Backend Phase 1E (Generic RTMP & Dual Connection) is tested and locked. Do NOT rewrite the stream routing or orchestrator logic unless you find a critical bug.
- **Frontend Architecture**: Keep using the existing `LiveDashboard.jsx` and `LiveSessionsList.jsx` as the base routes, but deeply enrich their layouts.

## References:
- `docs/Fujitech_AI_Livestream_Master_Development_Specification_v1.1.md`
- `docs/Fujitech_AI_Livestream_Phase1E8_Frontend_Report.md` (Read this to understand how UI currently consumes dual connections securely).
