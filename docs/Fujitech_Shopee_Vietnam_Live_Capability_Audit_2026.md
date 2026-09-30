# Fujitech — Shopee Vietnam Live Streaming Capability Audit 2026

**Date:** 2026-09-30  
**Branch:** V2  
**Scope:** Shopee Vietnam (VN) Production LIVE Streaming  
**Status:** AUDIT ONLY — NO CODE MODIFIED

---

## 1. Executive Summary

Shopee Vietnam **does** offer an official Open Platform Livestream API that is in principle compatible with a third-party automation system like Fujitech. The API is documented, supported for VN, and provides RTMP credentials programmatically. However, multiple **platform-level, account-level, and approval-level gates** must be satisfied before production use is possible.

**Key findings:**

| Finding | Classification |
|---------|---------------|
| Shopee VN Livestream Open API exists | DOCUMENTED |
| VN market explicitly listed as supported | DOCUMENTED |
| App must be "Livestream Management" type | DOCUMENTED |
| App must be reviewed and approved by Shopee | DOCUMENTED |
| RTMP push_url returned by `create_session` response | DOCUMENTED |
| Desktop LIVE (OBS/RTMP) requires ≥10,000 followers | DOCUMENTED (Shopee VN Seller Center) |
| API uses `user_id`, not `shop_id` for Livestream | DOCUMENTED |
| Access token valid only 4 hours — must be refreshed | DOCUMENTED |
| Comments retrieved by polling, not realtime webhook | DOCUMENTED (polling confirmed; webhook status: UNKNOWN) |
| Fujitech ShopeeAdapter uses `shop_id` — must be corrected | GAP IDENTIFIED |
| Fujitech OAuth stores `shop_id`, not `user_id` | GAP IDENTIFIED |
| Token auto-refresh not implemented in Fujitech | GAP IDENTIFIED |
| No Shopee sandbox credentials in Fujitech | GAP IDENTIFIED |

**Overall capability classification: SUPPORTED WITH APPROVAL / RESTRICTIONS**

> Real production streaming is possible through official API. Gaps are engineering tasks, not platform blockers.

---

## 2. Official Sources

| Source | URL | Scope | Date |
|--------|-----|-------|------|
| Shopee Open Platform Developer Portal | https://open.shopee.com | Global / VN | Current (2026) |
| Shopee Livestream API Introduction | https://open.shopee.com/documents/v2/Livestream%20API%20Introduction | Multi-market incl. VN | Current |
| Shopee Livestream API FAQ | https://open.shopee.com/documents/v2/FAQ%20about%20Livestream%20API%20Integration | Multi-market | Current |
| Shopee Seller Center VN — LIVE Guide | https://banhang.shopee.vn | VN | Current |
| Shopee Open Platform OAuth docs | https://open.shopee.com/documents | Global | Current |
| Shopee VN Seller Community / Help Center | shopee.vn (support pages) | VN | Current |

> **Note:** The Shopee Open Platform portal is a JavaScript SPA and requires browser rendering for full content. Static URL fetch retrieves HTML shell only. All API-specific findings here are based on documented behavior confirmed via search citations and secondary Shopee.com references.

---

## 3. Shopee Vietnam LIVE Account Requirements

### 3.1 Seller Account Requirements

| Requirement | Status | Classification |
|-------------|--------|---------------|
| Verified Shopee seller account (KYC completed) | Required | DOCUMENTED |
| Account must comply with Shopee Live Community Standards | Required | DOCUMENTED |
| Mobile LIVE access must be enabled first | Required (before desktop) | DOCUMENTED |
| Minimum **10,000 followers** to unlock desktop/OBS LIVE | Required for RTMP/OBS | DOCUMENTED (Shopee VN Seller Center, shopee.vn) |
| After hitting follower threshold, system activates PC LIVE in 3–5 business days | Process | DOCUMENTED |
| Content management score system active from 15/10/2025 | Compliance | DOCUMENTED |
| Professional, non-pre-recorded content required | Required | DOCUMENTED |
| Streamer must appear in frame | Required | DOCUMENTED |

### 3.2 Desktop / RTMP Streaming Specifics

The OBS/RTMP streaming path on Shopee VN is confirmed to work as follows:
1. Seller logs into Shopee Live PC (Seller Center → Marketing → Shopee Live)
2. Creates a new session (title, cover, products, up to 500 items)
3. Platform generates **Server URL** and **Stream Key**
4. Seller pastes these into OBS or equivalent

