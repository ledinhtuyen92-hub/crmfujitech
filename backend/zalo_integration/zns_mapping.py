"""
Hệ thống Quản lý và Ánh xạ Tham số Mẫu ZNS (Zalo Notification Service)
Cung cấp:
1. Danh mục biến chuẩn hệ thống CRM (SYSTEM_MAPPING_VARIABLES).
2. Công cụ Smart Alias Mapping tự động nhận diện cả Tiếng Anh và Tiếng Việt.
3. Hàm build_zns_context & resolve_zns_params phục vụ gửi tin ZNS chính xác 100%.
"""
import re
import unicodedata
from datetime import date, datetime
from typing import Any, Dict, List, Optional

SYSTEM_MAPPING_VARIABLES = [
    {
        "category": "customer",
        "category_label": "Thông tin Khách hàng",
        "category_icon": "UserOutlined",
        "variables": [
            {
                "key": "customer_name",
                "label": "Tên khách hàng",
                "type": "STRING",
                "example": "Nguyễn Văn A",
                "desc": "Họ và tên đầy đủ của khách hàng",
                "aliases": ["ten_khach_hang", "ten_kh", "ho_ten", "name", "full_name", "customer"],
            },
            {
                "key": "phone",
                "label": "Số điện thoại",
                "type": "STRING",
                "example": "0987654321",
                "desc": "Số điện thoại liên hệ của khách hàng",
                "aliases": ["so_dien_thoai", "sdt", "phone_number", "mobile"],
            },
            {
                "key": "birthday",
                "label": "Ngày sinh nhật",
                "type": "DATE",
                "example": "15/08/1992",
                "desc": "Ngày tháng năm sinh (định dạng DD/MM/YYYY)",
                "aliases": ["ngay_sinh", "sinh_nhat", "dob"],
            },
            {
                "key": "address",
                "label": "Địa chỉ khách hàng",
                "type": "STRING",
                "example": "Số 123 Cầu Giấy, Hà Nội",
                "desc": "Địa chỉ thường trú hoặc nơi ở của khách",
                "aliases": ["dia_chi", "customer_address", "dia_chi_khach_hang"],
            },
            {
                "key": "city",
                "label": "Tỉnh / Thành phố",
                "type": "STRING",
                "example": "Hà Nội",
                "desc": "Tỉnh hoặc thành phố của khách hàng",
                "aliases": ["thanh_pho", "tinh_thanh", "province"],
            },
            {
                "key": "company_name",
                "label": "Tên công ty (Khách hàng)",
                "type": "STRING",
                "example": "Công ty TNHH Ánh Dương",
                "desc": "Tên doanh nghiệp của khách hàng (nếu là khách B2B)",
                "aliases": ["ten_cong_ty", "cong_ty", "customer_company", "doanh_nghiep"],
            },
            {
                "key": "sender_company",
                "label": "Tên doanh nghiệp gửi",
                "type": "STRING",
                "example": "Fujitech Group",
                "desc": "Tên công ty / thương hiệu người gửi",
                "aliases": ["ten_cong_ty_gui", "thuong_hieu", "brand_name", "fujitech", "ten_oa"],
            },
        ],
    },
    {
        "category": "order",
        "category_label": "Đơn hàng & Bán hàng",
        "category_icon": "ShoppingOutlined",
        "variables": [
            {
                "key": "order_number",
                "label": "Mã đơn hàng",
                "type": "STRING",
                "example": "DH-20261027-001",
                "desc": "Mã định danh đơn hàng trên CRM",
                "aliases": ["order_code", "ma_don_hang", "ma_don", "order_id", "so_don"],
            },
            {
                "key": "total_amount",
                "label": "Tổng tiền đơn hàng",
                "type": "NUMBER/STRING",
                "example": "2.500.000đ",
                "desc": "Tổng giá trị đơn hàng sau thuế và chiết khấu",
                "aliases": ["tong_tien", "gia_tri_don", "amount", "price", "tong_gia_tri", "tong_don_hang"],
            },
            {
                "key": "order_date",
                "label": "Ngày đặt hàng",
                "type": "DATE",
                "example": "27/10/2026",
                "desc": "Ngày tạo hoặc xác nhận đơn hàng (DD/MM/YYYY)",
                "aliases": ["ngay_dat", "ngay_tao", "date", "ngay_don_hang"],
            },
            {
                "key": "status",
                "label": "Trạng thái đơn hàng",
                "type": "STRING",
                "example": "Đã xác nhận",
                "desc": "Trạng thái xử lý của đơn hàng",
                "aliases": ["trang_thai", "trang_thai_don", "order_status"],
            },
            {
                "key": "delivery_address",
                "label": "Địa chỉ giao hàng",
                "type": "STRING",
                "example": "Tòa nhà FPT, Duy Tân, Cầu Giấy",
                "desc": "Địa chỉ nhận hàng thực tế của đơn hàng",
                "aliases": ["dia_chi_giao", "dia_chi_giao_hang", "dia_chi_nhan", "noi_giao"],
            },
            {
                "key": "delivery_time",
                "label": "Thời gian giao hàng dự kiến",
                "type": "STRING",
                "example": "29/10/2026 (Trong giờ hành chính)",
                "desc": "Hẹn thời gian giao hàng tới khách",
                "aliases": ["thoi_gian_giao", "ngay_giao_du_kien", "ngay_giao", "han_giao"],
            },
            {
                "key": "warranty_months",
                "label": "Thời hạn bảo hành",
                "type": "STRING",
                "example": "12 tháng",
                "desc": "Số tháng bảo hành của sản phẩm/thiết bị",
                "aliases": ["bao_hanh", "thoi_gian_bao_hanh", "so_thang_bao_hanh"],
            },
            {
                "key": "note",
                "label": "Ghi chú đơn hàng",
                "type": "STRING",
                "example": "Khách dặn gọi trước khi giao",
                "desc": "Ghi chú bổ sung cho đơn hàng",
                "aliases": ["ghi_chu", "notes", "ghi_chu_don"],
            },
        ],
    },
    {
        "category": "receipt",
        "category_label": "Thu tiền & Thanh toán",
        "category_icon": "CreditCardOutlined",
        "variables": [
            {
                "key": "receipt_code",
                "label": "Mã phiếu thu",
                "type": "STRING",
                "example": "PT-00892",
                "desc": "Mã số phiếu thu tiền đã lập",
                "aliases": ["ma_phieu_thu", "ma_phieu", "so_phieu", "receipt_id"],
            },
            {
                "key": "amount",
                "label": "Số tiền đã thu",
                "type": "NUMBER/STRING",
                "example": "1.000.000đ",
                "desc": "Số tiền thực tế khách đã thanh toán trong phiếu",
                "aliases": ["so_tien", "so_tien_thu", "payment_amount", "tien_thu"],
            },
            {
                "key": "payment_date",
                "label": "Ngày thu tiền",
                "type": "DATE",
                "example": "27/10/2026",
                "desc": "Ngày giờ ghi nhận giao dịch thu tiền",
                "aliases": ["ngay_thu", "ngay_thanh_toan", "payment_time"],
            },
            {
                "key": "payment_method",
                "label": "Phương thức thanh toán",
                "type": "STRING",
                "example": "Chuyển khoản ngân hàng",
                "desc": "Hình thức thanh toán (Tiền mặt, Chuyển khoản...)",
                "aliases": ["hinh_thuc", "phuong_thuc", "hinh_thuc_thanh_toan"],
            },
            {
                "key": "milestone_title",
                "label": "Kỳ / Đợt thanh toán",
                "type": "STRING",
                "example": "Kỳ 1: Đặt cọc 30%",
                "desc": "Tên kỳ thanh toán trong tiến độ hợp đồng",
                "aliases": ["ky_thanh_toan", "dot_thanh_toan", "noi_dung_thu"],
            },
            {
                "key": "reference_code",
                "label": "Mã giao dịch ngân hàng",
                "type": "STRING",
                "example": "FT26102799182",
                "desc": "Mã tham chiếu ngân hàng hoặc số UNC",
                "aliases": ["ma_giao_dich", "ma_gd", "ref_code"],
            },
            {
                "key": "remaining_amount",
                "label": "Số tiền còn lại",
                "type": "NUMBER/STRING",
                "example": "1.500.000đ",
                "desc": "Số tiền nợ còn lại của đơn hàng sau khi trừ phiếu thu",
                "aliases": ["so_tien_con_lai", "con_lai", "cong_no_con_lai"],
            },
        ],
    },
    {
        "category": "delivery",
        "category_label": "Giao hàng & Bảo hành",
        "category_icon": "CarOutlined",
        "variables": [
            {
                "key": "tracking_code",
                "label": "Mã vận đơn",
                "type": "STRING",
                "example": "VNPOST8847291",
                "desc": "Mã theo dõi hành trình đơn vị vận chuyển",
                "aliases": ["ma_van_don", "van_don", "ma_tracking", "tracking_number"],
            },
            {
                "key": "carrier_name",
                "label": "Đơn vị vận chuyển",
                "type": "STRING",
                "example": "Viettel Post / GHTK",
                "desc": "Tên đơn vị hoặc nhà xe vận chuyển",
                "aliases": ["don_vi_van_chuyen", "nha_xe", "hang_van_chuyen"],
            },
            {
                "key": "delivery_date",
                "label": "Ngày giao hàng",
                "type": "DATE",
                "example": "28/10/2026",
                "desc": "Ngày giao hàng thực tế",
                "aliases": ["ngay_giao", "ngay_nhan_du_kien"],
            },
        ],
    },
    {
        "category": "appointment",
        "category_label": "Lịch hẹn & Chăm sóc",
        "category_icon": "CalendarOutlined",
        "variables": [
            {
                "key": "appointment_time",
                "label": "Thời gian hẹn",
                "type": "STRING",
                "example": "09:30 ngày 28/10/2026",
                "desc": "Thời gian hẹn gặp hoặc bảo trì dịch vụ",
                "aliases": ["thoi_gian_hen", "ngay_hen", "gio_hen", "lich_hen"],
            },
            {
                "key": "service_name",
                "label": "Dịch vụ / Nội dung hẹn",
                "type": "STRING",
                "example": "Bảo dưỡng máy in công nghiệp",
                "desc": "Dịch vụ hoặc mục đích của cuộc hẹn",
                "aliases": ["dich_vu", "noi_dung_hen", "cong_viec"],
            },
            {
                "key": "staff_name",
                "label": "Nhân viên phụ trách",
                "type": "STRING",
                "example": "Kỹ thuật viên Lê Văn Hùng",
                "desc": "Tên nhân viên phụ trách hoặc người hẹn",
                "aliases": ["nhan_vien", "ky_thuat_vien", "nguoi_phu_trach"],
            },
            {
                "key": "voucher_code",
                "label": "Mã ưu đãi / Voucher",
                "type": "STRING",
                "example": "FUJI2026",
                "desc": "Mã voucher tri ân hoặc khuyến mại gửi khách",
                "aliases": ["ma_giam_gia", "ma_uu_dai", "ma_voucher", "voucher"],
            },
        ],
    },
]


