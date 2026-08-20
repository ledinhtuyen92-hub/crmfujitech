from django.db import models


class CustomerTag(models.Model):
    """Tag phân loại khách hàng — do Quản lý tạo sẵn, Sale gán vào khách."""

    company = models.ForeignKey(
        "users.Company",
        on_delete=models.CASCADE,
        related_name="customer_tags",
        verbose_name="Công ty",
    )
    name = models.CharField(max_length=100, verbose_name="Tên tag")
    color = models.CharField(
        max_length=20,
        default="#1649c9",
        verbose_name="Màu sắc",
        help_text="Mã màu hex, vd: #FF5733",
    )

    class Meta:
        verbose_name = "Tag khách hàng"
        verbose_name_plural = "Tag khách hàng"
        constraints = [
            models.UniqueConstraint(
                fields=["company", "name"],
                name="unique_customer_tag_per_company",
            )
        ]

    def __str__(self):
        return f"{self.name} ({self.company.name})"


class Customer(models.Model):
    """Khách hàng / Lead — trung tâm của module CRM."""

    SOURCE_FACEBOOK = "facebook"
    SOURCE_ZALO = "zalo"
    SOURCE_REFERRAL = "referral"
    SOURCE_WALK_IN = "walk_in"
    SOURCE_WEBSITE = "website"
    SOURCE_OTHER = "other"
    SOURCE_CHOICES = [
        (SOURCE_FACEBOOK, "Facebook"),
        (SOURCE_ZALO, "Zalo"),
        (SOURCE_REFERRAL, "Giới thiệu"),
        (SOURCE_WALK_IN, "Đến trực tiếp"),
        (SOURCE_WEBSITE, "Website"),
        (SOURCE_OTHER, "Khác"),
    ]

    STATUS_NEW = "new"
    STATUS_POTENTIAL = "potential"
    STATUS_ACTIVE = "active"
    STATUS_HAS_ORDER = "has_order"
    STATUS_REPEAT_ORDER = "repeat_order"
    STATUS_LOST = "lost"
    STATUS_CHOICES = [
        (STATUS_NEW, "Khách mới"),
        (STATUS_POTENTIAL, "Tìm hiểu nhu cầu"),
        (STATUS_ACTIVE, "Sắp chốt"),
        (STATUS_LOST, "Không còn nhu cầu"),
        (STATUS_HAS_ORDER, "Đã có đơn hàng"),
        (STATUS_REPEAT_ORDER, "Mua thêm đơn hàng"),
    ]

    PRIORITY_P1 = "p1"
    PRIORITY_P2 = "p2"
    PRIORITY_P3 = "p3"
    PRIORITY_P4 = "p4"
    PRIORITY_CHOICES = [
        (PRIORITY_P1, "Ưu tiên 1 (Rất cao)"),
        (PRIORITY_P2, "Ưu tiên 2 (Cao)"),
        (PRIORITY_P3, "Ưu tiên 3 (Trung bình)"),
        (PRIORITY_P4, "Ưu tiên 4 (Thấp)"),
    ]

    company = models.ForeignKey(
        "users.Company",
        on_delete=models.CASCADE,
        related_name="customers",
        verbose_name="Công ty",
    )
    name = models.CharField(max_length=255, verbose_name="Họ và tên")
    company_name = models.CharField(max_length=255, blank=True, verbose_name="Tên công ty (KH)")
    tax_code = models.CharField(max_length=50, blank=True, verbose_name="Mã số thuế (KH)")
    phone = models.CharField(max_length=20, verbose_name="Số điện thoại")
    email = models.EmailField(blank=True, verbose_name="Email")
    address = models.TextField(blank=True, verbose_name="Địa chỉ")
    city = models.CharField(max_length=100, blank=True, verbose_name="Tỉnh/Thành phố")
    birthday = models.DateField(null=True, blank=True, verbose_name="Ngày sinh")
    source = models.CharField(
        max_length=100,
        choices=SOURCE_CHOICES,
        default=SOURCE_OTHER,
        verbose_name="Nguồn khách",
    )
    status = models.CharField(
        max_length=20,
        choices=STATUS_CHOICES,
        default=STATUS_NEW,
        verbose_name="Trạng thái",
    )
    priority_level = models.CharField(
        max_length=10,
        choices=PRIORITY_CHOICES,
        default=PRIORITY_P4,
        verbose_name="Mức độ ưu tiên",
    )
    tags = models.ManyToManyField(
        CustomerTag,
        blank=True,
        related_name="customers",
        verbose_name="Tags",
    )
    is_inactive = models.BooleanField(
        default=False,
        verbose_name="Không hoạt động (Ngủ đông)"
    )
    assigned_to = models.ForeignKey(
        "users.User",
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="assigned_customers",
        verbose_name="Nhân viên phụ trách",
    )
    created_by = models.ForeignKey(
        "users.User",
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="created_customers",
        verbose_name="Người tạo",
    )
    expected_quantity = models.IntegerField(
        null=True,
        blank=True,
        verbose_name="Số lượng SP dự kiến"
    )
    notes = models.TextField(blank=True, verbose_name="Ghi chú")
    # ── Liên kết Zalo Social Lead (tùy chọn) ─────────────────────────
    social_lead = models.OneToOneField(
        "zalo_integration.SocialLead",
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="converted_customer",
        verbose_name="Social Lead (Zalo)",
        help_text="Liên kết về SocialLead nếu khách được convert từ Zalo OA.",
    )
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        verbose_name = "Khách hàng"
        verbose_name_plural = "Khách hàng"
        ordering = ["-created_at"]
        constraints = [
            models.UniqueConstraint(
                fields=["company", "phone"],
                name="unique_customer_phone_per_company",
            )
        ]

    def __str__(self):
        return f"{self.name} ({self.phone})"


