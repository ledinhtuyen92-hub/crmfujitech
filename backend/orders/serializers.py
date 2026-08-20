from rest_framework import serializers

from .models import Order, OrderItem
from finance.serializers import OrderPaymentMilestoneSerializer


class OrderItemSerializer(serializers.ModelSerializer):
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
        ]
        read_only_fields = ["id", "line_total"]

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
    financial_status_display = serializers.CharField(source="get_financial_status_display", read_only=True)
    payment_target_display = serializers.CharField(source="get_payment_target_display", read_only=True)
    paid_amount = serializers.FloatField(read_only=True)
    remaining_debt = serializers.FloatField(read_only=True)
    company_info = serializers.SerializerMethodField()
    customer_info = serializers.SerializerMethodField()
    has_pending_credit_request = serializers.SerializerMethodField()
    payment_milestones = OrderPaymentMilestoneSerializer(many=True, read_only=True)
    needs_export_request = serializers.SerializerMethodField()
    has_production_order = serializers.SerializerMethodField()
    has_pending_export = serializers.SerializerMethodField()

    class Meta:
        model = Order
        fields = [
            "id",
            "company",
            "order_number",
            "customer",
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
            "has_production_order",
            "has_pending_export",
        ]
        read_only_fields = [
            "id", "company", "order_number", "status_display", "financial_status_display",
            "paid_amount", "remaining_debt",
            "customer_name", "customer_phone", "customer_address",
            "created_by_name", "approved_by_name", "approved_at",
            "items", "created_at", "updated_at", "company_info", "customer_info", "quotation_detail",
            "has_pending_credit_request",
            "payment_milestones",
            "needs_export_request",
            "has_production_order",
            "has_pending_export",
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
