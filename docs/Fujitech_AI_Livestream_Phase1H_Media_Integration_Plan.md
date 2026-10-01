# Fujitech AI Livestream - Phase 1H Media Integration Plan

## 1. Objective
Replace the static `VideoPreview.jsx` placeholder in the Live Studio (`/live/studio/:id`) with a functioning realtime video player.

## 2. Technical Context & Constraints
- **Stream Source**: The `live_studio` (device) pushes RTMP. For local previews, it pushes to a local `MediaMTX` server.
- **Protocol**: MediaMTX automatically serves incoming RTMP streams as WebRTC via the WHEP protocol at `:8889`.
- **Frontend Security**: The `stream_url` (which contains RTMP secrets) is intentionally hidden from the frontend API responses.
- **Architectural Scope**: The frontend must remain decoupled from the stream generation. If the stream is pushed directly to an external platform (e.g., Shopee API mode), a local WebRTC preview may not be available unless dual-streaming is configured in the backend (out of scope for this UI phase).

## 3. Proposed Implementation (Iframe Approach)
As suggested in the Phase 1G blueprint ("a placeholder or basic iframe can be used if appropriate"), we will use an `iframe` to embed the MediaMTX WebRTC player. This avoids complex SDP negotiation in React and relies on the robust, built-in player provided by MediaMTX.

### Changes to `VideoPreview.jsx`
1. **Props**: Receive the `session` object to determine the stream path (e.g., `session_{id}`).
2. **State**: 
   - Wait until `session.status` is `running` or `human_takeover`. If not running, show the placeholder.
3. **Iframe**: 
   - URL: `http://localhost:8889/session_${session.id}/` (or a configurable path).
   - Render the iframe seamlessly within the existing Ant Design Card.
4. **Fallback**: If the iframe fails to load (e.g., streaming to Shopee directly, or MediaMTX is down), display a graceful "Preview Unavailable" state without crashing the UI.

## 4. Work Breakdown
1. Update `VideoPreview.jsx` to conditionally render an `iframe`.
2. Map the MediaMTX WebRTC URL using the `session.id`.
3. Ensure the iframe is styled to fit the left column seamlessly (100% width/height, borderless).
4. Verify the frontend builds successfully (`npm run build`).

## 5. Known Limitations
- If the session operates in Shopee API mode (pushing directly to Shopee's RTMP ingest), the local MediaMTX WebRTC player will be empty. In the future, a backend relay or dual-output in `ffmpeg` would be required to support local previews of external streams.
