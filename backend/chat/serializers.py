from rest_framework import serializers
from .models import Conversation, ConversationParticipant, ChatMessage, ChatCompanyConfig
from users.models import User, Department


class ChatSenderSerializer(serializers.ModelSerializer):
    class Meta:
        model = User
        fields = ["id", "username", "full_name", "avatar"]


class ChatMessageSerializer(serializers.ModelSerializer):
    sender = ChatSenderSerializer(read_only=True)
    file_url = serializers.SerializerMethodField()

    class Meta:
        model = ChatMessage
        fields = [
            "id",
            "conversation",
            "sender",
            "message_type",
            "content",
            "file",
            "file_url",
            "file_name",
            "file_size",
            "context_data",
            "is_deleted",
            "is_recalled",
            "recalled_at",
            "created_at",
        ]
        read_only_fields = ["id", "sender", "file_url", "created_at"]

    def get_file_url(self, obj):
        if obj.file:
            return obj.file.url
        return None


class ConversationParticipantSerializer(serializers.ModelSerializer):
    user_id = serializers.IntegerField(source="user.id", read_only=True)
    full_name = serializers.CharField(source="user.full_name", read_only=True)
    username = serializers.CharField(source="user.username", read_only=True)
    avatar = serializers.ImageField(source="user.avatar", read_only=True)
    department_name = serializers.CharField(source="user.department.name", default="", read_only=True)
    role_name = serializers.CharField(source="user.role.name", default="", read_only=True)

    class Meta:
        model = ConversationParticipant
        fields = [
            "id",
            "user_id",
            "full_name",
            "username",
            "avatar",
            "department_name",
            "role_name",
            "is_admin",
            "is_muted",
            "last_read_message_id",
            "last_read_at",
        ]


class ConversationDetailSerializer(serializers.ModelSerializer):
    participants = ConversationParticipantSerializer(many=True, read_only=True)
    direct_partner = serializers.SerializerMethodField()
    unread_count = serializers.SerializerMethodField()

    class Meta:
        model = Conversation
        fields = [
            "id",
            "type",
            "title",
            "avatar",
            "department",
            "created_by",
            "last_message_text",
            "last_message_at",
            "last_sender_name",
            "is_active",
            "created_at",
            "participants",
            "direct_partner",
            "unread_count",
        ]

    def get_direct_partner(self, obj):
        request = self.context.get("request")
        current_user = getattr(request, "user", None)
        if obj.type == Conversation.TYPE_DIRECT and current_user:
            partner_p = obj.participants.exclude(user=current_user).first()
            if partner_p and partner_p.user:
                return {
                    "id": partner_p.user.id,
                    "full_name": partner_p.user.full_name,
                    "username": partner_p.user.username,
                    "avatar": partner_p.user.avatar.url if partner_p.user.avatar else None,
                    "department_name": partner_p.user.department.name if partner_p.user.department else "",
                    "role_name": partner_p.user.role.name if partner_p.user.role else "",
                }
        return None

    def get_unread_count(self, obj):
        request = self.context.get("request")
        current_user = getattr(request, "user", None)
        if not current_user:
            return 0
        p = obj.participants.filter(user=current_user).first()
        if not p:
            return 0
        return obj.messages.filter(id__gt=p.last_read_message_id, is_deleted=False).exclude(sender=current_user).count()


class ChatCompanyConfigSerializer(serializers.ModelSerializer):
    class Meta:
        model = ChatCompanyConfig
        fields = [
            "retention_days",
            "max_file_size_mb",
            "allow_file_upload",
            "auto_compress_images",
            "updated_at",
        ]

