# Phase 1D-7E: Shopee LIVE Comment Integration - Pre-Implementation Audit

## 1. Current Architecture
- `PlatformAccount` manages encrypted Shopee OAuth credentials.
- `ShopeeAdapter` (extending `BasePlatformAdapter`) handles Shopee API calls and lifecycle commands (`start_live`, `get_live_status`, `stop_live`, `attach_product_to_live`).
- `LiveSession` tracks external `external_session_id` and `stream_url`.
- `LiveOrchestrator` receives normalized text comments, triggers RAG, AI core, TTS, and routes to WebSocket.
- `handle_live_message` is an existing Celery task for asynchronous comment processing.

## 2. Existing Reusable Components
- **`LiveCommentEvent`**: Dataclass in `platforms.events` providing a normalized schema.
- **`redis_client`**: Available via `live_sessions.services` for state management (used currently by Sequence service).
- **`ShopeeClient`**: Raw HTTP client with built-in HMAC signing, error normalization (`PlatformAuthError`, `PlatformRateLimitError`).

## 3. Shopee Comment API Capability
- **API Endpoint:** `/api/v2/livestream/get_latest_comment_list` (GET)
- **Behavior:** Retrieves comments from a livestream room from the last 10 seconds.
- **Parameters:** `session_id`, `offset` (optional, default 0 for pagination). Standard auth parameters (`shop_id`, `access_token`, etc.) are also required.
- **Response Schema:** Contains `user_id`, `user_name`, `comment_id`, `comment_content`, and `comment_time`.
- **Webhook Support:** NONE. Polling is strictly required.

## 4. Authentication
Standard Shopee v2 authentication applies. `ShopeeClient` already injects `partner_id`, `shop_id`, `timestamp`, `access_token`, and `sign` into every request. `ShopeeAdapter` correctly initializes this client by decrypting the `access_token` from `PlatformAccount`.

## 5. Polling Strategy
Since the Shopee API retains comments for the last 10 seconds:
- **Interval:** Poll every **3 seconds** (provides overlap to ensure no dropped comments during minor network delays).
- **Worker:** Use a self-rescheduling Celery task (e.g., `poll_shopee_comments`) that triggers itself with `countdown=3` if the `LiveSession` status is `RUNNING`.
- **Termination:** If the session transitions to `STOPPED`, `PAUSED`, `ERROR`, or `HUMAN_TAKEOVER`, the task gracefully exits without rescheduling.

## 6. Comment Normalization
Shopee comments will be normalized to `LiveCommentEvent`:
- `event_id`: Random UUID (for internal traceability).
- `platform`: `LivePlatformProduct.PLATFORM_SHOPEE`.
- `platform_comment_id`: Mapped from Shopee `comment_id`.
- `session_id`: Internal `LiveSession.id`.
- `company_id`: `LiveSession.company_id`.
- `user_id`: Mapped from Shopee `user_id`.
- `display_name`: Mapped from Shopee `user_name`.
- `text`: Mapped from Shopee `comment_content`.
- `timestamp`: Mapped from Shopee `comment_time`.

## 7. Dedup Strategy
Since polling overlaps (fetching the last 10s of comments every 3s), duplicate handling is mandatory.
- **Mechanism:** Redis SET via `redis_client`.
- **Key Format:** `live:company:{company_id}:session:{session_id}:dedup:comments`
- **Logic:** For each comment, execute Redis `SADD`. If it returns `0` (already exists), drop the comment. If `1`, proceed.
- **TTL:** Set a 1-hour expiration on the key, updated during initial creation, to prevent memory leaks after the session ends.

## 8. Redis State
No new persistent database tables are required. `redis_client` will handle duplicate tracking seamlessly, matching the ephemeral nature of live comments.

## 9. Celery Architecture
- **Task:** `poll_shopee_live_comments(session_id, company_id)`
- **Flow:**
  1. Retrieve `LiveSession`. If not `RUNNING`, exit.
  2. Call `ShopeeAdapter.get_comments()`.
  3. Filter duplicates using Redis.
  4. For each new comment, trigger the existing `handle_live_message.delay(...)` task.
  5. Schedule the next poll: `poll_shopee_live_comments.apply_async(..., countdown=3)`.

## 10. Rate Limiting & Error Handling
- **`PlatformRateLimitError` (429):** Log warning, increase `countdown` to 10 seconds for the next poll (Exponential backoff fallback).
- **`PlatformAuthError`:** Log critical error, transition session status to `ERROR`, stop polling.
- **`PlatformAPIError`:** Log error, proceed with normal retry (3s). 
- **Consecutive Failures:** If polling fails 15 consecutive times (approx. 45 seconds outage), transition session to `ERROR` and stop polling.

## 11. Tenant Isolation
- `ShopeeAdapter` strictly filters by `company_id`.
- The Redis dedup key explicitly embeds `company_id` to prevent cross-tenant key collision.
- The `LiveSession` query strictly mandates `company_id`.

## 12. Security
Tokens are natively decrypted in memory during the polling cycle via `ShopeeAdapter`. PII from Shopee users (`user_name`, `user_id`) should only be passed to `LiveOrchestrator` and not persisted to disk unencrypted outside of standard Django logs (which will be rotated).

## 13. Migration Requirement
None. No model modifications are needed.

## 14. Tests
- Ensure `get_comments` handles Shopee JSON responses accurately.
- Mock Redis `SADD` to verify dedup works perfectly (duplicate comments are dropped).
- Test that consecutive errors trigger fallback mechanisms and eventually abort polling.
- Test tenant isolation enforcement on polling queries.

## 15. Risks & Limitations
- **Offset/Pagination:** If the stream has more than 50 comments per 3 seconds, we might need to handle the `offset` parameter dynamically. Given MVP limits, we will process the first page and log warnings if `has_more` is true.
- **API Outages:** Prolonged API outages will result in the `LiveSession` switching to `ERROR`. This is acceptable for the MVP.

## 16. Exact Implementation Scope
- [ ] Implement `ShopeeAdapter.get_comments(session_id)`.
- [ ] Create Redis dedup helper logic in `live_sessions/services.py` or within the task.
- [ ] Implement Celery task `poll_shopee_live_comments` in `tasks.py`.
- [ ] Create tests in `tests_live_shopee.py` (or `tests_polling.py`).

**Status:** AUDIT COMPLETE. READY FOR IMPLEMENTATION.
