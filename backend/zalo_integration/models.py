from datetime import timedelta

from django.db import models
from django.utils import timezone


# ── Model 1: Cấu hình kết nối Zalo OA ────────────────────────────────────────

class ZaloOaConfig(models.Model):
    """
    Lưu thông tin xác thực OAuth2 cho từng Zalo OA theo từng công ty.
    Mỗi công ty chỉ có 1 config (OneToOne với Company).
    Token được auto-refresh bởi Celery task mỗi 12 giờ.
    """

    company = models.ForeignKey(
        "users.Company",
        on_delete=models.CASCADE,
        related_name="zalo_oa_configs",
        verbose_name="Công ty",
    )
    oa_name = models.CharField(
        max_length=255,
        verbose_name="Tên Zalo OA",
        help_text="Tên hiển thị của Official Account trên Zalo.",
    )
    use_system_config = models.BooleanField(
        default=True,
        verbose_name="Sử dụng cấu hình ứng dụng hệ thống",
        help_text="Nếu bật, hệ thống sẽ dùng App ID, Secret Key từ Cấu hình Hệ thống (SuperAdmin).",
    )
    ai_agent = models.ForeignKey(
        "ai_agents.AiAgent",
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        verbose_name="Trợ lý AI",
        help_text="AI được gán để quản lý OA này"
    )
    app_id = models.CharField(
        max_length=100,
        blank=True,
        null=True,
        verbose_name="App ID",
        help_text="App ID lấy từ trang Zalo Developers.",
    )
    secret_key = models.CharField(
        max_length=255,
        blank=True,
        null=True,
        verbose_name="App Secret",
        help_text="Secret key lấy từ trang Zalo Developers.",
    )
    oa_id = models.CharField(
        max_length=100,
        blank=True,
        verbose_name="OA ID",
        help_text="ID của Official Account sau khi xác thực.",
    )
    access_token = models.TextField(
        blank=True,
        null=True,
        verbose_name="Access Token",
    )
    refresh_token = models.TextField(
        blank=True,
        null=True,
        verbose_name="Refresh Token",
    )
    token_expires_at = models.DateTimeField(
        null=True,
        blank=True,
        verbose_name="Thời điểm Token hết hạn",
    )
    webhook_secret = models.CharField(
        max_length=255,
        blank=True,
        null=True,
        verbose_name="Webhook Secret",
        help_text="Dùng để xác minh chữ ký request từ Zalo.",
    )
    
    # ── Cấu hình tự động & Dọn dẹp ──────────────────────────────────────────
    auto_send_payment_zns = models.BooleanField(
        default=False, 
        verbose_name="Tự động gửi ZNS khi Thu tiền",
        help_text="Tự động bắn ZNS mẫu payment_receipt khi Phiếu thu được ghi nhận."
    )
    auto_send_delivery_zns = models.BooleanField(
        default=False,
        verbose_name="Tự động gửi ZNS khi Hoàn thành Đơn",
        help_text="Tự động bắn ZNS mẫu warranty kèm Phiếu bảo hành khi Đơn hàng hoàn thành."
    )
    auto_send_birthday_zns = models.BooleanField(
        default=False,
        verbose_name="Tự động gửi ZNS chúc mừng sinh nhật",
        help_text="Tự động bắn ZNS mẫu birthday vào ngày sinh nhật của Khách hàng."
    )
    auto_create_customer_from_phone = models.BooleanField(
        default=False,
        verbose_name="Tự động quét & tạo Khách hàng khi có SĐT trong hội thoại",
        help_text="Tự động quét tin nhắn Zalo, nếu khách hàng gửi SĐT sẽ tự động chuyển đổi thành Khách hàng hệ thống."
    )
    lead_cleanup_days = models.IntegerField(
        default=30,
        verbose_name="Số ngày dọn dẹp Lead rác",
        help_text="SocialLead không tương tác sau X ngày sẽ tự động bị ẩn (archived)."
    )
    request_phone_template = models.TextField(
        verbose_name="Mẫu tin nhắn xin SĐT",
        blank=True,
        default="Vui lòng chia sẻ số điện thoại để chúng tôi có thể liên hệ hỗ trợ tốt nhất."
    )
    request_email_template = models.TextField(
        verbose_name="Mẫu tin nhắn xin Email",
        blank=True,
        default="Xin chào quý khách! Để thuận tiện gửi thông tin và tài liệu, xin vui lòng chia sẻ địa chỉ Email của quý khách tại đây ạ."
    )

    is_active = models.BooleanField(default=True, verbose_name="Đang hoạt động")
    is_ai_active = models.BooleanField(
        default=True,
        verbose_name="Bật/Tắt AI toàn cục",
        help_text="Cờ bật/tắt AI cho toàn bộ Zalo OA này."
    )
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        verbose_name = "Cấu hình Zalo OA"
        verbose_name_plural = "Cấu hình Zalo OA"

    def __str__(self):
        return f"{self.oa_name} ({self.company.name})"

    # ── Resolved Properties ────────────────────────────────────────────────
    
    def get_app_id(self):
        from users.models import SystemSettings
        if self.use_system_config:
            sys_settings = SystemSettings.load()
            return sys_settings.zalo_app_id or ""
        return self.app_id or ""

    def get_secret_key(self):
        from users.models import SystemSettings
        if self.use_system_config:
            sys_settings = SystemSettings.load()
            return sys_settings.zalo_app_secret or ""
        return self.secret_key or ""

    def get_webhook_secret(self):
        from users.models import SystemSettings
        if self.use_system_config:
            sys_settings = SystemSettings.load()
            return sys_settings.zalo_webhook_secret or ""
        return self.webhook_secret or ""

    @property
    def is_token_near_expiry(self):
        """True nếu token còn dưới 2 giờ để sống (cần refresh)."""
        if not self.token_expires_at:
            return True
        return timezone.now() >= (self.token_expires_at - timedelta(hours=2))


