from rest_framework import serializers

from .models import (
    SocialLead, ZaloMessageLog, ZaloMessageTemplate, ZaloOaConfig, ZaloMessage,
    ZaloLeadTag, ZaloLeadNote, ZaloQuickReply
)


# ── ZaloLeadTag & Note & QuickReply Serializers ──────────────────────────────

class ZaloLeadTagSerializer(serializers.ModelSerializer):
    class Meta:
        model = ZaloLeadTag
        fields = ["id", "name", "color", "created_at"]


class ZaloLeadNoteSerializer(serializers.ModelSerializer):
    user_name = serializers.CharField(source="user.get_full_name", read_only=True, default="Nội bộ")

    class Meta:
        model = ZaloLeadNote
        fields = ["id", "lead", "user", "user_name", "content", "created_at"]
        read_only_fields = ["id", "user", "created_at"]


class ZaloQuickReplySerializer(serializers.ModelSerializer):
    created_by_name = serializers.CharField(source="created_by.get_full_name", read_only=True, default=None)

    class Meta:
        model = ZaloQuickReply
        fields = ["id", "company", "shortcut", "title", "content", "created_by", "created_by_name", "created_at"]
        read_only_fields = ["id", "company", "created_by", "created_at"]


# ── ZaloOaConfig ─────────────────────────────────────────────────────────────

class ZaloOaConfigSerializer(serializers.ModelSerializer):
    is_token_near_expiry = serializers.BooleanField(read_only=True)
    token_expires_at_display = serializers.SerializerMethodField()
    resolved_app_id = serializers.CharField(source='get_app_id', read_only=True)

    class Meta:
        model = ZaloOaConfig
        fields = [
            "id", "oa_name", "use_system_config", "app_id", "resolved_app_id", "oa_id", "secret_key",
            "access_token", "refresh_token", "token_expires_at",
            "token_expires_at_display", "is_token_near_expiry",
            "webhook_secret", "auto_send_payment_zns", "auto_send_delivery_zns", 
            "auto_send_birthday_zns", "auto_create_customer_from_phone", "auto_assign_lead_to_customer_assignee", "lead_cleanup_days",
            "request_phone_template", "request_email_template", "is_active", "ai_agent", "is_ai_active",
            "created_at", "updated_at",
        ]
        read_only_fields = ["id", "company", "created_at", "updated_at",
                            "is_token_near_expiry", "token_expires_at_display"]
        extra_kwargs = {
            "access_token": {"write_only": True},
            "refresh_token": {"write_only": True},
        }

    def get_token_expires_at_display(self, obj):
        if not obj.is_active or not obj.access_token:
            return "Trống (Đã ngắt kết nối)"
        if obj.token_expires_at:
            import django.utils.timezone as tz
            local_dt = obj.token_expires_at.astimezone(tz.get_current_timezone())
            return local_dt.strftime("%d/%m/%Y %H:%M")
        return None


class ZaloOaConfigWriteSerializer(serializers.ModelSerializer):
    """Dùng để tạo/cập nhật cấu hình OA."""
    class Meta:
        model = ZaloOaConfig
        fields = [
            "oa_name", "use_system_config", "app_id", "secret_key", "oa_id",
            "access_token", "refresh_token", "token_expires_at",
            "webhook_secret", "auto_send_payment_zns", "auto_send_delivery_zns", 
            "auto_send_birthday_zns", "auto_create_customer_from_phone", "auto_assign_lead_to_customer_assignee", "lead_cleanup_days",
            "request_phone_template", "request_email_template", "is_active", "ai_agent", "is_ai_active"
        ]

    def validate(self, attrs):
        # Nếu dùng cấu hình hệ thống, xóa trống các trường cấu hình riêng để tránh lộ/nhầm lẫn dữ liệu
        if attrs.get('use_system_config', False):
            attrs['app_id'] = ""
            attrs['secret_key'] = ""
            attrs['webhook_secret'] = ""
        if attrs.get("access_token") and not attrs.get("token_expires_at"):
            from django.utils import timezone
            from datetime import timedelta
            attrs["token_expires_at"] = timezone.now() + timedelta(hours=25)
        return attrs


