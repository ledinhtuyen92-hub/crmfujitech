# Phase 1D-5 Architecture Lock

## Final Architecture
The architecture introduces a `PlatformAdapter` layer to decouple the Live Orchestrator and AI Core from TikTok/Shopee specifics. The system utilizes `PlatformAccount` to store OAuth tokens, and `LiveSession` will link to `PlatformAccount`. Live comments are ingested via a `CommentSource` abstraction (polling for Shopee, disabled for TikTok) and pushed to an Event Gateway, which normalizes them into `LiveCommentEvent`.

## PlatformAdapter
The `PlatformAdapter` is the central boundary.
**Capabilities Discovery:**
```python
class Capability(Enum):
    AUTH = "AUTH"
    LIVE_STATUS = "LIVE_STATUS"
    LIVE_COMMENTS = "LIVE_COMMENTS"
    PRODUCT_READ = "PRODUCT_READ"
    PRODUCT_ATTACH = "PRODUCT_ATTACH"

class BasePlatformAdapter:
    def get_capabilities(self) -> List[Capability]: ...
    def authenticate(self, company_id): ...
    def get_live_status(self, session_id): ...
    def start_live(self, session_id): ...
    def get_comments(self, session_id): ...
    def attach_product_to_live(self, session_id, platform_product_id): ...
```
If a capability is unsupported, the adapter must raise `CapabilityNotSupportedError`.

## PlatformAccount
A Django model representing the tenant's connection to a platform.
- `company` (ForeignKey)
- `platform` (Choices: TIKTOK, SHOPEE, MOCK)
- `account_id` (External ID)
- `display_name`
- `access_token` (TextField)
- `refresh_token` (TextField)
- `token_expires_at`

## Capability System
Each PlatformAdapter returns its supported capabilities.
- **TikTok MVP:** Supports `AUTH`, `PRODUCT_READ`, `PRODUCT_ATTACH`. Does NOT support `LIVE_COMMENTS`.
- **Shopee MVP:** Supports `AUTH`, `LIVE_STATUS`, `LIVE_COMMENTS` (polling), `PRODUCT_READ`, `PRODUCT_ATTACH`.
- **Mock MVP:** Supports all capabilities for testing.

## CommentSource and Event Gateway
A worker handles `CommentSource.poll(session)` (for Shopee). When comments are received, they are deduplicated and normalized into `LiveCommentEvent` instances. These events are sent to the Event Gateway (a Redis PubSub or similar mechanism) to decouple ingestion from AI generation. 

## Product Mapping
`LivePlatformProduct` handles product mapping. The Orchestrator LLM outputs `{ "action": "pin", "product_id": "P123" }`. The backend translates this to a `platform_product_id` and calls `PlatformAdapter.attach_product_to_live(session_id, platform_product_id)`. The LLM never sees affiliate URLs.

## Streaming Abstraction
Streaming remains `WINDOW_CAPTURE` via external software (OBS / TikTok Live Studio). We are NOT implementing RTMP or FFmpeg in Local Studio for Phase 1D-5.

## Mock Platform
`MockPlatformAdapter` is fully implemented to test end-to-end functionality. It allows manual injection of `LiveCommentEvent` to trigger the Orchestrator -> AI Core -> TTS -> Local Studio flow without hitting real platforms.

## Security & Tenant Isolation
All objects (`PlatformAccount`, `LiveSession`, `LivePlatformProduct`) strictly enforce `company_id`. API endpoints will filter by `request.user.company`. Tokens are currently stored as `TextField` (same as existing ZaloOAConfig), but logs must actively redact `access_token` and `refresh_token`.

## Error Model
Standardized exceptions:
- `CapabilityNotSupportedError`
- `PlatformAuthError`
- `PlatformTokenExpiredError`
- `PlatformRateLimitError`
- `PlatformAPIError`

## Test Strategy
- Test MockAdapter capability discovery.
- Test Tenant Isolation for PlatformAccount.
- Test Comment Normalization logic.
- Verify `CapabilityNotSupportedError` logic.
- Verify Human Takeover blocks AI processing of mock events.
- Maintain existing 41/41 Local Studio tests.

## Limitations & Future Expansion
- TikTok MVP is purely a "Visual Presenter" due to the lack of comment APIs.
- Shopee comment ingestion uses polling, introducing 2-3s latency.
- Future expansion: If TikTok opens Webhook APIs, we add a Webhook Gateway and update `TikTokAdapter.get_capabilities()`.
