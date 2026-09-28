# FUJITECH AI LIVESTREAM

## MASTER DEVELOPMENT SPECIFICATION v1.0

> **Mục đích tài liệu:** Đây là tài liệu kiến trúc và kế hoạch phát
> triển chính thức cho module **Fujitech AI Livestream**, được xây dựng
> để AI coding agent (Claude / OpenAI / Gemini hoặc các agent khác) đọc
> cùng với **source code hiện tại của Fujitech CRM**, sau đó phân tích
> hệ thống đang có và tiếp tục phát triển đúng kiến trúc đã thống nhất.
>
> **Nguyên tắc quan trọng:** Không được coi tài liệu này là lý do để
> viết lại toàn bộ hệ thống hiện tại. Trước khi code, AI agent phải đọc
> và hiểu codebase hiện có, xác định những module đã tồn tại, tái sử
> dụng tối đa và chỉ bổ sung/thay đổi những gì cần thiết.

------------------------------------------------------------------------

# 1. MỤC TIÊU SẢN PHẨM

Fujitech AI Livestream là một module AI Sales + Livestream được tích hợp
trực tiếp vào Fujitech CRM.

Mục tiêu cuối cùng:

-   Cho phép doanh nghiệp cấu hình một AI Host.
-   AI sử dụng dữ liệu doanh nghiệp/sản phẩm thông qua RAG hiện có.
-   AI sử dụng System Prompt để định hình vai trò, tính cách, giọng
    điệu.
-   AI sử dụng Core Prompt để quy định cách suy luận và trả lời.
-   AI có thêm Live Context để hiểu trạng thái phiên livestream.
-   AI có khả năng:
    -   chủ động nói khi không có comment;
    -   đọc và phân loại comment;
    -   trả lời câu hỏi;
    -   tư vấn sản phẩm;
    -   xử lý objection;
    -   hướng khách tới hành động mua hàng;
    -   ghi nhận lead vào CRM;
    -   duy trì hội thoại và memory trong phiên live.
-   Audio được chuyển thành giọng nói qua TTS.
-   Avatar được render trên máy khách hàng.
-   Lip-sync theo audio.
-   Máy khách hàng thực hiện phần đồ họa/render và phát livestream.
-   Cloud chỉ chịu trách nhiệm cho AI, dữ liệu, điều phối, analytics và
    các tác vụ cần thiết.
-   Không phụ thuộc vào cloud GPU để render avatar.
-   Có khả năng tích hợp TikTok và Shopee thông qua các adapter riêng.
-   Có cơ chế fallback, reconnect, health monitoring và human takeover.
-   Có thể thương mại hóa thành add-on của Fujitech CRM.

------------------------------------------------------------------------

# 2. TRIẾT LÝ KIẾN TRÚC

## 2.1. Mô hình chính

Hệ thống sử dụng:

**Cloud AI Brain + Local Live Agent**

Cloud:

-   Django backend hiện tại.
-   PostgreSQL hiện tại.
-   Redis hiện tại.
-   RAG hiện tại.
-   LLM provider hiện tại.
-   AI configuration hiện tại.
-   Celery/background workers nếu đã có.
-   Live orchestration.
-   Analytics.
-   CRM integration.

Local:

-   Fujitech Live Agent.
-   Avatar rendering.
-   Live2D/WebGL.
-   Audio playback.
-   Lip-sync.
-   Scene rendering.
-   Streaming output.
-   Local health monitor.
-   OBS integration nếu cần.
-   Platform connector/output.

## 2.2. Không xây một AI Brain thứ hai

Đây là nguyên tắc bắt buộc.

Fujitech CRM đã có:

-   AI Configuration.
-   RAG.
-   System Prompt.
-   Core Prompt.
-   LLM integration.

Không được tạo một hệ thống AI độc lập cho livestream nếu có thể tái sử
dụng AI Core hiện tại.

Kiến trúc mong muốn:

``` text
FUJITECH AI CORE
│
├── CRM AI
├── Chat AI
├── Live AI
└── Sales AI
      │
      ├── Shared LLM abstraction
      ├── Shared RAG
      ├── Shared System Prompt
      ├── Shared Core Prompt
      └── Shared AI configuration
```

Livestream chỉ bổ sung context và orchestration:

``` text
System Prompt
+
Core Prompt
+
RAG
+
Live Prompt
+
Live Session Context
+
Conversation Memory
+
Sales State
        ↓
      LLM
```

------------------------------------------------------------------------

# 3. NGUYÊN TẮC BẮT BUỘC ĐỐI VỚI AI CODING AGENT

AI coding agent phải tuân thủ các nguyên tắc sau.

## 3.1. Đọc code trước khi sửa

Trước khi viết code:

1.  Scan toàn bộ repository.
2.  Xác định backend.
3.  Xác định frontend.
4.  Xác định database models.
5.  Xác định API.
6.  Xác định authentication/authorization.
7.  Xác định AI configuration.
8.  Xác định RAG pipeline.
9.  Xác định System Prompt.
10. Xác định Core Prompt.
11. Xác định LLM provider abstraction.
12. Xác định Redis/Celery.
13. Xác định realtime/WebSocket nếu đã có.
14. Xác định cấu trúc settings/environment.
15. Xác định test framework.
16. Xác định logging/monitoring.
17. Xác định coding conventions.

Không được đoán cấu trúc hiện tại.

## 3.2. Không rewrite hệ thống đang chạy

Không được:

-   rewrite Django project;
-   đổi framework;
-   đổi database;
-   thay RAG;
-   thay AI Core;
-   thay authentication;
-   đổi frontend framework;

nếu không có lý do kỹ thuật rõ ràng.

Nếu module hiện tại đã giải quyết tốt một vấn đề, phải tái sử dụng.

## 3.3. Ưu tiên abstraction

Các provider bên ngoài phải được bọc bằng interface/adapter.

Ví dụ:

``` python
class LLMProvider:
    async def generate(self, request):
        raise NotImplementedError
```

Các implementation:

``` text
OpenAIProvider
AnthropicProvider
GeminiProvider
```

Tương tự:

``` text
TTSProvider
AvatarProvider
PlatformAdapter
```

Không hard-code provider vào business logic.

## 3.4. Không đưa API key vào source code

Tất cả secret phải dùng:

-   environment variables;
-   secret storage hiện có;
-   encrypted credential storage nếu hệ thống hiện tại hỗ trợ.

Không commit API key.

## 3.5. Không tự ý thay đổi kiến trúc

Nếu phát hiện kiến trúc hiện tại xung đột với tài liệu này:

1.  Phân tích xung đột.
2.  Ghi rõ file/module bị ảnh hưởng.
3.  Đề xuất phương án.
4.  Không tự ý rewrite một vùng lớn.

------------------------------------------------------------------------

# 4. STACK MỤC TIÊU

Ưu tiên tái sử dụng stack hiện tại.

Nếu phù hợp với codebase hiện tại:

## Backend

-   Python
-   Django
-   Django REST Framework

## Database

-   PostgreSQL

## Cache / realtime

-   Redis
-   WebSocket / Channels hoặc realtime mechanism hiện có

## Background

-   Celery nếu đã có.

## Frontend

-   React
-   Ant Design nếu đang dùng.

## Local Live Agent

Ưu tiên kiến trúc desktop có thể chạy Windows.

Có thể dùng:

-   Electron hoặc framework desktop phù hợp với codebase.
-   React UI.
-   WebGL / Three.js nếu cần.
-   Live2D SDK cho avatar 2D.
-   FFmpeg nếu cần.
-   OBS integration nếu cần.

