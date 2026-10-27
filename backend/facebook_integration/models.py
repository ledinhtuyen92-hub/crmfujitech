"""
facebook_integration/models.py
Models cho module Facebook Multi-Page Inbox.
"""

from django.db import models
from django.utils import timezone


# ── Model 1: Cấu hình kết nối Trang Facebook (Fanpage) ───────────────────────

class FacebookPageConfig(models.Model):
    """
    Lưu thông tin kết nối cho mỗi Trang Facebook (Fanpage) của Công ty.
    Mỗi công ty có thể kết nối nhiều trang (Multi-Page).
    """

    company = models.ForeignKey(
        "users.Company",
        on_delete=models.CASCADE,
        related_name="facebook_page_configs",
        verbose_name="Công ty",
    )
    page_name = models.CharField(
        max_length=255,
        verbose_name="Tên Trang Facebook",
        help_text="Tên hiển thị của Fanpage trên Facebook.",
    )
    page_id = models.CharField(
        max_length=100,
        blank=True,
        verbose_name="Page ID",
        help_text="ID của Fanpage Facebook (tự động lấy sau khi đăng nhập).",
    )
    # ── Cấu hình App Facebook ────────────────────────────────────────────
    use_system_config = models.BooleanField(
        default=True,
        verbose_name="Sử dụng cấu hình ứng dụng hệ thống",
        help_text="Nếu bật, hệ thống sẽ dùng App ID, Secret từ Cấu hình Hệ thống (SuperAdmin).",
    )
    ai_agent = models.ForeignKey(
        "ai_agents.AiAgent",
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        verbose_name="Trợ lý AI",
        help_text="AI được gán để quản lý Trang này"
    )
    app_id = models.CharField(
        max_length=100,
        blank=True,
        null=True,
        verbose_name="App ID",
        help_text="Facebook App ID (chỉ cần khi không dùng cấu hình hệ thống).",
    )
    app_secret = models.CharField(
        max_length=255,
        blank=True,
        null=True,
        verbose_name="App Secret",
        help_text="Facebook App Secret (chỉ cần khi không dùng cấu hình hệ thống).",
    )
    # ── Token ────────────────────────────────────────────────────────────
    page_access_token = models.TextField(
        blank=True,
        null=True,
        verbose_name="Page Access Token",
        help_text="Long-Lived Page Access Token để gửi/nhận tin nhắn.",
    )
    token_expires_at = models.DateTimeField(
        null=True,
        blank=True,
        verbose_name="Thời hạn Token",
        help_text="Thời điểm Page Access Token hết hạn. None = không hết hạn (Page Token thường vĩnh viễn).",
    )
    webhook_verify_token = models.CharField(
        max_length=255,
        blank=True,
        verbose_name="Webhook Verify Token",
        help_text="Mã xác thực webhook tùy chỉnh – khai báo trên Meta Developers.",
    )
    page_avatar = models.URLField(
        max_length=1000,
        blank=True,
        null=True,
        verbose_name="Avatar Trang Facebook",
    )
    is_active = models.BooleanField(
        default=True,
        verbose_name="Đang kết nối",
    )
    auto_create_customer_from_phone = models.BooleanField(
        default=False,
        verbose_name="Tự động tạo KH khi phát hiện SĐT",
        help_text="Tự động tạo hồ sơ Khách hàng vào CRM khi nhận diện được SĐT trong hội thoại.",
    )
    auto_assign_lead_to_customer_assignee = models.BooleanField(
        default=True,
        verbose_name="Tự động gán hội thoại theo Nhân viên phụ trách",
        help_text="Nếu bật, khi hội thoại được liên kết với một Khách hàng đã có người phụ trách, hội thoại sẽ tự động được gán cho nhân viên đó."
    )
    lead_cleanup_days = models.IntegerField(
        default=30,
        verbose_name="Số ngày dọn dẹp Lead rác",
        help_text="Hội thoại không tương tác sau X ngày sẽ tự động bị ẩn (archived).",
    )
    request_phone_template = models.TextField(
        default="Dạ chào bạn, để tiện chuyên viên tư vấn chi tiết và gửi bảng giá ưu đãi, bạn cho mình xin số điện thoại liên hệ với ạ ❤️",
        verbose_name="Mẫu tin nhắn xin SĐT",
    )
    request_email_template = models.TextField(
        default="Dạ bạn cho mình xin địa chỉ Email để bên em gửi catalogue và thông tin chi tiết qua email cho mình nhé 📧",
        verbose_name="Mẫu tin nhắn xin Email",
    )
    assigned_to = models.ForeignKey(
        "users.User",
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="facebook_pages_managed",
        verbose_name="Nhân viên phụ trách mặc định",
    )
    is_ai_active = models.BooleanField(
        default=True,
        verbose_name="Bật/Tắt AI toàn cục",
        help_text="Cờ bật/tắt AI cho toàn bộ trang Facebook này."
    )
    # ── Cấu hình Tự động hóa Fanpage (Auto Bot) ──────────────────────────
    enable_bot = models.BooleanField(
        default=False,
        verbose_name="Bật Auto Bot Fanpage",
        help_text="Bật/tắt toàn bộ tính năng tự động like, reply comment và inbox của Bot cho Trang này."
    )
    enable_like_comment = models.BooleanField(
        default=True,
        verbose_name="Tự động Like bình luận",
        help_text="Tự động thả Like khi có khách hàng bình luận bài viết."
    )
    enable_comment_reply = models.BooleanField(
        default=False,
        verbose_name="Tự động trả lời bình luận mặc định",
        help_text="Trả lời bình luận theo mẫu mặc định khi không khớp Post/Keyword rules."
    )
    default_comment_reply = models.TextField(
        blank=True,
        default="",
        verbose_name="Nội dung trả lời bình luận mặc định",
        help_text="Hỗ trợ cú pháp Spintax {A|B|C} và biến {name}."
    )
    enable_private_message = models.BooleanField(
        default=False,
        verbose_name="Tự động gửi tin nhắn riêng khi có bình luận",
        help_text="Tự động gửi Private Message vào Messenger của khách khi khách bình luận."
    )
    default_private_message = models.TextField(
        blank=True,
        default="",
        verbose_name="Nội dung tin nhắn riêng mặc định",
        help_text="Hỗ trợ cú pháp Spintax {A|B|C} và biến {name}."
    )
    enable_keyword_reply = models.BooleanField(
        default=True,
        verbose_name="Bật trả lời theo từ khóa",
        help_text="Ưu tiên quét bộ từ khóa (Keyword Rules) trước khi fallback về mặc định."
    )
    enable_ai_fallback = models.BooleanField(
        default=True,
        verbose_name="Sử dụng AI Agent khi không khớp từ khóa",
        help_text="Nếu bật và Trang có gán Trợ lý AI, AI sẽ tự động tư vấn khi khách hỏi ngoài bộ từ khóa."
    )
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        verbose_name = "Cấu hình Trang Facebook"
        verbose_name_plural = "Cấu hình Trang Facebook"
        unique_together = [("company", "page_name")]
        ordering = ["-created_at"]

    def __str__(self):
        return f"{self.page_name} ({self.page_id or 'Chưa kết nối'})"

    def get_app_id(self) -> str:
        """Lấy App ID: ưu tiên config hệ thống nếu use_system_config=True."""
        if self.use_system_config:
            from users.models import SystemSettings
            sys = SystemSettings.load()
            return sys.facebook_app_id or ""
        return self.app_id or ""

    def get_app_secret(self) -> str:
        """Lấy App Secret: ưu tiên config hệ thống nếu use_system_config=True."""
        if self.use_system_config:
            from users.models import SystemSettings
            sys = SystemSettings.load()
            return sys.facebook_app_secret or ""
        return self.app_secret or ""

    @property
    def is_token_valid(self):
        """Token hợp lệ nếu page_access_token không rỗng."""
        return bool(self.page_access_token)

    @property
    def is_token_near_expiry(self) -> bool:
        """
        Token sắp hết hạn nếu còn dưới 5 ngày.
        Lưu ý: Page Access Token do Meta cấp thường vĩnh viễn (None = không hết hạn).
        """
        from django.utils import timezone
        from datetime import timedelta
        if not self.token_expires_at:
            return False  # Token vĩnh viễn
        return self.token_expires_at < timezone.now() + timedelta(days=5)