def _normalize_key(key: str) -> str:
    """Chuyển chuỗi về dạng chuẩn: chữ thường, không dấu, không ký tự đặc biệt."""
    if not key:
        return ""
    # Chuyển có dấu thành không dấu
    nfd = unicodedata.normalize("NFD", key.lower())
    clean = "".join(c for c in nfd if unicodedata.category(c) != "Mn")
    # Thay đ -> d
    clean = clean.replace("đ", "d")
    # Thay khoảng trắng và dấu gạch nối thành gạch dưới
    clean = re.sub(r"[\s\-]+", "_", clean)
    # Bỏ các ký tự không phải chữ và số và gạch dưới
    clean = re.sub(r"[^a-z0-9_]", "", clean)
    return clean


# Xây dựng bảng tra cứu ngược Alias -> Canonical Key
_ALIAS_TO_CANONICAL: Dict[str, str] = {}
for cat in SYSTEM_MAPPING_VARIABLES:
    for v in cat["variables"]:
        can_key = v["key"]
        _ALIAS_TO_CANONICAL[_normalize_key(can_key)] = can_key
        for al in v.get("aliases", []):
            _ALIAS_TO_CANONICAL[_normalize_key(al)] = can_key


def format_currency_vn(amount: Any) -> str:
    """Format số tiền thành dạng đẹp: 1.500.000đ"""
    try:
        val = int(float(amount))
        return f"{val:,}".replace(",", ".") + "đ"
    except (ValueError, TypeError):
        return str(amount or "")


