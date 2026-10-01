# Phase 1G-4 Stream Health — Implementation Report

## Summary

Phase 1G-4 is implemented. The Live Studio page at `/live/studio/:id` now displays a compact, realtime **Realtime Status** panel showing device heartbeat health and stream pipeline state — using only existing WebSocket events with no backend changes.

---

## Files Changed

| File | Action | Description |
|---|---|---|
| `frontend/src/pages/live/components/StreamHealthRow.jsx` | Created | Self-contained stream health display component |
| `frontend/src/pages/live/LiveStudioBeta.jsx` | Modified | Added stream state tracking; integrated StreamHealthRow |

No backend files were modified.

---

## Health Logic

### State Priority (highest → lowest)
1. `live.session.status_changed` with `stopped/error` → overrides everything
2. `live.stream.status` → authoritative stream state
3. `live.stream_start.dispatched` / `live.stream_stop.dispatched` → "pending" badges
4. `live.device.heartbeat` freshness → device online/stale/offline
5. `heartbeat.execution_state` → device execution health

### Device Freshness (frontend-only, constants in StreamHealthRow.jsx)

| Elapsed since last heartbeat | Status | Color |
|---|---|---|
| 0–30s | Online | Green |
| 31–60s | Thiết bị không phản hồi (Stale) | Amber |
| > 60s | Ngoại tuyến (Offline) | Red |
| `execution_state == "error"` | Thiết bị gặp lỗi | Red (independent of freshness) |

Constants: `HEARTBEAT_STALE_MS = 30_000`, `HEARTBEAT_OFFLINE_MS = 60_000`

### Stream States

| Backend `state` | Display | Color | Spinner |
|---|---|---|---|
| `LIVE` | Đang phát LIVE | Green | ✗ |
| `STARTING` | Đang khởi động... | Blue | ✓ |
| `STOPPING` | Đang dừng... | Orange | ✓ |
| `STOPPED` | Đã dừng | Gray | ✗ |
| `ERROR` | Lỗi kết nối | Red | ✗ |
| `RECONNECTING` | Đang kết nối lại... | Amber | ✓ |
| `IDLE` (default) | Chờ lệnh | Gray | ✗ |

---

## Event Handling (LiveStudioBeta.jsx)

| Event | Action |
|---|---|
| `live.device.heartbeat` | Update `deviceHealth` + record `lastHeartbeatAt = Date.now()` |
| `live.stream.status` | Set `streamState` to `payload.state`; clear `startDispatched` on LIVE, `stopDispatched` on STOPPED |
| `live.stream_start.dispatched` | Set `startDispatched = true`, clear `stopDispatched` |
| `live.stream_stop.dispatched` | Set `stopDispatched = true`, clear `startDispatched` |
| `live.session.status_changed` | Update session status + clear both dispatched flags on terminal states |

---

## Staleness Timer

`StreamHealthRow` runs a `setInterval` at **5s cadence** to recompute elapsed heartbeat time. The timer is mounted/unmounted with the component lifecycle. No backend polling is added.

---

## Security

- No stream keys, RTMP URLs, or credentials appear in any rendered event payload
- `execution_state` choices are safe enum values: `idle | initializing | ready | playing | error`
- `stream.state` values are safe enum values: `IDLE | STARTING | LIVE | STOPPING | STOPPED | ERROR | RECONNECTING`

---

## Build Result

```
✓ 2762 modules transformed
✓ built in 1.50s
Exit code: 0
```

---

## Manual Verification Checklist

| # | Verification | Status |
|---|---|---|
| 1 | `live.device.heartbeat` received → Device shows "Online" | ✅ Logic in place |
| 2 | No heartbeat for >30s → "Thiết bị không phản hồi" (amber) | ✅ 30s constant |
| 3 | No heartbeat for >60s → "Ngoại tuyến" (red) | ✅ 60s constant |
| 4 | `execution_state=error` → "Thiết bị gặp lỗi" independent of freshness | ✅ Separate check |
| 5 | `live.stream.status: STARTING` → blue spinner | ✅ STREAM_STATES map |
| 6 | `live.stream.status: LIVE` → green "Đang phát LIVE" | ✅ STREAM_STATES map |
| 7 | `live.stream.status: RECONNECTING` → amber spinner | ✅ STREAM_STATES map |
| 8 | `live.stream.status: ERROR` → red "Lỗi kết nối" | ✅ STREAM_STATES map |
| 9 | `live.stream.status: STOPPED` → gray "Đã dừng" | ✅ STREAM_STATES map |
| 10 | Session `stopped` → stream forced to STOPPED display | ✅ Session override in StreamHealthRow |
| 11 | Session `error` → stream forced to ERROR display | ✅ Session override in StreamHealthRow |
| 12 | `/live/console` unaffected | ✅ No hook changes |
| 13 | No secrets displayed | ✅ Only enum values rendered |

---

## Known Limitations

1. **No runtime bitrate/FPS**: Not provided by Windows StreamController upstream.
2. **RECONNECTING is transient**: The local Studio retries max 3 times (~14s window). During a missed WS disconnect, the RECONNECTING state may not be received if it resolved before reconnection.
3. **Staleness is a heuristic**: The 30s/60s frontend threshold cannot distinguish a dead device from a slow network.
4. **WS disconnect freezes health**: If admin WebSocket drops, the last known state is displayed until reconnect.
