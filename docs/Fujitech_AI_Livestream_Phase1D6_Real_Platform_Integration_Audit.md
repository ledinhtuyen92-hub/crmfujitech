# Phase 1D-6 Real Platform Integration Audit

## 1. Executive Summary
This document provides a pre-implementation audit for integrating real Livestream platforms (Shopee and TikTok) into the Fujitech AI Livestream architecture. The audit focuses on OAuth flows, API capabilities, security, and MVP scope alignment, confirming what capabilities can be implemented and what limitations exist.

## 2. Existing Credential Security
**Audit Result:** `NO EXISTING ENCRYPTION MECHANISM FOUND`

A review of the backend codebase (searching for Fernet, AES, Cryptography, EncryptedField, SecretField) confirms that OAuth tokens (e.g., ZaloOAConfig, Facebook pages) are currently stored in plaintext `models.TextField`. 
- **Recommendation:** Implement a custom `EncryptedTextField` using `django-cryptography` or `cryptography.fernet` in a future security hardening phase. For the MVP, `PlatformAccount` will follow the existing project standard (plaintext `TextField`), but strict logging redaction MUST be enforced.

## 3. Shopee OAuth
- **Registration:** Partner registration required on Shopee Open Platform. Needs App ID and Partner Key.
- **Environment:** Shopee offers a Sandbox and Production environment. Production requires App Review.
- **Flow:** Standard OAuth 2.0. Redirects user to Shopee authorization page, returns `code`, exchanges for `access_token` and `refresh_token`.
- **Token Expiry:** Access tokens usually expire in 24 hours, refresh tokens last 30 days.
- **Request Signing:** ALL API requests require HMAC-SHA256 signature using the `partner_key`, timestamp, and request body.

## 4. Shopee Product API
- **API Availability:** `SUPPORTED`.
- **Capabilities:** Get item list, get item details (`item_id`, `price`, `stock`, `status`).
- **Update:** Can update price/stock for Flash Sales during livestream.

## 5. Shopee LIVE API
- **Create/Start/Stop:** `SUPPORTED` via specific Live Stream API endpoints.
- **RTMP/Stream Key:** Can retrieve RTMP URL and Stream Key via API.
- **Product Management:** Can add/pin/unpin products in the live room (`SUPPORTED`).

## 6. Shopee Comment Polling
- **API Availability:** `SUPPORTED` but requires POLLING. No WebSocket/Webhook for comments.
- **Polling Strategy:**
    - Worker polls endpoint every X seconds (requires load/rate-limit validation).
    - Uses a `cursor` or `last_comment_id` mechanism to avoid duplicates.
    - Rate Limit considerations are critical. If limit is 10 req/sec, polling 1 req/sec per session is safe for small scale but requires batching or careful backoff for larger scales.
- **Integration:** Polling worker fetches comments -> Deduplication -> Maps to `LiveCommentEvent` -> Event Gateway.

## 7. Shopee Order Integration
- **Order Webhooks:** `SUPPORTED`. Shopee Push mechanism can send order status updates.
- **Order Polling:** `SUPPORTED` as fallback.

## 8. TikTok OAuth
- **Registration:** TikTok Shop Partner Center.
- **Developer Type:** Requires ISV (App Developer) for public apps.
- **Approval:** Requires strict compliance/legal review before going public (can take 3+ weeks).
- **Flow:** Standard OAuth 2.0.
- **Token Expiry:** Access token 24h, refresh token 365 days.

## 9. TikTok Shop / Product
- **API Availability:** `SUPPORTED` (Get products, orders, inventory).

## 10. TikTok LIVE
- **LIVE Comments:** `BLOCKED / NOT VERIFIED FOR MVP`. There is no official public API for developers to read live comments in real-time.
- **LIVE Streaming:** Streaming via RTMP is generally restricted to official partners (MCNs) or users with TikTok Live Studio access.
- **Conclusion for MVP:** TikTok is restricted to "Visual Presenter Mode" (no interactive Q&A). Streaming must use TikTok Live Studio Window Capture.

