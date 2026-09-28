# Phase 1D-4.1 Platform Feasibility Spike

## 1. Executive Summary
This document serves as the Platform Feasibility Spike for integrating Fujitech AI Livestream with TikTok and Shopee. The primary goal is to audit official APIs and capabilities without implementing any code. Key findings indicate that while Shopee offers official endpoints for Livestream session management and comment polling, TikTok's public APIs strictly restrict access to LIVE creation, RTMP stream keys, and realtime comments for ordinary developers. No unofficial scraping tools will be used in the MVP architecture to ensure compliance and enterprise stability.

## 2. Existing Codebase Integration Points
Based on the previous codebase audit, the following integration points currently exist:
- **Product Mapping:** `LivePlatformProduct` model links a CRM `Product` to a specific platform (`tiktok`, `shopee`, `custom`), storing `platform_product_id` and `affiliate_url`.
- **Session Management:** `LiveSession` tracks the status of a live room (draft, running, stopped) and associates it with a `LiveDevice` and a platform.
- **Missing Elements:** There are currently no OAuth models (`PlatformAccount`), no `PlatformAdapter` implementations, no Webhook/Event gateways for ingestion, and no API clients for TikTok/Shopee.

## 3. TikTok Official Capability Matrix
Based on official TikTok Shop Open Platform capabilities:

- **OAuth Authentication:** SUPPORTED (Requires App Review)
- **Shop / Product Management:** SUPPORTED (Full API available)
- **Create LIVE Session API:** REQUIRES APPROVAL (Restricted to official MCNs/Agencies)
- **Get RTMP Stream Key:** REQUIRES APPROVAL (Restricted, typical users must use TikTok Live Studio/App)
- **LIVE Comments/Chat Ingestion:** NOT SUPPORTED (No official public Webhook/API for real-time comments)
- **LIVE Product Pinning/Attachment:** SUPPORTED (via specific Shop API if granted LIVE permissions)
- **Send Reply/Comment:** NOT SUPPORTED

## 4. Shopee Official Capability Matrix
Based on official Shopee Open Platform capabilities:

- **OAuth Authentication:** SUPPORTED (HMAC-SHA256 signature required)
- **Shop / Product Management:** SUPPORTED
- **Create LIVE Session (`v2.livestream.start_session`):** SUPPORTED (Returns Stream URL/Key)
- **Get RTMP Stream Key:** SUPPORTED
- **LIVE Comments/Chat (`v2.livestream.get_latest_comment_list`):** SUPPORTED (Requires polling, no Webhooks/WebSocket)
- **LIVE Product Attachment (`v2.livestream.add_item_to_session`):** SUPPORTED
- **Send Reply/Comment:** NOT SUPPORTED

## 5. LIVE Comment Feasibility
- **TikTok:** **NO OFFICIAL REALTIME COMMENT CHANNEL VERIFIED.** Scrapers and reverse-engineered libraries (`TikTokLive`) violate TOS and are strictly excluded from the MVP.
- **Shopee:** Official API `get_latest_comment_list` is available. Requires a continuous polling mechanism with latency tradeoffs.
- **Fallback:** If comments cannot be ingested officially (TikTok), the AI avatar can operate in a "Visual-Only / Presenter" mode (speaking pre-scripted sales pitches or RAG-driven product knowledge without interactive Q&A).

## 6. LIVE Streaming Feasibility
- **TikTok:** No native RTMP ingestion API for regular developers. 
  - **Requirement:** The user MUST use TikTok Live Studio on their Windows machine, utilizing "Window Capture" to stream the Local Studio Pygame Avatar.
- **Shopee:** RTMP stream keys are provided via the API.
  - **Requirement:** Local Studio currently outputs to Pygame, not RTMP. The MVP will require using OBS with "Window Capture" pushing to the Shopee RTMP URL.
- **Separation:** AI avatar rendering (Local Studio) is strictly decoupled from RTMP publishing (OBS/TikTok Live Studio) for the MVP.

## 7. Product / Affiliate Feasibility
- **Flow:** `Fujitech Product` -> `Platform Product Mapping (LivePlatformProduct)` -> `Platform Product ID` -> `Affiliate/Shop URL` -> `LIVE Room`.
- **Creation:** Users manually create mappings in the CRM frontend, or the backend syncs products via Shopee/TikTok Shop APIs.
- **LLM Boundary:** The LLM does NOT generate affiliate URLs. It outputs a `product_id` and an `action` (e.g., "pin"). The Backend Orchestrator resolves the `platform_product_id` and executes the API call via the PlatformAdapter.

## 8. Authentication / OAuth
- Both platforms require standard OAuth 2.0 flows.
- **Requirements:** We need a new model `PlatformAccount` linked to `Company` to store `access_token`, `refresh_token`, and token expiration timestamps securely. Tokens must be refreshed automatically by background tasks before they expire.