Không bắt buộc Electron nếu repository hiện tại có giải pháp desktop phù
hợp hơn. AI agent phải đánh giá trước.

------------------------------------------------------------------------

# 5. KIẾN TRÚC TỔNG THỂ

``` text
                        FUJITECH CRM CLOUD
┌─────────────────────────────────────────────────────────┐
│                                                         │
│  Django API                                             │
│      │                                                  │
│      ├── CRM                                            │
│      ├── AI Configuration                               │
│      ├── Product                                        │
│      ├── Customer                                       │
│      ├── Lead                                           │
│      ├── RAG                                            │
│      ├── Live Management                                │
│      ├── Analytics                                      │
│      └── Platform Adapters                              │
│                                                         │
│  PostgreSQL                                             │
│  Redis                                                  │
│  Celery                                                 │
│  LLM Providers                                          │
│  TTS Providers                                          │
│                                                         │
└──────────────────────────┬──────────────────────────────┘
                           │
                    WebSocket / Events
                           │
                           ▼
                 FUJITECH LIVE AGENT
┌─────────────────────────────────────────────────────────┐
│                                                         │
│  Session Manager                                        │
│  Avatar Engine                                          │
│  Lip Sync                                               │
│  Audio Engine                                           │
│  Scene Engine                                           │
│  Stream Engine                                          │
│  Local Cache                                             │
│  Health Monitor                                         │
│  Auto Recovery                                          │
│  Human Takeover                                         │
│                                                         │
└──────────────────────────┬──────────────────────────────┘
                           │
                    Stream Output
                     /           \
                    ▼             ▼
                 TikTok         Shopee
```

------------------------------------------------------------------------

# 6. CLOUD AI CORE

AI Core hiện tại của Fujitech là nền móng chính.

## 6.1. Input

AI Live nhận:

``` text
System Prompt
Core Prompt
Live Prompt
RAG Context
Product Context
Live Session Context
Conversation Memory
Sales State
Current Event
```

## 6.2. Output

AI phải có thể trả về cấu trúc có thể máy đọc được.

Không nên chỉ trả về plain text.

Ví dụ:

``` json
{
  "speech": "Mẫu sofa này hiện có giá 29 triệu đồng...",
  "intent": "PRICE_QUERY",
  "action": "CONTINUE_CONVERSATION",
  "product_id": "SOFA-001",
  "sales_stage": "CONSIDERATION",
  "priority": "HIGH",
  "should_speak": true,
  "should_show_product": true,
  "should_create_lead": false
}
```

Business logic không được phụ thuộc vào việc parse câu chữ tự do của LLM
nếu có thể dùng structured output.

------------------------------------------------------------------------

# 7. LIVE SESSION

Mỗi livestream phải có một Live Session riêng.

Ví dụ:

``` text
LiveSession
├── id
├── tenant_id
├── platform
├── channel/account
├── status
├── started_at
├── ended_at
├── current_product
├── current_promotion
├── current_topic
├── sales_stage
├── viewer_count
├── settings
└── health_status
```

Các trạng thái:

``` text
DRAFT
SCHEDULED
CONNECTING
LIVE
PAUSED
HUMAN_TAKEOVER
RECONNECTING
ERROR
ENDED
```

------------------------------------------------------------------------

# 8. LIVE CONTEXT

Live Context là phần bổ sung quan trọng cho AI hiện tại.

Bao gồm:

``` text
Current Product
Current Promotion
Current Topic
Recent Comments
Recent AI Responses
Recent Viewer Questions
Current Sales Stage
Live Duration
Viewer Count
Recent Actions
```

Không đưa toàn bộ lịch sử live vào LLM.

Phải có cơ chế:

-   short-term memory;
-   summarized memory;
-   relevant retrieval.

Redis ưu tiên cho state realtime.

PostgreSQL lưu lịch sử cần thiết.

------------------------------------------------------------------------

# 9. CONVERSATION MEMORY

AI phải nhớ ngữ cảnh trong phiên.

Ví dụ:

``` text
Viewer:
"Giá bao nhiêu?"

AI:
"29 triệu."

Viewer:
"Có màu sáng hơn không?"
```

AI phải hiểu "màu sáng hơn" đang nói về sản phẩm hiện tại.

Memory nên chia:

``` text
Short Term Memory
    ↓
Recent messages/events

Session Summary
    ↓
Tóm tắt các chủ đề quan trọng

Relevant Memory
    ↓
Thông tin cần thiết được truy xuất khi có câu hỏi
```

Không gửi toàn bộ transcript vào mỗi LLM call.

------------------------------------------------------------------------

# 10. INTENT ROUTER

Comment phải được phân loại.

Các intent tối thiểu:

``` text
GREETING
PRICE_QUERY
PRODUCT_QUERY
PRODUCT_VARIANT
PRODUCT_SIZE
PRODUCT_MATERIAL
PRODUCT_STOCK
SHIPPING_QUERY
WARRANTY_QUERY
PROMOTION_QUERY
HOW_TO_BUY
PURCHASE_INTENT
PRICE_OBJECTION
QUALITY_OBJECTION
DELIVERY_OBJECTION
GENERAL_CHAT
POSITIVE_SOCIAL
NEGATIVE_SOCIAL
SPAM
TOXIC
UNKNOWN
```

Intent Router có thể dùng:

-   rule-based cho trường hợp đơn giản;
-   classifier/LLM nhẹ cho trường hợp phức tạp.

Không gọi LLM lớn cho mọi comment.

------------------------------------------------------------------------

# 11. COMMENT PRIORITIZATION

Comment phải có priority:

``` text
HIGH
MEDIUM
LOW
IGNORE
```

Ví dụ:

HIGH:

-   hỏi giá;
-   muốn mua;
-   hỏi sản phẩm;
-   hỏi khuyến mãi;
-   hỏi giao hàng.

MEDIUM:

-   hỏi chất liệu;
-   hỏi kích thước;
-   hỏi bảo hành.

LOW:

-   khen;
-   emoji;
-   social chat.

IGNORE:

-   spam;
-   comment lặp;
-   toxic;
-   bot.

AI không được trả lời từng comment một cách máy móc.

------------------------------------------------------------------------

# 12. PRODUCT TRUTH LAYER

Đây là lớp kiểm soát thông tin sản phẩm.

AI chỉ được sử dụng:

``` text
Product DB
+
Approved RAG Documents
+
Current Promotion
+
Inventory
+
Business Rules
```

AI không được tự bịa:

-   giá;
-   tồn kho;
-   khuyến mại;
-   bảo hành;
-   nguồn gốc;
-   thông số;
-   số lượng;
-   review;
-   doanh số;
-   tình trạng khan hiếm.

Nếu không có dữ liệu:

``` text
"I don't have verified information for this detail."
```

Sau đó chuyển người thật nếu cần.

------------------------------------------------------------------------

# 13. SALES STATE

AI cần biết khách đang ở giai đoạn nào:

``` text
AWARENESS
INTEREST
CONSIDERATION
OBJECTION
PURCHASE_INTENT
PURCHASE
POST_PURCHASE
```

Sales state không nhất thiết phải được suy ra bằng LLM mỗi lần.

Có thể cập nhật từ:

-   comment intent;
-   actions;
-   product clicks;
-   CTA;
-   lead creation;
-   order events.

------------------------------------------------------------------------

# 14. OBJECTION ENGINE

