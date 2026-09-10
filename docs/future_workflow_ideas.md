# Ý Tưởng Kiến Trúc Workflow Động (Tương Lai)

Tài liệu này lưu trữ các phân tích và lộ trình triển khai tính năng Quản lý Quy trình (Workflow) động cho hệ thống CRM Fujitech, được thảo luận vào ngày 10/09/2026.

## Giai đoạn 2: Cài đặt luồng cơ bản (Tương lai gần)
**Mục tiêu:** Cho phép Admin cấu hình luồng chạy Tuần tự hoặc Song song mà không cần can thiệp vào mã nguồn.
**Cách làm:**
1. Thêm trường cấu hình vào `CompanySettings`: `workflow_mode` (Choices: `sequential`, `parallel`).
2. Sửa `OrderWorkflowEngine` để đọc cấu hình này:
   - Nếu `sequential`: Chạy tuần tự `Duyệt đơn -> Xuất kho -> Sản xuất -> Giao hàng`.
   - Nếu `parallel`: Chạy song song `Xuất kho` & `Sản xuất`. Khi cả 2 hoàn thành mới gọi `Giao hàng`.
3. Giao diện: Thêm mục "Cấu hình Quy trình" trong trang Cài đặt Công ty, dùng Radio Button đơn giản.

## Giai đoạn 3: Visual Workflow Builder (Mục tiêu dài hạn)
**Mục tiêu:** Xây dựng bộ công cụ kéo thả (Drag & Drop) quy trình chuyên nghiệp tương tự Odoo, Salesforce, giúp tuỳ biến luồng chạy cho từng loại đơn hàng hoặc từng công ty khách hàng khác nhau.
**Cách làm:**
1. **Frontend:** 
   - Sử dụng thư viện `React Flow` để xây dựng màn hình vẽ Graph.
   - Các Nodes có thể có: Lên đơn, Duyệt tín dụng, Xuất kho, Sản xuất, QC (Kiểm định), Đóng gói, Giao hàng.
   - Các Edges (dây nối) đại diện cho thứ tự chạy. Có thể thiết lập điều kiện rẽ nhánh (Ví dụ: Đơn > 100tr thì qua Node Giám đốc duyệt).
2. **Backend:**
   - Xây dựng **BPMN Engine** thu nhỏ.
   - Lưu cấu hình Graph dưới dạng JSON trong bảng `CustomWorkflow`.
   - Mỗi `Order` khi tạo sẽ sinh ra một bản ghi `WorkflowInstance` để theo dõi trạng thái Token (đang nằm ở Node nào).
   - Xử lý bài toán Concurrency: Join Nodes (chờ nhiều nhánh song song hoàn thành mới đi tiếp) và Split Nodes.
   - Tách rời các logic cứng hiện tại trong `workflow.py` thành các `NodeHandler` độc lập có thể đăng ký (registry).
