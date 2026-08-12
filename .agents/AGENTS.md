# AGENTS.md - Project Rules for CRM SaaS

## 1. Maintenance Mode Principle (Chế độ Bảo trì Hệ thống)
- Khi hệ thống đang ở chế độ bảo trì (`maintenanceMode == true` từ hook `useAuth()` ở Frontend), TẤT CẢ các chức năng thêm, sửa, xóa, hoặc tạo mới dữ liệu ĐỀU PHẢI tuân thủ nguyên tắc:
  - **Ở Frontend:** Khi người dùng (không phải SuperAdmin) click vào nút "Thêm", "Tạo mới", "Sửa", hoặc bất kỳ nút nào dùng để mở form/modal nhập liệu, hệ thống phải CHẶN ngay lập tức (ví dụ: hiển thị thông báo `message.warning("⚠️ Hệ thống đang bảo trì dữ liệu. Chức năng này tạm thời bị khóa!")` hoặc nút bấm bị disabled) và KHÔNG cho phép mở form/modal nhập liệu.
  - **Mục đích:** Tránh việc người dùng mất thời gian điền thông tin vào form rồi khi bấm "Lưu" mới bị lỗi từ phía server.
  - **Lưu ý cho AI phát triển sau:** Bất kỳ module hay màn hình mới nào được tạo ra có chức năng Thêm/Sửa/Xóa dữ liệu đều phải import và kiểm tra `maintenanceMode` từ hook `useAuth()` trước khi mở Modal/Drawer nhập liệu.

## 2. Code-First Configuration (Cấu hình bằng Code)
- Bất kỳ cấu hình hệ thống, dữ liệu mặc định, hoặc phân quyền (permissions) mới nào ĐỀU PHẢI được khai báo cứng bằng code thay vì thao tác tay trên DB.
- Ví dụ: Khi thêm một Quyền (Permission) mới, BẮT BUỘC phải viết thêm vào mảng `PERMISSIONS` trong file `backend/users/management/commands/seed_permissions.py`.
- **Mục đích:** Đảm bảo khi làm việc trên nhiều máy/môi trường khác nhau (như kéo code từ công ty về nhà), hệ thống không bao giờ bị thiếu hụt dữ liệu (như mất quyền Zalo).
- Tuyệt đối hạn chế các thao tác manual dễ gây mất đồng bộ hoặc mất dữ liệu.

## 3. Mobile-First & Responsive Design (Tối ưu hóa Giao diện Di động)
- **Tất cả các module, trang, chức năng hoặc màn hình mới được tạo ra trên Frontend ĐỀU PHẢI tương thích hoàn hảo với thiết bị di động (Smartphones/Tablets).**
- **Quy tắc thực thi khi code Frontend:**
  - **Grid & Form:** Tuyệt đối không dùng fix cứng `span={12}` (hoặc tương tự) cho `Col` trong Grid/Form mà không có responsive. Phải dùng `xs={24} md={12}` để trên điện thoại các trường nhập liệu tự động dàn thành 1 cột dọc (100% width).
  - **Tables:** Mọi bảng dữ liệu (Table) bắt buộc phải có thuộc tính `scroll={{ x: 'max-content' }}` (hoặc một số pixel cụ thể) để tránh bị bóp méo chữ trên màn hình hẹp.
  - **Danh sách trên Di động (Mobile Lists):** Đối với các danh sách hiển thị trên di động (ví dụ 10 đơn hàng mới nhất), NÊN sử dụng component `List` của Ant Design để render dạng các thẻ (card) theo chiều dọc thay vì dùng `Table` phải cuộn ngang. Các thẻ phải bo góc, có padding chuẩn, chia layout rõ ràng (ví dụ: title, meta, tags trạng thái, icon) tương tự như thiết kế trong `CustomerList.jsx`. Luôn bọc Table/List bằng `{isMobile ? <List .../> : <Table .../>}`.
  - **Layout & Modal:** Modal phải có chiều rộng linh hoạt (Ant Design tự động xử lý tốt, nhưng không được fix cứng bằng px quá kích thước màn hình). Sidebar/Menu phải dùng cơ chế ẩn/Drawer trên mobile (đã được setup ở MainLayout).
  - **Charts:** Mọi biểu đồ đều phải được bọc trong `<ResponsiveContainer>`.

