from django.db import models
from django.conf import settings
from users.models import Company, Department


class ChatCompanyConfig(models.Model):
    """Cấu hình lưu trữ và chính sách chat của từng công ty."""
    company = models.OneToOneField(
        Company,
        on_delete=models.CASCADE,
        related_name="chat_config",
        verbose_name="Công ty"
    )
    retention_days = models.PositiveIntegerField(
        default=90,
        verbose_name="Thời gian lưu trữ tin nhắn (ngày)",
        help_text="Số ngày lưu tin nhắn trước khi tự động dọn dẹp. Đặt 0 nếu muốn lưu vĩnh viễn."
    )
    max_file_size_mb = models.PositiveIntegerField(
        default=15,
        verbose_name="Dung lượng tệp tối đa (MB)"
    )
    allow_file_upload = models.BooleanField(
        default=True,
        verbose_name="Cho phép gửi file & ảnh"
    )
    auto_compress_images = models.BooleanField(
        default=True,
        verbose_name="Tự động nén ảnh WebP/JPEG"
    )
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        verbose_name = "Cấu hình Chat công ty"
        verbose_name_plural = "Cấu hình Chat công ty"

    def __str__(self):
        return f"ChatConfig - {self.company.name} ({self.retention_days} ngày)"

    @classmethod
    def get_for_company(cls, company):
        if not company:
            return None
        cfg, _ = cls.objects.get_or_create(company=company)
        return cfg


class Conversation(models.Model):
    """Cuộc trò chuyện (Trực tiếp 1-1, Nhóm dự án, hoặc Nhóm phòng ban)."""
    TYPE_DIRECT = "direct"
    TYPE_GROUP = "group"
    TYPE_DEPARTMENT = "department"
    TYPE_CHOICES = [
        (TYPE_DIRECT, "Trực tiếp 1-1"),
        (TYPE_GROUP, "Nhóm tùy chọn"),
        (TYPE_DEPARTMENT, "Nhóm phòng ban"),
    ]

    company = models.ForeignKey(
        Company,
        on_delete=models.CASCADE,
        related_name="chat_conversations",
        verbose_name="Công ty"
    )
    type = models.CharField(
        max_length=20,
        choices=TYPE_CHOICES,
        default=TYPE_DIRECT,
        verbose_name="Loại hội thoại"
    )
    title = models.CharField(
        max_length=255,
        blank=True,
        null=True,
        verbose_name="Tên nhóm trò chuyện"
    )
    avatar = models.ImageField(
        upload_to="chat_avatars/",
        blank=True,
        null=True,
        verbose_name="Ảnh đại diện nhóm"
    )
    department = models.ForeignKey(
        Department,
        on_delete=models.SET_NULL,
        blank=True,
        null=True,
        related_name="chat_conversations",
        verbose_name="Phòng ban liên kết"
    )
    created_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        blank=True,
        null=True,
        related_name="created_chat_conversations",
        verbose_name="Người tạo"
    )
    last_message_text = models.TextField(blank=True, default="", verbose_name="Tin nhắn cuối")
    last_message_at = models.DateTimeField(blank=True, null=True, db_index=True, verbose_name="Thời gian tin cuối")
    last_sender_name = models.CharField(max_length=150, blank=True, default="", verbose_name="Người gửi cuối")
    is_active = models.BooleanField(default=True, verbose_name="Đang hoạt động")
    created_at = models.DateTimeField(auto_now_add=True, verbose_name="Ngày tạo")
    updated_at = models.DateTimeField(auto_now=True, verbose_name="Cập nhật")

    class Meta:
        verbose_name = "Cuộc trò chuyện"
        verbose_name_plural = "Cuộc trò chuyện"
        ordering = ["-last_message_at", "-created_at"]
        indexes = [
            models.Index(fields=["company", "type", "is_active"]),
            models.Index(fields=["company", "-last_message_at"]),
        ]

    def __str__(self):
        if self.type == self.TYPE_DIRECT:
            return f"Direct Chat #{self.id}"
        return self.title or f"Group #{self.id}"


