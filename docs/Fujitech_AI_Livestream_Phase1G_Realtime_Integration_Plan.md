# Fujitech AI Livestream - Phase 1G Realtime Integration Plan

## 1. Current Realtime Architecture (Audit Results)
- **Django Channels**: Provides the WebSocket infrastructure.
- **Device WebSocket** (`ws/live_sessions/<session_id>/device/`): The Windows Live Studio connects here. Exchanges commands and acks. Sends `device.heartbeat` and `event.comment`.
- **Admin WebSocket** (`ws/live_sessions/<session_id>/admin/`): Read-only WebSocket for the frontend. Receives observability events emitted by `LiveConsoleEventService`.
- **Frontend Hook** (`useLiveWebSocket(sessionId)`): Connects to the Admin WebSocket, listens for events, and maintains connection state. Currently used by the diagnostic `/live/console`.

## 2. Phase 1G Scope Breakdown

### In Scope for 1G
- **1G-1 Realtime Device Status**: Show connection state and `execution_state` derived from `device.heartbeat`.
- **1G-2 Realtime Session Status**: Map session state transitions (`ready` -> `running` -> `human_takeover` -> `stopped`) accurately via REST actions and WS events.
- **1G-3 Live Studio Workspace (`/live/studio/:id`)**: Implement the target UI concept. Replaces the placeholder `LiveStudioBeta.jsx`.
- **1G-4 Realtime Event Feed**: Provide a unified timeline of what the AI is doing (`live.rag.completed`, `live.ai.completed`, `live.tts.completed`, `live.speech.dispatched`).
- **1G-5 Stream Health**: Show semantic connection health (e.g., Device Online, Reconnecting, FFmpeg Ready) based on available existing data.
- **1G-6 Human Takeover / Emergency Controls**: Frontend UI controls mapped to existing REST endpoints (`pause`, `resume`, `stop`).

### Out of Scope (Later Enhancements)
- **1G-7 Realtime Control Room**: Multi-stream grid view monitoring.
- Realtime video feed rendering via WebRTC (HLS/WebRTC streaming requires media server setup, which is out of scope for just UI integration; a placeholder or basic iframe can be used if appropriate).
- Realtime viewer analytics (unless supported by backend).
- Modifying the Windows Live Studio executable.

## 3. Realtime Data Flow

### Event Feed Flow
1. **Windows Device** -> `device.heartbeat` -> **Device WS** (updates DB).
2. **REST API** -> Orchestrator processing -> **Admin WS** (via `LiveConsoleEventService.emit`).
3. **React `useLiveWebSocket`** -> `setEvents()` -> Renders into **Live Studio Event Feed**.

### Available Events
- `live.stream_start.dispatched`, `live.stream_stop.dispatched`
- `live.stream.status` (dispatched from device)
- `live.comment.received` (from backend task)
- `live.rag.completed`, `live.rag.error`
- `live.product_truth.loaded`
- `live.ai.completed`, `live.ai.error`
- `live.tts.completed`, `live.tts.error`
- `live.speech.dispatched`, `live.speech.error`

### Missing / Required Backend Changes
- `device.heartbeat` is currently NOT emitted to the Admin WS. 
  - **Required Change**: In `consumers.py`, `DeviceAgentConsumer.receive()` must call `LiveConsoleEventService.emit('live.device.heartbeat', payload)` when it receives `device.heartbeat`. This allows the React UI to update the stream health/device status instantly without polling.

## 4. Live Studio Workspace UX Concept (`/live/studio/:id`)

The workspace will be a full-screen layout designed for maximum focus:

```text
┌─────────────────────────────────────────────────────────┐
│ LIVE SESSION: [Name]                   ● LIVE   [STOP]  │
├──────────────────┬─────────────────────┬───────────────┤
│                  │                     │               │
│   VIDEO /        │ AI / EVENT ACTIVITY │ LIVE CHAT &   │
│   STREAM PREVIEW │ (Timeline)          │ PRODUCTS      │
│                  │                     │               │
│   [Placeholder]  │ - RAG context found │ - User: Hello │
│                  │ - AI generated text │ - User: Price?│
│                  │ - TTS Generated     │               │
│                  │                     │               │
├──────────────────┴─────────────────────┴───────────────┤
│ Device Health │ Platform: Shopee │ AI Host: Agent Name │
└─────────────────────────────────────────────────────────┘
```

## 5. Security Constraints
- **Do not expose stream secrets**: Stream keys, RTMP URLs, and OAuth tokens must not be logged or exposed in the UI or Admin WS payloads.
- **REST for Commands**: The Admin WS is strictly READ-ONLY. All commands (Start, Stop, Pause/Takeover, Resume) must continue to use the secured REST API endpoints (`/live_sessions/sessions/:id/...`).

## 6. Human Takeover Flow
- **Trigger**: User clicks "Tạm dừng AI (Human Takeover)".
- **Action**: Frontend calls `POST /live_sessions/sessions/:id/pause/`.
- **UI State**: Status badge changes to `human_takeover`. AI event feed shows "AI Paused".
- **Resume**: User clicks "Tiếp tục AI". Frontend calls `POST /live_sessions/sessions/:id/resume/`.

## 7. Diagnostic Console Preservation
- `/live/console` will NOT be removed or modified to serve as the customer-facing studio.
- `/live/console` remains a diagnostic tool for developers.
- Phase 1G implements the production UI entirely within `/live/studio/:id`.

## 8. Acceptance Criteria
1. `/live/studio/:id` provides a full-width real-time workspace.
2. The UI connects successfully to the Admin WebSocket without throwing console errors.
3. Live session status accurately reflects backend state (REST actions map correctly to visual states).
4. `device.heartbeat` is forwarded by the backend and updates the UI stream health component.
5. The AI Event Feed renders the observability events chronologically.
6. The Diagnostic Console (`/live/console`) remains completely functional.
7. No stream keys or access tokens are exposed in the frontend.