# ── Model: Lịch sử Refresh Token ─────────────────────────────────────────────

class ZaloTokenRefreshLog(models.Model):
    """Lưu lại lịch sử mỗi lần hệ thống tự động hoặc thủ công refresh token Zalo OA."""

    STATUS_SUCCESS = "success"
    STATUS_FAILED = "failed"
    STATUS_CHOICES = [
        (STATUS_SUCCESS, "Thành công"),
        (STATUS_FAILED, "Thất bại"),
    ]

    TRIGGER_AUTO = "auto"
    TRIGGER_MANUAL = "manual"
    TRIGGER_OAUTH = "oauth"
    TRIGGER_CHOICES = [
        (TRIGGER_AUTO, "Tự động (Celery)"),
        (TRIGGER_MANUAL, "Thủ công (Bấm nút)"),
        (TRIGGER_OAUTH, "Đăng nhập lấy Token mới"),
    ]

    oa_config = models.ForeignKey(
        ZaloOaConfig,
        on_delete=models.CASCADE,
        related_name="token_refresh_logs",
        verbose_name="Zalo OA",
    )
    status = models.CharField(max_length=10, choices=STATUS_CHOICES)
    trigger = models.CharField(max_length=10, choices=TRIGGER_CHOICES, default=TRIGGER_AUTO)
    error_message = models.TextField(blank=True, default="")
    old_expires_at = models.DateTimeField(null=True, blank=True, verbose_name="Hạn cũ")
    new_expires_at = models.DateTimeField(null=True, blank=True, verbose_name="Hạn mới")
    created_at = models.DateTimeField(auto_now_add=True, verbose_name="Thời điểm")

    class Meta:
        verbose_name = "Log Refresh Token"
        verbose_name_plural = "Log Refresh Token"
        ordering = ["-created_at"]
        indexes = [
            models.Index(fields=["oa_config", "-created_at"]),
        ]

    def __str__(self):
        return f"[{self.get_trigger_display()}] {self.oa_config.oa_name} → {self.get_status_display()} ({self.created_at})"


# ── Model 2: Social Lead (Tầng 1 của Phễu — Hứng rác) ────────────────────────