Các objection tối thiểu:

``` text
PRICE
QUALITY
TRUST
DELIVERY
WARRANTY
COMPARISON
TIMING
UNKNOWN
```

Ví dụ:

``` text
Customer:
"Đắt quá."

Intent:
PRICE_OBJECTION

AI:
Không chỉ giảm giá.
Phải giải thích value dựa trên dữ liệu được xác minh.
```

Không được tự bịa lợi ích.

------------------------------------------------------------------------

# 15. PROACTIVE SPEAKING ENGINE

AI không được phụ thuộc hoàn toàn vào comment.

Khi không có comment trong một khoảng thời gian:

``` text
No Comment
    ↓
Proactive Engine
    ↓
Select Topic
    ↓
Generate Speech
```

Các topic:

``` text
INTRODUCTION
PRODUCT_HIGHLIGHT
PRODUCT_STORY
FAQ
BENEFIT
MATERIAL
DESIGN
USE_CASE
PROMOTION
SOCIAL_PROOF_ONLY_IF_VERIFIED
CTA
TRANSITION
```

Thời gian không được hard-code quá cứng.

Phải cấu hình được:

``` text
silence_threshold
minimum_interval
maximum_interval
```

------------------------------------------------------------------------

# 16. DYNAMIC SCRIPT ENGINE

Không sử dụng script video cố định.

Script được tạo từ:

``` text
Base Script
+
Product
+
RAG
+
Live Context
+
Sales Stage
+
Viewer Questions
+
Promotion
+
Previous Speech
```

Script phải tránh lặp.

Cần tracking:

``` text
recent_topics
recent_phrases
recent_product_points
recent_ctas
```

Mục tiêu là giảm cảm giác AI đọc lại cùng một đoạn.

------------------------------------------------------------------------

# 17. AI RESPONSE POLICY

Mỗi response phải có các giới hạn:

-   phù hợp với voice;
-   ngắn;
-   tự nhiên;
-   không markdown;
-   không emoji nếu TTS không xử lý tốt;
-   không đọc URL dài;
-   không đọc JSON;
-   không đọc ký hiệu kỹ thuật;
-   không lặp câu chào;
-   không tự xưng sai vai trò.

Có thể cấu hình:

``` text
max_sentence_count
max_words
tone
language
speaking_speed
cta_frequency
```

------------------------------------------------------------------------

# 18. TTS PIPELINE

TTS cũng phải dùng abstraction.

``` text
TTSProvider
├── FPT
├── ElevenLabs
├── Zalo
├── Google
└── Other
```

Pipeline:

``` text
AI Speech Text
      ↓
Text Normalizer
      ↓
TTS Provider
      ↓
Audio
      ↓
Audio Cache
      ↓
Live Agent
```

Audio phải được cache khi nội dung lặp lại.

Ví dụ:

-   lời chào;
-   CTA;
-   thông báo chuyển sản phẩm;
-   thông báo khuyến mại.

------------------------------------------------------------------------

# 19. LLM PROVIDER

Fujitech cần hỗ trợ:

``` text
Claude / Anthropic
OpenAI
Gemini
```

Thông qua abstraction.

Không để business logic biết provider cụ thể.

Ví dụ:

``` text
AIProviderManager
│
├── OpenAI
├── Anthropic
└── Gemini
```

Có thể cấu hình:

``` text
Primary Model
Fallback Model
Temperature
Max Tokens
Timeout
Retry
```

Có cơ chế fallback:

``` text
Primary LLM
   ↓ failure
Fallback LLM
   ↓ failure
Safe predefined response
```

Không được retry vô hạn.

------------------------------------------------------------------------

# 20. REALTIME EVENT ARCHITECTURE

Realtime không nên dựa vào Celery.

Luồng mong muốn:

``` text
Platform Event
      ↓
Event Gateway
      ↓
Redis/Event Bus
      ↓
Live Orchestrator
      ↓
AI Router
      ↓
AI Core
      ↓
TTS
      ↓
WebSocket
      ↓
Live Agent
```

Celery dùng cho:

-   analytics;
-   report;
-   document processing;
-   background tasks;
-   scheduled jobs;
-   long-running non-realtime tasks.

------------------------------------------------------------------------

# 21. LOCAL FUJITECH LIVE AGENT

Đây là phần mới lớn nhất phía client.

Nhiệm vụ:

1.  Connect CRM.
2.  Authenticate device.
3.  Connect Live Session.
4.  Receive AI events.
5.  Receive audio.
6.  Render avatar.
7.  Lip-sync.
8.  Manage scenes.
9.  Play audio.
10. Stream output.
11. Monitor health.
12. Reconnect.
13. Cache assets.
14. Human takeover.

------------------------------------------------------------------------

# 22. AVATAR ENGINE

MVP ưu tiên:

**Live2D 2D avatar**

Có thể mở rộng:

``` text
Live2D
WebGL 3D
Three.js
Other avatar providers
```

Không xây AI video generation từ đầu.

Avatar engine cần hỗ trợ:

``` text
IDLE
TALKING
LISTENING
THINKING
HAPPY
SURPRISED
SERIOUS
CTA
```

------------------------------------------------------------------------

# 23. LIP SYNC

MVP:

``` text
Audio amplitude
    ↓
Mouth parameter
```

V2:

``` text
Audio
 ↓
Viseme/phoneme analysis
 ↓
Mouth shapes
```

Lip-sync phải có smoothing để tránh giật.

------------------------------------------------------------------------

# 24. SCENE ENGINE

Scene gồm:

``` text
Avatar
Background
Product image
Product video
Text overlay
Price
Promotion
CTA
Logo
```

Mỗi scene có thể lưu cấu hình.

Ví dụ:

``` text
Scene:
PRODUCT_SHOWCASE

Avatar:
host_01

Background:
luxury_room_01

Product:
sofa_001

Overlay:
price + CTA
```

------------------------------------------------------------------------

# 25. AUDIO ENGINE

Local Agent phải quản lý:

``` text
AI Speech
Background Music
Sound Effect
System Alert
Human Microphone
```

Có mixer và volume control.

AI speech phải có priority cao hơn background music.

------------------------------------------------------------------------

# 26. STREAM ENGINE

Kiến trúc không được phụ thuộc hoàn toàn vào OBS.

Có thể hỗ trợ:

``` text
OBS Integration
RTMP Output
Platform-specific output
```

OBS được xem là một output/integration option.

MVP có thể dùng OBS để giảm độ phức tạp.

Về dài hạn Live Agent phải có khả năng tự kiểm soát stream trong phạm vi
nền tảng cho phép.

------------------------------------------------------------------------

# 27. HUMAN TAKEOVER

Bắt buộc phải có.

``` text
AI MODE
HUMAN TAKEOVER
AI RESUME
```

Khi human takeover:

-   AI ngừng phát speech;
-   avatar chuyển trạng thái;
-   microphone của người thật được ưu tiên;
-   sau khi kết thúc có thể resume AI.

------------------------------------------------------------------------

# 28. HEALTH MONITOR

Live Agent phải báo:

``` text
AI Brain
TTS
Avatar
Audio
Internet
Stream
Platform
WebSocket
CPU
RAM
```

Ví dụ:

``` text
AI Brain:     GREEN
TTS:          GREEN
Avatar:       GREEN
Audio:        GREEN
TikTok:       GREEN
Stream:       GREEN
```

------------------------------------------------------------------------

# 29. AUTO RECOVERY

Các lỗi cần xử lý:

