from rest_framework import serializers

from .models import Factory, ProductionOrder, ProductionStep


class FactorySerializer(serializers.ModelSerializer):
    company = serializers.PrimaryKeyRelatedField(read_only=True)
    linked_warehouse_name = serializers.CharField(source="linked_warehouse.name", read_only=True)

    class Meta:
        model = Factory
        fields = [
            "id",
            "company",
            "name",
            "location",
            "linked_warehouse",
            "linked_warehouse_name",
            "is_active",
        ]

class ProductionStepSerializer(serializers.ModelSerializer):
    status_display = serializers.CharField(source="get_status_display", read_only=True)
    assigned_to_name = serializers.CharField(source="assigned_to.full_name", read_only=True)

    class Meta:
        model = ProductionStep
        fields = [
            "id",
            "production_order",
            "step_name",
            "sequence",
            "assigned_to",
            "assigned_to_name",
            "status",
            "status_display",
            "started_at",
            "completed_at",
            "notes",
        ]
        read_only_fields = ["id", "status_display", "assigned_to_name"]


class ProductionOrderSerializer(serializers.ModelSerializer):
    steps = ProductionStepSerializer(many=True, read_only=True)
    status_display = serializers.CharField(source="get_status_display", read_only=True)
    order_number = serializers.CharField(source="order.order_number", read_only=True)
    factory_name = serializers.CharField(source="factory.name", read_only=True, default=None)
    delivery_status = serializers.SerializerMethodField()
    export_transaction_code = serializers.SerializerMethodField()

    class Meta:
        model = ProductionOrder
        fields = [
            "id",
            "company",
            "order",
            "production_order_code",
            "order_number",
            "export_transaction_code",
            "factory",
            "factory_name",
            "status",
            "status_display",
            "delivery_status",
            "start_date",
            "end_date",
            "notes",
            "steps",
            "created_at",
            "updated_at",
        ]
        read_only_fields = [
            "id", "company", "production_order_code", "order_number", "factory_name",
            "status_display", "delivery_status", "created_at", "updated_at"
        ]

    def validate(self, data):
        start_date = data.get('start_date') or (self.instance.start_date if self.instance else None)
        end_date = data.get('end_date') or (self.instance.end_date if self.instance else None)

        if start_date and end_date and start_date > end_date:
            raise serializers.ValidationError({
                "end_date": "Ngày kết thúc dự kiến không được trước ngày bắt đầu sản xuất."
            })
        return data

    def get_delivery_status(self, obj):
        if obj.order and hasattr(obj.order, 'delivery_order'):
            return obj.order.delivery_order.status
        return None

    def get_export_transaction_code(self, obj):
        if obj.order:
            # Import inside to avoid circular import if necessary
            from inventory.models import InventoryTransaction
            txn = InventoryTransaction.objects.filter(
                reference_order=obj.order, type=InventoryTransaction.TYPE_EXPORT
            ).order_by('-created_at').first()
            if txn:
                return txn.transaction_code
        return None