class SocialLead(models.Model):
    """
    TẦNG 1 CỦA PHỄU: Nhận data thô từ Webhook Zalo.
    KHÔNG yêu cầu số điện thoại để tránh rác Database.
    Khi Sale xin được SĐT -> chạy hàm convert() -> tạo Customer thật.
    """

    PLATFORM_ZALO = "zalo"
    PLATFORM_FACEBOOK = "facebook"
    PLATFORM_CHOICES = [
        (PLATFORM_ZALO, "Zalo"),
        (PLATFORM_FACEBOOK, "Facebook"),
    ]

    STATUS_NEW = "new"
    STATUS_CHATTING = "chatting"
    STATUS_CONVERTED = "converted"
    STATUS_ARCHIVED = "archived"
    STATUS_CHOICES = [
        (STATUS_NEW, "Mới"),
        (STATUS_CHATTING, "Đang chat"),
        (STATUS_CONVERTED, "Đã chuyển đổi"),
        (STATUS_ARCHIVED, "Đã lưu trữ"),
    ]

    company = models.ForeignKey(
        "users.Company",
        on_delete=models.CASCADE,
        related_name="social_leads",
        verbose_name="Công ty",
    )
    oa_config = models.ForeignKey(
        "ZaloOaConfig",
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="social_leads",
        verbose_name="Zalo OA",
    )
    platform = models.CharField(
        max_length=20,
        choices=PLATFORM_CHOICES,
        default=PLATFORM_ZALO,
        verbose_name="Nền tảng",
        db_index=True,
    )

    # ── Định danh mạng xã hội ─────────────────────────────────────────
    social_id = models.CharField(
        max_length=255,
        verbose_name="Social ID (UID)",
        help_text="Zalo User ID hoặc Facebook PSID.",
    )
    display_name = models.CharField(
        max_length=255,
        blank=True,
        verbose_name="Tên hiển thị",
    )
    avatar_url = models.URLField(
        blank=True,
        null=True,
        verbose_name="Ảnh đại diện",
    )

    # ── Tương tác ──────────────────────────────────────────────────────
    last_message = models.TextField(
        blank=True,
        verbose_name="Tin nhắn cuối",
        help_text="Preview tin nhắn cuối cùng từ khách.",
    )
    ai_summary = models.TextField(
        blank=True,
        null=True,
        verbose_name="AI tóm tắt hội thoại",
    )
    ai_tags = models.JSONField(
        blank=True,
        null=True,
        verbose_name="AI Tags",
    )
    last_interaction_date = models.DateTimeField(
        default=timezone.now,
        verbose_name="Lần tương tác cuối",
        db_index=True,
    )
    status = models.CharField(
        max_length=20,
        choices=STATUS_CHOICES,
        default=STATUS_NEW,
        verbose_name="Trạng thái",
        db_index=True,
    )
    has_unread_message = models.BooleanField(
        default=False,
        verbose_name="Có tin nhắn chưa đọc"
    )
    is_ai_active = models.BooleanField(
        default=True,
        verbose_name="AI đang tiếp quản",
        help_text="Cờ bật/tắt AI cho cuộc hội thoại này. Tắt nếu Sale thật nhảy vào."
    )
    unread_count = models.IntegerField(
        default=0,
        verbose_name="Số tin nhắn chưa đọc"
    )
    detected_phone = models.CharField(
        max_length=20,
        blank=True,
        verbose_name="Số điện thoại phát hiện",
        help_text="SĐT phát hiện tự động trong tin nhắn của khách."
    )
    detected_email = models.EmailField(
        max_length=255,
        blank=True,
        null=True,
        verbose_name="Email tự động quét",
    )
    detected_address = models.CharField(
        max_length=500,
        blank=True,
        null=True,
        verbose_name="Địa chỉ tự động quét",
    )
    is_customer_converted = models.BooleanField(
        default=False,
        verbose_name="Đã thêm vào Khách hàng",
        help_text="Đánh dấu True nếu SĐT này đã có hoặc đã được thêm vào Customer hệ thống."
    )
    has_ai_followed_up = models.BooleanField(
        default=False,
        verbose_name="Đã được AI bám đuổi",
    )

    # ── Phân công & Phân loại nội bộ ───────────────────────────────────
    is_starred = models.BooleanField(
        default=False,
        verbose_name="Đánh dấu Khách VIP / Gấp",
        db_index=True,
    )
    tags = models.ManyToManyField(
        "ZaloLeadTag",
        blank=True,
        related_name="social_leads",
        verbose_name="Nhãn hội thoại",
    )
    assigned_to = models.ForeignKey(
        "users.User",
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="assigned_social_leads",
        verbose_name="Nhân viên phụ trách",
    )
    notes = models.TextField(blank=True, verbose_name="Ghi chú nội bộ")

    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        verbose_name = "Social Lead"
        verbose_name_plural = "Social Leads"
        ordering = ["-last_interaction_date"]
        constraints = [
            models.UniqueConstraint(
                fields=["company", "platform", "social_id"],
                name="unique_social_lead_per_platform_company",
            )
        ]

    def __str__(self):
        return f"{self.display_name or self.social_id} ({self.get_platform_display()})"

    def convert(self, phone_number, assigned_user=None):
        """
        Chuyển đổi SocialLead -> Customer (Tầng 2).
        Gọi khi Sale xin được số điện thoại của khách.
        """
        from zalo_integration.services import convert_social_lead
        return convert_social_lead(self, phone_number, assigned_user)