## 4. Đồng bộ Dữ liệu & Quyền trước khi Push lên GitHub
- **Bắt buộc:** Trước khi đẩy code lên GitHub, LUÔN LUÔN tạo file `sync_data.json` chứa toàn bộ dữ liệu hiện tại của database để đảm bảo khi pull code về máy khác chỉ cần nạp lại dữ liệu là hệ thống chạy bình thường.
- **Lệnh thực thi (chạy tại thư mục gốc của dự án):**
  ```powershell
  docker exec -i crm_web python manage.py dumpdata -e contenttypes -e auth.Permission -e sessions -e admin.logentry --indent 2 -o sync_data.json
  ```
- **Lưu ý Quan trọng về Lỗi Font chữ (Mojibake):** TUYỆT ĐỐI KHÔNG chạy lệnh `python manage.py dumpdata` trực tiếp trên Windows PowerShell/CMD (vì Python trên Windows mặc định dùng bảng mã cp1252/cp437 gây lỗi font tiếng Việt kiểu `Thanh to├ín`). Luôn dùng `docker exec -i crm_web` và cờ `-o` để Linux tự động ghi file bằng chuẩn UTF-8.

## 5. Quotation Template Snapshot (Chốt mẫu Báo giá)
- **Luôn bảo lưu cấu hình mẫu:** Báo giá phải luôn lưu lại cấu hình mẫu (ngang/dọc) tại thời điểm tạo/sửa thông qua 	emplate_snapshot.
- **Hiển thị Form Sửa:** Khi sửa báo giá, Form sửa phải render các cột và tính tổng tiền dựa vào effectiveTemplate của chính báo giá đó (hàm getEffectiveTemplate()), tuyệt đối KHÔNG dùng cấu hình mặc định hiện tại của công ty.
- **Lưu Báo Giá:** Khi lưu (Save) một báo giá cũ, phải dùng chính effectiveTemplate của nó để lưu đè lại vào snapshot, nhằm cô lập hoàn toàn với việc công ty có đổi mẫu mặc định hay không.
- **Báo giá cũ không có snapshot:** Bất kỳ báo giá nào không có 	emplate_snapshot thì mặc định được coi là mẫu STANDARD (Dọc).

## 6. Auto-Cancel Approval Requests (Tự động hủy Yêu cầu duyệt cũ)
- **Quy tắc:** Bất kỳ module nào có sử dụng quy trình phê duyệt tập trung (ApprovalRequest) như Báo giá, Đơn hàng... nếu bị người dùng **chỉnh sửa dữ liệu** trong lúc đang ở trạng thái pending_approval (Chờ duyệt) hoặc pproved (Đã duyệt), hệ thống phải:
  1. Tự động lùi trạng thái của đối tượng đó về draft (Nháp) hoặc pending (Chờ duyệt lại).
  2. Tự động tìm và chuyển trạng thái của tất cả các ApprovalRequest cũ đang chờ duyệt thành canceled (Đã hủy).
  3. Yêu cầu người dùng trình duyệt lại (hoặc tự động tạo Request mới tùy module).
- **Mục đích:** Đảm bảo cấp quản lý không bao giờ nhìn thấy các yêu cầu duyệt rác/cũ đã bị thay đổi dữ liệu.

## 7. Xử lý Giao diện In ấn (Print/PDF Views)
- Trong các form in ấn như PDF, Print Báo giá... các ô/cột không có dữ liệu (ví dụ: Ký hiệu, Ghi chú kỹ thuật, Chiết khấu) phải được **để trống hoàn toàn** (return 
ull hoặc chuỗi rỗng ''), tuyệt đối KHÔNG dùng dấu gạch ngang (—) để tránh gây nhiễu và mất tính chuyên nghiệp của biểu mẫu.