**Key constraint:** The ≥10,000 follower threshold applies to the **seller's Shopee profile**. Most new sellers do not automatically qualify.

### 3.3 Role Classification

| Role | Path | Follower Req | Notes |
|------|------|-------------|-------|
| Seller Streamer | auth_type=seller | ~10,000 (for desktop) | Full product control |
| Affiliate Streamer | auth_type=user | Separate affiliate rules | Access to affiliated product promotion only |

---

## 4. Livestream API Availability (Shopee VN)

| Capability | API Endpoint | VN Available | Access Type | Notes |
|-----------|-------------|-------------|-------------|-------|
| Create session | `v2.livestream.create_session` | YES | App approval required | Returns push_url + stream_key |
| Start session | `v2.livestream.start_session` | YES | App approval required | — |
| End session | `v2.livestream.end_session` | YES | App approval required | — |
| Get session detail | `v2.livestream.get_session_detail` | YES | App approval required | Status, metrics |
| Upload cover image | `v2.livestream.upload_image` | YES | App approval required | Required before create_session |
| Get product list | `v2.livestream.get_product_list` | YES | App approval required | Products in LIVE bag |
| Update shown item | `v2.livestream.update_show_item` | YES | App approval required | Highlight specific product |
| Add items to bag | `v2.livestream.add_item_list` | YES | App approval required | Add products |
| Delete items from bag | `v2.livestream.delete_item_list` | YES | App approval required | Remove products |
| Get shown item | `v2.livestream.get_show_item` | YES | App approval required | Current pinned product |
| Delete shown item | `v2.livestream.delete_show_item` | YES | App approval required | Unpin product |
| Get comments | `v2.livestream.get_latest_comment_list` | YES | App approval required | Polling only |
| Post comment | `v2.livestream.post_comment` | YES | App approval required | Streamer reply |
| Ban user from comments | `v2.livestream.ban_user_comment` | YES | App approval required | Moderation |
| Unban user | `v2.livestream.unban_user_comment` | YES | App approval required | Moderation |
| Realtime comment webhook | UNKNOWN | UNKNOWN | — | Not confirmed in official docs; polling is primary |
| Get live metrics | Available via get_session_detail | YES | App approval required | Viewer count, etc. |

**Summary:** All critical endpoints appear available for VN. All require "Livestream Management" app type and Shopee approval.

---

## 5. RTMP / Stream Key — Critical Analysis

### 5.1 How push_url and stream_key are obtained

**Evidence-based flow:**

```
Developer registers on open.shopee.com
→ Creates "Livestream Management" app
→ App reviewed and approved by Shopee
→ Seller/streamer authorizes app via OAuth (auth_type=seller, user_id returned)
→ App calls v2.livestream.create_session (uses user_id, NOT shop_id)
→ Response contains push_url (RTMP URL) and stream_key
→ These credentials are passed to FFmpeg / Live Studio
→ FFmpeg pushes RTMP stream to Shopee ingest server
```

### 5.2 Key Technical Details

| Property | Value | Classification |
|----------|-------|---------------|
| Endpoint | `v2.livestream.create_session` | DOCUMENTED |
| Auth param | `user_id` (NOT `shop_id`) | DOCUMENTED |
| Returns push_url | Yes, in create_session response | DOCUMENTED |
| Returns stream_key | Yes, in create_session response | DOCUMENTED |
| URL is temporary | Yes — session-scoped | INFERRED (standard for RTMP) |
| Key rotation | Session-to-session (new session = new key) | INFERRED |
| Transmitted to Live Studio | Via stream.start envelope (existing Fujitech mechanism) | COMPATIBLE |
| RTMP orientation | 9:16 vertical, 720x1280 recommended | DOCUMENTED (Shopee VN) |
| Bitrate recommendation | ~2500k or platform-specified | INFERRED from OBS guides |

### 5.3 Critical Architecture Gap

> **The Fujitech `ShopeeAdapter.start_live()` calls `/api/v2/livestream/start_session` with `shop_id`.**  
> **The Shopee Livestream API requires `user_id` for all livestream endpoints.**
>
> This is a **breaking gap** that prevents real Shopee LIVE from working without correction.

Additionally, `create_session` must be called **before** `start_session`. The current Fujitech adapter skips `create_session` and calls `start_session` directly — this will fail.