# ── Model 3: Mẫu tin nhắn ZNS ────────────────────────────────────────────────

class ZaloMessageTemplate(models.Model):
    """
    Lưu các mẫu ZNS đã được Zalo duyệt.
    Dùng để gửi thông báo tự động: xác nhận đơn, nhắc hẹn, chăm sóc KH.
    """

    TYPE_ORDER_CONFIRM = "order_confirm"
    TYPE_APPOINTMENT = "appointment"
    TYPE_PROMOTION = "promotion"
    TYPE_CARE = "care"
    TYPE_BIRTHDAY = "birthday"
    TYPE_DELIVERY_WARRANTY = "delivery_warranty"
    TYPE_CUSTOM = "custom"
    TYPE_CHOICES = [
        (TYPE_ORDER_CONFIRM, "Xác nhận đơn hàng"),
        (TYPE_APPOINTMENT, "Nhắc lịch hẹn"),
        (TYPE_PROMOTION, "Khuyến mãi"),
        (TYPE_CARE, "Chăm sóc khách hàng"),
        (TYPE_BIRTHDAY, "Chúc mừng sinh nhật"),
        (TYPE_DELIVERY_WARRANTY, "Giao hàng / Bảo hành"),
        (TYPE_CUSTOM, "Tùy chỉnh"),
    ]

    company = models.ForeignKey(
        "users.Company",
        on_delete=models.CASCADE,
        related_name="zalo_message_templates",
        verbose_name="Công ty",
    )
    name = models.CharField(
        max_length=255,
        verbose_name="Tên mẫu (nội bộ)",
        help_text="Tên để nhận diện mẫu trong hệ thống.",
    )
    zalo_template_id = models.CharField(
        max_length=100,
        verbose_name="ID Mẫu Zalo",
        help_text="ID do Zalo cấp sau khi duyệt mẫu ZNS.",
    )
    template_type = models.CharField(
        max_length=20,
        choices=TYPE_CHOICES,
        default=TYPE_CUSTOM,
        verbose_name="Loại mẫu",
    )
    content_preview = models.TextField(
        blank=True,
        verbose_name="Nội dung mẫu (preview)",
        help_text="Nội dung mẫu để xem, KHÔNG dùng để gửi trực tiếp.",
    )
    params_schema = models.JSONField(
        default=dict,
        verbose_name="Tham số mẫu",
        help_text='Định nghĩa các tham số. VD: {"customer_name": "Họ tên KH", "order_id": "Mã đơn hàng"}',
    )
    is_active = models.BooleanField(default=True, verbose_name="Đang hoạt động", db_index=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        verbose_name = "Mẫu ZNS"
        verbose_name_plural = "Mẫu ZNS"
        constraints = [
            models.UniqueConstraint(
                fields=["company", "zalo_template_id"],
                name="unique_zns_template_per_company",
            )
        ]

    def __str__(self):
        return f"{self.name} ({self.company.name})"


# ── Model 4: Lịch sử gửi ZNS ─────────────────────────────────────────────────

class ZaloMessageLog(models.Model):
    """
    Ghi lại mọi lần gửi ZNS để audit và theo dõi tỷ lệ thành công.
    """

    STATUS_PENDING = "pending"
    STATUS_SENT = "sent"
    STATUS_FAILED = "failed"
    STATUS_CHOICES = [
        (STATUS_PENDING, "Đang gửi"),
        (STATUS_SENT, "Đã gửi thành công"),
        (STATUS_FAILED, "Gửi thất bại"),
    ]

    company = models.ForeignKey(
        "users.Company",
        on_delete=models.CASCADE,
        related_name="zalo_message_logs",
        verbose_name="Công ty",
    )
    template = models.ForeignKey(
        "ZaloMessageTemplate",
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="message_logs",
        verbose_name="Mẫu ZNS",
    )
    social_lead = models.ForeignKey(
        "SocialLead",
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="message_logs",
        verbose_name="Social Lead",
    )
    customer = models.ForeignKey(
        "crm.Customer",
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="zalo_message_logs",
        verbose_name="Khách hàng",
    )
    sent_by = models.ForeignKey(
        "users.User",
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="zalo_sent_logs",
        verbose_name="Người gửi",
    )
    recipient_phone = models.CharField(
        max_length=20,
        verbose_name="SĐT nhận ZNS",
    )
    recipient_zalo_id = models.CharField(
        max_length=255,
        blank=True,
        verbose_name="Zalo ID người nhận",
    )
    params_sent = models.JSONField(
        default=dict,
        verbose_name="Tham số đã gửi",
    )
    status = models.CharField(
        max_length=20,
        choices=STATUS_CHOICES,
        default=STATUS_PENDING,
        verbose_name="Trạng thái",
        db_index=True,
    )
    zalo_msg_id = models.CharField(
        max_length=255,
        blank=True,
        verbose_name="Zalo Message ID",
        help_text="ID tin nhắn do Zalo trả về sau khi gửi thành công.",
    )
    error_message = models.TextField(
        blank=True,
        verbose_name="Thông báo lỗi",
    )
    sent_at = models.DateTimeField(auto_now_add=True, verbose_name="Thời điểm gửi")

    class Meta:
        verbose_name = "Lịch sử gửi ZNS"
        verbose_name_plural = "Lịch sử ZNS"
        ordering = ["-sent_at"]

    def __str__(self):
        return f"{self.template.name if self.template else 'ZNS'} -> {self.recipient_phone} ({self.get_status_display()})"


# ── Model 5: Tin nhắn Zalo Inbox (Live Chat) ─────────────────────────────────

class ZaloMessage(models.Model):
    """
    Lưu trữ lịch sử chat 2 chiều giữa OA và khách hàng trên nền tảng Zalo.
    """

    DIRECTION_INBOUND = "inbound"
    DIRECTION_OUTBOUND = "outbound"
    DIRECTION_CHOICES = [
        (DIRECTION_INBOUND, "Khách hàng gửi"),
        (DIRECTION_OUTBOUND, "OA gửi (Sale)"),
    ]

    company = models.ForeignKey(
        "users.Company",
        on_delete=models.CASCADE,
        related_name="zalo_messages",
        verbose_name="Công ty",
    )
    social_lead = models.ForeignKey(
        "SocialLead",
        on_delete=models.CASCADE,
        related_name="messages",
        verbose_name="Social Lead",
    )
    direction = models.CharField(
        max_length=20,
        choices=DIRECTION_CHOICES,
        verbose_name="Hướng tin nhắn",
        db_index=True,
    )
    sender_role = models.CharField(
        max_length=20,
        null=True,
        blank=True,
        choices=[("ai", "AI"), ("sale", "Sale"), ("system", "Hệ thống")],
        verbose_name="Vai trò gửi",
    )
    sender_name = models.CharField(
        max_length=100,
        null=True,
        blank=True,
        verbose_name="Tên người gửi (nếu có)",
    )
    content = models.TextField(
        blank=True,
        verbose_name="Nội dung tin nhắn",
    )
    attachment_url = models.URLField(
        blank=True,
        null=True,
        verbose_name="Link file đính kèm",
    )
    attachment_type = models.CharField(
        max_length=50,
        blank=True,
        verbose_name="Loại đính kèm",
    )
    payload = models.JSONField(
        blank=True,
        null=True,
        verbose_name="Dữ liệu mở rộng (Carousel/JSON)",
    )
    zalo_msg_id = models.CharField(
        max_length=255,
        blank=True,
        verbose_name="Zalo Message ID",
    )
    sender_user = models.ForeignKey(
        "users.User",
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        verbose_name="Người gửi (nếu outbound)",
    )
    created_at = models.DateTimeField(auto_now_add=True, db_index=True)

    class Meta:
        verbose_name = "Tin nhắn Zalo"
        verbose_name_plural = "Tin nhắn Zalo"
        ordering = ["created_at", "id"]

    def __str__(self):
        return f"[{self.get_direction_display()}] {self.social_lead.display_name}: {self.content[:30]}"


# ── Model 6: Nhãn hội thoại Zalo (Multi-Color Tags) ──────────────────────────

class ZaloLeadTag(models.Model):
    company = models.ForeignKey(
        "users.Company",
        on_delete=models.CASCADE,
        related_name="zalo_lead_tags",
        verbose_name="Công ty",
    )
    name = models.CharField(max_length=50, verbose_name="Tên nhãn")
    color = models.CharField(max_length=20, default="#3b82f6", verbose_name="Màu sắc (HEX)")
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        verbose_name = "Nhãn hội thoại Zalo"
        verbose_name_plural = "Nhãn hội thoại Zalo"
        unique_together = [("company", "name")]
        ordering = ["name"]

    def __str__(self):
        return self.name


# ── Model 7: Ghi chú nội bộ hội thoại Zalo ───────────────────────────────────

class ZaloLeadNote(models.Model):
    lead = models.ForeignKey(
        SocialLead,
        on_delete=models.CASCADE,
        related_name="internal_notes",
        verbose_name="Hội thoại Zalo",
    )
    user = models.ForeignKey(
        "users.User",
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        verbose_name="Nhân viên ghi chú",
    )
    content = models.TextField(verbose_name="Nội dung ghi chú")
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        verbose_name = "Ghi chú nội bộ Zalo"
        verbose_name_plural = "Ghi chú nội bộ Zalo"
        ordering = ["-created_at"]

    def __str__(self):
        return f"Note on {self.lead_id} by {self.user_id}"


# ── Model 8: Văn bản tin nhắn mẫu Zalo (Quick Replies) ───────────────────────

class ZaloQuickReply(models.Model):
    company = models.ForeignKey(
        "users.Company",
        on_delete=models.CASCADE,
        related_name="zalo_quick_replies",
        verbose_name="Công ty",
    )
    shortcut = models.CharField(
        max_length=50,
        blank=True,
        verbose_name="Cú pháp gõ tắt (vd: /banggia)",
    )
    title = models.CharField(
        max_length=100,
        verbose_name="Tiêu đề mẫu tin",
    )
    content = models.TextField(verbose_name="Nội dung tin nhắn")
    created_by = models.ForeignKey(
        "users.User",
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        verbose_name="Người tạo",
    )
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        verbose_name = "Tin nhắn mẫu Zalo"
        verbose_name_plural = "Tin nhắn mẫu Zalo"
        ordering = ["title"]

    def __str__(self):
        return f"{self.shortcut or ''} - {self.title}"