``` text
WebSocket disconnect
TTS timeout
LLM timeout
Audio playback error
Avatar freeze
OBS disconnected
Internet temporarily lost
Platform connection lost
```

Cơ chế:

``` text
Detect
 ↓
Retry
 ↓
Reconnect
 ↓
Fallback
 ↓
Alert
```

Không retry vô hạn.

------------------------------------------------------------------------

# 30. PLATFORM ADAPTER

Không hard-code TikTok/Shopee vào core.

``` text
PlatformAdapter
│
├── TikTokAdapter
└── ShopeeAdapter
```

Core chỉ biết:

``` text
get_live_events()
send_product_action()
get_status()
start_live()
stop_live()
```

Adapter chịu trách nhiệm API/platform-specific implementation.

Chỉ sử dụng phương thức/API/integration mà nền tảng cho phép.

Không xây core phụ thuộc vào scraper.

Nếu một platform không có API chính thức cho một chức năng:

-   đánh dấu capability là unavailable;
-   không giả vờ rằng chức năng tồn tại;
-   thiết kế fallback hợp lệ.

------------------------------------------------------------------------

# 31. CAPABILITY SYSTEM

Mỗi platform phải khai báo capability.

Ví dụ:

``` json
{
  "comments": true,
  "product_cards": true,
  "orders": false,
  "start_live": false,
  "stop_live": false,
  "viewer_count": true
}
```

UI chỉ hiển thị chức năng platform thực sự hỗ trợ.

------------------------------------------------------------------------

# 32. CRM INTEGRATION

AI Live phải tích hợp với CRM hiện tại.

Các entity cần tái sử dụng nếu đã tồn tại:

``` text
Customer
Lead
Product
Order
Campaign
Conversation
AI Configuration
```

Không tạo duplicate entity nếu CRM đã có.

Live interaction có thể tạo:

``` text
Lead
```

với:

``` text
source = AI_LIVESTREAM
platform = TIKTOK / SHOPEE
live_session_id
product_id
intent
interest_level
```

------------------------------------------------------------------------

# 33. ANALYTICS

MVP:

``` text
Live duration
Comments
AI responses
Unique questions
Top products
Leads
```

V2:

``` text
Response latency
AI speech duration
Product clicks
Conversion
Revenue
Lead conversion
Top objections
Top questions
```

V3:

``` text
AI response effectiveness
Product performance
Best topics
Best CTA
Best time segments
```

Không tự tuyên bố ROI nếu chưa có dữ liệu.

------------------------------------------------------------------------

# 34. DATABASE DESIGN NGUYÊN TẮC

Không tạo model trùng với model hiện tại.

AI agent phải kiểm tra database trước.

Các model mới có khả năng cần:

``` text
LiveSession
LiveSessionProduct
LiveEvent
LiveComment
LiveAIResponse
LiveState
LiveMemory
LiveMetric
LiveDevice
LiveDeviceSession
LiveScene
LiveAvatar
LivePlatformConnection
```

Tên thực tế phải tuân theo convention hiện tại của codebase.

------------------------------------------------------------------------

# 35. EVENT MODEL

Một LiveEvent nên có:

``` text
id
session_id
event_type
source
payload
created_at
processed_at
status
```

Event types:

``` text
COMMENT_RECEIVED
VIEWER_JOINED
VIEWER_LEFT
PRODUCT_SELECTED
PROMOTION_STARTED
PROMOTION_ENDED
AI_SPEECH_STARTED
AI_SPEECH_ENDED
TTS_FAILED
PLATFORM_DISCONNECTED
HUMAN_TAKEOVER
AI_RESUMED
```

------------------------------------------------------------------------

# 36. API DESIGN

API phải RESTful nếu backend hiện tại đang dùng DRF.

Ví dụ:

``` text
GET    /api/live/sessions/
POST   /api/live/sessions/
GET    /api/live/sessions/{id}/
PATCH  /api/live/sessions/{id}/
POST   /api/live/sessions/{id}/start/
POST   /api/live/sessions/{id}/pause/
POST   /api/live/sessions/{id}/takeover/
POST   /api/live/sessions/{id}/resume/
POST   /api/live/sessions/{id}/end/
```

Không copy nguyên các URL này nếu codebase hiện tại có convention khác.

------------------------------------------------------------------------

# 37. WEBSOCKET EVENTS

Ví dụ:

``` text
live.comment.received
live.ai.response
live.ai.speech.start
live.ai.speech.end
live.product.change
live.scene.change
live.status
live.health
live.takeover
live.resume
live.error
```

Event payload phải versionable.

Ví dụ:

``` json
{
  "version": 1,
  "type": "live.ai.response",
  "session_id": "123",
  "payload": {}
}
```

------------------------------------------------------------------------

# 38. SECURITY

Bắt buộc:

-   tenant isolation;
-   user authorization;
-   device authentication;
-   short-lived token nếu phù hợp;
-   encrypted API credentials;
-   audit log;
-   rate limiting;
-   validation;
-   input sanitization.

Live Agent không được giữ master API key của hệ thống.

------------------------------------------------------------------------

# 39. MULTI-TENANT

Fujitech CRM có khả năng trở thành SaaS.

Mọi Live Session phải thuộc tenant/customer tương ứng.

Không được để:

``` text
Tenant A
```

truy cập:

``` text
Tenant B
```

dữ liệu:

-   RAG;
-   products;
-   prompts;
-   sessions;
-   comments;
-   analytics;
-   credentials.

------------------------------------------------------------------------

# 40. OBS STRATEGY

MVP:

``` text
Live Agent
   ↓
Browser/Window output
   ↓
OBS
   ↓
Platform
```

Nhưng không thiết kế business logic phụ thuộc OBS.

V2:

``` text
Live Agent
 ├── OBS
 ├── RTMP
 └── Other Output
```

------------------------------------------------------------------------

# 41. CHROME TAB STRATEGY

Chrome/React Web vẫn có thể tồn tại như:

-   preview;
-   admin studio;
-   debug mode;
-   fallback;
-   MVP.

Nhưng không phải kiến trúc production duy nhất.

Production architecture ưu tiên:

**Fujitech Live Agent Desktop**

------------------------------------------------------------------------

# 42. PHASE 0 - CODEBASE & PLATFORM AUDIT

Thời gian dự kiến: 3-5 ngày.

AI agent phải:

1.  Scan repository.
2.  Đọc architecture.
3.  Tìm AI Core.
4.  Tìm RAG.
5.  Tìm prompts.
6.  Tìm LLM providers.
7.  Tìm Redis/Celery.
8.  Tìm WebSocket.
9.  Tìm Product model.
10. Tìm Customer/Lead model.
11. Tìm API patterns.
12. Tìm auth.
13. Tìm frontend architecture.
14. Tìm test setup.
15. Kiểm tra platform integration feasibility.

Output bắt buộc:

``` text
CODEBASE_AUDIT.md
```

Nội dung:

-   hiện trạng;
-   module có sẵn;
-   module có thể tái sử dụng;
-   module thiếu;
-   file liên quan;
-   dependencies;
-   rủi ro;
-   đề xuất implementation.

Không code feature lớn trước khi audit xong.

------------------------------------------------------------------------

# 43. PHASE 1 - AI LIVE BRAIN

Thời gian mục tiêu: 5-10 ngày coding sau audit.

Mục tiêu:

``` text
Comment
 ↓
Intent
 ↓
Context
 ↓
RAG/Product
 ↓
AI Core
 ↓
Structured Response
 ↓
TTS
 ↓
Audio
```