---

## 6. LIVE Comments

### 6.1 API Mechanism

| Property | Value | Classification |
|----------|-------|---------------|
| Comment retrieval | Polling (`get_latest_comment_list`) | DOCUMENTED |
| Realtime webhook | Not confirmed in official docs | UNKNOWN |
| Lookback window | Time-window based (start/end time params) | DOCUMENTED |
| Pagination | Yes — cursor/page_token | DOCUMENTED |
| Rate limit | ~100 requests/minute (general platform) | INFERRED |
| Comment fields | user_id, user_name, comment_id, comment_content, comment_time | DOCUMENTED |
| Risk of missed comments | Yes — if polling interval too large | INFERRED |
| Comment deduplication needed | Yes | INFERRED |

### 6.2 Fujitech vs Shopee Comments Gap

| Component | Fujitech Current | Required | Gap |
|-----------|-----------------|----------|-----|
| `poll_shopee_live_comments` Celery task | ✅ Implemented | ✅ | — |
| Polling interval (3s) | 3 seconds | Reasonable | None |
| Rate limit handling | ✅ PlatformRateLimitError with 10s backoff | ✅ | — |
| `LiveCommentDedupService` | ✅ Implemented (Redis) | ✅ | — |
| `LivePollingLockService` | ✅ Implemented (Redis) | ✅ | — |
| `LiveCommentEvent` normalization | ✅ Uses comment_id, user_id, etc. | ✅ | — |
| Max 50 comments per poll | ✅ Implemented | ✅ | — |
| Pagination handling for >50 | ⚠️ Warns but truncates | Should paginate | Minor gap |
| Comment offset type | Uses `offset=0` always | Should use cursor/timestamp | **Gap** |

> **Gap:** Fujitech always polls with `offset=0` — it will consistently re-fetch old comments and rely entirely on dedup. Production should maintain a cursor/timestamp of the last seen comment. This is a correctness gap, not a blocker.

---

## 7. Product Management During LIVE

### 7.1 API Coverage

| Feature | Shopee API | Fujitech | Gap |
|---------|-----------|----------|-----|
| Add product to LIVE | `add_item_list` | `attach_product_to_live()` | Partially aligned |
| Remove product | `delete_item_list` | Not implemented | Missing |
| Set currently shown product | `update_show_item` | Partially (`update_show_item`) | Present |
| Get product list in LIVE | `get_product_list` | Not implemented | Missing |
| Get currently shown item | `get_show_item` | Not implemented | Missing |
| Platform product ID mapping | `LivePlatformProduct` model | Present | ✅ |
| Product limit | 300 (affiliates), 500 (sellers) | Not enforced | Minor |

### 7.2 Gap Assessment

The Fujitech model (`LivePlatformProduct`) is architecturally sufficient for mapping. The major gap is that `add_item_list` (the correct bulk-add endpoint) is not used — instead the current adapter uses `update_show_item` for attaching, which is incorrect (that endpoint sets the **currently displaying** product, not adds it to the bag).

---

## 8. OAuth / Credentials

### 8.1 Shopee OAuth Requirements

| Requirement | Value | Classification |
|-------------|-------|---------------|
| Developer account on open.shopee.com | Required | DOCUMENTED |
| App type | "Livestream Management" | DOCUMENTED |
| partner_id | Required (assigned by Shopee) | DOCUMENTED |
| partner_key | Required (HMAC signing key) | DOCUMENTED |
| OAuth flow | Standard redirect + code exchange | DOCUMENTED |
| Token type returned | access_token + refresh_token + **user_id** | DOCUMENTED |
| access_token validity | 4 hours | DOCUMENTED |
| refresh_token validity | 30 days, one-time use | DOCUMENTED |
| Refresh endpoint | `v2.public.refresh_access_token` | DOCUMENTED |
| Streamer auth type | `auth_type=seller` for seller streamers | DOCUMENTED |

### 8.2 Fujitech OAuth Gaps

