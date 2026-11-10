from decimal import Decimal
from django.db import transaction
from rest_framework import serializers

from .models import Order, OrderItem
from finance.serializers import OrderPaymentMilestoneSerializer, PaymentReceiptSerializer


class OrderItemSerializer(serializers.ModelSerializer):
    symbol = serializers.SerializerMethodField()
    unit = serializers.SerializerMethodField()

    class Meta:
        model = OrderItem
        fields = [
            "id",
            "order",
            "product",
            "item_type",
            "product_name",
            "unit_price",
            "width",
            "height",
            "quantity",
            "discount_percent",
            "line_total",
            "note",
            "length",
            "area",
            "spec",
            "warranty",
            "thickness",
            "product_image",
            "custom_data",
            "symbol",
            "unit",
        ]
        read_only_fields = ["id", "line_total"]

    def get_symbol(self, obj):
        if isinstance(obj.custom_data, dict):
            return obj.custom_data.get('symbol', '')
        return ''

    def get_unit(self, obj):
        if isinstance(obj.custom_data, dict):
            return obj.custom_data.get('unit', '')
        return ''

    def validate(self, attrs):
        custom_data = attrs.get('custom_data', {})
        if custom_data and 'actual_product_id' in custom_data:
            pass # Keep product as-is for frontend grouping
        return attrs

    def to_representation(self, instance):
        data = super().to_representation(instance)
        for field in ['width', 'height', 'length', 'area', 'thickness']:
            if field in data and data[field] is not None:
                try:
                    f_val = float(data[field])
                    if f_val.is_integer():
                        data[field] = str(int(f_val))
                except (ValueError, TypeError):
                    pass
        if isinstance(instance.custom_data, dict):
            data['symbol'] = instance.custom_data.get('symbol', '')
            data['unit'] = instance.custom_data.get('unit', '')
        return data


from sales.serializers import get_company_info_dict, QuotationSerializer