def check_and_sync_converted_zalo(obj):
    from crm.models import Customer
    cust = getattr(obj, "converted_customer", None)
    if cust:
        if Customer.objects.filter(id=cust.id).exists():
            needs_save = False
            if not obj.is_customer_converted:
                obj.is_customer_converted = True
                needs_save = True
            auto_assign = obj.oa_config.auto_assign_lead_to_customer_assignee if hasattr(obj, "oa_config") and obj.oa_config else True
            if auto_assign and cust.assigned_to and not obj.assigned_to:
                obj.assigned_to = cust.assigned_to
                needs_save = True
            if needs_save:
                obj.save(update_fields=["is_customer_converted", "assigned_to", "updated_at"])
            return True, cust.id, cust.name
        else:
            obj.is_customer_converted = False
            obj.save(update_fields=["is_customer_converted", "updated_at"])
            return False, None, None

    if getattr(obj, "company_id", None) and obj.detected_phone:
        cust = Customer.objects.filter(company_id=obj.company_id, phone=obj.detected_phone).first()
        if cust:
            needs_save = False
            if not obj.is_customer_converted:
                obj.is_customer_converted = True
                needs_save = True
            auto_assign = obj.oa_config.auto_assign_lead_to_customer_assignee if hasattr(obj, "oa_config") and obj.oa_config else True
            if auto_assign and cust.assigned_to and not obj.assigned_to:
                obj.assigned_to = cust.assigned_to
                needs_save = True
            if needs_save:
                obj.save(update_fields=["is_customer_converted", "assigned_to", "updated_at"])
            # Auto-link the customer relation
            try:
                cust.social_lead = obj
                cust.save(update_fields=["social_lead"])
            except:
                pass
            return True, cust.id, cust.name

    if obj.is_customer_converted:
        obj.is_customer_converted = False
        obj.save(update_fields=["is_customer_converted", "updated_at"])
    return False, None, None


# ── SocialLead ───────────────────────────────────────────────────────────────

class SocialLeadListSerializer(serializers.ModelSerializer):
    """Serializer gọn cho danh sách (Inbox view)."""
    assigned_to_name = serializers.CharField(
        source="assigned_to.get_full_name", read_only=True, default=None
    )
    oa_name = serializers.CharField(source="oa_config.oa_name", read_only=True, default=None)
    status_display = serializers.CharField(source="get_status_display", read_only=True)
    platform_display = serializers.CharField(source="get_platform_display", read_only=True)
    is_converted = serializers.SerializerMethodField()
    is_customer_converted = serializers.SerializerMethodField()
    unread_count = serializers.SerializerMethodField()
    tags = ZaloLeadTagSerializer(many=True, read_only=True)

    class Meta:
        model = SocialLead
        fields = [
            "id", "social_id", "display_name", "avatar_url",
            "platform", "platform_display", "oa_name", "oa_config",
            "last_message", "last_interaction_date", "ai_summary", "ai_tags",
            "status", "status_display",
            "assigned_to", "assigned_to_name",
            "is_converted", "detected_phone", "detected_email", "detected_address",
            "is_customer_converted", "is_starred", "tags",
            "created_at", "has_unread_message", "unread_count", "is_ai_active"
        ]

    def get_is_converted(self, obj):
        return obj.status == SocialLead.STATUS_CONVERTED

    def get_is_customer_converted(self, obj):
        converted, _, _ = check_and_sync_converted_zalo(obj)
        return converted

    def get_unread_count(self, obj):
        count = getattr(obj, "unread_count", 0) or 0
        if count == 0 and getattr(obj, "has_unread_message", False):
            return 1
        return count


class SocialLeadDetailSerializer(serializers.ModelSerializer):
    """Serializer đầy đủ cho màn hình chi tiết / Inbox."""
    assigned_to_name = serializers.CharField(
        source="assigned_to.get_full_name", read_only=True, default=None
    )
    oa_name = serializers.CharField(source="oa_config.oa_name", read_only=True, default=None)
    status_display = serializers.CharField(source="get_status_display", read_only=True)
    platform_display = serializers.CharField(source="get_platform_display", read_only=True)
    converted_customer_id = serializers.SerializerMethodField()
    converted_customer_name = serializers.SerializerMethodField()
    is_customer_converted = serializers.SerializerMethodField()
    unread_count = serializers.SerializerMethodField()
    tags = ZaloLeadTagSerializer(many=True, read_only=True)
    internal_notes = ZaloLeadNoteSerializer(many=True, read_only=True)

    class Meta:
        model = SocialLead
        fields = [
            "id", "social_id", "display_name", "avatar_url",
            "platform", "platform_display", "oa_name", "oa_config",
            "last_message", "last_interaction_date", "ai_summary", "ai_tags",
            "status", "status_display",
            "assigned_to", "assigned_to_name",
            "notes",
            "converted_customer_id", "converted_customer_name", "has_unread_message", "unread_count",
            "detected_phone", "detected_email", "detected_address",
            "is_customer_converted", "is_starred", "tags", "internal_notes",
            "created_at", "updated_at", "is_ai_active"
        ]

    def get_is_customer_converted(self, obj):
        converted, _, _ = check_and_sync_converted_zalo(obj)
        return converted

    def get_unread_count(self, obj):
        count = getattr(obj, "unread_count", 0) or 0
        if count == 0 and getattr(obj, "has_unread_message", False):
            return 1
        return count

    def get_converted_customer_id(self, obj):
        _, cid, _ = check_and_sync_converted_zalo(obj)
        return cid

    def get_converted_customer_name(self, obj):
        _, _, cname = check_and_sync_converted_zalo(obj)
        return cname


