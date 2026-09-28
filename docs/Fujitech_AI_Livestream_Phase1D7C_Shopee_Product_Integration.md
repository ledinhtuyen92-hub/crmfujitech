# Phase 1D-7C: Shopee Account & Product Integration

## 1. Overview
This phase implements the capability to read account information and product catalogs from a connected Shopee shop via the Shopee OpenAPI v2. It securely translates external platform products into Fujitech's internal mapping schema (`LivePlatformProduct`) while ensuring strict Tenant Isolation and preserving Fujitech's Product Truth.

## 2. Architecture & Patterns
- **`ShopeeClient`**: A low-level HTTP wrapper strictly responsible for network I/O. It automatically generates HMAC-SHA256 signatures, manages timestamps, handles rate limiting, and translates raw Shopee errors into domain-specific exceptions.
- **`ShopeeAdapter`**: Implements `BasePlatformAdapter` to provide domain-level abstractions (`get_account`, `get_products`). It interacts with the `PlatformAccount` to securely decrypt access tokens via `get_decrypted_access_token()`.

## 3. Product Flow & Mapping
- **List Shopee Products (`GET /api/live-sessions/platforms/shopee/products/`)**: Fetches items using `/api/v2/product/get_item_list` to get IDs, then `/api/v2/product/get_item_base_info` to get details (name, price, stock, sku).
- **Create Mapping (`POST /api/live-sessions/platforms/shopee/mapping/`)**: Binds a `fujitech_product_id` to a `shopee_item_id`.
- **Product Truth Boundary**: The `inventory.Product` (Fujitech Product) remains the canonical source of truth for commercial data. Shopee product metadata (like price and stock) is only fetched for reconciliation and LIVESTREAM pinning. Mismatches (e.g., price differences) are detectable but do not auto-overwrite the CRM's Product Truth.

## 4. Security & Tenant Isolation
- Access tokens are only decrypted ephemerally in memory by `ShopeeAdapter._init_client()` and are never leaked to Logs, Serializers, or the Frontend.
- Product mappings strictly validate that the `inventory.Product` belongs to the authenticated user's `company_id`.
- If a cross-tenant mapping is attempted (mapping a Shopee Product to another Company's Fujitech Product), a `404 Not Found` is enforced by `get_object_or_404`.

## 5. Rate Limits & Error Handling
- **Rate Limiting**: If Shopee API returns HTTP 429, it is translated into a `PlatformRateLimitError`.
- **Auth Failure**: If `error_auth` or `error_token` is received, it throws `PlatformAuthError` (signaling the token lifecycle manager to refresh it).
- **Timeouts**: All ShopeeClient requests have a strict 10-second timeout to prevent deadlocking the worker/backend thread.

## 6. Testing
Tests intercept `requests.request` using `unittest.mock.patch` to return mock JSON payloads identical to Shopee OpenAPI v2 responses.
1. Tests validated successful account fetching and normalization.
2. Tests validated successful product fetching (multi-request list + info).
3. Tests validated DRF endpoints return accurate data and mappings are created securely.
4. Tests validated cross-company mapping prevention.
5. All Local Studio Regression tests remain PASS.
