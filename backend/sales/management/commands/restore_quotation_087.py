from decimal import Decimal
from django.core.management.base import BaseCommand
from django.db import transaction

from sales.models import Quotation, QuotationItem
from inventory.models import Product


class Command(BaseCommand):
    help = "Phục hồi đầy đủ 40 hạng mục cho phiếu báo giá FT-BG-087 từ bản lưu PDF"

    def handle(self, *args, **options):
        q = Quotation.objects.filter(quotation_number__icontains="087").first()
        if not q:
            self.stdout.write(self.style.ERROR("❌ Không tìm thấy báo giá nào chứa mã '087' trong hệ thống!"))
            return

        self.stdout.write(self.style.WARNING(f"👉 Tìm thấy báo giá: ID {q.id} ({q.quotation_number}) - KH: {q.customer_name_snapshot or (q.customer.name if q.customer else '')}"))

        company = q.company

        # Lấy sản phẩm từ catalog của công ty
        prod_tp = Product.objects.filter(company=company, name__icontains="Cửa Composite TP").first() or Product.objects.filter(id=7).first()
        prod_vs = Product.objects.filter(company=company, name__icontains="Cửa Composite VS").first() or Product.objects.filter(id=65).first()
        prod_ban_le = Product.objects.filter(company=company, name__icontains="Bản lề Inox").first() or Product.objects.filter(id=19).first()
        prod_chan_cua = Product.objects.filter(company=company, name__icontains="Chặn cửa bán nguyệt").first() or Product.objects.filter(id=23).first()
        prod_gioang = Product.objects.filter(company=company, name__icontains="Gioăng").first() or Product.objects.filter(id=66).first()
        prod_keo = Product.objects.filter(company=company, name__icontains="Keo Silicon").first() or Product.objects.filter(id=67).first()
        prod_kitos = Product.objects.filter(company=company, name__icontains="KITOS- SD500").first() or Product.objects.filter(id=26).first()
        prod_ft103 = Product.objects.filter(company=company, name__icontains="FT-103").first() or Product.objects.filter(id=13).first()
        prod_vanchuyen = Product.objects.filter(company=company, name__icontains="vận chuyển").first() or Product.objects.filter(id=57).first()
        prod_bo_lap_dat = Product.objects.filter(company=company, name__icontains="bọ lắp đặt").first() or Product.objects.filter(id=56).first()

        img_tp = prod_tp.image.url if prod_tp and prod_tp.image else "/media/products/1783916824591_7400646408975455757_g3082726409609913969_15e40555c70dc7c93d7e16bc_ICO0zac.jpg"
        img_vs = prod_vs.image.url if prod_vs and prod_vs.image else "/media/products/1783916824591_7400646408975455757_g3082726409609913969_15e40555c70dc7c93d7e16bccee7c8fb.jpg"

        with transaction.atomic():
            q.items.all().delete()
            items_to_create = []

            # --- NHÓM 1: CỬA COMPOSITE TP (12 CỬA + 7 PHỤ KIỆN) ---
            group1_doors = [
                (2178, 930, 135, "D2.1", "sx kt 910, thêm bọ"),
                (2180, 930, 135, "D2.2", "sx kt 910, thêm bọ"),
                (2190, 930, 135, "D2.3", "sx kt 910, thêm bọ"),
                (2185, 930, 130, "D5.1", "sx kt 910, thêm bọ"),
                (2188, 930, 130, "D5.2", "sx kt 910, thêm bọ"),
                (2147, 930, 130, "D4.1", "sx kt 910, thêm bọ"),
                (2150, 930, 135, "D4.2", "sx kt 910, thêm bọ"),
                (2140, 930, 135, "D4.3", "sx kt 910, thêm bọ"),
                (2163, 930, 135, "D3.1", "sx kt 910, thêm bọ"),
                (2168, 930, 135, "D3.2", "sx kt 910, thêm bọ"),
                (2170, 930, 135, "D3.3", "sx kt 910, thêm bọ"),
                (0, 0, 0, "D6", "chưa có kt"),
            ]

            for h, w, t, sym, note in group1_doors:
                items_to_create.append(QuotationItem(
                    quotation=q,
                    product=prod_tp,
                    item_type=QuotationItem.ITEM_TYPE_PRODUCT,
                    product_name="Cửa Composite TP",
                    unit_price=Decimal("3150000.00"),
                    height=Decimal(h),
                    width=Decimal(w),
                    thickness=Decimal(t),
                    quantity=1,
                    line_total=Decimal("3150000.00"),
                    product_image=img_tp,
                    note=note,
                    custom_data={"unit": "cái", "symbol": sym, "thickness": t, "merge_columns": [], "is_custom_size": False, "custom_size_text": ""}
                ))

            # Phụ kiện Nhóm 1
            items_to_create.append(QuotationItem(
                quotation=q,
                product=prod_tp,
                item_type=QuotationItem.ITEM_TYPE_PRODUCT,
                product_name="Cửa Composite TP",
                unit_price=Decimal("0.00"),
                quantity=36,
                line_total=Decimal("0.00"),
                product_image=img_tp,
                custom_data={"unit": "Cái", "symbol": "", "thickness": 0, "note_image": "/media/products/ban_le_1.png", "merge_columns": ["height", "width", "thickness"], "is_custom_size": True, "custom_size_text": "Bản lề Inox", "actual_product_id": prod_ban_le.id if prod_ban_le else 19}
            ))
            items_to_create.append(QuotationItem(
                quotation=q,
                product=prod_tp,
                item_type=QuotationItem.ITEM_TYPE_PRODUCT,
                product_name="Cửa Composite TP",
                unit_price=Decimal("0.00"),
                quantity=12,
                line_total=Decimal("0.00"),
                product_image=img_tp,
                note="Quà tặng",
                custom_data={"unit": "Cái", "symbol": "", "thickness": 0, "note_image": "/media/products/5.png", "merge_columns": ["height", "width", "thickness"], "is_custom_size": True, "custom_size_text": "Chặn cửa bán nguyệt", "actual_product_id": prod_chan_cua.id if prod_chan_cua else 23}
            ))
            items_to_create.append(QuotationItem(
                quotation=q,
                product=prod_tp,
                item_type=QuotationItem.ITEM_TYPE_PRODUCT,
                product_name="Cửa Composite TP",
                unit_price=Decimal("0.00"),
                quantity=12,
                line_total=Decimal("0.00"),
                product_image=img_tp,
                custom_data={"unit": "Bộ", "symbol": "", "thickness": 0, "merge_columns": ["height", "width", "thickness"], "is_custom_size": True, "custom_size_text": "Gioăng nhập khẩu", "actual_product_id": prod_gioang.id if prod_gioang else 66}
            ))
            items_to_create.append(QuotationItem(
                quotation=q,
                product=prod_tp,
                item_type=QuotationItem.ITEM_TYPE_PRODUCT,
                product_name="Cửa Composite TP",
                unit_price=Decimal("0.00"),
                quantity=4,
                line_total=Decimal("0.00"),
                product_image=img_tp,
                custom_data={"unit": "Cái", "symbol": "", "thickness": 0, "merge_columns": ["height", "width", "thickness"], "is_custom_size": True, "custom_size_text": "Keo Silicon", "actual_product_id": prod_keo.id if prod_keo else 67}
            ))
            items_to_create.append(QuotationItem(
                quotation=q,
                product=prod_tp,
                item_type=QuotationItem.ITEM_TYPE_PRODUCT,
                product_name="Cửa Composite TP",
                unit_price=Decimal("0.00"),
                quantity=1,
                line_total=Decimal("0.00"),
                product_image=img_tp,
                note="Quà tặng",
                custom_data={"unit": "Bộ", "symbol": "", "thickness": 0, "note_image": "/media/products/images.jpg", "merge_columns": ["height", "width", "thickness"], "is_custom_size": True, "custom_size_text": "KHÓA TM KITOS- SD500", "actual_product_id": prod_kitos.id if prod_kitos else 26}
            ))
            items_to_create.append(QuotationItem(
                quotation=q,
                product=prod_tp,
                item_type=QuotationItem.ITEM_TYPE_PRODUCT,
                product_name="Cửa Composite TP",
                unit_price=Decimal("1950000.00"),
                quantity=11,
                line_total=Decimal("21450000.00"),
                product_image=img_tp,
                custom_data={"unit": "Bộ", "symbol": "", "thickness": 0, "note_image": "/media/products/images.jpg", "merge_columns": ["height", "width", "thickness"], "is_custom_size": True, "custom_size_text": "KHÓA TM KITOS- SD500", "actual_product_id": prod_kitos.id if prod_kitos else 26}
            ))
            items_to_create.append(QuotationItem(
                quotation=q,
                product=prod_tp,
                item_type=QuotationItem.ITEM_TYPE_PRODUCT,
                product_name="Cửa Composite TP",
                unit_price=Decimal("0.00"),
                quantity=12,
                line_total=Decimal("0.00"),
                product_image=img_tp,
                custom_data={"unit": "Bộ", "symbol": "", "thickness": 0, "merge_columns": ["height", "width", "thickness"], "is_custom_size": True, "custom_size_text": "Màu V-03", "actual_product_id": None}
            ))

            # --- NHÓM 2: CỬA COMPOSITE VS (13 CỬA + 5 PHỤ KIỆN) ---
            group2_doors = [
                (2227, 749, 125, "DW2.1", "nẹp chân dài"),
                (2223, 725, 125, "DW2.2", "nẹp chân dài"),
                (2223, 750, 125, "DW2.3", "nẹp chân dài"),
                (2177, 750, 125, "DW6", "nẹp chân dài"),
                (2197, 757, 125, "DW5.1", "nẹp chân dài"),
                (2205, 810, 125, "DW5.2", "nẹp chân dài"),
                (2158, 747, 125, "DW4.1", "nẹp chân dài"),
                (2182, 725, 125, "DW4.2", "nẹp chân dài"),
                (2167, 750, 125, "DW4.3", "nẹp chân dài"),
                (2208, 750, 125, "DW3.1", "nẹp chân dài"),
                (2220, 735, 125, "DW3.2", "nẹp chân dài"),
                (2218, 750, 125, "DW3.3", "nẹp chân dài"),
                (0, 0, 0, "DW1", "chưa có kích thước"),
            ]

            for h, w, t, sym, note in group2_doors:
                items_to_create.append(QuotationItem(
                    quotation=q,
                    product=prod_vs,
                    item_type=QuotationItem.ITEM_TYPE_PRODUCT,
                    product_name="Cửa Composite VS",
                    unit_price=Decimal("3000000.00"),
                    height=Decimal(h),
                    width=Decimal(w),
                    thickness=Decimal(t),
                    quantity=1,
                    line_total=Decimal("3000000.00"),
                    product_image=img_vs,
                    note=note,
                    custom_data={"unit": "cái", "symbol": sym, "thickness": t, "merge_columns": [], "is_custom_size": False, "custom_size_text": ""}
                ))

            # Phụ kiện Nhóm 2
            items_to_create.append(QuotationItem(
                quotation=q,
                product=prod_vs,
                item_type=QuotationItem.ITEM_TYPE_PRODUCT,
                product_name="Cửa Composite VS",
                unit_price=Decimal("0.00"),
                quantity=39,
                line_total=Decimal("0.00"),
                product_image=img_vs,
                custom_data={"unit": "Cái", "symbol": "", "thickness": 0, "note_image": "/media/products/ban_le_1.png", "merge_columns": ["height", "width", "thickness"], "is_custom_size": True, "custom_size_text": "Bản lề Inox", "actual_product_id": prod_ban_le.id if prod_ban_le else 19}
            ))
            items_to_create.append(QuotationItem(
                quotation=q,
                product=prod_vs,
                item_type=QuotationItem.ITEM_TYPE_PRODUCT,
                product_name="Cửa Composite VS",
                unit_price=Decimal("0.00"),
                quantity=13,
                line_total=Decimal("0.00"),
                product_image=img_vs,
                custom_data={"unit": "Bộ", "symbol": "", "thickness": 0, "merge_columns": ["height", "width", "thickness"], "is_custom_size": True, "custom_size_text": "Gioăng nhập khẩu", "actual_product_id": prod_gioang.id if prod_gioang else 66}
            ))
            items_to_create.append(QuotationItem(
                quotation=q,
                product=prod_vs,
                item_type=QuotationItem.ITEM_TYPE_PRODUCT,
                product_name="Cửa Composite VS",
                unit_price=Decimal("0.00"),
                quantity=4,
                line_total=Decimal("0.00"),
                product_image=img_vs,
                custom_data={"unit": "Cái", "symbol": "", "thickness": 0, "merge_columns": ["height", "width", "thickness"], "is_custom_size": True, "custom_size_text": "Keo Silicon", "actual_product_id": prod_keo.id if prod_keo else 67}
            ))
            items_to_create.append(QuotationItem(
                quotation=q,
                product=prod_vs,
                item_type=QuotationItem.ITEM_TYPE_PRODUCT,
                product_name="Cửa Composite VS",
                unit_price=Decimal("0.00"),
                quantity=13,
                line_total=Decimal("0.00"),
                product_image=img_vs,
                note="Quà tặng",
                custom_data={"unit": "Bộ", "symbol": "", "thickness": 0, "note_image": "/media/products/FT-103.jpg", "merge_columns": ["height", "width", "thickness"], "is_custom_size": True, "custom_size_text": "KHÓA FT-103", "actual_product_id": prod_ft103.id if prod_ft103 else 13}
            ))
            items_to_create.append(QuotationItem(
                quotation=q,
                product=prod_vs,
                item_type=QuotationItem.ITEM_TYPE_PRODUCT,
                product_name="Cửa Composite VS",
                unit_price=Decimal("0.00"),
                quantity=13,
                line_total=Decimal("0.00"),
                product_image=img_vs,
                custom_data={"unit": "Bộ", "symbol": "", "thickness": 0, "merge_columns": ["height", "width", "thickness"], "is_custom_size": True, "custom_size_text": "Màu V-03", "actual_product_id": None}
            ))

            # --- DỊCH VỤ & CHI PHÍ PHÁT SINH ---
            items_to_create.append(QuotationItem(
                quotation=q,
                product=prod_vanchuyen,
                item_type=QuotationItem.ITEM_TYPE_SERVICE,
                product_name="Chi phí vận chuyển",
                unit_price=Decimal("2000000.00"),
                quantity=1,
                line_total=Decimal("2000000.00"),
                custom_data={"unit": "chuyến", "symbol": ""}
            ))
            items_to_create.append(QuotationItem(
                quotation=q,
                product=None,
                item_type=QuotationItem.ITEM_TYPE_SERVICE,
                product_name="CNC xong sơn đen",
                unit_price=Decimal("450000.00"),
                quantity=25,
                line_total=Decimal("11250000.00"),
                custom_data={"unit": "Bộ", "symbol": ""}
            ))
            items_to_create.append(QuotationItem(
                quotation=q,
                product=prod_bo_lap_dat,
                item_type=QuotationItem.ITEM_TYPE_SERVICE,
                product_name="Phát sinh bọ lắp đặt",
                unit_price=Decimal("50000.00"),
                quantity=12,
                line_total=Decimal("600000.00"),
                custom_data={"unit": "bộ", "symbol": ""}
            ))

            QuotationItem.objects.bulk_create(items_to_create)

            subtotal = sum(it.line_total for it in items_to_create)
            q.subtotal = subtotal
            q.total_amount = subtotal
            q.save(update_fields=['subtotal', 'total_amount'])

        self.stdout.write(self.style.SUCCESS(f"✅ ĐÃ PHỤC HỒI THÀNH CÔNG {len(items_to_create)} HẠNG MỤC CHO BÁO GIÁ {q.quotation_number}!"))
        self.stdout.write(self.style.SUCCESS(f"💰 Tổng tiền thanh toán: {q.total_amount:,.2f} VNĐ"))
