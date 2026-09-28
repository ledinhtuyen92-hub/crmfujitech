# Phase 1D-7D: Pre-Implementation Audit (Shopee LIVE Integration)

## 1. Current Architecture
The current architecture establishes a secure foundation for Shopee integration:
- `PlatformAccount` securely stores encrypted OAuth tokens.
- `ShopeeClient` handles HTTP I/O, HMAC-SHA256 request signing, and rate limiting.
- `ShopeeAdapter` (implementing `BasePlatformAdapter`) exposes `get_account` and `get_products`.
- `LivePlatformProduct` handles the mapping between internal CRM `inventory.Product` and external Shopee item IDs.
- `LiveSession` models the lifecycle of a livestream, tracking its status and linked platform.

## 2. Existing Reusable Components
- `ShopeeClient.request()`: Automatically injects `partner_id`, `shop_id`, `timestamp`, `access_token`, and generates the `sign`. Handles timeouts and translates 429 into `PlatformRateLimitError`.
- `LiveSession` statuses: `draft`, `running`, `stopped`.
- Security mechanism: Tokens are decrypted ephemerally via `get_decrypted_access_token()`.

## 3. Shopee API Capability Matrix (LIVE)
Based on official Shopee OpenAPI v2 documentation and web research:
- **Create LIVE (`v2.livestream.start_session`)**: SUPPORTED. Used to create a session and obtain the RTMP push URL.
- **Get LIVE Detail (`v2.livestream.get_session_detail`)**: SUPPORTED. Retrieves session info, status, and view counts.
- **Update LIVE (`v2.livestream.update_session`)**: SUPPORTED. Modifies title, description, cover image.
- **End LIVE (`v2.livestream.end_session`)**: SUPPORTED. Terminates an ongoing session.
- **Manage Products (`v2.livestream.update_show_item`)**: SUPPORTED. Adds or updates products pinned in the live room.
- **Remove Products (`v2.livestream.delete_show_item`)**: SUPPORTED. Removes products from the live room.

## 4. Authentication Flow
- All livestream APIs require the standard `access_token` generated during the OAuth flow.
- Signatures (HMAC-SHA256) are required and identical to the standard Shop APIs. `ShopeeClient` already supports this.

## 5. LIVE Lifecycle
1. **Creation**: Fujitech calls `ShopeeAdapter.start_live()`. `ShopeeClient` POSTs to `/api/v2/livestream/start_session`. Shopee returns a session ID and RTMP URL.
2. **Monitoring**: Fujitech calls `ShopeeAdapter.get_live_status()` which maps to `/api/v2/livestream/get_session_detail`.
3. **Product Binding**: During the live, Fujitech calls `ShopeeAdapter.attach_product_to_live()` mapping to `/api/v2/livestream/update_show_item`.
4. **Termination**: Fujitech calls `ShopeeAdapter.stop_live()` mapping to `/api/v2/livestream/end_session`.

## 6. Product Binding
Product binding is strict:
- The input to `attach_product_to_live()` is the internal CRM `LiveSession.id` and `LivePlatformProduct.id`.
- The backend resolves `LivePlatformProduct` to extract the `platform_product_id` (the Shopee item ID) and pushes it to Shopee using `v2.livestream.update_show_item`.
- AI/LLM ONLY outputs the internal ID, preventing hallucinations of external IDs.

## 7. Error Handling & Rate Limiting
- Handled seamlessly by `ShopeeClient.request()`.
- 429 triggers `PlatformRateLimitError`.
- `error_auth` triggers `PlatformAuthError`.
- Any other error code triggers `PlatformAPIError`.

## 8. Security & Tenant Isolation
- `ShopeeAdapter` is initialized with a `company_id`.
- It fetches the `PlatformAccount` strictly for that `company_id`.
- `LiveSession` and `LivePlatformProduct` queries must filter by `company_id`.
- Cross-tenant access is explicitly rejected at the database level.

## 9. Migration Requirement
No new models are required. `LiveSession` already has `external_session_id` and `stream_url` fields. `PlatformAccount` and `LivePlatformProduct` exist.
- No DB migrations are needed.

## 10. Test Strategy
- **Mocking**: `unittest.mock.patch` will intercept `requests.request` in `tests_live_shopee.py`.
- **Coverage**: Must test `start_live`, `get_live_status`, `stop_live`, `attach_product_to_live`.
- **Security Tests**: Ensure `CapabilityNotSupportedError` is raised if a platform doesn't support an action, and verify cross-company boundaries.

## 11. Risks & Open Questions
- **Risk**: Livestream APIs might require a specific "Livestream Management" App Type in the Shopee Console, which must be approved separately from the normal Shop API.
- **Risk**: Stream stability depends on the RTMP pusher (OBS/Local Studio Window Capture). This backend only manages the lifecycle, not the video stream bytes.
- **Open Question**: Exact payload structure for `v2.livestream.start_session` (e.g., required cover images). We will use minimal payloads in the MVP and mock them defensively.

## 12. Exact Implementation Scope
1. Update `ShopeeClient` (no changes needed, it's generic).
2. Update `ShopeeAdapter` to implement `start_live`, `get_live_status`, `stop_live`, and `attach_product_to_live`.
3. Ensure `get_capabilities()` includes `Capability.LIVE_START`, `LIVE_STATUS`, `LIVE_STOP`, `PRODUCT_ATTACH`.
4. Create `live_sessions/tests_live_shopee.py` to validate the Shopee LIVE implementation.
5. Create Architecture Lock document.
