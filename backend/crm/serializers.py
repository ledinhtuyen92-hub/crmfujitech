from rest_framework import serializers

from users.models import User
from .models import Customer, CustomerContact, CustomerInteraction, CustomerTag, InteractionAttachment


class CustomerTagSerializer(serializers.ModelSerializer):
    class Meta:
        model = CustomerTag
        fields = ["id", "name", "color"]
        read_only_fields = ["id"]


class CustomerContactSerializer(serializers.ModelSerializer):
    class Meta:
        model = CustomerContact
        fields = ["id", "customer", "name", "phone", "email", "position"]
        read_only_fields = ["id"]


class InteractionAttachmentSerializer(serializers.ModelSerializer):
    class Meta:
        model = InteractionAttachment
        fields = ["id", "interaction", "file", "file_name", "file_size", "uploaded_at"]
        read_only_fields = ["id", "uploaded_at", "interaction"]


class CustomerInteractionSerializer(serializers.ModelSerializer):
    type_display = serializers.CharField(source="get_type_display", read_only=True)
    result_display = serializers.CharField(source="get_result_display", read_only=True)
    created_by_name = serializers.CharField(source="created_by.full_name", read_only=True)
    attachments = InteractionAttachmentSerializer(many=True, read_only=True)

    class Meta:
        model = CustomerInteraction
        fields = [
            "id",
            "customer",
            "created_by",
            "created_by_name",
            "type",
            "type_display",
            "content",
            "result",
            "result_display",
            "next_follow_up",
            "attachments",
            "created_at",
        ]
        read_only_fields = ["id", "created_by", "created_at", "type_display", "result_display", "created_by_name", "attachments"]


class AssignedUserSerializer(serializers.Serializer):
    """Serializer nhỏ để trả về thông tin nhân viên được phân công."""
    id = serializers.IntegerField()
    full_name = serializers.CharField()
    username = serializers.CharField()


class CustomerSerializer(serializers.ModelSerializer):
    source = serializers.CharField(max_length=100, required=False, allow_blank=True, allow_null=True)
    contacts = CustomerContactSerializer(many=True, read_only=True)
    interactions = CustomerInteractionSerializer(many=True, read_only=True)
    tags = CustomerTagSerializer(many=True, read_only=True)
    tag_ids = serializers.PrimaryKeyRelatedField(
        queryset=CustomerTag.objects.all(),
        many=True,
        write_only=True,
        required=False,
        source="tags",
    )
    # Đọc: trả về object {id, full_name, username}
    assigned_to = AssignedUserSerializer(read_only=True)
    # Ghi: nhận ID nhân viên
    assigned_to_id = serializers.PrimaryKeyRelatedField(
        queryset=User.objects.all(),
        source="assigned_to",
        write_only=True,
        required=False,
        allow_null=True,
    )
    assigned_to_name = serializers.CharField(source="assigned_to.full_name", read_only=True)
    created_by = AssignedUserSerializer(read_only=True)
    created_by_name = serializers.CharField(source="created_by.full_name", read_only=True, allow_null=True)
    status_display = serializers.SerializerMethodField()
    source_display = serializers.CharField(source="get_source_display", read_only=True)
    quotation_count = serializers.IntegerField(read_only=True)
    order_count = serializers.IntegerField(read_only=True)
    interaction_count = serializers.IntegerField(read_only=True)

    class Meta:
        model = Customer
        fields = [
            "id",
            "company",
            "name",
            "company_name",
            "tax_code",
            "phone",
            "email",
            "address",
            "city",
            "birthday",
            "expected_quantity",
            "source",
            "source_display",
            "status",
            "status_display",
            "priority_level",
            "is_inactive",
            "tags",
            "tag_ids",
            "assigned_to",
            "assigned_to_id",
            "assigned_to_name",
            "created_by",
            "created_by_name",
            "notes",
            "contacts",
            "interactions",
            "created_at",
            "updated_at",
            "quotation_count",
            "order_count",
            "interaction_count",
        ]
        read_only_fields = [
            "id", "company", "contacts", "interactions", "tags",
            "assigned_to", "assigned_to_name", "created_by", "created_by_name",
            "status_display", "source_display",
            "created_at", "updated_at",
        ]

    def get_status_display(self, obj):
        if obj.company and hasattr(obj.company, 'settings') and obj.company.settings.pipeline_status_labels:
            custom_label = obj.company.settings.pipeline_status_labels.get(obj.status)
            if custom_label:
                return custom_label
        return obj.get_status_display()

    def validate_status(self, value):
        if self.instance and self.instance.pk:
            # If status hasn't changed, no need to validate
            if value == self.instance.status:
                return value
                
            from orders.models import Order
            valid_orders_count = self.instance.orders.exclude(
                status__in=[Order.STATUS_CANCELLED, Order.STATUS_REJECTED]
            ).count()
            
            if valid_orders_count > 0:
                raise serializers.ValidationError(
                    "Khách hàng này đã có đơn hàng trên hệ thống. KHÔNG ĐƯỢC PHÉP thay đổi trạng thái thủ công để tránh sai lệch dữ liệu."
                )
                
            if value in [Customer.STATUS_HAS_ORDER, Customer.STATUS_REPEAT_ORDER]:
                raise serializers.ValidationError(
                    "Trạng thái 'Đã có đơn hàng' và 'Mua thêm đơn hàng' là trạng thái được hệ thống TỰ ĐỘNG CẬP NHẬT. Bạn không được phép đổi thủ công."
                )
                
            return value
            
        if value in [Customer.STATUS_HAS_ORDER, Customer.STATUS_REPEAT_ORDER]:
            raise serializers.ValidationError(
                "Không thể tạo mới khách hàng với trạng thái này."
            )
        return value
    def validate_phone(self, value):
        request = self.context.get("request")
        if request and hasattr(request, "user"):
            company = request.user.company
            qs = Customer.objects.filter(company=company, phone=value)
            if self.instance:
                qs = qs.exclude(pk=self.instance.pk)
            if qs.exists():
                raise serializers.ValidationError("Số điện thoại này đã tồn tại trong hệ thống khách hàng của bạn.")
        return value

