# Kế hoạch triển khai: Tính năng Hẹn lịch chăm sóc khách hàng

Dưới đây là phương án tối ưu để triển khai tính năng hẹn lịch chăm sóc khách hàng, tự động nhắc nhở Sale qua hệ thống thông báo nội bộ, đã bao gồm yêu cầu tuỳ chỉnh thời gian nhắc nhở.

## Đề xuất triển khai

### 1. Cấu hình thời gian nhắc nhở (Settings)
- Bổ sung trường `follow_up_remind_before_hours` vào bảng `CompanySettings` (Cài đặt công ty) với giá trị mặc định là `24` giờ.
- Tại giao diện Cài đặt công ty (hoặc bằng lệnh ngầm định trước), cho phép tùy chỉnh thời gian này (ví dụ: nhắc trước 2 giờ, 12 giờ, hoặc 48 giờ tùy nhu cầu quản lý).

### 2. Cập nhật Cơ sở dữ liệu (Database)
- Bổ sung 2 trường dữ liệu mới vào bảng `Customer` trong file `backend/crm/models.py`:
  - `follow_up_time` (Hẹn lịch chăm sóc): Kiểu DateTime, cho phép lưu trữ chính xác ngày và giờ hẹn.
  - `follow_up_reminded` (Đã nhắc nhở): Kiểu Boolean (Mặc định `False`), dùng để cắm cờ đánh dấu những khách hàng nào hệ thống đã gửi thông báo nhắc nhở rồi, tránh việc Sale bị spam thông báo lặp đi lặp lại.
- Thiết lập logic: Bất cứ khi nào Sale thay đổi giờ `follow_up_time` sang một giờ mới, hệ thống sẽ tự động reset `follow_up_reminded = False` để sẵn sàng nhắc nhở lại vào khung giờ mới.
- Khởi tạo migration và áp dụng vào Database.

### 3. Cập nhật Giao diện (Frontend)
- **Form "Cập nhật Khách hàng"**: Thêm trường "Hẹn lịch chăm sóc" (DatePicker có bật tính năng chọn giờ/phút). Vị trí: Đặt bên cạnh trường "Mức độ ưu tiên" hoặc "Số lượng SP dự kiến" để đảm bảo bố cục hài hòa.
- **Tab "Thông tin chi tiết" của khách hàng**: Bổ sung trường hiển thị "Hẹn lịch chăm sóc" ở vị trí dễ nhìn để Sale có thể theo dõi nhanh chóng.

### 4. Tự động hóa Nhắc nhở bằng Celery (Background Tasks)
- Tạo một tác vụ tự động (Task) có tên `check_follow_up_appointments` trong file `backend/crm/tasks.py`.
- Lập lịch cho tác vụ này chạy **mỗi 15 phút một lần** thông qua cấu hình `CELERY_BEAT_SCHEDULE`.
- **Luồng hoạt động của Task:**
  1. Đọc cấu hình `follow_up_remind_before_hours` của từng công ty (VD: 2 giờ).
  2. Quét tìm tất cả các khách hàng có `follow_up_time` nằm trong khoảng từ *[Thời điểm hiện tại]* đến *[Thời điểm hiện tại + 2 giờ tới]*, và `follow_up_reminded = False`.
  3. Với mỗi khách hàng tìm thấy, hệ thống sẽ sinh ra một **Thông báo (Notification)** nội bộ gửi trực tiếp đến nhân viên Sale đang phụ trách (`assigned_to`). Tiêu đề: *"Sắp đến lịch chăm sóc khách hàng XYZ"*.
  4. Sau khi gửi thông báo, đánh dấu `follow_up_reminded = True` để hệ thống không nhắc lại ở vòng lặp 15 phút tiếp theo.

> [!NOTE]
> Kế hoạch này đã bao gồm đầy đủ các yêu cầu của anh. Nếu anh đồng ý với phương án này, hãy bấm **Proceed** hoặc phản hồi xác nhận để em tiến hành viết code ngay nhé!