## 11. Token Lifecycle
- **Refresh Ownership:** A background Celery beat task should monitor `token_expires_at` for `PlatformAccount` and proactively refresh before expiry.
- **Tenant Isolation:** Tokens belong strictly to `company_id`. Re-authentication must verify the OAuth callback `state` parameter to prevent CSRF and cross-tenant token mapping.

## 12. Webhook / Callback Security
- **OAuth Callback:** Must use `state` parameter (signed JWT or random nonce stored in Redis) to prevent CSRF.
- **Webhooks (Shopee Orders):** Must validate the HMAC-SHA256 signature in the request headers to ensure the payload is genuinely from Shopee/TikTok.

## 13. Product Mapping
- **Mapping:** `Fujitech Product` -> `LivePlatformProduct` -> `Platform item_id`.
- **Validation:** When mapping, the backend must fetch platform API to verify the `item_id` exists and belongs to the authenticated Shop.
- **AI Core:** AI Core continues to output internal `product_id`. `PlatformAdapter` handles the resolution to `platform_product_id` for pinning.

## 14. Live Session Mapping
- **Missing Fields:** `LiveSession` model currently lacks fields to track the platform's native session state. 
- **Recommendation:** Add `external_live_id` (str) and `stream_url` (str) to `LiveSession` in the next phase.

## 15. CRM Order Mapping
- **Flow:** Shopee Order Webhook -> Normalized Order Event -> Fujitech CRM `Order` creation.
- **Existing Models:** Reuse existing `Customer` and `Order` models in the CRM. No duplicate models should be created.

## 16. Error Mapping
- `invalid_token` -> `PlatformTokenExpiredError`
- `access_denied` -> `PlatformAuthError`
- `rate_limit_exceeded` -> `PlatformRateLimitError`
- `system_error` -> `PlatformAPIError`

## 17. Rate Limits / Reliability
- **Shopee API:** High risk on comment polling (Rate Limits). 
- **Mitigation:** Exponential backoff. Deduplication via Redis `SETNX`.
- **Worker Failure:** Polling workers must store the `last_comment_cursor` persistently (in Redis or DB) so they can resume after a crash without missing comments.

## 18. MVP Scope

| Capability | Shopee | TikTok | MVP Target |
| :--- | :--- | :--- | :--- |
| **OAuth Login** | SUPPORTED | SUPPORTED | MUST HAVE |
| **Product Read** | SUPPORTED | SUPPORTED | MUST HAVE |
| **Product Pin** | SUPPORTED | UNKNOWN | SHOULD HAVE |
| **Live Status** | SUPPORTED | UNKNOWN | MUST HAVE |
| **Live Comments** | SUPPORTED (Polling) | **BLOCKED** | MUST HAVE (Shopee) |
| **Order Webhook** | SUPPORTED | SUPPORTED | DEFER |
| **RTMP API** | SUPPORTED | PARTNER ONLY | DEFER |

## 19. Risks
- **Shopee Comment Polling Latency:** Polling introduces an artificial delay (2-5s) compared to native WebSockets, affecting AI responsiveness.
- **TikTok Limitations:** Inability to read comments makes TikTok integration less "interactive" and purely broadcast-based.
- **Security:** Plaintext token storage is a ticking time bomb for an ISV app.

## 20. Recommended Implementation Order
1. Shopee OAuth & App Registration.
2. Token Lifecycle & Refresh Worker.
3. Shopee Product Sync & Mapping.
4. Shopee Comment Polling Worker (Redis Gateway).
5. E2E Testing with Real Shopee Sandbox.

## 21. Official Sources
- [Shopee Open Platform Developer Guide](https://open.shopee.com/)
- [TikTok Shop Partner Center](https://partner.tiktokshop.com/)

---
**READY FOR SHOPEE IMPLEMENTATION**

- Files created: 1 (`docs/Fujitech_AI_Livestream_Phase1D6_Real_Platform_Integration_Audit.md`)
- Files modified: 0
- Tests: N/A (Audit only)
- Blockers: TikTok Live Comments (No API)
- Risks: High rate-limit risk with Shopee polling. Token security (plaintext storage).
