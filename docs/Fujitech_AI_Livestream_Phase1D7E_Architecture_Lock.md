# Phase 1D-7E: Shopee LIVE Comment Integration - Architecture Lock

## 1. Comment API
- **Endpoint**: Shopee Open API v2 `/api/v2/livestream/get_latest_comment_list` (GET)
- **Behavior**: Retrieves comments from a livestream room from the last 10 seconds.
- **Parameters**: `session_id`, `offset` (default 0), standard auth parameters (`partner_id`, `shop_id`, `access_token`, etc.).
- **Response**: List of comments containing `user_id`, `user_name`, `comment_id`, `comment_content`, and `comment_time`.
- **Constraint**: Must use polling; no webhook is available.

## 2. Polling Lifecycle
- **Trigger**: The polling task (`poll_shopee_live_comments`) is initiated when a `LiveSession` successfully transitions to `RUNNING`.
- **Interval**: 3 seconds (`countdown=3` in Celery).
- **Guard Condition**: Before executing an API call or scheduling the next loop, the task MUST verify `LiveSession.status == RUNNING`. If the session is `STOPPED`, `ERROR`, `PAUSED`, or `HUMAN_TAKEOVER`, the task gracefully exits and breaks the polling loop.

## 3. Dedup Strategy (Per-Comment)
To strictly avoid duplicates across polling windows, duplicate prevention is handled per-comment via Redis DB2:
- **Redis Key Structure**: `live:comment:dedup:{company_id}:{session_id}:{comment_id}`
- **Operation**: `SET key 1 NX EX 3600`
- **Semantics**:
  - `NX success`: Comment is new. Proceed to processing.
  - `NX failure`: Duplicate comment. Ignore and drop silently.
- This tenant/session-scoped mechanism guarantees uniqueness with minimal TTL overhead.

## 4. Concurrency Protection
To prevent multiple polling workers from processing the same `LiveSession` simultaneously (e.g., if a start command is triggered twice):
- A Redis-based distributed lock (`live:polling:lock:{company_id}:{session_id}`) will be used before initiating the polling loop, or a check that relies on the active worker context.
- If a polling worker is already active for the session, any new polling trigger for the same session is immediately dropped.

## 5. Celery Flow
Polling and processing are strictly decoupled:
1. `poll_shopee_live_comments` (Celery task) executes.
2. Calls `ShopeeAdapter.get_comments()`.
3. Normalizes to `LiveCommentEvent`.
4. Executes Dedup per comment via Redis.
5. For each valid new comment, calls `handle_live_message.delay(session_id, text, correlation_id)`.
6. Schedules next cycle: `poll_shopee_live_comments.apply_async(..., countdown=3)`.

## 6. Pagination
- MVP is hard-capped to process a maximum of **50 comments per polling cycle** to protect backend resources.
- If the Shopee API response indicates `has_more == true` after the MVP limit is reached, the system will **NOT** loop indefinitely.
- Instead, it will:
  - Halt processing for the current cycle.
  - Issue a clear logger warning: `[Session {id}] Pagination truncation: Processed 50 comments, but has_more=True remains.`
  - Document the exact number processed.

## 7. Polling Window & Latency Constraints
- **API Window**: Shopee retains comments for exactly 10 seconds.
- **Polling Interval**: Set to 3 seconds.
- **Expected Latency**: 3-5 seconds from user posting to AI receiving the message.
- **Comment Loss Risk**: If the polling worker is delayed in the Celery queue, or if API/network latency spikes beyond 7-10 seconds, the system may definitively miss comments. This risk is acknowledged and documented for the MVP.

## 8. Rate Limiting & Error Handling
- **PlatformRateLimitError (429)**: The polling task employs a bounded backoff. If 429 is encountered, the next schedule is delayed by `10s` (MVP fallback behavior). 
- **PlatformAuthError**: Polling stops immediately; session is transitioned to `ERROR`.
- **PlatformAPIError**: Standard retry in 3 seconds.
- **Bounded Retries**: Infinite loops are prohibited. If polling hits an exception state consecutively beyond MVP thresholds (e.g., 10 failures), the task exits and transitions the session to `ERROR`.

## 9. Redis Keys
- **Dedup**: `live:comment:dedup:{company_id}:{session_id}:{comment_id}` (TTL: 3600s)
- **Concurrency Lock**: `live:polling:lock:{company_id}:{session_id}` (TTL: tied to interval + buffer, e.g. 10s)

## 10. LiveCommentEvent Normalization
Mapping ensures `LiveOrchestrator` never sees Shopee schemas directly:
- `event_id`: Random UUID
- `platform`: `shopee`
- `platform_comment_id`: Shopee `comment_id`
- `session_id`, `company_id`: from `LiveSession`
- `user_id`, `display_name`: from Shopee user data
- `text`: Shopee `comment_content`
- `timestamp`: from Shopee `comment_time`

## 11. Tenant Isolation
- Redis keys explicitly enforce `company_id`.
- `ShopeeAdapter` strictly filters operations by `company_id`.

## 12. Security
- Tokens decrypted dynamically in memory. No persistent storage of raw access tokens or PII text in local unencrypted files.

## 13. Migration Requirement
- **NONE**. No database migrations. Comments remain ephemeral for Phase 1 MVP.

## 14. Test Matrix
- `test_get_comments_success`: API parsing and normalization accuracy.
- `test_dedup_success`: Redis `SET NX` behavior prevents duplicates.
- `test_polling_lifecycle`: Worker aborts if session is not `RUNNING`.
- `test_concurrency_lock`: Two workers cannot start for the same session.
- `test_pagination_truncation`: Verifies logging behavior when `has_more=true` and limit > 50.
- `test_rate_limit_backoff`: Ensures `countdown=10` is applied on 429.

## 15. Exact Files to Modify/Create
- `backend/live_sessions/platforms/shopee.py` (Implement `get_comments`)
- `backend/live_sessions/tasks.py` (Create `poll_shopee_live_comments`)
- `backend/live_sessions/services.py` (Create dedup & lock helpers)
- `backend/live_sessions/tests_live_shopee.py` (Add new polling/comment tests)

**Status:** ARCHITECTURE LOCK COMPLETE. READY FOR IMPLEMENTATION.