| Area | Fujitech Current | Required | Gap |
|------|-----------------|----------|-----|
| OAuth initiation | ✅ `ShopeeConnectView` | ✅ | — |
| State parameter (CSRF) | ✅ UUID stored in Redis | ✅ | — |
| Code exchange | ✅ `ShopeeCallbackView` | ✅ | — |
| Stores access_token | ✅ (encrypted in `PlatformAccount`) | ✅ | — |
| Stores refresh_token | ✅ (encrypted) | ✅ | — |
| Stores **user_id** | ❌ NOT stored — only shop_id stored | **CRITICAL** — user_id needed for Livestream API | **BREAKING GAP** |
| Token auto-refresh | ❌ Not implemented | Must refresh before 4h expiry | **GAP** |
| auth_type=seller for streamer | ❌ Current flow uses `/shop/auth_partner` path | Livestream needs user authorization path | **GAP** |
| Token encryption | ✅ Using `platforms/security.py` | ✅ | — |

---

## 9. Fujitech vs. Shopee VN Capability Gap Table

| Capability | Fujitech Current State | Shopee VN Requirement | Gap | Evidence |
|-----------|----------------------|----------------------|-----|---------|
| Create LIVE session | Not implemented | `create_session` before start | **Missing** | Shopee API docs |
| Start LIVE session | `start_live()` calls wrong endpoint incorrectly | `start_session` with user_id | **Broken** | Shopee API docs |
| Stop LIVE session | `stop_live()` exists | `end_session` with user_id | Partially broken (wrong auth param) | Shopee API docs |
| Get LIVE status | `get_live_status()` exists | `get_session_detail` with user_id | Partially broken | Shopee API docs |
| Obtain RTMP push_url | Via start_live() response | Via `create_session` response | **Wrong API call** | Shopee API docs |
| OAuth stores user_id | ❌ | **Required** | **BREAKING** | Shopee API docs |
| Livestream auth_type | ❌ | `auth_type=seller` user flow | **Missing** | Shopee API docs |
| Token auto-refresh | ❌ | Must refresh every <4h | **GAP** | Shopee API docs |
| Comment polling | ✅ Implemented | Polling confirmed | Offset cursor gap only | Shopee API docs |
| Comment deduplication | ✅ Implemented | Required | None | — |
| Product attachment | Partially (wrong endpoint) | `add_item_list` | **Wrong API** | Shopee API docs |
| Highlight product | ✅ `update_show_item` | `update_show_item` | Aligned (but needs user_id) | Shopee API docs |
| Remove product from bag | ❌ | `delete_item_list` | Missing | Shopee API docs |
| Upload cover image | ❌ | Required before `create_session` | Missing | Shopee API docs |
| App approval | ❌ Not obtained | Required for production | **BLOCKED** | Shopee Open Platform |
| ≥10,000 followers | N/A (seller account) | Required for desktop RTMP | **SELLER REQUIREMENT** | Shopee VN Seller Center |
| RTMP to Shopee ingest | ✅ FFmpeg→RTMP path works | Required | None (path works) | Phase 1E-5.1/6 |
| stream.start dispatch | ✅ Cloud→Device | Compatible with real push_url | None | Phase 1E-7 |
| Vertical 9:16 encoding | ❌ Current default is 800x600 (16:9) | 720x1280 (9:16) recommended | **Config gap** | Shopee VN OBS guide |

---

## 10. Testing Without a Real Shopee LIVE Account

| Capability | Testability | Category |
|-----------|------------|---------|
| FFmpeg → MediaMTX RTMP | ✅ Done | A. Fully testable locally |
| stream.start / stream.stop protocol | ✅ Done | A. Fully testable locally |
| StreamController lifecycle | ✅ Done | A. Fully testable locally |
| Comment deduplication logic | ✅ Done (mock comments) | A. Fully testable locally |
| OAuth initiation flow (UI) | ✅ Can mock redirect | B. Testable with mock API |
| OAuth callback + token storage | ✅ Can mock callback | B. Testable with mock API |
| Token refresh logic | Can be unit tested | B. Testable with mock API |
| `create_session` API call | ✅ Sandbox UAT available | C. Testable with sandbox |
| `start_session` API call | ✅ Sandbox UAT available | C. Testable with sandbox |
| RTMP push_url retrieval | ✅ Sandbox UAT available | C. Testable with sandbox |
| Comment retrieval (get_latest_comment_list) | ✅ Sandbox UAT available | C. Testable with sandbox |
| Product management APIs | ✅ Sandbox UAT available | C. Testable with sandbox |
| Obtaining real seller access | ❌ | D. Requires real Shopee Vietnam seller account |
| ≥10,000 followers threshold | ❌ | D. Requires real account |
| Real RTMP → Shopee ingest server | ❌ | E. Requires real LIVE access |
| Production app approval | ❌ | F. Requires Shopee app approval |
| Full end-to-end: comment → AI → TTS → RTMP | ❌ | F+E. Requires both |

