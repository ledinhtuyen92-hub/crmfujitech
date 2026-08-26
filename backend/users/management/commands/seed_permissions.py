from django.core.management.base import BaseCommand

from users.models import Permission, Role, CompanySettings


# Bộ permissions chuẩn theo module — đồng bộ với AGENTS.md / AI_CONTEXT.md
PERMISSIONS = [
    # ── Dashboard ──────────────────────────────────────────────────
    {"code": "dashboard.view", "name": "Xem Dashboard tổng quan", "module": "dashboard"},
    {"code": "dashboard.view_revenue", "name": "Xem biểu đồ doanh thu & dòng tiền", "module": "dashboard"},
    {"code": "dashboard.scope_my_department", "name": "Phạm vi: Xem dữ liệu phòng ban của mình", "module": "dashboard"},
    {"code": "dashboard.scope_any_department", "name": "Phạm vi: Xem dữ liệu các phòng ban", "module": "dashboard"},
    {"code": "dashboard.scope_company", "name": "Phạm vi: Xem dữ liệu toàn công ty", "module": "dashboard"},

    # ── CRM (Khách hàng & Leads) ───────────────────────────────────
    {"code": "crm.view", "name": "Xem danh sách khách hàng", "module": "crm"},
    {"code": "crm.create", "name": "Thêm khách hàng mới", "module": "crm"},
    {"code": "crm.edit", "name": "Chỉnh sửa thông tin khách hàng", "module": "crm"},
    {"code": "crm.delete", "name": "Xóa khách hàng", "module": "crm"},
    {"code": "crm.assign", "name": "Phân công / Gán khách hàng cho nhân viên", "module": "crm"},
    {"code": "crm.auto_assign", "name": "Chia khách tự động (Round-robin)", "module": "crm"},
    {"code": "crm.import", "name": "Import khách hàng từ Excel", "module": "crm"},
    {"code": "crm.export", "name": "Xuất danh sách khách hàng", "module": "crm"},
    {"code": "crm.view_all", "name": "Xem tất cả khách hàng (không giới hạn bởi phân công)", "module": "crm"},
    {"code": "crm.manage_tags", "name": "Quản lý Tags khách hàng", "module": "crm"},
    {"code": "crm.auto_assign_self", "name": "Tự động phụ trách khách hàng do mình tạo", "module": "crm"},
    {"code": "crm.upload_interaction_files", "name": "Tải file lên Lịch sử chăm sóc (Hình ảnh, PDF...)", "module": "crm"},

    # ── Sales (Báo giá) ───────────────────────────────────────────
    {"code": "sales.view", "name": "Xem danh sách báo giá", "module": "sales"},
    {"code": "sales.create", "name": "Tạo báo giá mới", "module": "sales"},
    {"code": "sales.edit", "name": "Chỉnh sửa báo giá", "module": "sales"},
    {"code": "sales.delete", "name": "Xóa báo giá", "module": "sales"},
    {"code": "sales.approve", "name": "Duyệt báo giá", "module": "sales"},
    {"code": "sales.require_approval", "name": "Bắt buộc trình duyệt (không cho gửi trực tiếp)", "module": "sales"},
    {"code": "sales.bypass_customer_signature", "name": "Bỏ qua yêu cầu khách ký xác nhận (cho phép tạo đơn ngay)", "module": "sales"},
    {"code": "sales.export_pdf", "name": "Xuất PDF báo giá", "module": "sales"},
    {"code": "sales.view_all", "name": "Xem tất cả báo giá (không giới hạn bởi phòng ban/người tạo)", "module": "sales"},

    # ── Orders (Đơn hàng) ─────────────────────────────────────────
    {"code": "orders.view", "name": "Xem danh sách đơn hàng", "module": "orders"},
    {"code": "orders.create", "name": "Tạo đơn hàng mới", "module": "orders"},
    {"code": "orders.edit", "name": "Chỉnh sửa đơn hàng", "module": "orders"},
    {"code": "orders.delete", "name": "Xóa đơn hàng", "module": "orders"},
    {"code": "orders.approve", "name": "Duyệt / Từ chối đơn hàng", "module": "orders"},
    {"code": "orders.cancel", "name": "Hủy đơn hàng", "module": "orders"},
    {"code": "orders.export_pdf", "name": "Xuất PDF đơn hàng", "module": "orders"},
    {"code": "orders.view_all", "name": "Xem tất cả đơn hàng (không giới hạn bởi người tạo)", "module": "orders"},

    # ── Products (Sản phẩm & Dịch vụ) ─────────────────────────────
    {"code": "products.view", "name": "Xem danh sách sản phẩm", "module": "products"},
    {"code": "products.create", "name": "Thêm sản phẩm mới", "module": "products"},
    {"code": "products.edit", "name": "Chỉnh sửa sản phẩm", "module": "products"},
    {"code": "products.delete", "name": "Xóa sản phẩm", "module": "products"},
    {"code": "products.manage_categories", "name": "Quản lý loại sản phẩm", "module": "products"},

    # ── Inventory (Kho vận) ───────────────────────────
    {"code": "inventory.view", "name": "Xem tồn kho & lịch sử giao dịch", "module": "inventory"},
    {"code": "inventory.import", "name": "Nhập hàng vào kho (tạo phiếu nhập)", "module": "inventory"},
    {"code": "inventory.adjust", "name": "Điều chỉnh tồn kho", "module": "inventory"},
    {"code": "inventory.approve_export", "name": "Duyệt lệnh xuất kho", "module": "inventory"},
    {"code": "inventory.manual_export", "name": "Tạo phiếu xuất kho thủ công", "module": "inventory"},
    {"code": "inventory.manage_warehouse", "name": "Quản lý kho hàng", "module": "inventory"},
    {"code": "inventory.transfer", "name": "Tạo phiếu điều chuyển kho", "module": "inventory"},
    {"code": "inventory.delete_history", "name": "Xoá lịch sử giao dịch kho", "module": "inventory"},

    # ── Production (Sản xuất) ─────────────────────────────────────
    {"code": "production.manage_factory", "name": "Quản lý thiết lập nhà máy", "module": "production"},
    {"code": "production.view", "name": "Xem lệnh sản xuất", "module": "production"},
    {"code": "production.scope_my_factory", "name": "Phạm vi: Xem lệnh sản xuất của Nhà máy mình", "module": "production"},
    {"code": "production.scope_company", "name": "Phạm vi: Xem tất cả lệnh sản xuất toàn công ty", "module": "production"},
    {"code": "production.create", "name": "Tạo lệnh sản xuất", "module": "production"},
    {"code": "production.edit", "name": "Chỉnh sửa lệnh sản xuất", "module": "production"},
    {"code": "production.update_step", "name": "Cập nhật tiến độ công đoạn", "module": "production"},
    {"code": "production.delete", "name": "Xóa lệnh sản xuất", "module": "production"},

    # ── Delivery (Giao hàng) ──────────────────────────────────────
    {"code": "delivery.view", "name": "Xem lệnh giao hàng", "module": "delivery"},
    {"code": "delivery.create", "name": "Tạo lệnh giao hàng mới", "module": "delivery"},
    {"code": "delivery.edit", "name": "Cập nhật lệnh giao hàng", "module": "delivery"},
    {"code": "delivery.delete", "name": "Xoá lệnh giao hàng", "module": "delivery"},
    {"code": "delivery.assign", "name": "Gán nhân viên giao hàng", "module": "delivery"},
    {"code": "delivery.shipper", "name": "Nhân viên giao hàng", "module": "delivery"},

    # ── Warranty (Bảo hành) ───────────────────────────────────────
    {"code": "warranty.view", "name": "Xem phiếu bảo hành", "module": "warranty"},
    {"code": "warranty.create", "name": "Tạo phiếu bảo hành mới", "module": "warranty"},
    {"code": "warranty.edit", "name": "Cập nhật phiếu bảo hành", "module": "warranty"},
    {"code": "warranty.delete", "name": "Xoá phiếu bảo hành", "module": "warranty"},

    # ── Reports (Báo cáo) ─────────────────────────────────────────
    {"code": "reports.view", "name": "Xem báo cáo kinh doanh", "module": "reports"},
    {"code": "reports.view_all", "name": "Xem báo cáo toàn công ty (tất cả nhân viên)", "module": "reports"},

    # ── Settings (Cài đặt công ty) ────────────────────────────────
    {"code": "settings.users", "name": "Quản lý tài khoản nhân viên", "module": "settings"},
    {"code": "settings.roles", "name": "Quản lý vai trò & phân quyền", "module": "settings"},
    {"code": "settings.company", "name": "Cài đặt thông tin công ty", "module": "settings"},
    {"code": "settings.departments", "name": "Quản lý phòng ban & cơ cấu tổ chức", "module": "settings"},

    # ── Approvals (Phê duyệt) ─────────────────────────────────────
    {"code": "approvals.approve", "name": "Duyệt/Từ chối yêu cầu", "module": "approvals"},
    {"code": "approvals.delete", "name": "Xóa yêu cầu / lịch sử phê duyệt", "module": "approvals"},


    # ── Finance (Tài chính & Kế toán) ─────────────────────────────
    {"code": "finance.view", "name": "Xem danh sách giao dịch tài chính", "module": "finance"},
    {"code": "finance.create_receipt", "name": "Tạo giao dịch thu/chi mới", "module": "finance"},
    {"code": "finance.print_receipt", "name": "In phiếu thu", "module": "finance"},
    {"code": "finance.delete", "name": "Xóa phiếu thu / giao dịch", "module": "finance"},
    {"code": "finance.request_credit", "name": "Trình duyệt xuất kho nợ", "module": "finance"},
    {"code": "finance.approve_credit", "name": "Phê duyệt nợ xuất kho (Tín dụng)", "module": "finance"},

    # ── Zalo Integration (Tích hợp Zalo OA) ───────────────────────
    {"code": "zalo.view", "name": "Xem danh sách hội thoại (Zalo Inbox)", "module": "zalo"},
    {"code": "zalo.view_all_inbox", "name": "Xem toàn bộ hội thoại Zalo (không giới hạn bởi phân công)", "module": "zalo"},
    {"code": "zalo.view_unassigned_inbox", "name": "Xem các hội thoại Zalo chưa được phân công", "module": "zalo"},
    {"code": "zalo.send_zns", "name": "Gửi tin nhắn ZNS chăm sóc khách hàng", "module": "zalo"},
    {"code": "zalo.config", "name": "Cấu hình kết nối Zalo OA & Mẫu ZNS", "module": "zalo"},
    {"code": "zalo.manage_templates", "name": "Quản lý mẫu in & cấu hình tự động ZNS", "module": "zalo"},
    {"code": "zalo.chat", "name": "Chat trực tiếp với khách hàng trên Zalo", "module": "zalo"},
    {"code": "zalo.create_customer", "name": "Tạo khách hàng từ hội thoại Zalo", "module": "zalo"},
    {"code": "zalo.delete_conversation", "name": "Xóa hội thoại Zalo", "module": "zalo"},
    {"code": "zalo.assign", "name": "Phân công hội thoại Zalo", "module": "zalo"},

    # ── Facebook Integration (Tích hợp Facebook Multi-Page) ────────
    {"code": "facebook.view_inbox", "name": "Xem Hộp thư Facebook (Multi-Page Inbox)", "module": "facebook"},
    {"code": "facebook.view_all_inbox", "name": "Xem toàn bộ hội thoại Facebook (không giới hạn bởi phân công)", "module": "facebook"},
    {"code": "facebook.view_unassigned_inbox", "name": "Xem các hội thoại Facebook chưa được phân công", "module": "facebook"},
    {"code": "facebook.chat", "name": "Chat trực tiếp với khách hàng trên Facebook", "module": "facebook"},
    {"code": "facebook.create_customer", "name": "Tạo khách hàng từ hội thoại Facebook", "module": "facebook"},
    {"code": "facebook.manage_config", "name": "Quản lý kết nối Trang Facebook & Cấu hình tự động quét SĐT", "module": "facebook"},
    {"code": "facebook.delete_conversation", "name": "Xóa hội thoại Facebook", "module": "facebook"},
    {"code": "facebook.assign", "name": "Phân công hội thoại Facebook", "module": "facebook"},

    # ── Internal Announcements (Thông báo nội bộ) ───────────────────
    {"code": "notifications.view_announcements", "name": "Xem thông báo nội bộ", "module": "notifications"},
    {"code": "notifications.create_announcements", "name": "Tạo và gửi thông báo nội bộ", "module": "notifications"},
    {"code": "notifications.delete_announcements", "name": "Xóa thông báo nội bộ", "module": "notifications"},

    # 🤖 Trợ lý AI (ai_agent)
    {"code": "ai_agent.view_dashboard", "name": "Xem bảng thống kê chi phí AI", "module": "ai_agent"},
    {"code": "ai_agent.manage_agents", "name": "Quản lý Đội ngũ Trợ lý AI", "module": "ai_agent"},
    {"code": "ai_agent.manage_knowledge", "name": "Quản lý Tài liệu Huấn luyện (RAG)", "module": "ai_agent"},
    {"code": "ai_agent.manage_keys", "name": "Cấu hình API Key & Phân bổ Quota", "module": "ai_agent"},
    {"code": "ai_agent.sync_pricing", "name": "Đồng bộ Bảng giá Models AI", "module": "ai_agent"},

    # 🌐 Tích hợp Website (website_integration)
    {"code": "website_integration.manage", "name": "Quản lý tích hợp Website (Webhooks)", "module": "website_integration"},
]

