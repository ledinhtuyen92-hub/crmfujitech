# CODEBASE AUDIT V3

## 1. Actual Current Architecture
Hệ thống Fujitech CRM hiện tại được xây dựng theo kiến trúc Monolith Modular (Django + DRF) với Frontend React SPA.
Hệ thống tuân thủ chặt chẽ kiến trúc **Multi-tenant** thông qua model `users.Company`. Tất cả các bảng dữ liệu đều liên kết với `Company`.
Hệ thống đã triển khai AI vào các module mạng xã hội (Zalo, Facebook) qua cấu hình `AiAgent`.

## 2. Existing AI Architecture (Verified)
- **Nằm tại:** App `ai_agents`.
- **Thành phần:** `AiAgent`, `SystemAiKey`, `CompanyAiKey`.
- **Đánh giá:** Rất hoàn thiện. Hỗ trợ đa LLM, chia tách Prompt và Rule rõ ràng.
- **Kết luận:** **REUSE HOÀN TOÀN**. Livestream sẽ cắm trực tiếp vào hệ thống này thông qua `LiveSession`.

## 3. Existing RAG Architecture (Verified)
- **Nằm tại:** App `ai_agents` (`AiKnowledgeDocument`, `AiKnowledgeChunk`).
- **Lưu trữ:** Sử dụng `pgvector` trong PostgreSQL.
- **Hạn chế hiện tại:** `AiKnowledgeDocument` đang gán chung chung cho một Agent hoặc Company, chưa có tính liên kết sâu vào Domain Sản phẩm.
- **Kết luận:** **REUSE & EXTEND**. Cần bổ sung ForeignKey `product_id` vào `AiKnowledgeDocument` để định hình "Product Knowledge Scope".

## 4. Existing CRM & Product Architecture (Verified)
- **Tình trạng:** Nằm tại app `inventory` (`Product`, `StockLevel`, `ProductCategory`).
- **Phân tích:** Model `inventory.Product` rất linh hoạt. Các trường `template`, `category`, `sku` đều cho phép null/blank. Không bắt buộc phải có bản ghi `StockLevel`.
- **Kết luận:** Hoàn toàn có thể dùng `inventory.Product` làm **Unified Product Model** cho cả CRM Customer và Affiliate Customer. Khách Affiliate sẽ tạo một `inventory.Product` "siêu nhẹ" (chỉ có Tên và Giá).
- **Khoảng trống:** `inventory.Product` không nên chứa URL Affiliate của Livestream, vì 1 sản phẩm có thể bán trên nhiều luồng/nền tảng khác nhau. Cần tạo model `LivePlatformProduct` làm Adapter nối `inventory.Product` ra ngoài Livestream.

## 5. Existing Realtime Architecture (Verified)
- **Nằm tại:** `notifications.consumers.NotificationConsumer`.
- **Hạn chế:** Dành cho Web User (qua JWT).
- **Kết luận:** Cần hệ thống riêng (`LiveStudioConsumer`) và Device Token để kết nối máy trạm (Live Studio).

## 6. Confirmed Gaps (Thiếu sót mới phát hiện & cập nhật V3)
- **Platform Adapter:** Chưa có model quản lý sản phẩm lai (Platform + Affiliate + Override Price).
- **Document Ingestion Pipeline:** Hệ thống chưa có luồng Upload -> Extract Text -> Chunking -> Vector cho PDF/DOCX tự động.
- **Device Management:** Chưa có cơ chế quản lý máy ảo/máy vật lý chạy Live Studio.
- **TTS (Text-to-Speech):** Chưa có abstraction provider.

## 7. Changes from V2
- Thay vì thêm `affiliate_url` trực tiếp vào `inventory.Product`, bản V3 xác nhận cần tạo Adapter Model riêng (`LivePlatformProduct`) để đảm bảo nguyên tắc Normalization và hỗ trợ 1 SP bán trên nhiều kênh.
- Phân tách rõ ràng RAG Scope theo Cấp độ (Product > Company).