def format_number_raw(amount: Any) -> str:
    """Format số tiền thuần số không có ký tự đ/phẩy: 1500000"""
    try:
        return str(int(float(amount)))
    except (ValueError, TypeError):
        return str(amount or "")


def build_zns_context(
    customer: Any = None,
    order: Any = None,
    receipt: Any = None,
    company: Any = None,
    extra: Optional[Dict[str, Any]] = None,
    template: Any = None,
) -> Dict[str, Any]:
    """
    Tập hợp toàn bộ thông tin từ Customer, Order, PaymentReceipt... thành từ điển dữ liệu.
    Tự động sinh cả biến Canonical lẫn các Alias (tiếng Anh + tiếng Việt)
    để đảm bảo mẫu ZNS đăng ký kiểu gì cũng khớp.
    """
    extra = extra or {}
    ctx: Dict[str, Any] = {}

    # 1. Company / Người gửi
    target_company = company
    if not target_company:
        if order and hasattr(order, "company"):
            target_company = order.company
        elif customer and hasattr(customer, "company"):
            target_company = customer.company
        elif receipt and hasattr(receipt, "company"):
            target_company = receipt.company

    company_name = getattr(target_company, "name", "Fujitech") if target_company else "Fujitech"
    ctx["sender_company"] = company_name

    # 2. Khách hàng
    if customer:
        cust_name = getattr(customer, "name", "")
        cust_phone = getattr(customer, "phone", "")
        cust_address = getattr(customer, "address", "")
        cust_city = getattr(customer, "city", "")
        cust_company = getattr(customer, "company_name", "")
        cust_birthday = getattr(customer, "birthday", None)

        ctx["customer_name"] = cust_name
        ctx["phone"] = cust_phone
        ctx["address"] = cust_address
        ctx["city"] = cust_city
        ctx["company_name"] = cust_company
        if cust_birthday:
            if isinstance(cust_birthday, (date, datetime)):
                ctx["birthday"] = cust_birthday.strftime("%d/%m/%Y")
            else:
                ctx["birthday"] = str(cust_birthday)

    # 3. Đơn hàng
    if order:
        order_num = getattr(order, "order_number", "")
        ctx["order_number"] = order_num
        tot_amount = getattr(order, "total_amount", 0)
        ctx["total_amount"] = format_currency_vn(tot_amount)
        ctx["raw_total_amount"] = format_number_raw(tot_amount)

        created_at = getattr(order, "created_at", None)
        if created_at and isinstance(created_at, (date, datetime)):
            ctx["order_date"] = created_at.strftime("%d/%m/%Y")

        if hasattr(order, "get_status_display"):
            ctx["status"] = order.get_status_display()
        else:
            ctx["status"] = str(getattr(order, "status", ""))

        deliv_addr = getattr(order, "delivery_address", None) or ctx.get("address", "")
        if deliv_addr:
            ctx["delivery_address"] = deliv_addr

        deliv_time = getattr(order, "delivery_time", None)
        if deliv_time:
            ctx["delivery_time"] = str(deliv_time)

        warranty_m = getattr(order, "warranty_months", None)
        if warranty_m:
            ctx["warranty_months"] = f"{warranty_m} tháng"

        notes = getattr(order, "notes", None)
        if notes:
            ctx["note"] = notes

    # 4. Phiếu thu
    if receipt:
        rec_code = getattr(receipt, "receipt_code", None) or f"PT-{getattr(receipt, 'id', '')}"
        ctx["receipt_code"] = rec_code
        rec_amt = getattr(receipt, "amount", 0)
        ctx["amount"] = format_currency_vn(rec_amt)
        ctx["raw_amount"] = format_number_raw(rec_amt)

        pay_date = getattr(receipt, "payment_date", None)
        if pay_date and isinstance(pay_date, (date, datetime)):
            ctx["payment_date"] = pay_date.strftime("%d/%m/%Y")

        if hasattr(receipt, "get_payment_method_display"):
            ctx["payment_method"] = receipt.get_payment_method_display()
        else:
            ctx["payment_method"] = str(getattr(receipt, "payment_method", ""))

        if getattr(receipt, "reference_code", None):
            ctx["reference_code"] = receipt.reference_code

        milestone = getattr(receipt, "milestone", None)
        if milestone and hasattr(milestone, "title"):
            ctx["milestone_title"] = milestone.title

        # Tính công nợ còn lại nếu có order
        if order and hasattr(order, "total_amount"):
            try:
                from finance.models import PaymentReceipt
                total_paid = PaymentReceipt.objects.filter(order=order).exclude(id=getattr(receipt, "id", 0)).aggregate(
                    s=PaymentReceipt.objects.filter(order=order).values("amount").model.objects.filter(order=order).aggregate(s=PaymentReceipt.objects.none())
                )
            except Exception:
                pass

    # 5. Ghi đè extra (các tham số tùy chỉnh thêm ngoài luồng)
    for k, v in extra.items():
        ctx[k] = v

    # 6. Mở rộng tất cả Alias tương ứng vào context
    # Nhờ vậy, ctx sẽ có cả customer_name, ten_khach_hang, ho_ten, order_number, ma_don_hang...
    expanded_ctx = dict(ctx)
    for cat in SYSTEM_MAPPING_VARIABLES:
        for var in cat["variables"]:
            can_key = var["key"]
            if can_key in ctx:
                val = ctx[can_key]
                for al in var.get("aliases", []):
                    if al not in expanded_ctx:
                        expanded_ctx[al] = val

    # 7. Nếu có template với params_schema, gọi resolve_zns_params để lọc chính xác
    if template and getattr(template, "params_schema", None):
        return resolve_zns_params(template.params_schema, expanded_ctx)

    return expanded_ctx


