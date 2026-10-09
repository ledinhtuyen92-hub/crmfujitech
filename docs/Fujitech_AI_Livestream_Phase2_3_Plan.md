# Kế hoạch Triển khai AI Livestream - Giai đoạn 3 (Động cơ FFmpeg & Client)

Tài liệu này lưu trữ lại tiến độ đã hoàn thành ở Giai đoạn 1 & 2 và phác thảo chi tiết Giai đoạn 3 cho phiên làm việc tiếp theo.

## I. NHỮNG GÌ ĐÃ HOÀN THÀNH (Giai đoạn 1 & 2)

### 1. Quản lý Tài nguyên (LiveMediaAssets)
- Đã hoàn thiện chức năng tải lên tài nguyên: Avatar (Video Phông Xanh), Phông nền (Background), Lớp phủ (Overlay/Logo), và Âm thanh nền (BGM).
- Xử lý lỗi thư viện Axios (`postForm`) để tải lên file chuẩn xác.
- Thiết kế giao diện `Kho Tài nguyên Live` trực quan dạng lưới (Grid), tự động nhận diện và hiển thị ảnh thu nhỏ (Thumbnail). Đối với video, tự động phát (Play) khi di chuột qua.
- Nền tối gradient để làm nổi bật phông xanh và logo.

### 2. Khung kéo thả cấu hình Cảnh (Live Scene Builder)
- Tích hợp tính năng "Thiết kế Cảnh (Scene)" vào trang chi tiết `Live Studio Workspace`.
- Cập nhật model Database `LiveSession` để lưu các bản nháp tài nguyên (`avatar_asset`, `background_asset`, `overlay_asset`, `audio_asset`).
- Bổ sung trường `session_prompt` (Kịch bản/Lưu ý riêng) vào cấu hình Phiên Live, giúp AI tự chủ linh hoạt theo bối cảnh (Ví dụ: Flash sale 10/10).
- Tạo luồng Mockup Preview, tự động xem trước bố cục hiển thị ngay trên giao diện Web khi đang ở trạng thái Idle (Chưa Live).

---

## II. KẾ HOẠCH GIAI ĐOẠN 3 (Giai đoạn tiếp theo)

Giai đoạn 3 là lõi của quá trình phát sóng: Tích hợp Động cơ trộn Video và Âm thanh sử dụng FFmpeg từ máy Client (Live Studio Device).

### Bước 3.1: Mở rộng Giao thức Điều khiển (Protocol Payload)
- Khi Cloud gửi lệnh `start_stream` hoặc cấu hình `scene.update` xuống Client, Payload cần chứa đầy đủ các thông tin:
  - Cấu trúc kịch bản AI: `ai_agent_id`, `session_prompt`.
  - Link tài nguyên: `avatar_asset_url`, `background_asset_url`, `overlay_asset_url`, `audio_asset_url`.
- **Yêu cầu:** Chỉnh sửa `live_sessions/protocol/commands.py` (Backend) để tự động nạp các URL tài nguyên này vào trong Lệnh.

### Bước 3.2: Máy khách (Live Studio Python Client) tải tài nguyên
- Khi nhận lệnh, Client (`live_studio/main.py` hoặc module execution tương ứng) cần khởi tạo một luồng (thread) tải ngầm các file này về thư mục Cache cục bộ (`live_studio/assets/cache/`).
- Đảm bảo File toàn vẹn trước khi chuyển sang bước render.

### Bước 3.3: Lắp ráp FFmpeg Command (Complex Filter)
- Xây dựng module tạo lệnh FFmpeg để trộn (Compositing):
  1. **Background layer:** Nằm dưới cùng.
  2. **Avatar layer:** Khử phông xanh (Chroma key: `colorkey=0x00FF00:0.1:0.1`) và đặt nằm đè lên Background.
  3. **Overlay/Logo layer:** Đặt trên cùng (có alpha channel).
  4. **Audio Routing:** Mix nhạc nền (BGM) với âm thanh của AI (TTS phát ra).
- Đẩy luồng đầu ra (Output stream) thành RTMP/FLV lên Shopee/Tiktok.

### Bước 3.4: Xử lý sự kiện thời gian thực (Real-time Events)
- Cập nhật Client để AI có thể tự ngắt kịch bản khi nhận được comment mới.
- Đẩy log lên Backend để Timeline (`AI Event Timeline`) trên trình duyệt nhảy liên tục, giúp người dùng giám sát.

---
**Trạng thái hệ thống:** Ổn định.
**Tiếp theo:** Mở file này và bắt đầu tiến hành viết Code cho Bước 3.1 & 3.2.