class SocialLeadUpdateSerializer(serializers.ModelSerializer):
    """Dùng để cập nhật note và phân công nhân viên."""
    class Meta:
        model = SocialLead
        fields = ["assigned_to", "notes", "is_ai_active"]


class ConvertLeadSerializer(serializers.Serializer):
    """Dùng cho action convert SocialLead -> Customer."""
    phone_number = serializers.CharField(max_length=20)
    customer_name = serializers.CharField(max_length=255, required=False, allow_blank=True)
    assigned_to = serializers.IntegerField(required=False, allow_null=True)
    email = serializers.CharField(max_length=255, required=False, allow_blank=True)
    address = serializers.CharField(max_length=500, required=False, allow_blank=True)

    def validate_phone_number(self, value):
        from zalo_integration.services import normalize_phone
        normalized = normalize_phone(value)
        if len(normalized) < 10:
            raise serializers.ValidationError("Số điện thoại không hợp lệ.")
        return normalized


# ── ZaloMessageTemplate ───────────────────────────────────────────────────────

class ZaloMessageTemplateSerializer(serializers.ModelSerializer):
    template_type_display = serializers.CharField(source="get_template_type_display", read_only=True)

    class Meta:
        model = ZaloMessageTemplate
        fields = [
            "id", "name", "zalo_template_id", "template_type",
            "template_type_display", "content_preview", "params_schema",
            "is_active", "created_at", "updated_at",
        ]
        read_only_fields = ["id", "company", "created_at", "updated_at", "template_type_display"]


class SendZNSSerializer(serializers.Serializer):
    """Dùng để gửi ZNS từ API."""
    template_id = serializers.IntegerField()
    recipient_phone = serializers.CharField(max_length=20)
    recipient_zalo_id = serializers.CharField(max_length=255, required=False, allow_blank=True)
    params = serializers.DictField(child=serializers.CharField(), default=dict)
    social_lead_id = serializers.IntegerField(required=False, allow_null=True)
    customer_id = serializers.IntegerField(required=False, allow_null=True)

    def validate_recipient_phone(self, value):
        from zalo_integration.services import normalize_phone
        return normalize_phone(value)


class BulkSendZNSSerializer(serializers.Serializer):
    template_id = serializers.IntegerField()
    customer_ids = serializers.ListField(child=serializers.IntegerField(), allow_empty=False)
    params = serializers.DictField(child=serializers.CharField(), default=dict)


# ── ZaloMessageLog ────────────────────────────────────────────────────────────

class ZaloMessageLogSerializer(serializers.ModelSerializer):
    status_display = serializers.CharField(source="get_status_display", read_only=True)
    template_name = serializers.CharField(source="template.name", read_only=True, default=None)

    class Meta:
        model = ZaloMessageLog
        fields = [
            "id", "template_name", "recipient_phone", "recipient_zalo_id",
            "params_sent", "status", "status_display",
            "zalo_msg_id", "error_message", "sent_at",
            "social_lead", "customer",
        ]
        read_only_fields = fields


# ── ZaloMessage (Live Chat) ──────────────────────────────────────────────────

class ZaloMessageSerializer(serializers.ModelSerializer):
    sender_name = serializers.SerializerMethodField()

    class Meta:
        model = ZaloMessage
        fields = [
            "id", "social_lead", "direction", "content",
            "attachment_url", "attachment_type", "payload", "zalo_msg_id",
            "sender_user", "sender_role", "sender_name", "created_at",
        ]
        read_only_fields = ["id", "social_lead", "direction", "zalo_msg_id", "created_at"]

    def get_sender_name(self, obj):
        if obj.direction == ZaloMessage.DIRECTION_INBOUND:
            return obj.social_lead.display_name
        if obj.sender_name:
            return obj.sender_name
        if obj.sender_user:
            return getattr(obj.sender_user, 'fullname', obj.sender_user.username)
        return "Hệ thống"
