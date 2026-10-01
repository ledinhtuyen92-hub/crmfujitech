# Phase 1G-3 Realtime AI Timeline Plan

## 1. Event Contract Audit

The backend emits various events via `LiveConsoleEventService.emit()`. All events are wrapped in a standard envelope:
```json
{
  "event_version": "1.0",
  "event_type": "<EVENT_TYPE>",
  "timestamp": "ISO-8601",
  "session_id": "UUID",
  "message_id": "UUID",
  "correlation_id": "UUID",
  "payload": { ... }
}
```

### Audited Event Payloads
- **`live.comment.received`**: `{"text": "<user_message>"}`
- **`live.rag.completed`**: `{"context_found": <bool>}`
- **`live.rag.error`**: `{"error": "<error_message>"}`
- **`live.product_truth.loaded`**: `{"product_name": "<str>", "sku": "<str>", "has_live_price": <bool>}`
- **`live.ai.completed`**: `{"intent": "<str>", "action": "<str>", "reply_length": <int>, "reply_text": "<str>"}`
- **`live.ai.error`**: `{"error": "<error_message>"}`
- **`live.tts.completed`**: `{"format": "<str>", "bytes": <int>}`
- **`live.tts.error`**: `{"error": "<error_message>"}`
- **`live.speech.dispatched`**: `{"command_id": "<uuid>", "message_id": "<uuid>"}`
- **`live.speech.error`**: `{"error": "<error_message>"}`
- **`live.ai.suppressed`**: `{"reason": "human_takeover" | "not_running (...)"}`

**Safety**: The payloads do *not* contain sensitive tokens, stream keys, or internal credentials. The `error` strings are standard python exception messages which might contain stack traces if unhandled, but the codebase primarily passes `str(e)`. 

## 2. Correlation Strategy

The backend assigns a unique `correlation_id` (a UUID) when `live.comment.received` is initiated in `LiveOrchestrator.process_comment()`. 
This exact `correlation_id` is propagated downstream to `rag`, `product_truth`, `ai`, `tts`, and `speech` events.
**Strategy**: Group timeline events by `correlation_id`. A single `correlation_id` represents an "Interaction Cycle". 

## 3. Timeline UX & Event Grouping

The UI will render a bounded feed of interactions, displaying newest interactions at the bottom (oldest-first, like a chat or console) to feel natural. 

### Interaction Lifecycle in React
A custom hook or local state will accumulate events into an `interactions` dictionary keyed by `correlation_id`. 
An interaction object structure:
```javascript
{
  id: correlation_id,
  timestamp: "2026-...",
  comment: "Mẫu sofa này bao nhiêu tiền?",
  stages: {
    rag: { status: 'pending' | 'success' | 'error', details: ... },
    productTruth: { status: 'pending' | 'success' | 'error', details: ... },
    ai: { status: 'pending' | 'success' | 'error', details: ... },
    tts: { status: 'pending' | 'success' | 'error', details: ... },
    speech: { status: 'pending' | 'success' | 'error', details: ... },
    suppressed: { status: 'suppressed', details: ... } // for live.ai.suppressed
  }
}
```

### Visual Representation
Each Interaction Cycle will be rendered as a vertical stepper or timeline block:
1. **Header**: Timestamp + The user's comment.
2. **Steps**:
   - `RAG`: "Tìm kiếm tài liệu" (Success: "Đã tìm thấy tài liệu")
   - `Product Truth`: "Đồng bộ giá" (Success: "Giá: [SKU]")
   - `AI`: "Tạo câu trả lời" (Success: "Đã tạo câu trả lời") - expandable to show `reply_text`
   - `TTS`: "Tổng hợp giọng nói" (Success: "[format], [bytes] bytes")
   - `Speech`: "Phát Audio" (Success: "Đã gửi tới Live Studio")

## 4. Error Visualization

If an error event (`live.*.error`) or a suppression (`live.ai.suppressed`) arrives:
- The corresponding stage is marked with `status = 'error'` or `'suppressed'`.
- The timeline visually stops progressing for that interaction.
- The UI highlights the stage in red/orange and displays the concise error message or reason (`details.error` or `details.reason`).
- No stack traces are shown.

## 5. Bounded Buffer Strategy & Performance

- **Memory Limit**: We will keep a maximum of **50** interaction cycles in the component's state. When a new interaction (`live.comment.received`) arrives and the count exceeds 50, the oldest interaction is evicted.
- **`useLiveWebSocket` Leak**: Currently, `useLiveWebSocket` blindly appends to its `events` array without bound. We will update `useLiveWebSocket.js` to cap the raw `events` array at a safe number (e.g., 100) to prevent indefinite memory growth during long live streams. 
- **Auto-scroll**: We will implement an auto-scroll to the bottom of the timeline list container. If the user scrolls upward, auto-scroll pauses (controlled via an `isUserScrolled` state).

## 6. Reconnect Behavior

- The existing `useLiveWebSocket` will attempt to reconnect via `setTimeout` if the connection drops.
- **Missed Events**: Currently, the backend does not replay missed timeline events for a given `correlation_id` upon WS reconnect.
- **Handling**: If events are missed, an interaction may remain "stuck" in a pending stage. This is acceptable for Phase 1G. We will document this as a known limitation. 

## 7. Security & Redaction

- The frontend will purely render `payload` properties defined in the contract.
- It will explicitly extract `payload.reply_text`, `payload.error`, etc., rather than dumping `JSON.stringify(payload)`.
- No sensitive keys exist in these events, so no strict redaction logic is required beyond safe rendering.

## 8. Preserving Diagnostic Console

The existing `/live/console` route is untouched and continues to serve as the raw developer diagnostic tool. The new timeline is visually distinct and belongs to the `/live/studio/:id` workspace.

## 9. Files to Modify

1. **`frontend/src/hooks/useLiveWebSocket.js`**
   - Cap `events` array at 100 to prevent memory leaks.
2. **`frontend/src/pages/live/components/AITimeline.jsx`** (New File)
   - Component strictly dedicated to managing the Interaction state buffer, grouping events by `correlation_id`, and rendering the Timeline UI.
3. **`frontend/src/pages/live/LiveStudioBeta.jsx`**
   - Integrate `<AITimeline />` into the workspace concept placeholder section. Feed it `lastEvent` from the websocket hook.

## 10. Tests Required

- No new backend tests required for 1G-3 since the backend contract is not changing.
- Frontend manual testing to confirm maximum element limits, auto-scroll functionality, and correct state rendering for successes/errors.

## 11. Acceptance Criteria

- The AI Timeline displays in the Live Studio page.
- Interactions are grouped by `correlation_id`.
- Stages advance dynamically as events are received.
- Errors are caught and highlighted without crashing the UI.
- The timeline holds a maximum of 50 interactions without causing browser lag.
- Auto-scroll works but pauses if the user scrolls up.
- `useLiveWebSocket` does not leak memory over time.

## 12. Known Limitations

- Realtime Reconnection: If the WebSocket connection drops for 5 seconds and an AI cycle completes during that window, the frontend UI for that specific cycle will remain permanently "pending" or stuck mid-stage because the backend does not replay missed observability events.
