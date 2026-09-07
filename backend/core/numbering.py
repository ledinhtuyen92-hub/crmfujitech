"""
Auto-numbering utility cho Orders, Quotations, InventoryTransactions, v.v.
Format: {PREFIX}-{DDMMYYYY}-{SEQ:03d}

Cơ chế: Dùng bảng CompanySequence làm bộ đếm TRUNG TÂM.
- Số thứ tự CHỈ TĂNG, không bao giờ giảm dù chứng từ bị xóa.
- Đảm bảo đồng bộ hậu tố (suffix) giữa tất cả các loại phiếu trong cùng một ngày.
- Thread-safe: dùng select_for_update() + transaction.atomic().
"""
from datetime import date
from django.db import transaction


def _next_seq(company, prefix: str, date_str: str) -> int:
    """
    Lấy và tăng bộ đếm trung tâm cho (company, prefix, date_str).
    Trả về số thứ tự mới (đã tăng).
    Thread-safe với select_for_update().
    """
    from users.models import CompanySequence

    with transaction.atomic():
        seq_obj, _ = CompanySequence.objects.select_for_update().get_or_create(
            company=company,
            prefix=prefix,
            date_str=date_str,
            defaults={"last_seq": 0},
        )
        seq_obj.last_seq += 1
        seq_obj.save(update_fields=["last_seq"])
        return seq_obj.last_seq


def _generate_code(company, prefix: str) -> str:
    """
    Sinh mã tự động dạng PREFIX-DDMMYYYY-SEQ.
    Dùng CompanySequence làm bộ đếm trung tâm.
    """
    today_str = date.today().strftime("%d%m%Y")
    settings = getattr(company, "settings", None)
    
    is_continuous = settings and settings.continuous_sequence_numbering
    include_date = settings.code_include_date if settings else True
    
    seq_date_str = "ALL_TIME" if is_continuous else today_str
    
    seq = _next_seq(company, prefix, seq_date_str)
    
    parts = []
    if prefix:
        parts.append(prefix)
    if include_date:
        parts.append(today_str)
    parts.append(f"{seq:03d}")
    
    return "-".join(parts)


def derive_code_from_order(source_order_number: str, company, target_doc_type: str) -> str:
    """
    Tạo mã phiếu liên quan (EXP, LSX, GH, BH...) CÓ CÙNG HẬU TỐ với mã đơn hàng nguồn.

    Ví dụ:
        source_order_number = "FUJI-DH-21072026-001"
        target_doc_type     = "export"
        → trả về               "FUJI-EXP-21072026-001"

    Nếu mã đó đã tồn tại (trùng), sẽ sinh mã mới từ bộ đếm trung tâm.
    Luôn cập nhật CompanySequence để bộ đếm không bao giờ lùi số.
    """
    from users.models import CompanySequence

    prefix_map = {
        "export":   "EXP",
        "import":   "IMP",
        "adjust":   "ADJ",
        "transfer": "TRF",
        "lsx":      "LSX",
        "gh":       "GH",
        "bh":       "BH",
        "pt":       "PT",
    }
    base_doc = prefix_map.get(target_doc_type, target_doc_type.upper())
    target_prefix = resolve_doc_prefix(company, base_doc)

    # Trích xuất date_str và seq từ mã nguồn
    # Định dạng có thể có hoặc không có date_str
    parts = source_order_number.split("-") if source_order_number else []
    if len(parts) >= 1:
        try:
            seq = int(parts[-1])
            date_str = None
            if len(parts) >= 2 and len(parts[-2]) == 8 and parts[-2].isdigit():
                date_str = parts[-2]

            settings = getattr(company, "settings", None)
            include_date = settings.code_include_date if settings else True
            is_continuous = settings and settings.continuous_sequence_numbering
            
            candidate_parts = []
            if target_prefix:
                candidate_parts.append(target_prefix)
            
            if include_date:
                candidate_parts.append(date_str if date_str else date.today().strftime("%d%m%Y"))
                
            candidate_parts.append(f"{seq:03d}")
            candidate_code = "-".join(candidate_parts)

            # Kiểm tra mã này chưa tồn tại
            from inventory.models import InventoryTransaction
            from production.models import ProductionOrder
            from delivery.models import DeliveryOrder, WarrantyCard
            from orders.models import Order

            model_map = {
                "EXP": (InventoryTransaction, "transaction_code"),
                "IMP": (InventoryTransaction, "transaction_code"),
                "ADJ": (InventoryTransaction, "transaction_code"),
                "TRF": (InventoryTransaction, "transaction_code"),
                "LSX": (ProductionOrder, "production_order_code"),
                "GH":  (DeliveryOrder, "delivery_code"),
                "BH":  (WarrantyCard, "warranty_code"),
                "DH":  (Order, "order_number"),
                "PT":  (Order, "order_number"), # Temporary fallback, Receipt is different usually
            }
            model_info = model_map.get(base_doc)
            is_taken = False
            if model_info:
                model_cls, field = model_info
                is_taken = model_cls.objects.filter(
                    company=company, **{field: candidate_code}
                ).exists()

            if not is_taken:
                # Đảm bảo bộ đếm trung tâm không bao giờ nhỏ hơn seq này
                seq_date_str = "ALL_TIME" if is_continuous else (date_str if date_str else date.today().strftime("%d%m%Y"))
                with transaction.atomic():
                    seq_obj, created = CompanySequence.objects.select_for_update().get_or_create(
                        company=company,
                        prefix=target_prefix,
                        date_str=seq_date_str,
                        defaults={"last_seq": seq},
                    )
                    if not created and seq > seq_obj.last_seq:
                        seq_obj.last_seq = seq
                        seq_obj.save(update_fields=["last_seq"])
                return candidate_code
        except (ValueError, IndexError):
            pass

    # Fallback: sinh mã mới từ bộ đếm trung tâm
    return _generate_code(company, target_prefix)


