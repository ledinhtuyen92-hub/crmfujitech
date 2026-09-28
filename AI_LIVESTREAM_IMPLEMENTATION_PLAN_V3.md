# AI LIVESTREAM IMPLEMENTATION PLAN V3

## 1. CHANGES FROM V2
- **Product Architecture:** Hủy bỏ phương án chèn `affiliate_url` vào `inventory.Product`. Thiết kế mô hình Adapter `LivePlatformProduct` để kết nối `inventory.Product` (Core) với các nền tảng Livestream (TikTok, Shopee, Custom) nhằm hỗ trợ đa URL và Flash Sale Price.
- **Phân tách Product Truth và Knowledge:** Phân định rạch ròi cơ chế xử lý xung đột: Product Truth (Database) ưu tiên tuyệt đối so với RAG (Tài liệu Unstructured).
- **Affiliate URL Action:** Hủy bỏ ý tưởng LLM tự sinh Affiliate URL. LLM chỉ sinh Semantic Action (intent), Backend sẽ intercept và gắn URL từ DB vào payload cuối cùng để chống hallucination.
- **RAG Scope:** Chuyển từ RAG chung chung sang Multi-scoped RAG (Live Context -> Product -> Company).
- **Document Ingestion Pipeline:** Thiết kế luồng xử lý tài liệu tường minh với Celery và Status tracking.
- **Phased Approach:** Chia nhỏ Phase 1 thành 1A, 1B, 1C, 1D theo đúng nguyên tắc domain-driven.

---

## 2. ARCHITECTURE DECISION RECORD (ADR)
1. **Hybrid Control Plane / Execution Plane:** Backend (Cloud) nắm não AI, bảo mật CRM. Live Studio (Local) lo render Avatar, Lipsync, RTMP.
2. **Reuse Existing AI Core:** Dùng lại `ai_agents` để giữ đồng nhất logic prompt và API key.
3. **Reuse Existing RAG:** Tái sử dụng `AiKnowledgeChunk` (pgvector).
4. **Product Truth vs Product Knowledge:** Dữ liệu cấu trúc (Giá, Stock) luôn thắng dữ liệu phi cấu trúc (PDF).
5. **Unified CRM & Affiliate Product Strategy:** Affiliate Customer dùng `inventory.Product` (Unified Core) kết hợp `LivePlatformProduct` (Adapter).
6. **Knowledge Scope:** Truy xuất ưu tiên: Live Context > Product Knowledge > Company Knowledge.
7. **Live Session Context:** Lưu trữ trên Redis để tối ưu tốc độ, vòng đời theo Session.
8. **Backend-resolved Affiliate URL:** Chặn LLM sinh URL.
9. **Device Management:** Cấp Device Token cho Live Studio, cô lập với User JWT.
10. **Human Takeover:** Flush speech queue, block LLM generation, chuyển quyền cho Operator.
11. **LiveExecutionProvider:** Abstract layer cho Execution Worker.
12. **Platform Adapter:** Abstract layer giao tiếp API (TikTok/Shopee).
13. **TTS Abstraction:** Abstract `TTSProvider`.
14. **Phase Structure:** Tái cấu trúc thành Phase 1A -> 1D.

---

## 3. PRODUCT ARCHITECTURE DECISION

**Phân tích Option A (Gộp) vs Option B (Tách rời):**
Kiểm tra source code `inventory.Product` cho thấy model này rất linh hoạt (không bắt buộc Category, SKU, StockLevel). Tuy nhiên, một sản phẩm có thể được livestream trên nhiều nền tảng với các Affiliate URL và giá Flash Sale khác nhau.

**=> QUYẾT ĐỊNH: HYBRID UNIFIED MODEL**
1. **Product Truth (Core):** Dùng `inventory.Product`. Cả KH CRM và Affiliate đều tạo bản ghi ở đây (Affiliate chỉ cần điền Tên + Giá). Đảm bảo nếu Affiliate muốn upgrade lên CRM, sản phẩm đã sẵn sàng.
2. **Platform Adapter:** Tạo model mới `live_sessions.models.LivePlatformProduct`.
   - Có ForeignKey trỏ về `inventory.Product`.
   - Chứa các trường: `platform` (TikTok/Shopee), `platform_product_id`, `affiliate_url`, `live_price_override`.

---

## 4. RAG ARCHITECTURE & KNOWLEDGE SCOPE

**Product Truth vs Product Knowledge:**
- **Product Truth (Structured):** Dữ liệu cứng từ DB (Tên, Giá, Giá Override, URL).
- **Product Knowledge (Unstructured):** File PDF, DOCX, TXT.

**Cấu trúc RAG Mới:**
Tái sử dụng `AiKnowledgeDocument` và thêm trường `product = models.ForeignKey('inventory.Product', null=True)`.

