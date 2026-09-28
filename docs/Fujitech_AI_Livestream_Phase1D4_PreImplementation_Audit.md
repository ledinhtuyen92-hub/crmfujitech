# Phase 1D-4 Pre-Implementation Audit: TikTok & Shopee LIVE Integration

## 1. Current Architecture Review
The current Fujitech AI Livestream MVP has a decoupled execution architecture:
- **Cloud Backend:** Handles session management (`LiveSession`), device management (`LiveDevice`), and platform-product mapping (`LivePlatformProduct`). The orchestrator generates speech and commands.
- **Local Studio (Execution Core):** A lightweight WebSocket client that receives `speech.speak` commands, downloads audio, and renders a local Pygame-based 2D avatar.

**Key Findings:**
- The Local Studio currently has NO concept of TikTok or Shopee. It simply renders to a local desktop window.
- The Cloud backend has basic models for `LivePlatformProduct` (which maps a CRM `Product` to a TikTok/Shopee `platform_product_id` and `affiliate_url`), but lacks a dedicated `PlatformAdapter` layer to handle API interactions.
- We currently do NOT have an Event Gateway to ingest livestream comments or events from platforms.

## 2. TikTok Capability Audit
Based on official TikTok Shop Open Platform documentation:

### A. Authentication
- **SUPPORTED:** Standard OAuth 2.0 flow for TikTok Shop Sellers.
- **REQUIRES APPROVAL:** App needs to be reviewed and approved by TikTok before it can be published and used by merchants.

### B. LIVE
- **NOT SUPPORTED / RESTRICTED:** TikTok strictly guards its RTMP stream keys. Official API access to create a livestream and retrieve a raw RTMP URL is generally restricted to approved MCNs or specific agency partners. Ordinary sellers must use the TikTok app or TikTok Live Studio software.
- **REQUIRES APPROVAL:** Any API related to Live room creation.

### C. COMMENTS / CHAT
- **NOT SUPPORTED:** TikTok does NOT provide a public, official API or webhook to read livestream comments in real-time for standard developers. 
- **Notes:** All existing tools (like `TikTokLive` python library) use unofficial, reverse-engineered WebSocket connections. Relying on these violates TikTok's TOS and is unstable for an enterprise product.

### D. PRODUCTS
- **SUPPORTED:** TikTok Shop API provides full access to manage products, inventory, and orders.
- **SUPPORTED:** Pinning or managing products in a Live room is supported if the app has the specific TikTok Shop LIVE permissions.

## 3. Shopee Capability Audit
Based on official Shopee Open Platform documentation:

### A. Authentication
- **SUPPORTED:** OAuth 2.0 authorization with HMAC-SHA256 signature for API requests.

### B. LIVE & RTMP
- **SUPPORTED:** Shopee provides official API endpoints for Livestream (`v2.livestream`).
- **SUPPORTED:** `v2.livestream.start_session` can be used to initiate a session and retrieve the RTMP Push URL (Stream Key).

### C. COMMENTS / CHAT
- **SUPPORTED (Polling):** `v2.livestream.get_latest_comment_list` allows fetching recent comments. It requires polling (no Webhooks/WebSockets for comments).

### D. PRODUCTS
- **SUPPORTED:** Shopee API allows fetching products, updating inventory, and getting order details.
- **SUPPORTED:** `v2.livestream.get_recent_item_list` and related endpoints allow interacting with items in the livestream.

## 4. Capability Matrix

| Capability | TikTok | Shopee | Fujitech Requirement | Notes |
|---|---|---|---|---|
| **OAuth Auth** | SUPPORTED | SUPPORTED | Required | App approval needed for both |
| **Live Creation via API** | RESTRICTED | SUPPORTED | Preferred | TikTok requires TikTok Live Studio / App |
| **RTMP / Stream Key** | RESTRICTED | SUPPORTED | Required | TikTok hides stream keys for regular users |
| **Live Status** | SUPPORTED | SUPPORTED | Required | |
| **Comment Ingestion** | NOT SUPPORTED | SUPPORTED (Poll) | Required | TikTok requires unofficial scrapers (High Risk) |
| **Reply to Comments** | NOT SUPPORTED | NOT SUPPORTED | Optional | AI replies via Voice/TTS, not text |
| **Product List/Details** | SUPPORTED | SUPPORTED | Required | Standard e-commerce APIs |
| **Product Attachment** | SUPPORTED | SUPPORTED | Required | |
| **Affiliate URL** | SUPPORTED | SUPPORTED | Optional | |
| **Order Info / Webhooks**| SUPPORTED | SUPPORTED | Required | Webhooks available for order updates |

## 5. Platform Adapter Architecture
To keep the Live Orchestrator platform-agnostic, we must introduce a **Platform Adapter** layer in the Cloud Backend.

```python
class BasePlatformAdapter:
    def authenticate(self, company_id): ...
    def connect_live(self, session_id): ...
    def get_live_status(self, session_id): ...
    def receive_comments(self, session_id): ...
    def attach_product_to_live(self, session_id, product_id): ...
```
- **TikTokAdapter:** Will likely require manual livestream creation by the user via TikTok Live Studio, and comment ingestion is currently a major blocker without using unofficial libraries.
- **ShopeeAdapter:** Can fully implement `connect_live` (returns RTMP) and `receive_comments` (via polling loop).

## 6. Event Gateway Architecture
Platform events (comments, join events, orders) must enter the Fujitech system without blocking the Cloud APIs.