def resolve_doc_prefix(company, default_doc_code: str) -> str:
    """
    Sinh tiền tố dựa theo cài đặt bật tắt:
    - code_include_company_prefix
    - code_include_doc_type
    """
    try:
        settings = company.settings
        parts = []
        if getattr(settings, 'code_include_company_prefix', True):
            p = (settings.order_prefix or "").strip().upper()
            if p:
                parts.append(p)
        if getattr(settings, 'code_include_doc_type', True):
            parts.append(default_doc_code)
            
        return "-".join(parts)
    except Exception:
        pass
        
    return default_doc_code


def generate_order_number(company) -> str:
    """Sinh mã đơn hàng: {COMPANY_PREFIX}-DH-{DDMMYYYY}-{SEQ}."""
    prefix = resolve_doc_prefix(company, "DH")
    return _generate_code(company, prefix)


def generate_quotation_number(company) -> str:
    """Sinh mã báo giá: {COMPANY_PREFIX}-BG-{DDMMYYYY}-{SEQ}."""
    prefix = resolve_doc_prefix(company, "BG")
    return _generate_code(company, prefix)


def generate_transaction_code(company, txn_type: str) -> str:
    """
    Sinh mã phiếu kho:
    - import  → {COMPANY_PREFIX}-IMP-DDMMYYYY-SEQ
    - export  → {COMPANY_PREFIX}-EXP-DDMMYYYY-SEQ
    - adjust  → {COMPANY_PREFIX}-ADJ-DDMMYYYY-SEQ
    - transfer → {COMPANY_PREFIX}-TRF-DDMMYYYY-SEQ
    """
    prefix_map = {"import": "IMP", "export": "EXP", "adjust": "ADJ", "transfer": "TRF"}
    base_code = prefix_map.get(txn_type, "TXN")
    prefix = resolve_doc_prefix(company, base_code)
    return _generate_code(company, prefix)


def generate_receipt_code(company) -> str:
    """Sinh mã phiếu thu: {COMPANY_PREFIX}-PT-{DDMMYYYY}-{SEQ}."""
    prefix = resolve_doc_prefix(company, "PT")
    return _generate_code(company, prefix)


def generate_production_order_code(company) -> str:
    """Sinh mã lệnh sản xuất: {COMPANY_PREFIX}-LSX-{DDMMYYYY}-{SEQ}."""
    prefix = resolve_doc_prefix(company, "LSX")
    return _generate_code(company, prefix)


def generate_delivery_code(company) -> str:
    """Sinh mã phiếu giao hàng: {COMPANY_PREFIX}-GH-{DDMMYYYY}-{SEQ}."""
    prefix = resolve_doc_prefix(company, "GH")
    return _generate_code(company, prefix)


def generate_warranty_code(company) -> str:
    """Sinh mã phiếu bảo hành: {COMPANY_PREFIX}-BH-{DDMMYYYY}-{SEQ}."""
    prefix = resolve_doc_prefix(company, "BH")
    return _generate_code(company, prefix)


# ── Hàm tiện ích để đồng bộ hóa bộ đếm từ dữ liệu thực tế trong DB ──────────

def sync_sequences_from_db(company=None):
    """
    Đồng bộ hóa bộ đếm CompanySequence từ dữ liệu thực tế trong DB.
    Chạy lần đầu sau khi migrate để cập nhật bộ đếm theo mã cao nhất đang có.
    
    - company=None: sync toàn bộ các công ty.
    - company=<obj>: sync chỉ 1 công ty.
    """
    from users.models import Company, CompanySequence
    from orders.models import Order
    from sales.models import Quotation
    from inventory.models import InventoryTransaction
    from finance.models import PaymentReceipt
    from production.models import ProductionOrder
    from delivery.models import DeliveryOrder, WarrantyCard

    companies = [company] if company else list(Company.objects.all())

    doc_configs = [
        # (model_class, field_name, list_of_prefixes_to_scan)
        (Order, "order_number", None),
        (Quotation, "quotation_number", None),
        (InventoryTransaction, "transaction_code", None),
        (PaymentReceipt, "receipt_code", None),
        (ProductionOrder, "production_order_code", None),
        (DeliveryOrder, "delivery_code", None),
        (WarrantyCard, "warranty_code", None),
    ]

    updated_count = 0
    for comp in companies:
        for model_class, field_name, _ in doc_configs:
            # Quét tất cả mã của model này cho công ty này
            codes = model_class.objects.filter(company=comp).values_list(field_name, flat=True)
            for code in codes:
                if not code:
                    continue
                parts = code.split("-")
                # Định dạng: PREFIX(-SUBPREFIX)-DDMMYYYY-SEQ
                # Ví dụ: FUJI-DH-21072026-004 hoặc DH-21072026-004
                if len(parts) < 3:
                    continue
                try:
                    seq = int(parts[-1])
                    date_str = parts[-2]
                    if len(date_str) != 8 or not date_str.isdigit():
                        continue
                    prefix = "-".join(parts[:-2])  # Tất cả phần còn lại là prefix
                except (ValueError, IndexError):
                    continue

                # Cập nhật bộ đếm nếu seq hiện tại cao hơn last_seq đã lưu
                with transaction.atomic():
                    seq_obj, created = CompanySequence.objects.select_for_update().get_or_create(
                        company=comp,
                        prefix=prefix,
                        date_str=date_str,
                        defaults={"last_seq": seq},
                    )
                    if not created and seq > seq_obj.last_seq:
                        seq_obj.last_seq = seq
                        seq_obj.save(update_fields=["last_seq"])
                        updated_count += 1

    return updated_count