Có:

-   LiveSession;
-   LiveContext;
-   Intent Router;
-   Memory;
-   Sales State;
-   Proactive Speaking;
-   Dynamic Script;
-   TTS abstraction.

Chưa cần avatar hoàn chỉnh.

Có thể dùng:

``` text
Static Image + Audio
```

để test.

------------------------------------------------------------------------

# 44. PHASE 2 - AVATAR

Thời gian mục tiêu: 2-4 tuần.

Mục tiêu:

-   Live2D;
-   WebGL;
-   lip-sync;
-   idle animation;
-   talking;
-   expressions;
-   scenes;
-   audio sync.

------------------------------------------------------------------------

# 45. PHASE 3 - LIVE AGENT

Mục tiêu:

-   Windows desktop app;
-   login;
-   device registration;
-   connect live session;
-   receive WebSocket events;
-   render avatar;
-   audio;
-   health monitor;
-   reconnect;
-   OBS integration.

------------------------------------------------------------------------

# 46. PHASE 4 - PLATFORM INTEGRATION

Ưu tiên:

``` text
TikTok
Shopee
```

Mỗi platform:

1.  authentication;
2.  capability detection;
3.  live event;
4.  comments;
5.  product;
6.  status;
7.  platform-specific limitations.

Không assume API capability.

------------------------------------------------------------------------

# 47. PHASE 5 - COMMERCIALIZATION

Thêm:

-   multi-account;
-   scheduling;
-   subscription;
-   usage limits;
-   billing;
-   device management;
-   analytics;
-   logs;
-   support tools;
-   onboarding;
-   documentation.

------------------------------------------------------------------------

# 48. MVP DEFINITION OF DONE

MVP được coi là hoàn thành khi:

1.  Tạo được Live Session.
2.  Chọn AI Configuration.
3.  Chọn product.
4.  AI đọc RAG.
5.  AI sử dụng System Prompt.
6.  AI sử dụng Core Prompt.
7.  Comment đi vào hệ thống.
8.  Comment được phân loại.
9.  AI tạo structured response.
10. AI tạo speech.
11. TTS tạo audio.
12. Audio tới Live Agent.
13. Avatar nói.
14. Lip-sync hoạt động.
15. Có proactive speech.
16. Có memory.
17. Có fallback.
18. Có log.
19. Có health status.
20. Có human takeover.

------------------------------------------------------------------------

# 49. TESTING

## Unit tests

Test:

-   intent;
-   prompt composition;
-   product truth;
-   memory;
-   sales state;
-   fallback;
-   provider adapter.

## Integration tests

Test:

``` text
Comment
→ AI
→ TTS
→ WebSocket
→ Agent
```

## Failure tests

Phải test:

``` text
LLM timeout
TTS timeout
Redis disconnect
WebSocket disconnect
Internet disconnect
Platform unavailable
Invalid product
Missing RAG
Invalid AI config
```

## Long-running test

Mục tiêu:

``` text
2h
4h
8h
```

Không memory leak rõ rệt.

------------------------------------------------------------------------

# 50. OBSERVABILITY

Mỗi Live Session cần log:

``` text
timestamp
event
latency
provider
model
tokens if available
TTS latency
WebSocket latency
error
retry
```

Không log:

-   API key;
-   password;
-   sensitive credential.

------------------------------------------------------------------------

# 51. COST CONTROL

LLM cost phải được kiểm soát.

Không gọi model lớn cho mọi comment.

Chiến lược:

``` text
Simple
→ rule / DB

Medium
→ lightweight model

Complex
→ strong model
```

RAG chỉ retrieve phần liên quan.

Cache:

-   repeated questions;
-   standard answers;
-   TTS;
-   product facts.

------------------------------------------------------------------------

# 52. LATENCY TARGET

Mục tiêu kỹ thuật tham khảo:

``` text
Comment received
       ↓
Intent
       ↓
AI
       ↓
TTS
       ↓
Audio
```

Ưu tiên trải nghiệm phản hồi nhanh.

Mục tiêu:

-   realtime event propagation: rất thấp;
-   AI response: tối ưu theo provider/model;
-   TTS: ưu tiên streaming nếu provider hỗ trợ;
-   avatar start: gần như ngay khi audio sẵn sàng.

Không hard-code một con số SLA nếu chưa benchmark thực tế.

Sau benchmark mới đặt SLA chính thức.

------------------------------------------------------------------------

# 53. TTS STREAMING

Nếu provider hỗ trợ streaming:

``` text
LLM streaming
      ↓
sentence buffer
      ↓
TTS streaming
      ↓
Live Agent
```

Không nhất thiết chờ toàn bộ câu trả lời mới bắt đầu phát.

Tuy nhiên phải đảm bảo câu không bị cắt khó nghe.

------------------------------------------------------------------------

# 54. AI SPEECH QUEUE

Không được để AI nói chồng nhau.

Queue:

``` text
Speech 1
Speech 2
Speech 3
```

Có priority:

``` text
HUMAN
HIGH_PURCHASE
HIGH_PRICE
MEDIUM
PROACTIVE
```

Nếu khách hỏi mua trong khi AI đang đọc proactive:

``` text
Stop/finish current safe point
→ answer customer
```

------------------------------------------------------------------------

# 55. ANTI-REPETITION

Theo dõi:

``` text
recent_sentences
recent_topics
recent_ctas
recent_product_points
```

Không lặp câu trong khoảng thời gian cấu hình.

Có thể dùng semantic similarity nếu cần.

------------------------------------------------------------------------

# 56. AI PERSONALITY

System Prompt vẫn là nguồn chính để định hình tính cách.

Live Prompt chỉ bổ sung:

-   speaking style;
-   live behavior;
-   response length;
-   interaction policy.

Không overwrite System Prompt trái phép.

Prompt hierarchy:

``` text
System Prompt
        ↓
Core Prompt
        ↓
Live Policy
        ↓
Live Context
        ↓
User/Comment
```

Nếu có conflict, policy cao hơn được ưu tiên.

------------------------------------------------------------------------

# 57. PROMPT VERSIONING

Mỗi prompt phải có version.

Ví dụ:

``` text
system_prompt_version
core_prompt_version
live_prompt_version
```

Live Session phải lưu version đã sử dụng.

Mục đích:

-   debug;
-   audit;
-   reproduce;
-   A/B test sau này.

------------------------------------------------------------------------

# 58. AI DECISION VS SPEECH

Tách:

``` text
Decision
```

và:

``` text
Speech
```

AI có thể quyết định:

``` json
{
  "action": "SHOW_PRODUCT",
  "product_id": 123,
  "should_speak": true
}
```

Sau đó Speech Generator mới tạo câu nói.

Điều này giúp hệ thống linh hoạt.

------------------------------------------------------------------------

# 59. ACTION ENGINE

Các action:

``` text
SPEAK
SHOW_PRODUCT
SHOW_PROMOTION
CHANGE_SCENE
CHANGE_PRODUCT
CREATE_LEAD
UPDATE_LEAD
ESCALATE_HUMAN
PAUSE_AI
RESUME_AI
```

Action phải được validate trước khi thực thi.

------------------------------------------------------------------------

# 60. HUMAN ESCALATION

Nếu:

-   AI không có dữ liệu;
-   khách yêu cầu nhân viên;
-   khiếu nại;
-   vấn đề nhạy cảm;
-   đơn hàng có lỗi;

AI có thể:

