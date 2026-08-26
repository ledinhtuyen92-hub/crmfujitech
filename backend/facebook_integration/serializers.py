from rest_framework import serializers

from .models import (
    FacebookPageConfig, FacebookLead, FacebookMessage, QuickMediaAsset,
    FacebookLeadTag, FacebookLeadNote, FacebookQuickReply,
)


# ── FacebookLeadTag ───────────────────────────────────────────────────────────

class FacebookLeadTagSerializer(serializers.ModelSerializer):
    class Meta:
        model = FacebookLeadTag
        fields = ["id", "company", "name", "color", "created_at"]
        read_only_fields = ["id", "company", "created_at"]


# ── FacebookLeadNote ──────────────────────────────────────────────────────────

class FacebookLeadNoteSerializer(serializers.ModelSerializer):
    user_name = serializers.CharField(source="user.full_name", read_only=True, default="Hệ thống")
    user_avatar = serializers.URLField(source="user.avatar_url", read_only=True, default=None)

    class Meta:
        model = FacebookLeadNote
        fields = ["id", "lead", "user", "user_name", "user_avatar", "content", "created_at"]
        read_only_fields = ["id", "user", "created_at"]


# ── FacebookQuickReply ────────────────────────────────────────────────────────

class FacebookQuickReplySerializer(serializers.ModelSerializer):
    created_by_name = serializers.CharField(source="created_by.full_name", read_only=True, default="")

    class Meta:
        model = FacebookQuickReply
        fields = ["id", "company", "shortcut", "title", "content", "created_by", "created_by_name", "created_at"]
        read_only_fields = ["id", "company", "created_by", "created_at"]


# ── FacebookPageConfig ────────────────────────────────────────────────────────

class FacebookPageConfigSerializer(serializers.ModelSerializer):
    is_token_valid = serializers.BooleanField(read_only=True)
    is_token_near_expiry = serializers.BooleanField(read_only=True)
    resolved_app_id = serializers.CharField(source='get_app_id', read_only=True)
    assigned_to_name = serializers.CharField(source="assigned_to.full_name", read_only=True, default="")
    token_expires_at_display = serializers.SerializerMethodField()

    class Meta:
        model = FacebookPageConfig
        fields = [
            "id", "page_name", "page_id",
            "use_system_config", "app_id", "resolved_app_id",
            "page_access_token", "token_expires_at", "token_expires_at_display",
            "is_token_valid", "is_token_near_expiry",
            "webhook_verify_token", "page_avatar", "is_active",
            "auto_create_customer_from_phone", "lead_cleanup_days",
            "request_phone_template", "request_email_template",
            "assigned_to", "assigned_to_name", "ai_agent", "is_ai_active",
            "created_at", "updated_at",
        ]
        read_only_fields = ["id", "created_at", "updated_at", "is_token_valid", "is_token_near_expiry"]
        extra_kwargs = {
            "page_access_token": {"write_only": True, "required": False},
        }

    def get_token_expires_at_display(self, obj):
        if not obj.token_expires_at:
            return "Không hết hạn / Chưa rõ"
        from django.utils.timezone import localtime
        return localtime(obj.token_expires_at).strftime("%d/%m/%Y %H:%M")


# ── FacebookMessage ───────────────────────────────────────────────────────────

class FacebookMessageSerializer(serializers.ModelSerializer):
    class Meta:
        model = FacebookMessage
        fields = [
            "id", "fb_message_id", "sender_type", "sender_role", "sender_name", "text",
            "attachment_url", "attachment_type", "payload", "created_at",
        ]
        read_only_fields = ["id", "created_at"]


# ── FacebookLead ──────────────────────────────────────────────────────────────

def check_and_sync_converted_fb(obj):
    from crm.models import Customer
    company_id = getattr(obj, "company_id", None) or (obj.page_config.company_id if hasattr(obj, "page_config") and obj.page_config else None)
    
    # 1. Kiểm tra nếu có customer_id, xem Customer đó có thực sự tồn tại trong DB không
    if obj.customer_id:
        cust = Customer.objects.filter(id=obj.customer_id).first()
        if cust:
            return True, cust.name
        else:
            obj.customer = None
            obj.is_customer_converted = False
            obj.save(update_fields=["customer", "is_customer_converted", "updated_at"])
            return False, None

    # 2. Nếu không có customer_id nhưng có detected_phone, kiểm tra xem SĐT đã tồn tại trong CRM chưa
    if company_id and obj.detected_phone:
        cust = Customer.objects.filter(company_id=company_id, phone=obj.detected_phone).first()
        if cust:
            if not obj.is_customer_converted or obj.customer_id != cust.id:
                obj.customer = cust
                obj.is_customer_converted = True
                obj.save(update_fields=["customer", "is_customer_converted", "updated_at"])
            return True, cust.name

    # 3. Nếu không có customer và cũng không khớp SĐT, clear trạng thái nếu đang bị True giả
    if obj.is_customer_converted:
        obj.is_customer_converted = False
        obj.customer = None
        obj.save(update_fields=["customer", "is_customer_converted", "updated_at"])
    return False, None