**Target Architecture:**
1. **Shopee:** A Celery Beat worker (or asynchronous task) continuously polls `get_latest_comment_list` for active Shopee LiveSessions.
2. **TikTok:** (If unofficial scraper is approved as a risk) A lightweight Node.js/Python microservice connects to TikTok WebSockets and pushes events.
3. **Event Bus:** Events are normalized into a standard format (`LiveEvent`) and published to Redis Pub/Sub or a Redis Stream.
4. **Live Orchestrator:** Subscribes to the Redis Stream, processes the `LiveEvent` (Intent Router -> RAG/AI), and outputs `speech.speak` to the Local Studio.

## 7. Product / Affiliate Audit
The existing `LivePlatformProduct` model is well-designed for this phase:
- It maps the internal `inventory.Product` to `platform` (e.g., 'tiktok', 'shopee').
- It contains `platform_product_id` and `affiliate_url`.
- **Recommendation:** Keep this model. No changes are strictly necessary for the MVP, though we may need to add `platform_shop_id` if a company has multiple shops per platform.

## 8. Livestream Media Architecture
Since Local Studio currently renders to a local Pygame desktop window, how does the video reach the platform?

- **Shopee:** Shopee provides an RTMP URL. However, our Local Studio does not output RTMP natively (it's a Pygame window).
  - *Solution A (OBS):* The user runs OBS on their machine, uses "Window Capture" to capture the Local Studio Pygame window (chroma keying the green background), and inputs the Shopee RTMP key into OBS to stream.
  - *Solution B (FFmpeg):* We build FFmpeg into Local Studio to capture the Pygame surface array and push to RTMP. (High engineering effort).
- **TikTok:** TikTok does not provide RTMP keys to regular users.
  - *Solution:* The user MUST run TikTok Live Studio on their Windows PC, use "Window Capture" to capture our Local Studio Pygame window, and stream directly.

**Conclusion:** For Phase 1D MVP, **OBS / TikTok Live Studio Window Capture** is the only viable, low-effort streaming architecture. Local Studio remains a local renderer.

## 9. Security Audit
- **OAuth Tokens:** Must be encrypted at rest in the database (e.g., using `django-cryptography` or KMS) and tied securely to the `Company` tenant.
- **Webhook Verification:** Shopee/TikTok webhooks must be verified using HMAC signatures to prevent spoofing.
- **Local Studio:** Continues to use its short-lived JWT token. It never receives or stores TikTok/Shopee OAuth tokens.

## 10. Multi-Tenant Audit
The hierarchy `Company -> LiveSession -> LiveDevice -> Products` is preserved. 
- A new model `PlatformAccount` or `PlatformAuthorization` is needed to store the OAuth tokens per `Company` per `Platform`.
- `LiveSession` must link to the specific `PlatformAccount` being used.

## 11. Human Takeover Behavior
- **AI Mode:** Comments flow from Event Gateway -> AI -> Local Studio.
- **Human Takeover:** Event Gateway continues to ingest comments (so the UI can display them to the human operator), but the Intent Router stops forwarding them to the AI Core. The Orchestrator does not generate `speech.speak`.
- **AI Resume:** Intent Router clears the comment backlog (or summarizes it) and resumes normal AI generation.

## 12. Failure / Reconnect Behavior
- **Comment Polling Failure:** Shopee polling worker must implement exponential backoff and track the last seen `comment_id` to avoid duplicates upon reconnect.
- **OAuth Expiration:** Backend must automatically refresh tokens using the Refresh Token before starting a LiveSession. If refresh fails, the session status goes to `ERROR`.
- **Stream Disconnect:** If OBS drops the RTMP connection, the platform will eventually end the live. The Event Gateway must detect the "Live Ended" API status and transition the `LiveSession` to `STOPPED`.

## 13. Local Mock Strategy
To develop without spamming real platforms:
1. Create `MockShopeeAdapter` and `MockTikTokAdapter`.
2. Implement a Django Management Command: `python manage.py simulate_live_comments <session_id>` that injects fake comments into the Redis Event Stream.
3. The Orchestrator will process these fake comments exactly like real ones, allowing full end-to-end testing of the AI and Avatar without network calls.

## 14. Recommended Implementation Order
1. Create `PlatformAccount` models and basic Mock Adapters.
2. Implement the Redis Event Gateway and the `simulate_live_comments` mock tool.
3. Connect the Event Gateway to the Live Orchestrator (Intent Router).
4. (Optional for MVP) Implement Shopee OAuth and real Comment Polling.
5. Rely on OBS/Window Capture for video streaming.

## 15. Risks & Blockers
- **BLOCKER (TikTok):** Lack of official Comment API and RTMP keys for TikTok means full automation is impossible without violating TOS (using unofficial scrapers) or requiring the user to manually use TikTok Live Studio.
- **RISK (Shopee):** Comment polling introduces latency (e.g., 2-5 seconds) compared to WebSockets, slowing down the AI's response time to viewers.

## 16. Open Questions
1. Do we accept the risk of using unofficial TikTok scraper libraries (e.g., `TikTokLive`) for comment ingestion, or do we limit TikTok support to "Visual Only" (no chat interaction) for the MVP?
2. Are we enforcing the use of OBS/TikTok Live Studio for video capture, or should we invest in native FFmpeg RTMP pushing from Local Studio? (Recommendation: Stick to OBS for MVP).