## 9. Webhook / Event Architecture
- **Shopee Comments:** A Celery Beat task or asynchronous worker must poll `get_latest_comment_list` for active sessions and publish to a Redis Event Stream.
- **Order Webhooks:** Both platforms support standard webhooks for order creation/payment. A webhook gateway (`views.py`) will receive these, verify the HMAC/signatures, and push `OrderEvent` to the Redis Stream for the AI to acknowledge sales.

## 10. PlatformAdapter Requirements
The MVP requires an abstract `BasePlatformAdapter` with implementations for `TikTokAdapter` and `ShopeeAdapter`.

**Required Interface (Draft):**
- `authenticate(company_id)`
- `start_live(session_id)` -> Returns RTMP URL or raises `CapabilityUnavailable`
- `stop_live(session_id)`
- `get_live_status(session_id)`
- `get_comments(session_id)` -> Returns list of comments or raises `CapabilityUnavailable`
- `attach_product_to_live(session_id, platform_product_id)`

**Handling Unavailable Capabilities:** If a platform (e.g., TikTok) does not support `get_comments` natively, `TikTokAdapter.get_comments()` must explicitly return a structured "Capability Unavailable" response, preventing the Orchestrator from waiting for events.

## 11. MVP Decision Matrix

| Capability | TikTok | Shopee | Official Source | Approval | MVP Status | Risk |
|---|---|---|---|---|---|---|
| OAuth Auth | SUPPORTED | SUPPORTED | Developer Portals | Required | MUST HAVE | High (Review Time) |
| Live Creation | RESTRICTED | SUPPORTED | Shopee API Ref | Restricted | DEFER (TikTok) | Low (Use OBS) |
| RTMP Stream Key | RESTRICTED | SUPPORTED | Shopee API Ref | Restricted | DEFER (TikTok) | Low (Use OBS) |
| Comment Ingestion | NOT SUPPORTED | SUPPORTED | Shopee API Ref | - | BLOCKED (TikTok) | High (TikTok) |
| Reply to Comments | NOT SUPPORTED | NOT SUPPORTED | - | - | BLOCKED | Low (Voice AI instead) |
| Product Mappings | SUPPORTED | SUPPORTED | TikTok/Shopee Shop APIs | Required | MUST HAVE | Medium |
| Order Webhooks | SUPPORTED | SUPPORTED | Developer Portals | Required | SHOULD HAVE | Medium |

## 12. Fallback Architecture
- **Scenario C (No official comment API for TikTok):** The Orchestrator operates TikTok sessions in a pure "Presenter" state. No interactive intent routing occurs; the AI loops through product pitches.
- **Scenario D (Streaming requires OBS):** Local Studio remains a pure Pygame window. No FFmpeg/RTMP injection logic is built into Local Studio. User manuals will instruct using OBS "Window Capture".

## 13. Mock Platform Strategy
To test end-to-end integration without real platform credentials:
1. Develop `MockShopeeAdapter` and `MockTikTokAdapter` that simulate successful API responses.
2. Build a management command (e.g., `python manage.py simulate_events <session_id>`) to manually inject mock comments and order webhooks into the Redis Event Gateway.
3. The Orchestrator processes these mock events, triggering AI Voice responses exactly as in production.

## 14. Security Requirements
- **Encryption:** OAuth tokens in `PlatformAccount` must be encrypted at rest using `django-cryptography`.
- **Validation:** All incoming webhooks must strictly validate the platform's cryptographic signature (HMAC-SHA256).
- **Tenant Isolation:** The Orchestrator must assert `company_id` matches across `LiveSession`, `LiveDevice`, and `PlatformAccount` before initiating any API calls.

## 15. Multi-Tenant Requirements
- A `Company` can own multiple `PlatformAccount` instances (e.g., 2 TikTok shops, 1 Shopee shop).
- A `LiveSession` must explicitly reference a specific `PlatformAccount` ID to ensure the correct access tokens are used.
- Cross-tenant data leakage is prevented by strict Foreign Key filtering (`company=request.user.company`) in all platform mapping APIs.

## 16. Risks / Blockers
- **BLOCKER (TikTok Comments):** As there is no official API for comments, TikTok Live interaction cannot be implemented legally/stably. It must be deferred or downgraded to "Visual Only".
- **RISK (Shopee Polling):** Polling introduces API rate limit concerns and latency. Exponential backoff and strict polling intervals (e.g., 2-3 seconds) are necessary.
- **RISK (App Approval):** Both platforms require a manual app review process before production OAuth tokens are granted to merchants.

## 17. Recommended Next Phase
1. Establish `PlatformAccount` models and the `BasePlatformAdapter` abstraction.
2. Implement `MockShopeeAdapter` and the Redis Event Gateway.
3. Wire mock comments to the Intent Router to finalize the Cloud AI interactive loop.

## 18. Official Sources
- **TikTok Shop Open Platform:** https://developers.tiktok-shops.com
- **Shopee Open Platform:** https://open.shopee.com

---

READY FOR ARCHITECTURE LOCK
