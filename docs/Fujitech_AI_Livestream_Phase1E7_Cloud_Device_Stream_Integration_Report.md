# Fujitech AI Livestream Phase 1E-7: Cloud ↔ Device Stream Integration Report

## 1. Cloud Stream Target
The generic stream target abstraction has been integrated without introducing new database models, maintaining the architectural simplicity. The runtime stream target data (such as the RTMP URL) is fetched securely through the `ShopeeAdapter` (or custom endpoint) and passed directly via WebSocket, ensuring it is not leaked or persisted unnecessarily.

## 2. stream.start Flow
The Cloud-side `LiveOrchestrator` now implements `dispatch_stream_start(session_id: str)`. When a `LiveSession` status changes to `RUNNING` via the API, the orchestrator:
1. Validates the session.
2. Constructs a `stream.start` command payload.
3. Retrieves the appropriate `sequence_number`.
4. Wraps the payload in the `ProtocolEnvelope`.
5. Dispatches it over the channel layer to the `Live Studio` device.

## 3. stream.stop Flow
Similarly, `LiveOrchestrator` implements `dispatch_stream_stop(session_id: str, reason: str)`. Upon an API request to stop the session, it packages a `stream.stop` envelope and dispatches it over the channel layer, instructing the `StreamController` on the device to gracefully shut down FFmpeg.

## 4. ACK Lifecycle
- **ACK_RECEIVED**: Instantly emitted by `ProtocolDispatcher` in Live Studio when `stream.start` or `stream.stop` arrives.
- **ACK_COMPLETED**: Emitted when FFmpeg process starts successfully, and when FFmpeg successfully shuts down.
- **ACK_FAILED**: Emitted with error codes `STARTUP_FAILED` or `SHUTDOWN_FAILED` if the RTMP server refuses the connection or FFmpeg crashes on boot.

## 5. Device Runtime State
Live Studio now actively propagates its internal stream state (`STARTING`, `LIVE`, `STOPPING`, `STOPPED`, `ERROR`, `RECONNECTING`) back to the Cloud via a new `stream.status` event payload. The state transitions are broadcast to the Cloud using the WebSocket `event` mechanism without bleeding business logic into the device.

## 6. Health Propagation
The backend `DeviceAgentConsumer` listens for the `stream.status` events and writes them into `LiveContextService`. These runtime updates are also re-broadcast via `LiveConsoleEventService` for the Admin UI to monitor the true execution state distinct from the overall business `LiveSession` state. The local device also monitors health via `_health_monitor` and restarts FFmpeg seamlessly if the process dies.

## 7. Platform Adapter Boundary
The `Live Studio` engine remains 100% agnostic to the platform (Shopee, TikTok, etc.). It only knows about `stream_url` and encoding configs. The `ShopeeAdapter` on the Cloud handles Shopee-specific API calls and provides the resulting `stream_url` which is dispatched down.

## 8. Shopee Preparation
The `ShopeeAdapter` (`backend/live_sessions/platforms/shopee.py`) correctly handles fetching stream targets using the `/api/v2/livestream/start_session` endpoint. It parses the returned `external_session_id` and `push_url` which are saved properly for E2E integration. 

## 9. Security
- **Data Protection**: `stream_url` has been modified to be a `write_only=True` field in `LiveSessionSerializer`, ensuring it is never accidentally serialized and exposed to the frontend Admin Dashboard or generic API calls.
- **WebSocket Only**: Stream keys travel strictly through the authenticated device WebSocket connection, adhering to security requirements.

## 10. Tests
- **Backend Tests**: Wrote `backend/live_sessions/tests_stream_integration.py` to assert that `stream_url` is successfully redacted from API endpoints and that the orchestrator properly dispatches `stream.start` and `stream.stop` to the correct device channels.
- **Device Tests**: The 69 unit tests for `Live Studio` remain completely green, ensuring `StreamController` logic and protocol abstractions are intact.

## 11. Local E2E
A real E2E validation script (`test_e2e_stream.py`) was implemented and executed successfully:
- Cloud sent `stream.start` via WebSocket simulation.
- `Live Studio` acknowledged and started FFmpeg.
- Handled state transitions: `STARTING` -> `LIVE`.
- Real MediaMTX receiver on `localhost:1935` ingested the RTMP feed.
- Cloud sent `stream.stop`.
- `Live Studio` handled graceful shutdown with state transitions `STOPPING` -> `STOPPED` and sent `ACK_COMPLETED`.

## 12. Known Limitations
- The encoding configuration (`bitrate`, `fps`, `resolution`) inside `dispatch_stream_start` currently uses hardcoded safe defaults. In the future, this should be mapped dynamically based on platform-specific limitations.
- While the E2E verifies local streaming to MediaMTX, a true Shopee production stream verification requires valid Shopee credentials which were not used.

## 13. Next Phase
Phase 1E-8: Final Product Validation & Advanced Platform Specific Features (e.g. dynamic encoding parameters, production TikTok/Shopee testing). The system is now fully prepared to begin actual platform streaming.