``` text
ESCALATE_HUMAN
```

CRM tạo notification/task.

------------------------------------------------------------------------

# 61. PRODUCT ROTATION

MVP có thể chọn một product.

V2:

``` text
Product Queue
```

AI có thể chuyển sản phẩm theo:

-   lịch;
-   campaign;
-   viewer interest;
-   inventory;
-   promotion;
-   sales performance.

Nhưng không tự ý đổi sản phẩm nếu business rule không cho phép.

------------------------------------------------------------------------

# 62. CAMPAIGN MODE

Sau này có thể có:

``` text
Campaign
│
├── Product set
├── Script
├── Promotion
├── AI configuration
├── Duration
├── Target
└── KPI
```

Live Session lấy cấu hình từ Campaign.

------------------------------------------------------------------------

# 63. MULTI-PROVIDER STRATEGY

AI agent phải thiết kế provider-agnostic.

Ví dụ:

``` text
LLM:
Claude
OpenAI
Gemini

TTS:
FPT
ElevenLabs
Google
Zalo

Avatar:
Live2D
3D
External Avatar API
```

Không khóa hệ thống vào một nhà cung cấp.

------------------------------------------------------------------------

# 64. KHI ĐỌC CODE HIỆN TẠI

AI coding agent phải tạo một mapping:

``` text
SPEC REQUIREMENT
        ↓
EXISTING CODE
        ↓
REUSE / EXTEND / NEW
```

Ví dụ:

``` text
RAG
→ existing: reuse

AI Config
→ existing: reuse

Prompt
→ existing: extend

LiveSession
→ new

IntentRouter
→ new

TTS abstraction
→ new/extend

Product
→ existing
```

Không tạo duplicate.

------------------------------------------------------------------------

# 65. THỨ TỰ CODE BẮT BUỘC

Không code Avatar trước AI Brain.

Thứ tự:

``` text
1. Audit
2. Live domain models
3. Live session
4. Event architecture
5. Live context
6. Intent router
7. Memory
8. Sales state
9. Dynamic script
10. AI structured response
11. TTS abstraction
12. Audio pipeline
13. Local Live Agent
14. Avatar
15. Lip-sync
16. OBS
17. Platform adapters
18. Analytics
19. Recovery
20. Commercialization
```

------------------------------------------------------------------------

# 66. KHÔNG LÀM TRONG MVP

Không ưu tiên:

-   AI video generation;
-   photorealistic human avatar;
-   cloud GPU rendering;
-   multi-platform hàng chục nền tảng;
-   tự xây LLM;
-   tự xây TTS;
-   tự xây speech recognition nếu chưa cần;
-   complex 3D avatar;
-   quá nhiều analytics.

MVP phải tập trung:

**AI bán hàng + realtime + avatar + live.**

------------------------------------------------------------------------

# 67. TIÊU CHÍ CHẤT LƯỢNG

Hệ thống phải ưu tiên:

1.  Correctness.
2.  Stability.
3.  Safety.
4.  Low latency.
5.  Low cost.
6.  Maintainability.
7.  Extensibility.

Không đánh đổi correctness để lấy câu trả lời nhanh.

------------------------------------------------------------------------

# 68. QUY TẮC KHI AI AGENT TỰ CODE

Mỗi task phải:

1.  Đọc file liên quan.
2.  Hiểu dependency.
3.  Lập kế hoạch ngắn.
4.  Implement nhỏ.
5.  Test.
6.  Kiểm tra regression.
7.  Cập nhật documentation.
8.  Báo cáo file đã thay đổi.
9.  Báo cáo test.
10. Báo cáo phần chưa hoàn thành.

Không được trả lời "đã xong" nếu chưa test.

------------------------------------------------------------------------

# 69. CHANGE MANAGEMENT

Mỗi thay đổi kiến trúc lớn phải ghi:

``` text
ARCHITECTURE_DECISIONS.md
```

Format:

``` text
Decision
Context
Options
Chosen Option
Reason
Impact
Date
```

------------------------------------------------------------------------

# 70. DEFINITION OF PRODUCTION READY

Không được coi production-ready chỉ vì demo chạy.

Phải đạt:

-   reconnect;
-   retry;
-   logging;
-   authentication;
-   tenant isolation;
-   secrets protection;
-   long-running stability;
-   provider fallback;
-   platform capability handling;
-   human takeover;
-   monitoring;
-   tests;
-   documentation;
-   installation/update mechanism cho Live Agent.

------------------------------------------------------------------------

# 71. ROADMAP TỔNG THỂ

``` text
PHASE 0
Codebase + Platform Audit
3-5 ngày

        ↓

PHASE 1
AI Live Brain
5-10 ngày

        ↓

PHASE 2
Avatar + Lip Sync
2-4 tuần

        ↓

PHASE 3
Fujitech Live Agent
2-4 tuần

        ↓

PHASE 4
TikTok + Shopee Adapter
2-4 tuần

        ↓

PHASE 5
Analytics + Reliability
2-3 tuần

        ↓

PHASE 6
Commercial SaaS
Multi-account
Billing
Scheduling
```

Thời gian là mục tiêu kỹ thuật, không phải cam kết cố định. AI agent
phải điều chỉnh sau khi audit codebase.

------------------------------------------------------------------------

# 72. MASTER PRINCIPLE

Fujitech AI Livestream không phải:

> "Một avatar AI biết nói."

Nó phải là:

> **Một AI Sales Agent có khả năng tự vận hành một phiên livestream,
> hiểu sản phẩm, hiểu khách hàng, duy trì hội thoại, chủ động dẫn chương
> trình, xử lý phản đối, tạo lead và kết nối trực tiếp với CRM.**

Kiến trúc cốt lõi:

``` text
CRM
+
RAG
+
AI Core
+
Live Context
+
Conversation Memory
+
Sales State
+
Realtime Event Engine
+
TTS
+
Avatar
+
Live Agent
+
Platform Adapter
+
Analytics
=
FUJITECH AI LIVE
```

------------------------------------------------------------------------

# 73. INSTRUCTION CHO AI CODING AGENT

Khi được cung cấp repository Fujitech CRM cùng tài liệu này, hãy thực
hiện theo thứ tự:

## Bước 1

Đọc repository trước.

## Bước 2

Không viết code ngay.

## Bước 3

Tạo `CODEBASE_AUDIT.md`.

## Bước 4

Map các yêu cầu trong tài liệu này với code hiện tại.

## Bước 5

Phân loại:

``` text
REUSE
EXTEND
NEW
DEPRECATED
RISK
```

## Bước 6

Đề xuất implementation plan dựa trên code thực tế.

## Bước 7

Chỉ sau khi architecture mapping rõ ràng mới bắt đầu code.

## Bước 8

Mỗi phase phải có:

``` text
Implementation
Tests
Documentation
Migration if needed
Rollback consideration
```

## Bước 9

Không tự ý thay đổi những module không liên quan.

## Bước 10

Sau mỗi milestone phải kiểm tra regression.

------------------------------------------------------------------------

# 74. FINAL COMMAND FOR AI AGENT