# [FUTURE RESERVED PERMISSIONS - MỞ RỘNG SAU NÀY]
# Khi cần kích hoạt thêm tính năng chi tiết nào, hãy bỏ comment và thêm vào danh sách PERMISSIONS phía trên:
# {"code": "dashboard.view_all_stats", "name": "Xem số liệu toàn bộ công ty", "module": "dashboard"},
# {"code": "dashboard.export_report", "name": "Xuất báo cáo tổng quan Dashboard", "module": "dashboard"},
# {"code": "crm.view_phone", "name": "Xem số điện thoại đầy đủ (không bị che/ẩn)", "module": "crm"},
# {"code": "crm.merge", "name": "Gộp khách hàng trùng lặp", "module": "crm"},
# {"code": "sales.discount", "name": "Được phép giảm giá vượt hạn mức báo giá", "module": "sales"},
# {"code": "sales.manage_templates", "name": "Quản lý mẫu in & biểu mẫu Báo giá", "module": "sales"},
# {"code": "orders.change_price", "name": "Sửa giá bán đơn giá trong đơn hàng", "module": "orders"},
# {"code": "orders.view_cost", "name": "Xem giá vốn & biên lợi nhuận gộp đơn hàng", "module": "orders"},
# {"code": "products.view_cost_price", "name": "Xem giá vốn / giá nhập sản phẩm", "module": "products"},
# {"code": "products.manage_units", "name": "Quản lý đơn vị tính & quy đổi", "module": "products"},
# {"code": "inventory.export", "name": "Xem phiếu xuất kho", "module": "inventory"},
# {"code": "inventory.view_all_warehouses", "name": "Xem số liệu tồn kho tất cả các kho", "module": "inventory"},
# {"code": "inventory.stock_take", "name": "Tạo & chốt phiếu kiểm kê kho hàng", "module": "inventory"},
# {"code": "production.assign_worker", "name": "Phân công tổ đội / nhân công sản xuất", "module": "production"},
# {"code": "production.quality_check", "name": "Kiểm tra chất lượng KCS / QC thành phẩm", "module": "production"},
# {"code": "delivery.confirm", "name": "Xác nhận hoàn thành & thu hồi phiếu giao hàng", "module": "delivery"},
# {"code": "warranty.extend", "name": "Gia hạn thời gian bảo hành", "module": "warranty"},
# {"code": "reports.export", "name": "Xuất báo cáo ra Excel/PDF", "module": "reports"},
# {"code": "reports.view_revenue", "name": "Xem báo cáo doanh thu & chi phí chi tiết", "module": "reports"},
# {"code": "reports.view_inventory", "name": "Xem báo cáo xuất nhập tồn kho chi tiết", "module": "reports"},
# {"code": "reports.view_debt", "name": "Xem báo cáo công nợ phải thu / phải trả", "module": "reports"},
# {"code": "notifications.view", "name": "Xem danh sách thông báo", "module": "notifications"},
# {"code": "notifications.send_broadcast", "name": "Gửi thông báo toàn công ty", "module": "notifications"},
# {"code": "settings.system_logs", "name": "Xem nhật ký hoạt động hệ thống (Audit log)", "module": "settings"},
# {"code": "settings.backup", "name": "Quản lý sao lưu & phục hồi dữ liệu", "module": "settings"},
# {"code": "approvals.view", "name": "Xem danh sách phê duyệt", "module": "approvals"},
# {"code": "approvals.create", "name": "Tạo yêu cầu phê duyệt mới", "module": "approvals"},
# {"code": "approvals.manage", "name": "Quản lý luồng phê duyệt", "module": "approvals"},
# {"code": "finance.edit", "name": "Chỉnh sửa giao dịch", "module": "finance"},
# {"code": "finance.view_all", "name": "Xem toàn bộ quỹ công ty & sổ ngân hàng", "module": "finance"},
# {"code": "finance.export", "name": "Xuất Excel sổ quỹ thu chi & công nợ", "module": "finance"},
# {"code": "finance.approve_receipt", "name": "Duyệt chính thức phiếu thu / phiếu chi", "module": "finance"},
# (zalo.view_all_inbox và facebook.view_all_inbox đã được chuyển lên danh sách PERMISSIONS chính)


