from rest_framework import serializers

from .models import DeliveryOrder, WarrantyCard


class DeliveryOrderSerializer(serializers.ModelSerializer):
    order_number = serializers.CharField(source="order.order_number", read_only=True)
    customer_name = serializers.CharField(source="order.customer.name", read_only=True)
    customer_phone = serializers.CharField(source="order.customer.phone", read_only=True)
    order_shipping_address = serializers.CharField(source="order.delivery_address", read_only=True)
    order_remaining_debt = serializers.FloatField(source="order.remaining_debt", read_only=True)
    order_total_amount = serializers.FloatField(source="order.total_amount", read_only=True)
    order_sales_name = serializers.SerializerMethodField()
    order_sales_phone = serializers.SerializerMethodField()
    status_display = serializers.CharField(source="get_status_display", read_only=True)
    has_warranty = serializers.SerializerMethodField()
    factory_id = serializers.SerializerMethodField()
    factory_name = serializers.SerializerMethodField()

    def get_has_warranty(self, obj):
        return hasattr(obj.order, 'warranty_card') and obj.order.warranty_card is not None

    def get_factory_id(self, obj):
        prod = obj.order.production_orders.first()
        return prod.factory_id if prod else None

    def get_factory_name(self, obj):
        prod = obj.order.production_orders.first()
        return prod.factory.name if prod and prod.factory else None

    def get_order_sales_name(self, obj):
        if obj.order and obj.order.customer and obj.order.customer.assigned_to:
            return obj.order.customer.assigned_to.full_name or obj.order.customer.assigned_to.username
        if obj.order and obj.order.created_by:
            return obj.order.created_by.full_name or obj.order.created_by.username
        return None

    def get_order_sales_phone(self, obj):
        if obj.order and obj.order.customer and obj.order.customer.assigned_to:
            return getattr(obj.order.customer.assigned_to, 'phone', None)
        if obj.order and obj.order.created_by:
            return getattr(obj.order.created_by, 'phone', None)
        return None

    def to_representation(self, instance):
        ret = super().to_representation(instance)
        if not ret.get('shipper_name') and instance.shipper_user_id:
            ret['shipper_name'] = instance.shipper_user.full_name or instance.shipper_user.username
            if not ret.get('shipper_phone') and hasattr(instance.shipper_user, 'phone'):
                ret['shipper_phone'] = instance.shipper_user.phone
        return ret

    class Meta:
        model = DeliveryOrder
        fields = [
            "id",
            "company",
            "order",
            "order_number",
            "customer_name",
            "customer_phone",
            "order_shipping_address",
            "order_remaining_debt",
            "order_total_amount",
            "order_sales_name",
            "order_sales_phone",
            "factory_id",
            "factory_name",
            "delivery_code",
            "status",
            "status_display",
            "has_warranty",
            "shipper_user",
            "shipper_name",
            "shipper_phone",
            "shipping_address",
            "delivery_map_link",
            "expected_date",
            "actual_date",
            "notes",
            "created_at",
            "updated_at",
        ]
        read_only_fields = ["id", "company", "delivery_code", "status_display", "created_at", "updated_at"]


class WarrantyCardSerializer(serializers.ModelSerializer):
    order_number = serializers.CharField(source="order.order_number", read_only=True)
    customer_name = serializers.CharField(source="customer.name", read_only=True)
    customer_phone = serializers.CharField(source="customer.phone", read_only=True)
    status_display = serializers.CharField(source="get_status_display", read_only=True)
    customer = serializers.PrimaryKeyRelatedField(read_only=True)
    status = serializers.CharField(read_only=True)

    class Meta:
        model = WarrantyCard
        fields = [
            "id",
            "company",
            "order",
            "order_number",
            "customer",
            "customer_name",
            "customer_phone",
            "warranty_code",
            "status",
            "status_display",
            "start_date",
            "end_date",
            "terms",
            "warranty_content",
            "warranty_rules",
            "created_at",
            "updated_at",
        ]
        read_only_fields = ["id", "company", "warranty_code", "status_display", "created_at", "updated_at"]

    def to_representation(self, instance):
        ret = super().to_representation(instance)
        from django.utils import timezone
        if ret.get("status") == "active" and instance.end_date and instance.end_date < timezone.now().date():
            ret["status"] = "expired"
            ret["status_display"] = "Hết hạn"
        return ret