class CustomerContact(models.Model):
    """Đầu mối liên hệ phụ của khách hàng (nhiều người tại một công ty khách)."""

    customer = models.ForeignKey(
        "crm.Customer",
        on_delete=models.CASCADE,
        related_name="contacts",
        verbose_name="Khách hàng",
    )
    name = models.CharField(max_length=255, verbose_name="Họ và tên")
    phone = models.CharField(max_length=20, blank=True, verbose_name="Số điện thoại")
    email = models.EmailField(blank=True, verbose_name="Email")
    position = models.CharField(max_length=100, blank=True, verbose_name="Chức vụ")

    class Meta:
        verbose_name = "Đầu mối liên hệ"
        verbose_name_plural = "Đầu mối liên hệ"

    def __str__(self):
        return f"{self.name} — {self.customer.name}"


class CustomerInteraction(models.Model):
    """Lịch sử chăm sóc khách hàng — lưu thành timeline có Timestamp."""

    TYPE_CALL = "call"
    TYPE_MEETING = "meeting"
    TYPE_EMAIL = "email"
    TYPE_ZALO = "zalo"
    TYPE_QUOTATION = "quotation"
    TYPE_CARE = "care"
    TYPE_SYSTEM = "system"
    TYPE_CHOICES = [
        (TYPE_CALL, "Gọi điện"),
        (TYPE_MEETING, "Gặp mặt"),
        (TYPE_EMAIL, "Gửi Email"),
        (TYPE_ZALO, "Nhắn Zalo"),
        (TYPE_QUOTATION, "Gửi báo giá"),
        (TYPE_CARE, "Chăm sóc"),
        (TYPE_SYSTEM, "Hệ thống tự động"),
    ]

    RESULT_INTERESTED = "interested"
    RESULT_NOT_INTERESTED = "not_interested"
    RESULT_NEED_FOLLOW_UP = "need_follow_up"
    RESULT_CLOSED = "closed"
    RESULT_CHOICES = [
        (RESULT_INTERESTED, "Quan tâm"),
        (RESULT_NOT_INTERESTED, "Không quan tâm"),
        (RESULT_NEED_FOLLOW_UP, "Cần follow-up"),
        (RESULT_CLOSED, "Đã chốt"),
    ]

    customer = models.ForeignKey(
        "crm.Customer",
        on_delete=models.CASCADE,
        related_name="interactions",
        verbose_name="Khách hàng",
    )
    created_by = models.ForeignKey(
        "users.User",
        on_delete=models.PROTECT,
        related_name="customer_interactions",
        verbose_name="Người thực hiện",
    )
    type = models.CharField(
        max_length=20,
        choices=TYPE_CHOICES,
        verbose_name="Hình thức",
    )
    content = models.TextField(verbose_name="Nội dung")
    result = models.CharField(
        max_length=20,
        choices=RESULT_CHOICES,
        blank=True,
        default="",
        verbose_name="Kết quả",
    )
    next_follow_up = models.DateTimeField(
        null=True,
        blank=True,
        verbose_name="Lịch follow-up tiếp theo",
    )
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        verbose_name = "Lịch sử chăm sóc"
        verbose_name_plural = "Lịch sử chăm sóc"
        ordering = ["-created_at"]

    def __str__(self):
        return f"{self.customer.name} — {self.get_type_display()} ({self.created_at.strftime('%d/%m/%Y')})"


class InteractionAttachment(models.Model):
    """File đính kèm cho mỗi lần tương tác (hình ảnh, PDF, Excel...)."""
    interaction = models.ForeignKey(
        CustomerInteraction,
        on_delete=models.CASCADE,
        related_name="attachments",
        verbose_name="Lịch sử chăm sóc",
    )
    file = models.FileField(upload_to="interactions/%Y/%m/", verbose_name="File đính kèm")
    file_name = models.CharField(max_length=255, verbose_name="Tên file gốc")
    file_size = models.IntegerField(default=0, verbose_name="Dung lượng (bytes)")
    uploaded_at = models.DateTimeField(auto_now_add=True, verbose_name="Thời gian tải lên")

    class Meta:
        verbose_name = "File đính kèm tương tác"
        verbose_name_plural = "File đính kèm tương tác"
        ordering = ["-uploaded_at"]

    def __str__(self):
        return f"{self.file_name} ({self.interaction.id})"