class FacebookLeadSerializer(serializers.ModelSerializer):
    status = serializers.CharField(read_only=True)
    page_name = serializers.CharField(source="page_config.page_name", read_only=True)
    page_id = serializers.CharField(source="page_config.page_id", read_only=True)
    customer_name = serializers.SerializerMethodField()
    assigned_to_name = serializers.CharField(source="assigned_to.full_name", read_only=True, default=None)
    messages = FacebookMessageSerializer(many=True, read_only=True)
    tags = FacebookLeadTagSerializer(many=True, read_only=True)
    internal_notes = FacebookLeadNoteSerializer(many=True, read_only=True)
    is_customer_converted = serializers.SerializerMethodField()
    unread_count = serializers.SerializerMethodField()

    def get_is_customer_converted(self, obj):
        converted, _ = check_and_sync_converted_fb(obj)
        return converted

    def get_customer_name(self, obj):
        _, name = check_and_sync_converted_fb(obj)
        return name

    def get_unread_count(self, obj):
        count = getattr(obj, "unread_count", 0) or 0
        if count == 0 and getattr(obj, "has_unread_message", False):
            return 1
        return count

    class Meta:
        model = FacebookLead
        fields = [
            "id", "fb_user_id", "fb_user_name", "fb_user_avatar",
            "page_id", "page_name", "page_config",
            "detected_phone", "detected_email", "detected_address",
            "is_customer_converted", "status", "is_archived",
            "customer", "customer_name",
            "assigned_to", "assigned_to_name",
            "is_starred", "tags", "internal_notes",
            "last_message_at", "last_message_preview", "ai_summary", "ai_tags",
            "has_unread_message", "unread_count", "messages",
            "created_at", "updated_at", "is_ai_active"
        ]
        read_only_fields = ["id", "company", "fb_user_id", "status", "has_unread_message", "unread_count", "created_at", "updated_at"]


class FacebookLeadUpdateSerializer(serializers.ModelSerializer):
    class Meta:
        model = FacebookLead
        fields = ["assigned_to", "is_ai_active"]

class FacebookLeadListSerializer(serializers.ModelSerializer):
    """Serializer nhẹ hơn dùng cho danh sách (không include messages)."""
    status = serializers.CharField(read_only=True)
    page_name = serializers.CharField(source="page_config.page_name", read_only=True)
    page_id = serializers.CharField(source="page_config.page_id", read_only=True)
    customer_name = serializers.SerializerMethodField()
    assigned_to_name = serializers.CharField(source="assigned_to.full_name", read_only=True, default=None)
    tags = FacebookLeadTagSerializer(many=True, read_only=True)
    is_customer_converted = serializers.SerializerMethodField()
    unread_count = serializers.SerializerMethodField()

    def get_is_customer_converted(self, obj):
        converted, _ = check_and_sync_converted_fb(obj)
        return converted

    def get_customer_name(self, obj):
        _, name = check_and_sync_converted_fb(obj)
        return name

    def get_unread_count(self, obj):
        count = getattr(obj, "unread_count", 0) or 0
        if count == 0 and getattr(obj, "has_unread_message", False):
            return 1
        return count

    latest_sender = serializers.SerializerMethodField()

    def get_latest_sender(self, obj):
        if hasattr(obj, "latest_sender") and obj.latest_sender is not None:
            return obj.latest_sender
        last_m = obj.messages.order_by("-created_at").first()
        return last_m.sender_type if last_m else ""

    class Meta:
        model = FacebookLead
        fields = [
            "id", "fb_user_id", "fb_user_name", "fb_user_avatar",
            "page_id", "page_name", "page_config",
            "detected_phone", "detected_email", "detected_address",
            "is_customer_converted", "status", "is_archived",
            "customer", "customer_name",
            "assigned_to", "assigned_to_name",
            "is_starred", "tags",
            "last_message_at", "last_message_preview", "ai_summary", "ai_tags",
            "has_unread_message", "unread_count", "latest_sender",
            "created_at", "updated_at", "is_ai_active"
        ]


# ── QuickMediaAsset ───────────────────────────────────────────────────────────

class QuickMediaAssetSerializer(serializers.ModelSerializer):
    created_by_name = serializers.CharField(source="created_by.full_name", read_only=True, default="")
    media_type_display = serializers.CharField(source="get_media_type_display", read_only=True)
    file_url = serializers.SerializerMethodField()

    class Meta:
        model = QuickMediaAsset
        fields = [
            "id", "company", "title", "folder", "media_type", "media_type_display",
            "file_url", "created_by", "created_by_name", "created_at",
        ]
        read_only_fields = ["id", "company", "created_by", "created_at", "media_type_display"]

    def get_file_url(self, obj):
        if not obj.file_url:
            return ""
        if obj.file_url.startswith("http://") or obj.file_url.startswith("https://"):
            return obj.file_url
        request = self.context.get("request")
        if request and obj.file_url.startswith("/"):
            return request.build_absolute_uri(obj.file_url)
        return obj.file_url

