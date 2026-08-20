from rest_framework import serializers

from .models import (
    InventoryTransaction, Product, ProductCategory, StockLevel, Warehouse,
    ProductTemplate, ProductAttribute, ProductAttributeValue
)
from sales.serializers import get_company_info_dict


class ProductCategorySerializer(serializers.ModelSerializer):
    class Meta:
        model = ProductCategory
        fields = ["id", "company", "name", "description", "category_type"]
        read_only_fields = ["id", "company"]


class ProductAttributeValueSerializer(serializers.ModelSerializer):
    class Meta:
        model = ProductAttributeValue
        fields = ["id", "attribute", "value"]


class ProductAttributeSerializer(serializers.ModelSerializer):
    values = ProductAttributeValueSerializer(many=True, read_only=True)

    class Meta:
        model = ProductAttribute
        fields = ["id", "company", "name", "values"]
        read_only_fields = ["id", "company"]


class ProductTemplateSerializer(serializers.ModelSerializer):
    class Meta:
        model = ProductTemplate
        fields = ["id", "company", "name", "sku", "description", "product_type", "category", "image", "created_at", "updated_at"]
        read_only_fields = ["id", "company", "created_at", "updated_at"]


class ProductSerializer(serializers.ModelSerializer):
    category_name = serializers.CharField(source="category.name", read_only=True)
    template_name = serializers.CharField(source="template.name", read_only=True)
    unit_display = serializers.CharField(source="get_unit_display", read_only=True)
    image_url = serializers.SerializerMethodField()
    sku = serializers.CharField(max_length=100, required=False, allow_blank=True, allow_null=True)

    class Meta:
        model = Product
        fields = [
            "id",
            "company",
            "template",
            "template_name",
            "category",
            "category_name",
            "sku",
            "name",
            "product_type",
            "description",
            "ai_knowledge",
            "attributes",
            "unit",
            "unit_display",
            "price",
            "cost_price",
            "image",
            "image_url",
            "is_active",
            "created_at",
            "updated_at",
        ]
        read_only_fields = ["id", "company", "category_name", "template_name", "unit_display", "image_url", "created_at", "updated_at"]

    def get_image_url(self, obj):
        request = self.context.get("request")
        if obj.image:
            try:
                return request.build_absolute_uri(obj.image.url) if request else obj.image.url
            except Exception:
                return obj.image.url
        return None

    def validate_sku(self, value):
        if value == "":
            return None
        return value


class WarehouseSerializer(serializers.ModelSerializer):
    class Meta:
        model = Warehouse
        fields = ["id", "company", "name", "location", "is_active"]
        read_only_fields = ["id", "company"]


class StockLevelSerializer(serializers.ModelSerializer):
    product_name = serializers.CharField(source="product.name", read_only=True)
    product_sku = serializers.CharField(source="product.sku", read_only=True)
    warehouse_name = serializers.CharField(source="warehouse.name", read_only=True)
    is_low_stock = serializers.BooleanField(read_only=True)

    class Meta:
        model = StockLevel
        fields = [
            "id",
            "product",
            "product_name",
            "product_sku",
            "warehouse",
            "warehouse_name",
            "quantity",
            "min_quantity",
            "is_low_stock",
        ]
        read_only_fields = [
            "id", "product_name", "product_sku",
            "warehouse_name", "is_low_stock",
        ]


class InventoryTransactionSerializer(serializers.ModelSerializer):
    type_display = serializers.CharField(source="get_type_display", read_only=True)
    status_display = serializers.CharField(source="get_status_display", read_only=True)
    product_name = serializers.SerializerMethodField()
    product_sku = serializers.CharField(source="product.sku", read_only=True)
    warehouse_name = serializers.CharField(source="warehouse.name", read_only=True)
    target_warehouse_name = serializers.CharField(source="target_warehouse.name", read_only=True)
    created_by_name = serializers.CharField(source="created_by.get_full_name", read_only=True)
    reference_order_number = serializers.CharField(source="reference_order.order_number", read_only=True)
    company_info = serializers.SerializerMethodField()
    factory_name = serializers.CharField(source="factory.name", read_only=True, allow_null=True)
    has_production_order = serializers.SerializerMethodField()
    production_order_code = serializers.SerializerMethodField()

    class Meta:
        model = InventoryTransaction
        fields = [
            "id",
            "company",
            "transaction_code",
            "type",
            "type_display",
            "status",
            "status_display",
            "product",
            "product_name",
            "product_sku",
            "warehouse",
            "warehouse_name",
            "target_warehouse",
            "target_warehouse_name",
            "quantity",
            "unit_cost",
            "reference_order",
            "reference_order_number",
            "note",
            "created_by",
            "created_by_name",
            "created_at",
            "company_info",
            "factory_name",
            "has_production_order",
            "production_order_code",
        ]
        read_only_fields = [
            "id", "company", "transaction_code", "type_display", "status_display", "product_name", "product_sku",
            "warehouse_name", "target_warehouse_name", "created_by", "created_by_name", "created_at", "company_info",
            "reference_order_number", "factory_name", "has_production_order", "production_order_code",
        ]

    def validate(self, data):
        txn_type = data.get('type')
        warehouse = data.get('warehouse')
        target_warehouse = data.get('target_warehouse')
        quantity = data.get('quantity', 0)
        product = data.get('product')

        if txn_type == InventoryTransaction.TYPE_TRANSFER:
            if not warehouse:
                raise serializers.ValidationError({"warehouse": "Vui lòng chọn Kho xuất."})
            if not target_warehouse:
                raise serializers.ValidationError({"target_warehouse": "Vui lòng chọn Kho nhận."})
            if warehouse.id == target_warehouse.id:
                raise serializers.ValidationError({"target_warehouse": "Kho xuất và Kho nhận không được trùng nhau."})
            
            # Check stock
            from .models import StockLevel
            stock = StockLevel.objects.filter(warehouse=warehouse, product=product).first()
            if not stock or stock.quantity < quantity:
                raise serializers.ValidationError({"quantity": f"Số lượng tồn kho không đủ. Tồn kho hiện tại: {stock.quantity if stock else 0}"})
        
        return data

    def get_company_info(self, obj):
        return get_company_info_dict(self, obj)

    def get_product_name(self, obj):
        if hasattr(obj, 'custom_product_name') and obj.custom_product_name:
            return obj.custom_product_name
        return obj.product.name if obj.product else ""

    def get_has_production_order(self, obj):
        """Trả về True nếu phiếu xuất kho đã hoàn thành và có lệnh SX liên kết."""
        if obj.type != obj.TYPE_EXPORT or obj.status != obj.STATUS_COMPLETED:
            return None  # Chỉ áp dụng cho phiếu xuất đã hoàn thành
        if not obj.reference_order:
            return None
        return obj.reference_order.production_orders.exists()

    def get_production_order_code(self, obj):
        """Trả về mã lệnh SX liên kết (nếu có)."""
        if obj.type != obj.TYPE_EXPORT or obj.status != obj.STATUS_COMPLETED:
            return None
        if not obj.reference_order:
            return None
        po = obj.reference_order.production_orders.first()
        return po.production_order_code if po else None