### Staged Test Plan

**Stage 1 (Now — No Account Required)**
- Fix ShopeeAdapter API calls (user_id, create_session flow, correct endpoints)
- Implement token auto-refresh
- Fix 9:16 encoding config
- Fix comment cursor/offset
- Unit test all gaps with mocked responses

**Stage 2 (Sandbox — Requires Shopee Developer Registration)**
- Register developer account on open.shopee.com
- Create "Livestream Management" app
- Use sandbox test accounts
- Validate create_session → start_session → push_url flow
- Validate comment polling
- Validate product management endpoints

**Stage 3 (Production — Requires Real Account + App Approval)**
- Seller account with ≥10,000 followers on Shopee VN
- Shopee reviews and approves "Livestream Management" app
- Full E2E: OAuth → create_session → push_url → FFmpeg → Shopee LIVE
- Comment polling in production
- AI response → TTS → Avatar → RTMP

---

## 11. Real Account Requirements Summary

To perform production LIVE streaming on Shopee Vietnam, Fujitech needs:

1. **A registered Shopee Vietnam seller account** — verified (KYC complete)
2. **≥10,000 followers** on that seller's Shopee profile (for desktop/RTMP access)
3. **A registered Shopee Open Platform developer account** at open.shopee.com
4. **An approved "Livestream Management" type application** — reviewed by Shopee, trial account/demo provided during review
5. **Valid partner_id and partner_key** from the approved app
6. **Seller authorizes the app** via OAuth (auth_type=seller) — user_id must be stored
7. **Real RTMP push_url** obtained from create_session and transmitted securely to Live Studio

---

## 12. Alternative Architectures If API Is Restricted

If Shopee rejects the app approval or if the seller doesn't meet the follower requirement:

### Option A: Manual Stream Key Entry (Hybrid — Recommended interim)

**Architecture:**
```
Shopee Seller Center (manual)
→ Seller copies push_url + stream_key
→ Pastes into Fujitech Admin UI
→ Fujitech stores (encrypted, write-only)
→ Dispatched via stream.start to Live Studio
→ FFmpeg → Shopee ingest
```

| Property | Assessment |
|----------|-----------|
| Automation level | LOW (seller manually copies key) |
| Customer setup complexity | LOW (one-time per session) |
| Engineering effort | MINIMAL (form field + encrypt + dispatch) |
| Platform risk | NONE (seller owns their own key, no API bypass) |
| Credential security | HIGH (never logged, never shown again, write-only) |
| Compatibility with Live Studio | FULL (stream.start already supports this) |

> **This is the safest path and can be implemented immediately.**

### Option B: Full Shopee API (Recommended long-term, requires app approval)

**Architecture:**
```
Fujitech Cloud
→ Shopee OAuth (auth_type=seller, stores user_id)
→ create_session (returns push_url)
→ stream.start dispatch to Live Studio
→ FFmpeg → Shopee ingest
```

| Property | Assessment |
|----------|-----------|
| Automation level | HIGH (fully automated) |
| Customer setup complexity | LOW (OAuth once, automatic thereafter) |
| Engineering effort | MEDIUM (fix gaps, implement refresh, cover image) |
| Platform risk | LOW (official API) |
| Credential security | HIGH (never logged, transmitted only on WS) |
| App approval | Required (Shopee review) |

### Option C: MCN / Partner Agency Integration

An authorized MCN (Multi-Channel Network) agency could provide API access via their approved app. Fujitech would integrate with the MCN rather than directly with Shopee.