class Command(BaseCommand):
    help = "Seed danh sách permissions mặc định cho toàn bộ module CRM SaaS."

    def handle(self, *args, **options):
        # --- MIGRATION LOGIC CHO VIỆC TÁCH MODULE SẢN PHẨM ---
        self.stdout.write("Checking module products migration...")
        for cs in CompanySettings.objects.all():
            if 'inventory' in cs.active_modules and 'products' not in cs.active_modules:
                cs.active_modules.append('products')
                cs.save(update_fields=['active_modules'])
        
        try:
            inv_view_perm = Permission.objects.get(code="inventory.view")
            prod_view_perm, _ = Permission.objects.get_or_create(
                code="products.view",
                defaults={"name": "Xem danh sách sản phẩm", "module": "products"}
            )
            roles_with_inv = Role.objects.filter(permissions=inv_view_perm)
            for role in roles_with_inv:
                role.permissions.add(prod_view_perm)
            
            rename_map = {
                "inventory.create_product": ("products.create", "Thêm sản phẩm mới"),
                "inventory.edit_product": ("products.edit", "Chỉnh sửa sản phẩm"),
                "inventory.delete_product": ("products.delete", "Xóa sản phẩm"),
                "inventory.manage_categories": ("products.manage_categories", "Quản lý loại sản phẩm"),
            }
            for old_code, (new_code, new_name) in rename_map.items():
                try:
                    p = Permission.objects.get(code=old_code)
                    p.code = new_code
                    p.name = new_name
                    p.module = "products"
                    p.save()
                except Permission.DoesNotExist:
                    pass
        except Permission.DoesNotExist:
            pass
        # ------------------------------------------------------

        created_count = 0
        updated_count = 0

        valid_codes = [p["code"] for p in PERMISSIONS]
        deleted_count, _ = Permission.objects.exclude(code__in=valid_codes).delete()
        if deleted_count > 0:
            self.stdout.write(self.style.WARNING(f"🧹 Đã dọn dẹp {deleted_count} quyền cũ không còn sử dụng."))

        for perm_data in PERMISSIONS:
            obj, created = Permission.objects.update_or_create(
                code=perm_data["code"],
                defaults={"name": perm_data["name"], "module": perm_data["module"]},
            )
            if created:
                created_count += 1
            else:
                updated_count += 1

        # Tự động cấp toàn bộ quyền cho vai trò Giám đốc
        all_perms = Permission.objects.all()
        admin_roles = Role.objects.filter(name__icontains="Giám đốc")
        for role in admin_roles:
            role.permissions.set(all_perms)
            self.stdout.write(self.style.SUCCESS(f"👑 Đã cập nhật đủ {all_perms.count()} quyền cho vai trò: {role.name}"))

        self.stdout.write(
            self.style.SUCCESS(
                f"✅ Hoàn thành! Đã tạo mới {created_count} và cập nhật {updated_count} permissions.\n"
                f"   Tổng cộng: {len(PERMISSIONS)} permissions chuẩn trong hệ thống."
            )
        )