# ── Model 2: Hội thoại Khách hàng trên Facebook ──────────────────────────────

class FacebookLeadTag(models.Model):
    company = models.ForeignKey(
        "users.Company",
        on_delete=models.CASCADE,
        related_name="fb_lead_tags",
        verbose_name="Công ty",
    )
    name = models.CharField(max_length=50, verbose_name="Tên nhãn/Tag")
    color = models.CharField(max_length=20, default="#3b82f6", verbose_name="Màu sắc")
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        verbose_name = "Nhãn hội thoại Facebook"
        verbose_name_plural = "Nhãn hội thoại Facebook"
        unique_together = [("company", "name")]
        ordering = ["name"]

    def __str__(self):
        return f"{self.name} ({self.color})"


class FacebookLead(models.Model):
    """
    Đại diện cho mỗi người dùng Facebook đã nhắn tin vào Trang.
    Mỗi Lead tương ứng 1 PSID (Page-Scoped User ID) trên từng Trang.
    """

    company = models.ForeignKey(
        "users.Company",
        on_delete=models.CASCADE,
        related_name="facebook_leads",
        verbose_name="Công ty",
    )
    page_config = models.ForeignKey(
        FacebookPageConfig,
        on_delete=models.CASCADE,
        related_name="leads",
        verbose_name="Trang Facebook",
    )
    fb_user_id = models.CharField(
        max_length=100,
        verbose_name="Facebook User ID (PSID)",
    )
    fb_user_name = models.CharField(
        max_length=255,
        blank=True,
        verbose_name="Tên người dùng Facebook",
    )
    fb_user_avatar = models.URLField(
        max_length=1000,
        blank=True,
        null=True,
        verbose_name="Avatar Facebook",
    )
    detected_phone = models.CharField(
        max_length=20,
        blank=True,
        null=True,
        verbose_name="SĐT đã phát hiện",
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
        verbose_name="Đã có trong hệ thống KH",
    )
    has_ai_followed_up = models.BooleanField(
        default=False,
        verbose_name="Đã được AI bám đuổi",
    )
    customer = models.ForeignKey(
        "crm.Customer",
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="facebook_leads",
        verbose_name="Khách hàng CRM liên kết",
    )
    assigned_to = models.ForeignKey(
        "users.User",
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="facebook_leads_assigned",
        verbose_name="Nhân viên phụ trách",
    )
    is_starred = models.BooleanField(
        default=False,
        verbose_name="Đánh dấu sao / Khách VIP",
    )
    is_ai_active = models.BooleanField(
        default=True,
        verbose_name="AI đang tiếp quản",
        help_text="Cờ bật/tắt AI cho cuộc hội thoại này. Tắt nếu Sale thật nhảy vào."
    )
    tags = models.ManyToManyField(
        FacebookLeadTag,
        blank=True,
        related_name="leads",
        verbose_name="Nhãn/Tag hội thoại",
    )
    is_ai_active = models.BooleanField(
        default=True,
        verbose_name="AI đang tiếp quản",
        help_text="Cờ bật/tắt AI cho cuộc hội thoại này. Tắt nếu Sale thật nhảy vào.",
    )
    has_unread_message = models.BooleanField(
        default=False,
        verbose_name="Có tin nhắn chưa đọc",
    )
    unread_count = models.IntegerField(
        default=0,
        verbose_name="Số tin nhắn chưa đọc",
    )
    is_archived = models.BooleanField(
        default=False,
        verbose_name="Đã dọn dẹp / Ẩn khỏi inbox",
    )
    last_message_at = models.DateTimeField(
        null=True,
        blank=True,
        verbose_name="Thời điểm tin nhắn cuối",
    )
    last_message_preview = models.CharField(
        max_length=255,
        blank=True,
        verbose_name="Nội dung tin nhắn cuối (tóm tắt)",
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
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        verbose_name = "Hội thoại Facebook"
        verbose_name_plural = "Hội thoại Facebook"
        unique_together = [("page_config", "fb_user_id")]
        ordering = ["-last_message_at"]

    def __str__(self):
        return f"{self.fb_user_name or self.fb_user_id} @ {self.page_config.page_name}"

    @property
    def status(self):
        if self.is_archived:
            return "archived"
        if self.customer_id:
            return "converted"
        if self.is_customer_converted:
            if not self.detected_phone:
                return "converted"
            from crm.models import Customer
            company_id = getattr(self, "company_id", None) or (self.page_config.company_id if hasattr(self, "page_config") and self.page_config else None)
            if company_id and Customer.objects.filter(company_id=company_id, phone=self.detected_phone).exists():
                return "converted"
            return "not_added"
        return "not_added"


# ── Model 3: Tin nhắn 2 chiều Facebook ───────────────────────────────────────

class FacebookMessage(models.Model):
    """
    Lưu từng tin nhắn trong hội thoại giữa Khách hàng và Trang Facebook.
    """

    SENDER_CHOICES = [
        ("customer", "Khách hàng"),
        ("page", "Trang Facebook (Admin)"),
    ]

    lead = models.ForeignKey(
        FacebookLead,
        on_delete=models.CASCADE,
        related_name="messages",
        verbose_name="Hội thoại",
    )
    fb_message_id = models.CharField(
        max_length=100,
        unique=True,
        blank=True,
        null=True,
        verbose_name="Facebook Message ID",
    )
    sender_type = models.CharField(
        max_length=20,
        choices=SENDER_CHOICES,
        default="customer",
        verbose_name="Người gửi",
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
    text = models.TextField(
        blank=True,
        verbose_name="Nội dung văn bản",
    )
    attachment_url = models.URLField(
        max_length=1000,
        blank=True,
        null=True,
        verbose_name="Đính kèm (URL ảnh/file)",
    )
    attachment_type = models.CharField(
        max_length=50,
        blank=True,
        verbose_name="Loại đính kèm (image, file, carousel...)",
    )
    payload = models.JSONField(
        blank=True,
        null=True,
        verbose_name="Dữ liệu mở rộng (Carousel/JSON)",
    )
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        verbose_name = "Tin nhắn Facebook"
        verbose_name_plural = "Tin nhắn Facebook"
        ordering = ["created_at", "id"]

    def __str__(self):
        preview = (self.text or "[Đính kèm]")[:40]
        return f"[{self.sender_type}] {preview}"


# ── Model 4: Thư viện hình ảnh & video gửi nhanh (Quick Media Asset) ─────────

class QuickMediaAsset(models.Model):
    """
    Thư viện file mẫu gửi nhanh cho hội thoại (catalogue, bảng giá, hình sản phẩm...).
    """
    MEDIA_TYPES = [
        ("image", "Hình ảnh"),
        ("video", "Video"),
        ("file", "Tài liệu/File"),
    ]

    company = models.ForeignKey(
        "users.Company",
        on_delete=models.CASCADE,
        related_name="quick_media_assets",
        verbose_name="Công ty",
    )
    title = models.CharField(
        max_length=255,
        verbose_name="Tiêu đề / Tên mẫu",
        help_text="Ví dụ: Bảng báo giá sỉ 2026, Hình Sâm VIP...",
    )
    folder = models.CharField(
        max_length=100,
        default="Chung",
        verbose_name="Thư mục/Nhóm",
    )
    media_type = models.CharField(
        max_length=20,
        choices=MEDIA_TYPES,
        default="image",
        verbose_name="Loại file",
    )
    file_url = models.CharField(
        max_length=1000,
        verbose_name="URL file/ảnh",
        blank=True,
    )
    created_by = models.ForeignKey(
        "users.User",
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        verbose_name="Người tạo",
    )
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        verbose_name = "Thư viện file gửi nhanh"
        verbose_name_plural = "Thư viện file gửi nhanh"
        ordering = ["-created_at"]

    def __str__(self):
        return self.title


# ── Model 5: Ghi chú nội bộ cho ca làm việc / Sale ───────────────────────────

class FacebookLeadNote(models.Model):
    lead = models.ForeignKey(
        FacebookLead,
        on_delete=models.CASCADE,
        related_name="internal_notes",
        verbose_name="Hội thoại",
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
        verbose_name = "Ghi chú nội bộ hội thoại"
        verbose_name_plural = "Ghi chú nội bộ hội thoại"
        ordering = ["-created_at"]

    def __str__(self):
        return f"Note on {self.lead_id} by {self.user_id}"


# ── Model 6: Văn bản tin nhắn mẫu (Quick Reply / Shortcuts) ─────────────────

class FacebookQuickReply(models.Model):
    company = models.ForeignKey(
        "users.Company",
        on_delete=models.CASCADE,
        related_name="fb_quick_replies",
        verbose_name="Công ty",
    )
    shortcut = models.CharField(
        max_length=50,
        blank=True,
        verbose_name="Cú pháp gõ tắt (vd: /stk)",
    )
    title = models.CharField(
        max_length=100,
        verbose_name="Tiêu đề mẫu tin",
    )
    content = models.TextField(verbose_name="Nội dung tin nhắn mẫu")
    created_by = models.ForeignKey(
        "users.User",
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        verbose_name="Người tạo",
    )
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        verbose_name = "Tin nhắn mẫu Facebook"
        verbose_name_plural = "Tin nhắn mẫu Facebook"
        ordering = ["title"]

    def __str__(self):
        return f"{self.shortcut or ''} - {self.title}"


# ── Model 7: Cấu hình bài viết cụ thể (FacebookPostRule) ─────────────────────

class FacebookPostRule(models.Model):
    """
    Tầng 1 (Ưu tiên cao nhất):
    Cấu hình trả lời tự động cho các bài viết Facebook cụ thể (chạy Ads, khuyến mãi...).
    """

    company = models.ForeignKey(
        "users.Company",
        on_delete=models.CASCADE,
        related_name="fb_post_rules",
        verbose_name="Công ty",
    )
    page_config = models.ForeignKey(
        FacebookPageConfig,
        on_delete=models.CASCADE,
        related_name="post_rules",
        verbose_name="Trang Facebook",
    )
    post_id_list = models.TextField(
        verbose_name="Danh sách ID bài viết",
        help_text="Các Post ID cách nhau bởi dấu phẩy, khoảng trắng hoặc xuống dòng (VD: 123456, 789101).",
    )
    keywords = models.TextField(
        blank=True,
        null=True,
        verbose_name="Từ khóa lọc trong bài viết",
        help_text="Để trống = áp dụng cho mọi bình luận trong bài viết. Nhiều từ khóa cách nhau bằng dấu phẩy.",
    )
    post_note = models.CharField(
        max_length=255,
        blank=True,
        verbose_name="Ghi chú mô tả bài viết / chiến dịch",
    )
    comment_reply = models.TextField(
        blank=True,
        verbose_name="Nội dung trả lời bình luận",
        help_text="Hỗ trợ Spintax {A|B|C} và biến {name}.",
    )
    private_message = models.TextField(
        blank=True,
        verbose_name="Nội dung tin nhắn riêng gửi khách",
        help_text="Hỗ trợ Spintax {A|B|C} và biến {name}.",
    )
    enable_like = models.BooleanField(
        default=True,
        verbose_name="Tự động Like bình luận bài viết này",
    )
    is_active = models.BooleanField(
        default=True,
        verbose_name="Đang hoạt động",
    )
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        verbose_name = "Cấu hình bài viết Facebook"
        verbose_name_plural = "Cấu hình bài viết Facebook"
        ordering = ["-created_at"]

    def __str__(self):
        return f"PostRule #{self.id} ({self.post_note or self.post_id_list[:30]})"


# ── Model 8: Cấu hình theo bộ từ khóa (FacebookKeywordRule) ──────────────────

class FacebookKeywordRule(models.Model):
    """
    Tầng 2:
    Cấu hình trả lời tự động theo từ khóa cho Fanpage (khớp có chứa hoặc chính xác).
    """

    MATCH_CONTAINS = "contains"
    MATCH_EXACT = "exact"
    MATCH_CHOICES = [
        (MATCH_CONTAINS, "Có chứa từ khóa"),
        (MATCH_EXACT, "Khớp chính xác 100%"),
    ]

    company = models.ForeignKey(
        "users.Company",
        on_delete=models.CASCADE,
        related_name="fb_keyword_rules",
        verbose_name="Công ty",
    )
    page_config = models.ForeignKey(
        FacebookPageConfig,
        on_delete=models.CASCADE,
        related_name="keyword_rules",
        verbose_name="Trang Facebook",
    )
    keywords = models.JSONField(
        default=list,
        verbose_name="Danh sách từ khóa",
        help_text='Mảng các từ khóa (VD: ["giá", "báo giá", "tư vấn", "bao nhiêu"])',
    )
    match_type = models.CharField(
        max_length=20,
        choices=MATCH_CHOICES,
        default=MATCH_CONTAINS,
        verbose_name="Kiểu so khớp",
    )
    comment_reply = models.TextField(
        blank=True,
        verbose_name="Nội dung trả lời bình luận",
        help_text="Hỗ trợ Spintax {A|B|C} và biến {name}.",
    )
    private_message = models.TextField(
        blank=True,
        verbose_name="Nội dung tin nhắn riêng gửi khách",
        help_text="Hỗ trợ Spintax {A|B|C} và biến {name}.",
    )
    use_for_inbox = models.BooleanField(
        default=False,
        verbose_name="Áp dụng cả khi khách nhắn tin trực tiếp vào Messenger",
    )
    is_active = models.BooleanField(
        default=True,
        verbose_name="Đang hoạt động",
    )
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        verbose_name = "Quy tắc từ khóa Facebook"
        verbose_name_plural = "Quy tắc từ khóa Facebook"
        ordering = ["-created_at"]

    def __str__(self):
        kw_str = ", ".join(self.keywords[:3]) if isinstance(self.keywords, list) else str(self.keywords)
        return f"KeywordRule #{self.id} [{kw_str}]"


# ── Model 9: Nhật ký tương tác Bot (FacebookBotActivityLog) ──────────────────

class FacebookBotActivityLog(models.Model):
    """
    Ghi nhận toàn bộ lịch sử tương tác của Bot Facebook (Like, Reply, Inbox, Bỏ qua...).
    """

    EVENT_COMMENT = "comment"
    EVENT_MESSAGE = "message"
    EVENT_CHOICES = [
        (EVENT_COMMENT, "Bình luận (Comment)"),
        (EVENT_MESSAGE, "Tin nhắn (Message)"),
    ]

    STATUS_SUCCESS = "success"
    STATUS_SKIPPED_COOLDOWN = "skipped_cooldown"
    STATUS_SKIPPED_OLD = "skipped_old"
    STATUS_ERROR = "error"
    STATUS_CHOICES = [
        (STATUS_SUCCESS, "Thành công"),
        (STATUS_SKIPPED_COOLDOWN, "Bỏ qua (Cooldown 5s)"),
        (STATUS_SKIPPED_OLD, "Bỏ qua (Tin cũ >60s)"),
        (STATUS_ERROR, "Lỗi"),
    ]

    company = models.ForeignKey(
        "users.Company",
        on_delete=models.CASCADE,
        related_name="fb_bot_activity_logs",
        verbose_name="Công ty",
    )
    page_config = models.ForeignKey(
        FacebookPageConfig,
        on_delete=models.CASCADE,
        related_name="bot_activity_logs",
        verbose_name="Trang Facebook",
    )
    post_id = models.CharField(
        max_length=100,
        blank=True,
        null=True,
        verbose_name="ID Bài viết",
    )
    fb_sender_id = models.CharField(
        max_length=100,
        verbose_name="Facebook Sender ID",
    )
    customer_name = models.CharField(
        max_length=255,
        blank=True,
        verbose_name="Tên khách hàng",
    )
    event_type = models.CharField(
        max_length=30,
        choices=EVENT_CHOICES,
        default=EVENT_COMMENT,
        verbose_name="Loại tương tác",
    )
    trigger_content = models.TextField(
        blank=True,
        verbose_name="Nội dung khách gửi",
    )
    action_taken = models.CharField(
        max_length=255,
        verbose_name="Hành động đã thực hiện",
        help_text="VD: Like cmt, Reply cmt, Gửi inbox riêng, AI tư vấn...",
    )
    status = models.CharField(
        max_length=30,
        choices=STATUS_CHOICES,
        default=STATUS_SUCCESS,
        verbose_name="Trạng thái",
    )
    details = models.TextField(
        blank=True,
        verbose_name="Chi tiết quy tắc / Lỗi",
    )
    fb_item_id = models.CharField(
        max_length=150,
        db_index=True,
        verbose_name="ID bình luận / tin nhắn để chống lặp",
    )
    created_at = models.DateTimeField(
        auto_now_add=True,
        db_index=True,
        verbose_name="Thời gian",
    )

    class Meta:
        verbose_name = "Nhật ký tương tác Bot Facebook"
        verbose_name_plural = "Nhật ký tương tác Bot Facebook"
        ordering = ["-created_at"]

    def __str__(self):
        return f"[{self.event_type}] {self.customer_name}: {self.action_taken} ({self.status})"