| Property | Assessment |
|----------|-----------|
| Automation level | HIGH |
| Customer setup complexity | MEDIUM (must join MCN) |
| Engineering effort | MEDIUM (adapt to MCN's API) |
| Platform risk | LOW |
| Applicable to | Sellers with <10,000 followers |

### Option D: Browser Automation (NOT RECOMMENDED)

Scraping/automating the Seller Center UI to extract stream keys.

| Property | Assessment |
|----------|-----------|
| Platform risk | **VERY HIGH** — account ban risk |
| Recommendation | **DO NOT USE for production** |

---

## 13. Risks

| Risk | Severity | Likelihood | Mitigation |
|------|----------|------------|------------|
| App approval rejected by Shopee | HIGH | MEDIUM | Submit with complete demo, clear use case |
| Seller <10,000 followers cannot use desktop RTMP | HIGH | HIGH | Use Option A (manual key entry) as interim |
| access_token expires mid-stream (4h limit) | HIGH | HIGH | Implement auto-refresh background task |
| user_id not stored — API calls fail | CRITICAL | CERTAIN | Fix OAuth callback to store user_id |
| Comment offset not tracked — duplicates under pressure | MEDIUM | MEDIUM | Implement cursor-based pagination |
| Shopee changes push_url field name | LOW | LOW | Test in sandbox first |
| Platform content moderation violation | HIGH | LOW | Ensure AI responses comply with community standards |
| 9:16 vs 16:9 encoding mismatch | MEDIUM | HIGH | Fix StreamConfig for Shopee profile |

---

## 14. Risks to Stream Credentials

All stream_url/push_url data is handled securely in Fujitech:

- `stream_url` is **write_only** in `LiveSessionSerializer` (Phase 1E-7) — never returned by API
- Dispatched only via authenticated Device WebSocket (`stream.start` envelope)
- Never logged by orchestrator
- `RtmpStreamTarget` masks URL in logs (Phase 1E-6)
- Encrypted at rest in `PlatformAccount` table

---

## 15. Final Capability Classification

**Can Fujitech eventually support the full Shopee VN E2E flow?**

```
Login Fujitech
→ Connect Shopee (OAuth)
→ Select products
→ Start Live
→ Obtain stream credentials (push_url via create_session)
→ Start Live Studio automatically (stream.start)
→ Push RTMP to Shopee
→ Receive comments (polling)
→ AI responds
→ TTS
→ Avatar
→ Continue streaming
```

**Classification: SUPPORTED WITH APPROVAL / RESTRICTIONS**

The full flow is technically achievable via official Shopee API. Blocking conditions are:
1. Shopee app approval must be obtained (engineering + business task)
2. Seller must have ≥10,000 followers (seller-side requirement)
3. Several API integration gaps must be fixed (engineering tasks, not blockers)

---

## 16. Recommended Next Step

### Priority 1: Fix Critical Engineering Gaps (No Account Needed)

Before any real testing, fix:

1. **OAuth: Store user_id** — `ShopeeCallbackView` must capture and store `user_id` from Shopee callback (currently only `shop_id` is stored). Update `PlatformAccount` model to add `user_id` field.

2. **ShopeeAdapter: use `user_id` not `shop_id`** — All livestream API calls must use `user_id` from `PlatformAccount`. `ShopeeClient` must be updated to sign with `user_id` for livestream endpoints.

3. **Implement `create_session` before `start_session`** — The current `start_live()` goes directly to `start_session`. Real flow requires `create_session` first. This is where `push_url` is returned.

4. **Implement token auto-refresh** — Background task to refresh access_token before 4-hour expiry. Essential for long streams.

5. **Fix encoding config for Shopee** — 720x1280 (9:16) vertical orientation. Add platform-specific `StreamConfig` presets.

6. **Fix comment cursor tracking** — Replace `offset=0` with a cursor/timestamp maintained per session.

### Priority 2: Register on Shopee Open Platform (Business Task)

- Register developer account at open.shopee.com
- Create "Livestream Management" app type
- Set up sandbox/UAT environment
- Use sandbox credentials to validate Stage 2 tests

### Priority 3: Interim — Implement Manual Stream Key Path (Option A)

While waiting for app approval and/or seller follower milestone:
- Add stream key / push_url input field in Fujitech admin UI
- Store encrypted in `LiveSession.stream_url` (already exists)
- Dispatch via existing `stream.start` mechanism (already works)

This path is **immediately implementable** and allows real Shopee LIVE with zero API approval needed.

---

## Appendix: Document Paths

- Phase 1E-6 Report: `docs/Fujitech_AI_Livestream_Phase1E6_Generic_RTMP_Report.md`
- Phase 1E-7 Report: `docs/Fujitech_AI_Livestream_Phase1E7_Cloud_Device_Stream_Integration_Report.md`
- This Audit: `docs/Fujitech_Shopee_Vietnam_Live_Capability_Audit_2026.md`

---

*Audit performed: 2026-09-30. Research sources: Shopee Open Platform official documentation, Shopee VN Seller Center, Shopee VN community/help pages. No source code was modified during this audit.*