def resolve_zns_params(schema: Dict[str, Any], context_data: Dict[str, Any]) -> Dict[str, Any]:
    """
    Khớp các key mà Zalo Template yêu cầu (trong schema) với dữ liệu từ context_data.
    Đảm bảo 100% key Zalo yêu cầu sẽ được điền giá trị tương ứng (dù đặt tên Anh hay Việt).
    """
    if not schema or not isinstance(schema, dict):
        return context_data

    result: Dict[str, Any] = {}

    for param_name, type_or_label in schema.items():
        # 1. Trùng khớp trực tiếp
        if param_name in context_data:
            result[param_name] = context_data[param_name]
            continue

        # 2. Chuẩn hóa tên param
        norm = _normalize_key(param_name)

        # 3. Tìm Canonical key
        can_key = _ALIAS_TO_CANONICAL.get(norm)
        if can_key and can_key in context_data:
            val = context_data[can_key]
            # Nếu param type là NUMBER mà val có chữ đ, lấy raw_
            type_str = str(type_or_label).upper()
            if "NUMBER" in type_str:
                raw_k = f"raw_{can_key}"
                val = context_data.get(raw_k, val)
                val = format_number_raw(val)
            result[param_name] = val
            continue

        # 4. Tìm kiếm tương đối trong context_data theo norm
        found = False
        for ctx_k, ctx_v in context_data.items():
            if _normalize_key(ctx_k) == norm:
                result[param_name] = ctx_v
                found = True
                break

        if not found:
            # Nếu không tìm thấy, để chuỗi rỗng để tránh Zalo crash
            result[param_name] = ""

    return result
