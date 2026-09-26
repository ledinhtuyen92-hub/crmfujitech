# Kế Hoạch Triển Khai Module AI Livestream - Fujitech CRM

## 1. Bối cảnh & Phân tích thị trường
Xu hướng sử dụng AI Livestream bán hàng 24/7 trên TikTok, Shopee đang bùng nổ. Qua việc phân tích các nền tảng trong và ngoài nước, chúng ta chia thị trường thành 2 mô hình chính:

*   **Mô hình Cloud 100% (Ví dụ: Genpio):** Toàn bộ việc xử lý AI (từ Text-to-Speech đến render hình ảnh Video Avatar) đều chạy trên máy chủ đám mây (Cloud GPU) của nhà cung cấp. 
    *   *Ưu điểm:* Khách hàng không cần máy tính mạnh.
    *   *Nhược điểm:* Chi phí vận hành máy chủ khổng lồ. Giá bán rất đắt (hàng chục triệu/tháng).
*   **Mô hình Hybrid / Local (Ví dụ: DeepCore, LIVI AI):** Hệ thống chỉ cung cấp "Não" (Kịch bản, API LLM) trên máy chủ, còn việc dựng hình MC Ảo được thực hiện qua phần mềm cài trên máy tính cá nhân của khách hàng.
    *   *Ưu điểm:* Chi phí Server cho nhà cung cấp gần như bằng 0. Giá bán rất dễ tiếp cận (500k - 1tr/tháng).

## 2. Chiến lược đề xuất cho Fujitech CRM: Mô hình Hybrid (Lai)
Để tối ưu chi phí hạ tầng (không phải đầu tư máy chủ Card đồ họa) và dễ dàng tích hợp vào nền tảng Web CRM hiện có, **chúng ta sẽ áp dụng Mô hình Hybrid mượn lực phần cứng từ khách hàng**.

### Cấu trúc hệ thống:
Hệ thống sẽ được chia làm 2 phần rõ rệt:

#### Phần 1: Bộ não Điều phối (Chạy trên Server Django CRM của Fujitech)
*   **Quản lý dữ liệu:** Nơi khách hàng cấu hình API Key (OpenAI/Gemini), tải lên kịch bản, FAQ, và thông tin sản phẩm.
*   **Thu thập dữ liệu Live:** Server có các Worker (Celery/Redis) liên tục quét và thu thập bình luận từ kênh Live TikTok/Shopee theo thời gian thực (Real-time).
*   **Xử lý Logic (LLM & TTS):** Nhận comment -> Đưa qua Trợ lý AI (Gemini/OpenAI) để sinh câu trả lời -> Gửi text sang API Giọng nói (FPT.AI / ElevenLabs / Zalo TTS) để lấy file Audio (âm thanh).

#### Phần 2: Xử lý Đồ họa & Phát sóng (Chạy trên máy tính khách hàng)
*   **Frontend (React Web):** Tạo một màn hình riêng biệt (Studio View) chứa giao diện Livestream. Màn hình này hiển thị nhân vật ảo (Dùng thư viện Live2D cho nhân vật hoạt hình hoặc WebGL cho 3D nhẹ).
*   **Lip-sync (Nhép môi):** Trình duyệt nhận file Audio từ Server. Khi phát âm thanh, Javascript trên trình duyệt sẽ tự động phân tích tần số âm thanh để điều khiển nhân vật ảo mấp máy môi khớp chữ.
*   **Phát sóng (OBS Studio):** Khách hàng mở phần mềm OBS Studio trên máy tính của họ -> Quay màn hình (Capture) cái tab trình duyệt chứa nhân vật ảo -> Bấm nút Stream đẩy luồng lên TikTok/Shopee.

## 3. Tại sao đây là phương án tối ưu nhất?
1.  **Vốn đầu tư ban đầu thấp:** Không cần mua/thuê cụm máy chủ GPU đắt đỏ.
2.  **Rủi ro thấp, biên lợi nhuận cao:** Chi phí duy nhất chúng ta chịu là tiền gọi API Text (OpenAI) và API Voice (TTS). Các khoản này rất rẻ, giúp tạo ra biên lợi nhuận cao kể cả khi bán gói cước rẻ.
3.  **Khả thi về mặt kỹ thuật:** Không đòi hỏi đội ngũ Dev phải có kiến thức chuyên sâu về Computer Vision hay AI Video Generation. Các thư viện làm 2D/3D trên Web (Three.js, Live2D) đều có sẵn và dễ tích hợp vào React.
4.  **Tích hợp liền mạch:** Module này trở thành một "Add-on" hoàn hảo để Upsell (bán kèm) cho các khách hàng đang dùng CRM Fujitech.

## 4. Lộ trình triển khai dự kiến (Roadmap)
Nếu được phê duyệt, dự án có thể chia làm 3 giai đoạn (Phase):

*   **Phase 1 (Proof of Concept - 2-3 Tuần):**
    *   Tích hợp công cụ cào (Scrape) comment từ TikTok Live về hệ thống.
    *   Xây dựng luồng tự động trả lời: Nhận Comment -> AI sinh Text -> API sinh Voice -> Phát Audio trên web.
    *   *Mục tiêu:* Tạo ra một luồng "Live Radio" hoặc "Live hiển thị hình tĩnh" thành công.
*   **Phase 2 (Avatar 2D/3D Cơ bản - 3-4 Tuần):**
    *   Tích hợp SDK Live2D vào giao diện React.
    *   Xử lý logic Lip-sync (nhép môi) theo âm thanh (Audio API) trả về từ máy chủ.
    *   *Mục tiêu:* Có một nhân vật MC hoạt hình lên sóng mấp máy môi mượt mà.
*   **Phase 3 (Hoàn thiện & Đóng gói Thương mại):**
    *   Phát triển giao diện quản lý phòng Live (Live Studio Dashboard).
    *   Cơ chế chọn nhiều nhân vật ảo khác nhau, upload phông nền.
    *   Viết tài liệu hướng dẫn khách hàng cách cài đặt và kết nối OBS Studio.