class ConversationParticipant(models.Model):
    """Thành viên tham gia cuộc trò chuyện."""
    conversation = models.ForeignKey(
        Conversation,
        on_delete=models.CASCADE,
        related_name="participants",
        verbose_name="Cuộc trò chuyện"
    )
    user = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.CASCADE,
        related_name="chat_memberships",
        verbose_name="Người dùng"
    )
    joined_at = models.DateTimeField(auto_now_add=True, verbose_name="Thời gian tham gia")
    last_read_message_id = models.PositiveIntegerField(default=0, verbose_name="ID tin nhắn đã đọc cuối")
    last_read_at = models.DateTimeField(blank=True, null=True, verbose_name="Thời gian đọc cuối")
    is_admin = models.BooleanField(default=False, verbose_name="Quản trị viên nhóm")
    is_muted = models.BooleanField(default=False, verbose_name="Tắt thông báo")
    is_hidden = models.BooleanField(default=False, verbose_name="Ẩn khỏi danh sách của tôi")
    cleared_at = models.DateTimeField(blank=True, null=True, verbose_name="Thời điểm xóa lịch sử ở phía tôi")

    class Meta:
        verbose_name = "Thành viên hội thoại"
        verbose_name_plural = "Thành viên hội thoại"
        unique_together = [("conversation", "user")]
        indexes = [
            models.Index(fields=["user", "conversation"]),
        ]

    def __str__(self):
        return f"{self.user} in {self.conversation}"


class ChatMessage(models.Model):
    """Tin nhắn trong cuộc trò chuyện."""
    MSG_TEXT = "text"
    MSG_IMAGE = "image"
    MSG_FILE = "file"
    MSG_CONTEXT_DOC = "context_doc"
    MSG_SYSTEM = "system"
    MSG_CHOICES = [
        (MSG_TEXT, "Văn bản"),
        (MSG_IMAGE, "Hình ảnh"),
        (MSG_FILE, "Tệp tin đính kèm"),
        (MSG_CONTEXT_DOC, "Chứng từ CRM"),
        (MSG_SYSTEM, "Hệ thống thông báo"),
    ]

    conversation = models.ForeignKey(
        Conversation,
        on_delete=models.CASCADE,
        related_name="messages",
        verbose_name="Cuộc trò chuyện"
    )
    sender = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        blank=True,
        null=True,
        related_name="sent_chat_messages",
        verbose_name="Người gửi"
    )
    message_type = models.CharField(
        max_length=20,
        choices=MSG_CHOICES,
        default=MSG_TEXT,
        verbose_name="Loại tin nhắn"
    )
    content = models.TextField(blank=True, default="", verbose_name="Nội dung tin nhắn")
    file = models.FileField(
        upload_to="chat_files/%Y/%m/",
        blank=True,
        null=True,
        verbose_name="Tệp đính kèm / Ảnh"
    )
    file_name = models.CharField(max_length=255, blank=True, default="", verbose_name="Tên tệp gốc")
    file_size = models.PositiveIntegerField(default=0, verbose_name="Dung lượng (bytes)")
    
    # Dữ liệu ngữ cảnh CRM (Đơn hàng, Báo giá, Khách hàng, Xuất kho...)
    # Ví dụ: {"doc_type": "order", "doc_id": 12, "doc_code": "FT-DH-747", "title": "Khách: Anh Song", "amount": 61770000}
    context_data = models.JSONField(blank=True, null=True, default=dict, verbose_name="Dữ liệu chứng từ liên kết")

    is_deleted = models.BooleanField(default=False, verbose_name="Đã xóa")
    deleted_at = models.DateTimeField(blank=True, null=True, verbose_name="Thời gian xóa")
    is_recalled = models.BooleanField(default=False, verbose_name="Đã thu hồi")
    recalled_at = models.DateTimeField(blank=True, null=True, verbose_name="Thời gian thu hồi")
    created_at = models.DateTimeField(auto_now_add=True, db_index=True, verbose_name="Thời gian gửi")

    class Meta:
        verbose_name = "Tin nhắn chat"
        verbose_name_plural = "Tin nhắn chat"
        ordering = ["created_at"]
        indexes = [
            models.Index(fields=["conversation", "created_at"]),
            models.Index(fields=["conversation", "id"]),
            models.Index(fields=["created_at"]),
        ]

    def __str__(self):
        sender_name = self.sender.full_name if self.sender else "Hệ thống"
        return f"[{self.created_at:%H:%M}] {sender_name}: {self.content[:30]}"
