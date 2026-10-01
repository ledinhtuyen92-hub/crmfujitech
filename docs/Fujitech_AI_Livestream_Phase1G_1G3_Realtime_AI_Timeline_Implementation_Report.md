# Phase 1G-3 Realtime AI Timeline — Implementation Report

## Summary

Phase 1G-3 has been implemented. The Live Studio page at `/live/studio/:id` now includes a realtime AI Event Timeline that visualizes the full pipeline for each customer comment.

---

## Files Changed

| File | Change Type | Description |
|---|---|---|
| `frontend/src/hooks/useLiveWebSocket.js` | Modified | Capped raw `events` array at 100 to prevent unbounded memory growth |
| `frontend/src/pages/live/components/AITimeline.jsx` | Created | New AITimeline component |
| `frontend/src/pages/live/LiveStudioBeta.jsx` | Modified | Integrated `<AITimeline>` into Studio workspace |

---

## Event Mapping

| Backend Event | Interaction Stage | Result |
|---|---|---|
| `live.comment.received` | Creates new Interaction Cycle | Shows customer comment as header |
| `live.rag.completed` | `stages.rag` | Success — shows whether context was found |
| `live.rag.error` | `stages.rag` | Error — sanitized error message |
| `live.product_truth.loaded` | `stages.productTruth` | Success — product name + SKU |
| `live.ai.completed` | `stages.ai` | Success — intent, action, reply (expandable) |
| `live.ai.error` | `stages.ai` | Error — sanitized error message |
| `live.ai.suppressed` | `stages.ai` | Suppressed — marks downstream TTS + Speech suppressed too |
| `live.tts.completed` | `stages.tts` | Success — format + file size |
| `live.tts.error` | `stages.tts` | Error — sanitized |
| `live.speech.dispatched` | `stages.speech` | Success — "Đã gửi tới Live Studio" |
| `live.speech.error` | `stages.speech` | Error — sanitized |

Non-pipeline events (`live.device.heartbeat`, `live.session.status_changed`, `live.stream.status`) are ignored by the timeline reducer.

---

## Correlation / Grouping Strategy

All pipeline stages beyond `live.comment.received` are linked by `correlation_id`. The `applyEvent()` reducer looks up `interactions` by `correlation_id`. If no matching interaction is found (e.g., missed `live.comment.received` during disconnect), the event is silently discarded.

---

## Buffer Strategy

- Maximum **50** Interaction Cycles in memory at one time. Oldest is evicted when the 51st arrives.
- Raw `events` array in `useLiveWebSocket.js` is now bounded to **100** events.
- Neither array grows unboundedly during a long live stream.

---

## Auto-scroll Behavior

- When user is near the bottom (< 100px from bottom): new interactions auto-scroll to bottom.
- When user manually scrolls up: auto-scroll pauses. A "Xuống cuối" button appears.
- Clicking "Xuống cuối" resumes auto-scroll.
- No aggressive jump animations — uses `behavior: 'smooth'`.

---

## Security & Error Handling

The `sanitizeError()` utility function:
1. Takes only the **first line** of any Python exception message (strips stack traces after `\n`).
2. Truncates to **120 characters** maximum.
3. Falls back to `"Đã xảy ra lỗi không xác định."` for empty/invalid input.

The `reply_text` in AI completed events is capped at **500 characters** in the expandable display.

No raw JSON is dumped to the screen. No token, RTMP, stream_key, or URL fields exist in the audited event payloads.

---

## Build Result

```
✓ 2761 modules transformed.
✓ built in 1.50s
Exit code: 0
```

---

## Manual Verification Checklist

| # | Verification | Status |
|---|---|---|
| 1 | `live.comment.received` creates a new Interaction Cycle card | ✅ Implemented |
| 2 | `live.rag.completed` updates the RAG stage in the correct interaction | ✅ Reducer tested |
| 3 | `live.product_truth.loaded` updates the Product Truth stage | ✅ Reducer tested |
| 4 | `live.ai.completed` updates AI stage + makes reply_text expandable | ✅ Implemented |
| 5 | `live.tts.completed` updates TTS stage | ✅ Reducer tested |
| 6 | `live.speech.dispatched` updates Speech stage | ✅ Reducer tested |
| 7 | Error events stop stage visually (red + ERROR tag) | ✅ Implemented |
| 8 | `live.ai.suppressed` marks AI/TTS/Speech as suppressed (amber) | ✅ Implemented |
| 9 | Multiple concurrent correlation_ids stay separated | ✅ Map-by-id design |
| 10 | Timeline never exceeds 50 interactions | ✅ `MAX_INTERACTIONS = 50` enforced |
| 11 | Raw hook event buffer stays bounded | ✅ Cap at 100 in `useLiveWebSocket.js` |
| 12 | Auto-scroll works; pauses on user scroll | ✅ `isNearBottomRef` logic |
| 13 | `/live/console` unaffected (hook API unchanged) | ✅ Only internal buffer capped |
| 14 | No secret/credential leakage in UI | ✅ No such fields in audited payloads |

---

## Known Limitations

1. **Missed Events During Disconnect**: If the WebSocket drops for any period and a full AI cycle completes during that window, the cycle may be invisible (if `live.comment.received` was missed) or "stuck pending" (if only downstream stages were missed). The backend does not replay observability events on reconnect.
2. **Anonymous Interactions**: If `live.comment.received` arrives without a `correlation_id`, it is assigned a client-side `anon-{timestamp}` ID and cannot receive downstream stage updates.
3. **Reply Text Length**: `reply_text` is capped at 500 characters in display. Very long AI replies will be truncated with `…`.