**Retrieval Priority (Thứ tự ưu tiên):**
1. **Live Context (Redis):** Thông tin đang ghim, sản phẩm đang bàn.
2. **Product Truth (DB):** Inject thẳng vào System Prompt qua block `<PRODUCT_TRUTH>`.
3. **Product Knowledge (PGVector):** Truy vấn vector filter theo `product_id` hiện tại.
4. **Company Knowledge (PGVector):** Truy vấn vector filter theo `company_id` (khi `product_id IS NULL`).

**Conflict Resolution:**
System Prompt ép buộc LLM: "Nếu thông tin trong RAG mâu thuẫn với <PRODUCT_TRUTH> (đặc biệt về Giá và Tồn kho), BẮT BUỘC sử dụng <PRODUCT_TRUTH>".

---

## 5. AFFILIATE ARCHITECTURE & URL RESOLUTION

**Luồng xử lý chống Hallucination:**
1. Comment -> Intent Router -> LLM quyết định chốt sale.
2. LLM sinh JSON Output:
   ```json
   {
     "intent": "PURCHASE_INTENT",
     "action": "SHOW_PRODUCT_LINK",
     "product_id": "123",
     "response_text": "Dạ em gửi anh link mua sản phẩm nhé."
   }
   ```
3. Backend Parser đọc JSON, validate `product_id` có thuộc `Company` hiện tại không.
4. Backend lấy `affiliate_url` từ `LivePlatformProduct` tương ứng.
5. Backend tổng hợp command gửi xuống Live Studio kèm URL thật. LLM KHÔNG BAO GIỜ sinh URL.

---

## 6. LIVE ARCHITECTURE

### Document Ingestion
Upload -> `Document Record (Status: PENDING)` -> Celery Job -> Extract Text -> Chunking -> Embedding -> `AiKnowledgeChunk` -> `Status: COMPLETED`. (Hỗ trợ TXT, DOCX, PDF cho MVP).

### Multi-Tenant Isolation
- Mọi model (`LiveSession`, `LiveDevice`, `LivePlatformProduct`, `Product`) phải có `company_id`.
- RAG Query **bắt buộc** gắn `WHERE company_id = X` ở tầng Database (không lọc bằng code Python sau khi đã query vector).

### Live Session & Device
- **LiveDevice:** Quản lý máy tính chạy phần mềm. Cấp Device Token. Revoke được.
- **LiveContext:** Lưu trên Redis, cấu trúc JSON: `current_product`, `recent_comments`, `sales_stage`.

---

## 7. MVP PHASES (Trình tự triển khai)

### PHASE 1A: PRODUCT KNOWLEDGE FOUNDATION
- **Database:** Extend `AiKnowledgeDocument` (+ `product_id`). Tạo `LivePlatformProduct`.
- **Tasks:** Xây dựng Celery Ingestion Pipeline cho PDF/DOCX -> Chunking -> Vector DB.
- **Backend:** Cập nhật hàm Vector Search hỗ trợ filter theo Product/Company.

### PHASE 1B: LIVE DOMAIN FOUNDATION
- **Database:** Tạo App `live_sessions` (Models: `LiveSession`, `LiveDevice`).
- **Backend:** Xây dựng hệ thống Authentication bằng Device Token. Xây dựng cấu trúc `LiveContext` trên Redis.

### PHASE 1C: LIVE AI BRAIN
- **Backend:** Viết `Intent Router`. Tích hợp logic truy xuất Product Truth.
- **Backend:** Điều chỉnh System Prompt của `AiAgent` hiện có để nhận `<PRODUCT_TRUTH>` và xuất ra JSON Semantic Action.
- **Backend:** Xây dựng tính năng Proactive Speech (Celery beat / Async loop check silence).

### PHASE 1D: EXECUTION MVP
- **Backend:** Khai báo Interface `LiveExecutionProvider`, `PlatformAdapter`, `TTSProvider`.
- **Mocking:** Viết `DummyTTSProvider` và `LocalLiveExecutor` base.
- **Realtime:** Xây dựng `LiveStudioConsumer` (WebSocket) truyền Audio URL + Command xuống Worker.

*(Phase 2: Tích hợp Platform thực tế, Phase 3: Analytics, Phase 4: Cloud GPU).*

---

## 8. REMAINING RISKS
- **Data Leakage (RAG):** Cần đảm bảo hàm gọi pgvector luôn bị ép constraint `company_id` từ middleware hoặc service layer, tránh dev quên truyền param.
- **Ingestion Failure:** File PDF bị lỗi font/không extract được text. Cần có cờ `Status: FAILED` và lưu `failure_reason` rõ ràng để báo cho người dùng.

## 9. FILES CREATED (Kế hoạch File-by-File)
- **Database (Change):** `backend/ai_agents/models.py` (Mở rộng `AiKnowledgeDocument`).
- **Database (New):** `backend/live_sessions/models.py` (Tạo `LivePlatformProduct`, `LiveSession`, `LiveDevice`).
- **Tasks (New):** `backend/ai_agents/tasks.py` (Document Ingestion).
- **Backend (New):** `backend/live_sessions/services/...` (Live Context, Resolvers, TTS, Execution Provider).
- **Realtime (New):** `backend/live_sessions/consumers.py`.
