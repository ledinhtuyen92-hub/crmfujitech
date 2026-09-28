# Phase 1D-7D: Architecture Lock (Shopee LIVE Integration)

## 1. Exact Implementation Scope
This phase focuses exclusively on integrating Shopee LIVE session management via the `ShopeeAdapter` abstraction, ensuring zero leakage of platform-specific business logic into the AI Core.

## 2. Responsibilities
- **`ShopeeLiveClient` (or extended `ShopeeClient`)**: Handles raw HTTP requests to `v2.livestream.*` endpoints. Manages HMAC-SHA256 signing, authentication tokens, timeouts, and Shopee-specific error translation.
- **`ShopeeAdapter`**: Implements `BasePlatformAdapter` capabilities for LIVE:
  - `start_live(session_id: str)` -> Maps to `/api/v2/livestream/start_session`
  - `stop_live(session_id: str)` -> Maps to `/api/v2/livestream/end_session`
  - `get_live_status(session_id: str)` -> Maps to `/api/v2/livestream/get_session_detail`
  - `attach_product_to_live(session_id: str, platform_product_id: str)` -> Maps to `/api/v2/livestream/update_show_item`
- **`LiveSession` (CRM)**: The authoritative lifecycle controller for Fujitech. When `LiveSession.start()` is called, it triggers the adapter.
- **`LivePlatformProduct`**: Provides the mapping boundary. Only bound products can be passed to `attach_product_to_live`.
- **Product Truth**: CRM `Product` remains authoritative.

## 3. Rate Limit Handling
Standardized across all `ShopeeClient` requests:
- Detect HTTP 429.
- Raise `PlatformRateLimitError`.
- Let higher-level orchestrator tasks handle retry/exponential backoff (not implemented directly inside the HTTP client).

## 4. Security & Isolation
- **Tenant Isolation**: Assert `Company A` cannot start a live using `Company B`'s `PlatformAccount`.
- **Token Security**: Tokens decrypted ephemerally using `PlatformAccount.get_decrypted_access_token()`. Never logged or leaked.
- **Capability Checks**: If a capability is missing (e.g., Shopee doesn't support comment replies natively via API yet), the adapter must raise `CapabilityNotSupportedError`.

## 5. File Modifications
**Files to Modify:**
- `backend/live_sessions/platforms/shopee.py`: Implement `start_live`, `get_live_status`, `stop_live`, and `attach_product_to_live` in `ShopeeAdapter`. Expand `get_capabilities()`.
- `backend/live_sessions/platforms/capabilities.py`: Ensure capabilities exist for LIVE actions.
- `backend/live_sessions/platforms/base.py`: Ensure interface matches capabilities.

**Files to Create:**
- `backend/live_sessions/tests_live_shopee.py`: Dedicated test suite for Shopee LIVE operations with mocked `requests.request`.

**Migrations:**
- A new migration is required to add `external_session_id` and `stream_url` to `LiveSession`.

## 6. ARCHITECTURE REVISION — BLOCKER RESOLUTION
- **Root Cause**: The initial Architecture Lock incorrectly assumed `LiveSession` contained fields to store the external livestream session ID and RTMP push URL.
- **Codebase Audit**: Confirmed `backend/live_sessions/models.py` lacks `external_session_id`, `stream_url`, or a JSON `metadata` field.
- **Fields Added**:
  - `external_session_id` (`CharField(max_length=255, null=True, blank=True)`): Stores Shopee's session_id to enable subsequent API calls (status check, end, bind product).
  - `stream_url` (`URLField(max_length=1000, null=True, blank=True)`): Stores the RTMP URL needed for OBS/Live Studio to push the stream.
- **Why**: Without storing `external_session_id`, the backend cannot interact with the specific session again.
- **No Unnecessary Data**: We will not add a generic `metadata` JSON field yet, as the MVP only requires these two explicit attributes.
- **Migration**: Mandatory to alter the DB schema.
- **Backward Compatibility**: `null=True, blank=True` ensures existing `LiveSession` rows remain valid. Uniqueness is not enforced globally because external IDs may theoretically conflict across different platforms.

**Dependencies:**
- None.

**Tests:**
- Mock all HTTP interactions.
- Validate success, rate limit, auth failure, cross-tenant isolation, and capability unsupported scenarios.
- Verify `LiveSession` correctly stores the new fields.