> **Bạn đang làm việc trên một Fujitech CRM đã tồn tại, không phải một
> project mới.**
>
> Hãy coi source code hiện tại là nguồn sự thật về implementation, và
> tài liệu này là nguồn sự thật về mục tiêu kiến trúc của module AI
> Livestream.
>
> Không được giả định codebase đang như thế nào. Hãy đọc code.
>
> Không được rewrite hệ thống nếu chưa cần.
>
> Không được tạo duplicate AI Core, RAG, Product, Customer hoặc Prompt
> system nếu các thành phần đó đã tồn tại.
>
> Tái sử dụng tối đa hệ thống hiện tại.
>
> Xây AI Livestream như một mode/extension của Fujitech AI Core.
>
> Ưu tiên Cloud AI Brain + Local Live Agent.
>
> Không lấy Chrome + OBS làm nền tảng kiến trúc production. Có thể sử
> dụng chúng cho MVP/fallback.
>
> Không phụ thuộc vào scraper làm nền tảng cho platform integration.
> Thiết kế Platform Adapter và sử dụng API/integration được nền tảng cho
> phép.
>
> Không để LLM tự bịa thông tin sản phẩm.
>
> Tách AI Decision khỏi Speech.
>
> Tách AI Core khỏi Live Orchestration.
>
> Tách Platform Adapter khỏi business logic.
>
> Tách Avatar Engine khỏi AI Brain.
>
> Thiết kế provider-agnostic cho LLM, TTS và Avatar.
>
> Ưu tiên stability, correctness, safety, latency và cost.
>
> Khi chưa chắc về một chức năng của TikTok/Shopee, hãy kiểm tra
> capability/API thực tế thay vì tự giả định.
>
> Mọi implementation phải được test.
>
> Mọi thay đổi kiến trúc lớn phải được ghi lại.
>
> Mục tiêu cuối cùng không phải tạo một avatar biết nói, mà là tạo **AI
> Sales Operating System cho livestream được tích hợp sâu vào Fujitech
> CRM**.

------------------------------------------------------------------------

# 75. END STATE

``` text
                         FUJITECH CRM
                              │
       ┌──────────────────────┼──────────────────────┐
       │                      │                      │
    CUSTOMER                PRODUCT                AI CORE
       │                      │                      │
       └──────────────────────┼──────────────────────┘
                              │
                            RAG
                              │
                    SYSTEM + CORE PROMPT
                              │
                              ▼
                     FUJITECH AI BRAIN
                              │
             ┌────────────────┼────────────────┐
             │                │                │
          MEMORY          SALES STATE      LIVE SCRIPT
             │                │                │
             └────────────────┼────────────────┘
                              │
                      LIVE ORCHESTRATOR
                              │
             ┌────────────────┼────────────────┐
             │                │                │
          COMMENT          TIMER            EVENT
             │                │                │
             └────────────────┼────────────────┘
                              │
                         AI DECISION
                              │
                    ┌─────────┴─────────┐
                    │                   │
                  SPEECH              ACTION
                    │                   │
                   TTS            CRM / Product
                    │
                    ▼
             FUJITECH LIVE AGENT
                    │
          ┌─────────┼──────────┐
          │         │          │
       Avatar     Audio      Scene
          │         │          │
          └─────────┼──────────┘
                    │
                 Lip Sync
                    │
                    ▼
              STREAM ENGINE
                    │
             ┌──────┴──────┐
             ▼             ▼
          TikTok         Shopee
             │             │
             └──────┬──────┘
                    ▼
              COMMENTS / LEADS
                    │
                    ▼
               FUJITECH CRM
```

**Đây là vòng lặp hoàn chỉnh:**

**CRM → AI → LIVE → CUSTOMER → COMMENT → AI → LEAD → CRM.**

---

# ARCHITECTURE AMENDMENT v1.1: LOCAL-FIRST, CLOUD-READY LIVE EXECUTION

## 1. Product Deployment Principle

Fujitech AI Livestream SHALL follow a **Local-First, Cloud-Ready** deployment strategy during initial development and MVP.

The initial commercial prototype SHALL use a **Fujitech Live Studio / Local Live Executor** installed on the customer's Windows computer for resource-intensive livestream execution. This includes avatar rendering, lip-sync, local audio handling, video composition, encoding and platform streaming where technically permitted.

This approach is intentional: it minimizes Fujitech's infrastructure and GPU costs during the validation and early commercial phases.

However, the Local Live Studio MUST NOT become the architectural center of the platform. It is an **execution worker**, not the AI brain, CRM, source of truth, or business-logic layer.

## 2. End-User Experience During MVP

During MVP, the user may be required to install Fujitech Live Studio once. After installation, the intended workflow is:

1. Sign in.
2. Register/authorize the device.
3. Select products and AI configuration in the Web App.
4. Start a live session from the Web App or Live Studio.
5. Live Studio connects securely to Fujitech Cloud.
6. AI decisions, product truth, RAG, conversation state and orchestration remain in Fujitech Cloud.
7. Live Studio executes rendering, audio/avatar/lip-sync and livestream output locally.

The user SHOULD NOT need to install or configure OBS, FFmpeg, GPU drivers, Python environments, developer tools, or other technical dependencies manually. Fujitech Live Studio should package or manage its runtime dependencies where legally and technically appropriate.

## 3. Future SaaS Deployment

The architecture MUST support a future transition to a fully cloud-hosted experience where the customer does not install Live Studio.

Future deployment modes:

- `LOCAL`: customer computer runs the live execution worker.
- `CLOUD`: Fujitech-managed GPU worker runs the live execution worker.
- `HYBRID`: different customers or sessions may use local or cloud execution.
- `DEDICATED`: enterprise customer uses a dedicated GPU worker/infrastructure.

The customer-facing Web App SHOULD remain substantially the same regardless of execution mode.

## 4. Live Execution Abstraction

All rendering/streaming execution MUST be hidden behind an execution abstraction. Do NOT couple the Live Orchestrator or AI Core directly to Windows, OBS, a local process, or a specific GPU vendor.

Conceptual architecture:

    LiveSession
        |
        v
    LiveOrchestrator
        |
        v
    LiveExecutionProvider
       /       |        \
      /        |         \
     v         v          v
LocalExecutor CloudGPU   DedicatedExecutor

Initial implementation:

`LocalLiveExecutor`

Future implementations:

`CloudGPULiveExecutor`
`DedicatedLiveExecutor`
`EnterpriseLiveExecutor`

The exact class/module names MUST follow existing repository conventions after codebase audit.

## 5. Strict Separation of Responsibilities

### Fujitech Cloud owns

- Authentication and authorization
- Tenant/account management
- CRM
- Products
- Inventory truth
- Promotions
- RAG
- System Prompt
- Core Prompt
- Live Prompt
- AI Brain
- Intent Router
- Sales State
- Conversation Memory
- Live Orchestrator
- Live session state
- TTS provider abstraction
- Business rules
- Analytics and reporting
- Billing/usage in later phases
- Device registration and authorization
- Execution worker scheduling in later cloud phases

### Local Live Studio owns

- Local avatar runtime
- Local avatar rendering
- Lip-sync
- Audio playback/capture where required
- Scene composition
- Local video rendering
- Encoding
- Platform streaming connection where permitted
- Local hardware/resource monitoring
- Local reconnect/recovery
- Secure communication with Fujitech Cloud

Business truth MUST NOT be stored only in the Local Live Studio.

The Local Live Studio MUST be replaceable without changing the AI/CRM domain model.

## 6. Device Management

MVP MUST include a device abstraction sufficient to support:

- Device registration
- Device identity
- Device authorization
- Device status: ONLINE/OFFLINE/ERROR
- Last heartbeat
- Current live session
- Software version
- Basic CPU/RAM/GPU information
- Revocation
- Secure session authentication

Do NOT expose master API keys or platform secrets to the Local Live Studio.