## 8. Logic Thêm dòng Kích thước mới (Insert Product Row)
- Khi bấm nút "Thêm kích thước" (chèn thêm một biến thể/kích thước mới của cùng một sản phẩm đang có), dòng mới **phải được chèn vào ngay sau dòng cuối cùng** của nhóm sản phẩm đó, KHÔNG được chèn ngay sau dòng đầu tiên chứa nút bấm. Quét mảng để tìm index cuối cùng của sản phẩm đó rồi mới splice.

## 9. Xử lý Lỗi Giao diện (Error Handling)
- **Quy tắc:** Bất kỳ thao tác nào của người dùng (bấm nút Lưu, Xóa, Phê duyệt...) nếu bị hệ thống từ chối hoặc không thực hiện được (bị lỗi từ Backend), Frontend BẮT BUỘC phải bắt được lỗi (`catch`) và hiển thị thông báo lỗi RÕ RÀNG cho người dùng biết lý do tại sao.
- Tuyệt đối KHÔNG dùng các câu thông báo chung chung như "Không thể xóa" hoặc "Có lỗi xảy ra" nếu có thể lấy được chi tiết. Phải bóc tách `err.response.data` để lấy được thông báo lỗi cụ thể do Backend trả về (ví dụ: "Không thể xóa đơn hàng đã có phiếu thu tiền").

## 10. Chạy phần mềm (Workflow khởi động hệ thống)
- Khi user yêu cầu "chạy phần mềm" hoặc "khởi động phần mềm", bắt buộc phải chạy đầy đủ các bước theo thứ tự sau mà không cần hỏi lại:
  1. Khởi động Docker Compose: `docker-compose up -d`
  2. Cập nhật Database (nếu có pull code): `docker exec -i crm_web python manage.py migrate`
  3. Load lại dữ liệu đồng bộ: `docker exec -i crm_web python load_sync_data.py`
  4. Nạp quyền (Permissions): `docker exec -i crm_web python manage.py seed_permissions`
  5. Khởi động Frontend: Chạy lệnh `npm run dev` trong thư mục `frontend` (chạy background).
  6. Khởi động Ngrok (nếu user yêu cầu hoặc mặc định): Chạy lệnh `ngrok http 8000` (dành cho Webhook).
- Thông báo cho user biết chi tiết các bước đã chạy thành công.

## 11. Testing & Chủ động Đề xuất (Proactive Validation)
- **Quy tắc:** Sau khi code xong một chức năng mới hoặc sửa lỗi, AI BẮT BUỘC PHẢI tự động chạy test hoặc giả lập các kịch bản sử dụng thực tế để đảm bảo không phát sinh lỗi (như lỗi sập trang, lỗi IntegrityError từ DB).
- Nếu phát hiện logic luồng đi chưa hợp lý, hoặc thiếu Validate bảo vệ dữ liệu (Frontend/Backend), AI phải CHỦ ĐỘNG báo lại cho người dùng và ĐƯA RA PHƯƠNG ÁN XỬ LÝ tốt nhất (như thêm validator, thêm try-catch, bổ sung trường dữ liệu).
- **Mục tiêu:** Không chỉ code đúng theo yêu cầu, mà còn phải tư vấn và bọc lót các lỗ hổng trải nghiệm/bảo mật.

## 12. H?n ch? s? d?ng Emoji tr�n Giao di?n (Ant Design Icons)
- **Quy t?c:** Tuy?t d?i KH�NG s? d?ng c�c k� t? Emoji (nhu ??, ??, ?...) tr�n giao di?n Frontend v� d? g�y ra l?i font ch? (mojibake ho?c bi?n th�nh � vu�ng) tr�n m?t s? h? di?u h�nh/tr�nh duy?t cu.
- Thay v�o d�, LU�N LU�N s? d?ng b? icon chu?n c?a Ant Design (@ant-design/icons) nhu <RobotOutlined />, <WarningOutlined />, <CloseCircleOutlined />... d? d?m b?o t�nh d?ng b? v� chuy�n nghi?p cho UI.