class OrderSerializer(serializers.ModelSerializer):
    items = OrderItemSerializer(many=True, read_only=True)
    quotation_detail = QuotationSerializer(source="quotation", read_only=True)
    status_display = serializers.CharField(source="get_status_display", read_only=True)
    customer_name = serializers.SerializerMethodField()
    customer_phone = serializers.SerializerMethodField()
    customer_address = serializers.SerializerMethodField()
    created_by_name = serializers.CharField(source="created_by.full_name", read_only=True)
    approved_by_name = serializers.CharField(source="approved_by.full_name", read_only=True)
    financial_status_display = serializers.SerializerMethodField()
    payment_target_display = serializers.CharField(source="get_payment_target_display", read_only=True)
    paid_amount = serializers.FloatField(read_only=True)
    remaining_debt = serializers.FloatField(read_only=True)
    company_info = serializers.SerializerMethodField()
    customer_info = serializers.SerializerMethodField()
    has_pending_credit_request = serializers.SerializerMethodField()
    payment_milestones = OrderPaymentMilestoneSerializer(many=True, read_only=True)
    payment_receipts = PaymentReceiptSerializer(many=True, read_only=True)
    needs_export_request = serializers.SerializerMethodField()
    has_production_order = serializers.SerializerMethodField()
    has_pending_export = serializers.SerializerMethodField()
    requires_inventory_export = serializers.ReadOnlyField()
    factory_name = serializers.CharField(source="factory.name", read_only=True, default=None)
    total_quantity = serializers.SerializerMethodField()
    linked_documents = serializers.SerializerMethodField()

    class Meta:
        model = Order
        fields = [
            "id",
            "company",
            "order_number",
            "customer",
            "factory",
            "factory_name",
            "customer_name",
            "customer_phone",
            "customer_address",
            "quotation",
            "quotation_detail",
            "created_by",
            "created_by_name",
            "approved_by",
            "approved_by_name",
            "status",
            "status_display",
            "delivery_address",
            "delivery_map_link",
            "financial_status",
            "financial_status_display",
            "payment_term",
            "payment_terms_schedule",
            "payment_target",
            "payment_target_display",
            "paid_amount",
            "remaining_debt",
            "installation_date",
            "notes",
            "shipping_fee",
            "installation_fee",
            "delivery_time",
            "warranty_months",
            "validity_days",
            "subtotal",
            "vat_rate",
            "vat_amount",
            "discount_total",
            "total_amount",
            "approved_at",
            "custom_data",
            "items",
            "created_at",
            "updated_at",
            "company_info",
            "customer_info",
            "has_pending_credit_request",
            "needs_export_request",
            "payment_milestones",
            "payment_receipts",
            "has_production_order",
            "has_pending_export",
            "requires_inventory_export",
            "total_quantity",
            "linked_documents",
        ]
        read_only_fields = [
            "id", "company", "order_number", "status_display", "financial_status_display",
            "paid_amount", "remaining_debt",
            "customer_name", "customer_phone", "customer_address",
            "created_by_name", "approved_by_name", "approved_at",
            "items", "created_at", "updated_at", "company_info", "customer_info", "quotation_detail",
            "has_pending_credit_request",
            "payment_milestones",
            "payment_receipts",
            "needs_export_request",
            "has_production_order",
            "has_pending_export",
            "requires_inventory_export",
            "linked_documents",
        ]

    def get_company_info(self, obj):
        return get_company_info_dict(self, obj)

    def get_customer_info(self, obj):
        if obj.customer:
            if getattr(obj, "customer_name_snapshot", ""):
                return {
                    "name": obj.customer_name_snapshot,
                    "phone": obj.customer_phone_snapshot,
                    "email": obj.customer.email, # we didn't snapshot email, fallback to live
                    "address": obj.customer_address_snapshot,
                    "city": obj.customer_city_snapshot,
                    "company_name": obj.customer_company_snapshot,
                    "tax_code": obj.customer_tax_code_snapshot,
                }
            return {
                "name": obj.customer.name,
                "phone": obj.customer.phone,
                "email": obj.customer.email,
                "address": obj.customer.address,
                "city": obj.customer.city,
                "company_name": getattr(obj.customer, "company_name", "") or "",
                "tax_code": getattr(obj.customer, "tax_code", "") or "",
            }
        return None

    def get_financial_status_display(self, obj):
        display = obj.get_financial_status_display()
        if not getattr(obj, 'requires_inventory_export', True):
            return display.replace(" (Đủ ĐK xuất kho)", "")
        return display

    def get_linked_documents(self, obj):
        # 1. Báo giá (Quotation)
        quotation_data = None
        if obj.quotation_id and getattr(obj, "quotation", None):
            q = obj.quotation
            quotation_data = {
                "id": q.id,
                "code": getattr(q, "quotation_number", None) or getattr(q, "code", None) or f"BG-{q.id}",
                "status": q.status,
                "status_display": q.get_status_display(),
            }

        # 2. Xuất kho (Inventory Export)
        export_data = None
        txns = list(obj.inventory_transactions.all()) if hasattr(obj, "inventory_transactions") else []
        export_txns = [t for t in txns if t.type == "export"]
        if export_txns:
            active_txns = [t for t in export_txns if t.status != "rejected"]
            target_txn = active_txns[-1] if active_txns else export_txns[-1]
            export_data = {
                "id": target_txn.id,
                "code": target_txn.transaction_code or f"XK-{target_txn.id}",
                "status": target_txn.status,
                "status_display": target_txn.get_status_display(),
            }

        # 3. Lệnh sản xuất (Production Order)
        production_data = None
        pos = list(obj.production_orders.all()) if hasattr(obj, "production_orders") else []
        if pos:
            active_pos = [p for p in pos if p.status != "cancelled"]
            target_po = active_pos[-1] if active_pos else pos[-1]
            production_data = {
                "id": target_po.id,
                "code": target_po.production_order_code or f"LSX-{target_po.id}",
                "status": target_po.status,
                "status_display": target_po.get_status_display(),
            }

        # 4. Giao hàng (Delivery Order)
        delivery_data = None
        try:
            d_order = getattr(obj, "delivery_order", None)
            if d_order:
                delivery_data = {
                    "id": d_order.id,
                    "code": d_order.delivery_code or f"GH-{d_order.id}",
                    "status": d_order.status,
                    "status_display": d_order.get_status_display(),
                }
        except Exception:
            pass

        # 5. Bảo hành (Warranty Card)
        warranty_data = None
        try:
            w_card = getattr(obj, "warranty_card", None)
            if w_card:
                warranty_data = {
                    "id": w_card.id,
                    "code": w_card.warranty_code or f"BH-{w_card.id}",
                    "status": w_card.status,
                    "status_display": w_card.get_status_display(),
                }
        except Exception:
            pass

        return {
            "quotation": quotation_data,
            "export": export_data,
            "production": production_data,
            "delivery": delivery_data,
            "warranty": warranty_data,
        }

    def get_has_production_order(self, obj):
        return obj.production_orders.exists()

    def get_customer_name(self, obj):
        if getattr(obj, "customer_name_snapshot", ""): return obj.customer_name_snapshot
        return obj.customer.name if obj.customer else ""
        
    def get_customer_phone(self, obj):
        if getattr(obj, "customer_name_snapshot", ""): return obj.customer_phone_snapshot
        return obj.customer.phone if obj.customer else ""
        
    def get_customer_address(self, obj):
        if getattr(obj, "customer_name_snapshot", ""): return obj.customer_address_snapshot
        return obj.customer.address if obj.customer else ""

    def _is_inventory_active(self, obj):
        """Check nếu module Kho vận đang được bật — đọc FRESH từ DB để tránh ORM cache."""
        try:
            from users.models import CompanySettings
            settings_obj = CompanySettings.objects.get(company_id=obj.company_id)
            modules = settings_obj.active_modules
            if isinstance(modules, str):
                import ast
                try:
                    modules = ast.literal_eval(modules)
                except Exception:
                    modules = [m.strip() for m in modules.split(',') if m.strip()]
            return isinstance(modules, list) and 'inventory' in modules
        except Exception:
            return False

    def get_needs_export_request(self, obj):
        if obj.status != "approved":
            return False
        # Nếu module kho vận không bật, không cần xuất kho
        if not self._is_inventory_active(obj):
            return False
        if not getattr(obj, 'requires_inventory_export', True):
            return False
        try:
            from inventory.models import InventoryTransaction
            active_exports = InventoryTransaction.objects.filter(
                reference_order=obj, type=InventoryTransaction.TYPE_EXPORT
            ).exclude(status=InventoryTransaction.STATUS_REJECTED).exists()
            return not active_exports
        except Exception:
            return False

    def get_has_pending_export(self, obj):
        # Nếu module kho vận không bật, không hiển thị trạng thái chờ xuất kho
        if not self._is_inventory_active(obj):
            return False
        try:
            from inventory.models import InventoryTransaction
            return InventoryTransaction.objects.filter(
                reference_order=obj, type=InventoryTransaction.TYPE_EXPORT, status=InventoryTransaction.STATUS_PENDING
            ).exists()
        except Exception:
            return False

    def get_has_pending_credit_request(self, obj):
        try:
            from approvals.models import ApprovalRequest
            from django.contrib.contenttypes.models import ContentType
            ct = ContentType.objects.get_for_model(obj)
            return ApprovalRequest.objects.filter(
                content_type=ct, 
                object_id=obj.id, 
                status=ApprovalRequest.STATUS_PENDING,
                title__startswith="Duyệt xuất kho nợ"
            ).exists()
        except Exception:
            return False

    def get_total_quantity(self, obj):
        total = 0
        valid_product_ids = set()
        
        for item in obj.items.all():
            if item.item_type != 'product':
                continue
                
            is_custom_size = False
            if isinstance(item.custom_data, dict):
                is_custom_size = item.custom_data.get('is_custom_size', False)
                
            if not is_custom_size:
                is_sales_target = False
                if item.product and item.product.category:
                    is_sales_target = item.product.category.is_sales_target
                
                if not item.product or is_sales_target:
                    total += float(item.quantity)
                    if item.product_id:
                        valid_product_ids.add(item.product_id)
        
        for item in obj.items.all():
            if item.item_type != 'product':
                continue
                
            is_custom_size = False
            if isinstance(item.custom_data, dict):
                is_custom_size = item.custom_data.get('is_custom_size', False)
                
            if is_custom_size:
                actual_product_id = item.custom_data.get('actual_product_id')
                if actual_product_id in valid_product_ids:
                    total += float(item.quantity)
                    
        return total

    @transaction.atomic
    def create(self, validated_data):
        items_data = self.initial_data.get('items')
        instance = super().create(validated_data)
        if items_data is not None and isinstance(items_data, list):
            self._save_items(instance, items_data)
        return instance

    @transaction.atomic
    def update(self, instance, validated_data):
        items_data = self.initial_data.get('items')

        # Kiểm tra xem đơn hàng có phiếu xuất kho nào đang hoạt động (pending hoặc completed) hay không
        active_export = None
        if hasattr(instance, "inventory_transactions"):
            active_export = instance.inventory_transactions.filter(
                type="export"
            ).exclude(status="rejected").first()
        else:
            from inventory.models import InventoryTransaction
            active_export = InventoryTransaction.objects.filter(
                reference_order=instance,
                type=InventoryTransaction.TYPE_EXPORT
            ).exclude(status=InventoryTransaction.STATUS_REJECTED).first()

        if active_export and items_data is not None and isinstance(items_data, list):
            # So sánh xem danh mục sản phẩm, số lượng, quy cách có bị thay đổi không
            old_items = list(instance.items.all().order_by('id'))

            def get_item_sig(it):
                if hasattr(it, 'product_id'):
                    p_id = it.product_id
                    qty = int(it.quantity or 1)
                    itype = str(it.item_type or 'product')
                    uprice = str(it.unit_price or 0)
                else:
                    p_val = it.get('product')
                    p_id = p_val if isinstance(p_val, int) else None
                    qty = int(it.get('quantity', 1) or 1)
                    itype = str(it.get('item_type', 'product'))
                    uprice = str(it.get('unit_price', 0) or 0)
                return (p_id, qty, itype, uprice)

            old_sigs = [get_item_sig(x) for x in old_items]
            new_sigs = [get_item_sig(x) for x in items_data]

            if old_sigs != new_sigs:
                status_display = active_export.get_status_display()
                raise serializers.ValidationError({
                    "items": f"Đơn hàng này đã có Phiếu xuất kho [{active_export.transaction_code}] (Trạng thái: {status_display}). "
                             f"Không thể thay đổi danh mục sản phẩm hoặc số lượng. "
                             f"Vui lòng hủy phiếu xuất kho tại mục Quản lý Kho vận trước khi chỉnh sửa sản phẩm."
                })

        instance = super().update(instance, validated_data)
        if items_data is not None and isinstance(items_data, list):
            if not active_export:
                instance.items.all().delete()
                self._save_items(instance, items_data)
        return instance

    def _save_items(self, order, items_data):
        items_to_create = []
        for it in items_data:
            prod_id = it.get('product')
            if not isinstance(prod_id, int):
                prod_id = None
            
            qty = int(it.get('quantity', 1) or 1)
            u_price = Decimal(str(it.get('unit_price', 0) or 0))
            disc = Decimal(str(it.get('discount_percent', 0) or 0))
            area_val = Decimal(str(it.get('area', 0) or 0))
            custom_d = it.get('custom_data', {}) or {}
            if 'symbol' in it and it.get('symbol') is not None:
                custom_d['symbol'] = it.get('symbol')
            if 'unit' in it and it.get('unit') is not None:
                custom_d['unit'] = it.get('unit')
            unit_str = str(custom_d.get('unit', '') or it.get('unit', '')).lower()
            if ('m2' in unit_str or 'm²' in unit_str) and area_val > 0:
                calc_total = area_val * Decimal(qty) * u_price * (Decimal(1) - disc / Decimal(100))
            else:
                calc_total = Decimal(qty) * u_price * (Decimal(1) - disc / Decimal(100))

            items_to_create.append(OrderItem(
                order=order,
                product_id=prod_id,
                item_type=it.get('item_type', OrderItem.ITEM_TYPE_PRODUCT),
                product_name=it.get('product_name', 'Sản phẩm'),
                unit_price=u_price,
                width=Decimal(str(it.get('width', 0) or 0)),
                height=Decimal(str(it.get('height', 0) or 0)),
                length=Decimal(str(it.get('length', 0) or 0)),
                thickness=Decimal(str(it.get('thickness', 0) or 0)),
                area=area_val,
                quantity=qty,
                discount_percent=disc,
                line_total=Decimal(str(it.get('line_total', calc_total) or calc_total)),
                spec=it.get('spec', '') or '',
                warranty=it.get('warranty', '') or '',
                product_image=it.get('product_image', '') or '',
                note=it.get('note', '') or '',
                custom_data=custom_d,
            ))
        if items_to_create:
            OrderItem.objects.bulk_create(items_to_create)