Use short-lived/session-scoped credentials or an equivalent secure mechanism appropriate to the existing authentication architecture.

## 7. Cloud Migration Requirement

The first implementation MUST be designed so that migrating from Local to Cloud execution does NOT require rewriting:

- AI Core
- RAG
- Product Truth
- CRM
- Live Orchestrator
- Conversation Memory
- Sales Engine
- Live Session domain model
- Customer-facing Web App business workflows

Only the execution layer and deployment/scheduling infrastructure should materially change.

## 8. GPU Infrastructure Strategy

Fujitech MUST NOT design the future cloud architecture around one permanently oversized VPS.

When cloud execution is introduced, use a worker-pool model:

    Fujitech Cloud
          |
    Live Scheduler
          |
    +-----+-----+-----+
    |           |     |
  GPU #1      GPU #2 GPU #3
    |           |     |
 sessions    sessions sessions

The scheduler SHOULD assign sessions according to:

- GPU availability
- Current session count
- Estimated GPU load
- Required avatar/render profile
- Customer plan
- Session priority
- Worker health

The architecture SHOULD support adding/removing GPU workers without changing application-level live-session logic.

## 9. Cost-Control Principle

During MVP, prioritize customer-local execution to avoid premature GPU infrastructure costs.

Before enabling large-scale Cloud execution, benchmark and record at minimum:

- GPU utilization per concurrent session
- CPU utilization
- RAM usage
- VRAM usage
- Network bandwidth per live hour
- TTS cost per live hour
- LLM cost per live hour
- Average AI response latency
- Average session recovery time
- Maximum stable concurrent sessions per worker

These measurements SHALL be used to define pricing and cloud capacity planning.

## 10. Product UX Rule

MVP may require one-time installation of Fujitech Live Studio.

However, the **product experience MUST remain Web-first**.

The Web App is the primary control plane. Live Studio is an execution plane.

Do NOT build the product UX around a complex desktop studio resembling OBS.

The intended customer workflow remains:

    Login
      -> Select Product
      -> Select AI/Avatar
      -> Configure Live
      -> Preview
      -> Start Live

The desktop application should expose only the controls necessary for reliable execution, device status, live status, diagnostics and emergency human takeover.

## 11. Cloud-Ready Contract

Any component that communicates with the Local Live Studio MUST use a stable application-level contract rather than direct implementation assumptions.

Conceptually:

    Web App
       |
       v
    Live Session API
       |
       v
    Live Orchestrator
       |
       v
    Execution Contract
       |
       +---- Local Live Studio
       |
       +---- Cloud GPU Worker
       |
       +---- Dedicated Worker

The protocol may use WebSocket, HTTP, gRPC or another appropriate mechanism based on the existing architecture. The coding agent MUST inspect the repository before choosing or introducing a new protocol.

## 12. Implementation Guardrails for AI Coding Agents

The coding agent MUST obey all of the following:

1. Do NOT remove Local Live Studio from the MVP merely because a future cloud mode exists.
2. Do NOT make Local Live Studio a permanent hard dependency of the AI Core.
3. Do NOT put Product Truth, CRM business logic, RAG logic or sales logic exclusively inside the desktop application.
4. Do NOT build a single-VPS-only architecture for future cloud execution.
5. Do NOT require end users to install OBS as part of the standard Fujitech workflow.
6. Do NOT hard-code TikTok or Shopee execution directly into the AI Core.
7. Do NOT expose master API keys to the desktop client.
8. Do NOT duplicate the AI Brain inside the desktop application.
9. Do NOT rewrite existing CRM/AI infrastructure when an extension or adapter is sufficient.
10. MUST preserve a clear boundary between Control Plane and Execution Plane.
11. MUST implement the MVP Local Executor in a way that a future Cloud GPU Executor can replace it.
12. MUST document every architectural decision that affects future Local-to-Cloud migration.

## 13. Control Plane vs Execution Plane

The canonical architecture is:

**CONTROL PLANE**

Web App + API + AI Core + RAG + CRM + Product Truth + Live Orchestrator + Session State + Analytics

**EXECUTION PLANE**

Local Live Studio initially; Cloud GPU Workers later.

The Control Plane decides **what should happen**.

The Execution Plane performs **how it happens in real time**.

This distinction is mandatory and should be reflected in modules, services, interfaces and documentation.

## 14. Revised Development Phases

### Phase 0: Codebase Audit

Inspect the existing repository before implementation.

### Phase 1: AI Live Brain

Implement/extend AI Core integration, Live Context, Product Truth, Intent Router, Sales State, Conversation Memory, structured AI output and Live Orchestrator.

### Phase 2: Local Live Execution MVP

Build the minimum viable Fujitech Live Studio / LocalLiveExecutor for Windows. It should receive execution commands from the Cloud, run avatar/lip-sync/audio/rendering/streaming, report health and support human takeover.

### Phase 3: Web-First Live Control UX

Build the simple Web workflow for product selection, avatar/voice selection, configuration, preview, start/stop and monitoring. Keep technical execution details out of the customer UX.

### Phase 4: TikTok + Shopee Platform Adapters

Implement platform adapters and capability discovery using supported/authorized platform mechanisms.

### Phase 5: Reliability + Analytics

Add long-running tests, recovery, monitoring, usage metrics, session analytics and cost measurement.

### Phase 6: Cloud GPU Execution

Introduce CloudGPULiveExecutor, GPU worker registration, scheduler, capacity tracking, health monitoring and session assignment.

### Phase 7: Hybrid + Commercial SaaS

Allow per-customer/per-session execution mode selection, usage metering, billing, quotas and enterprise deployment.

## 15. Definition of Done: Local-First MVP

The MVP is complete when:

- User can create a live session from the Web App.
- User can select products and approved product information.
- AI uses existing System Prompt, Core Prompt and RAG architecture.
- AI receives and classifies live comments.
- AI generates structured decisions/responses.
- TTS produces speech.
- Local Live Studio receives execution commands.
- Avatar speaks with lip-sync.
- Local Studio streams to the supported platform path.
- Proactive speech works.
- Conversation memory works.
- Human takeover works.
- Device heartbeat/health is visible.
- Session logs are stored in Cloud.
- Local Studio can reconnect after temporary network failure.
- AI Core and CRM do not depend on local rendering implementation details.
- The execution boundary is documented sufficiently to implement CloudGPULiveExecutor later.

## 16. Final Product Principle

Fujitech AI Livestream should be developed as a **Web-first AI Livestream SaaS platform with a Local-First execution strategy**.

In MVP:

**Customer computer provides the rendering/streaming resources.**

In scale-up:

**Fujitech provides optional managed GPU execution.**

In mature SaaS:

**Local, Cloud and Dedicated execution can coexist behind the same Live Execution abstraction.**

The customer should experience one product regardless of where the livestream is physically rendered.

---

# AI CODING AGENT MANDATORY ARCHITECTURE CHECK

Before writing implementation code, the coding agent MUST explicitly verify:

- Is the proposed change part of the Control Plane or Execution Plane?
- Can the Local Executor be replaced by a Cloud GPU Executor without changing business logic?
- Is any business logic accidentally being placed in the desktop client?
- Is any component hard-coded to one execution environment?
- Does the design increase future GPU migration cost?
- Does the design unnecessarily require the customer to operate technical software?
- Does the change reuse existing Fujitech AI/CRM infrastructure?

If any answer indicates architectural coupling that violates this specification, STOP and revise the design before implementation.
