import uuid
from django.db import models


class Quotation(models.Model):
    """Báo giá — được tạo từ profile khách hàng, có thể chuyển thành Đơn hàng."""

    STATUS_DRAFT = "draft"
    STATUS_PENDING_APPROVAL = "pending_approval"
    STATUS_APPROVED = "approved"
    STATUS_SENT = "sent"
    STATUS_ACCEPTED = "accepted"
    STATUS_REJECTED = "rejected"
    STATUS_CHOICES = [
        (STATUS_DRAFT, "Nháp"),
        (STATUS_PENDING_APPROVAL, "Chờ duyệt"),
        (STATUS_APPROVED, "Đã duyệt"),
        (STATUS_SENT, "Đã gửi"),
        (STATUS_ACCEPTED, "Đã chấp nhận"),
        (STATUS_REJECTED, "Đã từ chối"),
    ]

    company = models.ForeignKey(
        "users.Company",
        on_delete=models.CASCADE,
        related_name="quotations",
        verbose_name="Công ty",
    )
    quotation_number = models.CharField(
        max_length=50,
        verbose_name="Mã báo giá",
    )
    customer = models.ForeignKey(
        "crm.Customer",
        on_delete=models.PROTECT,
        related_name="quotations",
        verbose_name="Khách hàng",
    )
    # --- Snapshot fields ---
    customer_name_snapshot = models.CharField(max_length=255, blank=True, verbose_name="Tên khách hàng (snapshot)")
    customer_company_snapshot = models.CharField(max_length=255, blank=True, verbose_name="Tên công ty KH (snapshot)")
    customer_tax_code_snapshot = models.CharField(max_length=50, blank=True, verbose_name="Mã số thuế KH (snapshot)")
    customer_phone_snapshot = models.CharField(max_length=50, blank=True, verbose_name="SĐT KH (snapshot)")
    customer_address_snapshot = models.TextField(blank=True, verbose_name="Địa chỉ KH (snapshot)")
    customer_city_snapshot = models.CharField(max_length=100, blank=True, verbose_name="Thành phố KH (snapshot)")
    created_by = models.ForeignKey(
        "users.User",
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="created_quotations",
        verbose_name="Người tạo",
    )
    status = models.CharField(
        max_length=20,
        choices=STATUS_CHOICES,
        default=STATUS_DRAFT,
        verbose_name="Trạng thái",
    )
    installation_date = models.DateField(
        null=True,
        blank=True,
        verbose_name="Ngày lắp đặt dự kiến",
    )
    notes = models.TextField(blank=True, verbose_name="Ghi chú")
    discount_total = models.DecimalField(
        max_digits=15,
        decimal_places=2,
        default=0,
        verbose_name="Tổng chiết khấu",
    )
    
    # ── Fields cho Public Link & Ký duyệt ──
    public_token = models.UUIDField(
        default=uuid.uuid4,
        editable=False,
        unique=True,
        verbose_name="Token Public",
    )
    public_link_expires_at = models.DateTimeField(
        null=True,
        blank=True,
        verbose_name="Hết hạn Link Public",
    )
    signature_image = models.TextField(
        blank=True,
        null=True,
        verbose_name="Chữ ký khách hàng (Base64)",
    )
    signed_at = models.DateTimeField(
        blank=True,
        null=True,
        verbose_name="Thời gian ký",
    )
    customer_name_signed = models.CharField(
        max_length=255,
        blank=True,
        null=True,
        verbose_name="Tên người ký",
    )
    subtotal = models.DecimalField(
        max_digits=15,
        decimal_places=2,
        default=0,
        verbose_name="Tổng trước thuế (Subtotal)",
    )
    vat_rate = models.DecimalField(
        max_digits=5,
        decimal_places=2,
        default=0,
        verbose_name="% Thuế VAT",
    )
    vat_amount = models.DecimalField(
        max_digits=15,
        decimal_places=2,
        default=0,
        verbose_name="Tiền thuế VAT",
    )
    total_amount = models.DecimalField(
        max_digits=15,
        decimal_places=2,
        default=0,
        verbose_name="Tổng cộng sau thuế",
    )

    order = models.OneToOneField(
        "orders.Order",
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="linked_quotation",
        verbose_name="Đơn hàng liên kết",
        help_text="Đơn hàng được sinh ra sau khi duyệt báo giá",
    )
    template = models.ForeignKey(
        "sales.QuotationTemplate",
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="applied_quotations",
        verbose_name="Mẫu báo giá sử dụng",
    )
    shipping_fee = models.DecimalField(
        max_digits=15,
        decimal_places=2,
        default=0,
        verbose_name="Chi phí vận chuyển",
    )
    installation_fee = models.DecimalField(
        max_digits=15,
        decimal_places=2,
        default=0,
        verbose_name="Chi phí lắp đặt",
    )
    delivery_time = models.TextField(
        blank=True,
        verbose_name="Thời gian giao hàng dự kiến",
    )
    warranty_months = models.IntegerField(
        default=12,
        verbose_name="Số tháng bảo hành",
    )
    payment_terms = models.TextField(
        blank=True,
        verbose_name="Điều khoản thanh toán (Text)",
    )
    payment_terms_schedule = models.JSONField(
        default=list,
        blank=True,
        verbose_name="Tiến độ thanh toán",
    )
    validity_days = models.PositiveIntegerField(
        default=30,
        verbose_name="Hiệu lực báo giá (ngày)",
    )
    custom_data = models.JSONField(
        default=dict,
        blank=True,
        verbose_name="Dữ liệu mở rộng theo mẫu",
    )
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        verbose_name = "Báo giá"
        verbose_name_plural = "Báo giá"
        ordering = ["-created_at"]
        constraints = [
            models.UniqueConstraint(
                fields=["company", "quotation_number"],
                name="unique_quotation_number_per_company",
            ),
            models.CheckConstraint(
                check=models.Q(total_amount__gte=0),
                name="quotation_total_amount_gte_0",
            ),
            models.CheckConstraint(
                check=models.Q(discount_total__gte=0),
                name="quotation_discount_total_gte_0",
            ),
        ]

    def __str__(self):
        return self.quotation_number

    def save(self, *args, **kwargs):
        # Auto snapshot customer data on creation or if it's missing (and we have a customer)
        if self.customer:
            # We snapshot if this is a new record (not pk) or if the snapshot fields are suspiciously empty.
            if not self.pk or not self.customer_name_snapshot:
                self.customer_name_snapshot = self.customer.name or ''
                self.customer_company_snapshot = getattr(self.customer, 'company_name', '') or ''
                self.customer_tax_code_snapshot = getattr(self.customer, 'tax_code', '') or ''
                self.customer_phone_snapshot = getattr(self.customer, 'phone', '') or ''
                self.customer_address_snapshot = getattr(self.customer, 'address', '') or ''
                self.customer_city_snapshot = getattr(self.customer, 'city', '') or ''
                
        super().save(*args, **kwargs)

    def clone(self):
        """Tạo một bản sao của báo giá hiện tại (thường dùng khi tạo version mới)."""
        new_q = Quotation.objects.get(pk=self.pk)
        new_q.pk = None
        new_q.quotation_number = f"{self.quotation_number}-COPY"
        new_q.status = self.STATUS_DRAFT
        new_q.save()

        # Copy items
        for item in self.items.all():
            item.pk = None
            item.quotation = new_q
            item.save()

        return new_q

    def handle_approval_result(self, approval_status):
        """
        Được gọi tự động khi ApprovalRequest liên kết với Báo giá này thay đổi trạng thái.
        """
        if approval_status == "approved":
            self.status = self.STATUS_APPROVED
            self.save(update_fields=["status"])
        elif approval_status == "rejected":
            self.status = self.STATUS_DRAFT
            self.save(update_fields=["status"])


class QuotationItem(models.Model):
    """Dòng sản phẩm trong báo giá — hỗ trợ kích thước (width × height) và chiết khấu."""

    quotation = models.ForeignKey(
        "sales.Quotation",
        on_delete=models.CASCADE,
        related_name="items",
        verbose_name="Báo giá",
    )
    product = models.ForeignKey(
        "inventory.Product",
        on_delete=models.PROTECT,
        related_name="quotation_items",
        verbose_name="Sản phẩm",
        null=True,
        blank=True,
    )
    
    ITEM_TYPE_PRODUCT = 'product'
    ITEM_TYPE_SERVICE = 'service'
    ITEM_TYPE_CHOICES = [
        (ITEM_TYPE_PRODUCT, 'Sản phẩm'),
        (ITEM_TYPE_SERVICE, 'Dịch vụ / Chi phí'),
    ]
    item_type = models.CharField(
        max_length=20,
        choices=ITEM_TYPE_CHOICES,
        default=ITEM_TYPE_PRODUCT,
        verbose_name="Loại item",
    )
    # Snapshot thông tin sản phẩm tại thời điểm lập báo giá
    product_name = models.CharField(
        max_length=255,
        verbose_name="Tên sản phẩm (snapshot)",
    )
    unit_price = models.DecimalField(
        max_digits=15,
        decimal_places=2,
        verbose_name="Đơn giá (snapshot)",
    )
    # Kích thước (đặc thù ngành: cửa nhôm, nội thất...)
    width = models.DecimalField(
        max_digits=10,
        decimal_places=2,
        default=0,
        verbose_name="Chiều rộng (m)",
    )
    height = models.DecimalField(
        max_digits=10,
        decimal_places=2,
        default=0,
        verbose_name="Chiều cao (m)",
    )
    quantity = models.PositiveIntegerField(default=1, verbose_name="Số lượng")
    discount_percent = models.DecimalField(
        max_digits=5,
        decimal_places=2,
        default=0,
        verbose_name="Chiết khấu (%)",
    )
    line_total = models.DecimalField(
        max_digits=15,
        decimal_places=2,
        default=0,
        verbose_name="Thành tiền",
    )
    note = models.CharField(max_length=255, blank=True, verbose_name="Ghi chú dòng")
    length = models.DecimalField(
        max_digits=10,
        decimal_places=2,
        default=0,
        verbose_name="Chiều dài (m)",
    )
    area = models.DecimalField(
        max_digits=10,
        decimal_places=2,
        default=0,
        verbose_name="Diện tích (m²)",
    )
    spec = models.CharField(
        max_length=255,
        blank=True,
        verbose_name="Quy cách / Mô tả",
    )
    warranty = models.CharField(
        max_length=100,
        blank=True,
        verbose_name="Thời gian bảo hành",
    )
    thickness = models.DecimalField(
        max_digits=10,
        decimal_places=2,
        default=0,
        verbose_name="Chiều dày / Dày (mm/cm/m)",
    )
    product_image = models.CharField(
        max_length=500,
        blank=True,
        verbose_name="Hình ảnh sản phẩm (snapshot URL)",
    )
    custom_data = models.JSONField(
        default=dict,
        blank=True,
        verbose_name="Dữ liệu mở rộng dòng",
    )

    class Meta:
        verbose_name = "Dòng báo giá"
        verbose_name_plural = "Dòng báo giá"
        constraints = [
            models.CheckConstraint(
                check=models.Q(quantity__gt=0),
                name="quotation_item_quantity_gt_0",
            ),
            models.CheckConstraint(
                check=models.Q(unit_price__gte=0),
                name="quotation_item_unit_price_gte_0",
            ),
            models.CheckConstraint(
                check=models.Q(discount_percent__gte=0) & models.Q(discount_percent__lte=100),
                name="quotation_item_discount_percent_valid",
            ),
        ]

    def __str__(self):
        return f"{self.quotation.quotation_number} — {self.product_name} x{self.quantity}"


class QuotationTemplate(models.Model):
    """Mẫu báo giá — được quản lý bởi Superadmin, Admin công ty chọn để áp dụng cho công ty của mình."""

    name = models.CharField(max_length=100, verbose_name="Tên mẫu báo giá")
    code = models.SlugField(max_length=50, unique=True, verbose_name="Mã mẫu")
    description = models.TextField(blank=True, verbose_name="Mô tả")
    header_content = models.TextField(blank=True, verbose_name="Nội dung Header / Tiêu đề")
    footer_content = models.TextField(blank=True, verbose_name="Điều khoản & Footer")
    layout_style = models.CharField(max_length=50, default="modern_blue", verbose_name="Phong cách giao diện")
    layout_config = models.JSONField(
        default=dict,
        blank=True,
        verbose_name="Cấu hình Block Layout (Kéo thả)",
    )
    is_default = models.BooleanField(default=False, verbose_name="Mẫu mặc định hệ thống")
    is_active = models.BooleanField(default=True, verbose_name="Hoạt động")
    is_system_template = models.BooleanField(default=True, verbose_name="Mẫu hệ thống")
    company = models.ForeignKey(
        'users.Company',
        on_delete=models.CASCADE,
        null=True,
        blank=True,
        related_name='quotation_templates',
        verbose_name="Công ty sở hữu"
    )
    created_at = models.DateTimeField(auto_now_add=True, verbose_name="Ngày tạo")
    updated_at = models.DateTimeField(auto_now=True, verbose_name="Ngày cập nhật")

    class Meta:
        verbose_name = "Mẫu báo giá"
        verbose_name_plural = "Mẫu báo giá"
        ordering = ["-is_default", "name"]

    def __str__(self):
        return f"{self.name} ({self.code})"

    def save(self, *args, **kwargs):
        if self.is_default:
            # Đảm bảo chỉ có 1 mẫu mặc định trong toàn hệ thống
            QuotationTemplate.objects.filter(is_default=True).exclude(pk=self.pk).update(is_default=False)
        super().save(*args, **kwargs)


class SavedTemplateBlock(models.Model):
    """Lưu trữ các Block đã cấu hình sẵn của người dùng để kéo thả nhanh."""

    company = models.ForeignKey(
        "users.Company",
        on_delete=models.CASCADE,
        related_name="saved_blocks",
        verbose_name="Công ty",
    )
    name = models.CharField(max_length=100, verbose_name="Tên Block")
    block_type = models.CharField(max_length=50, verbose_name="Loại Block")
    props = models.JSONField(default=dict, verbose_name="Cấu hình Block")
    created_at = models.DateTimeField(auto_now_add=True, verbose_name="Ngày tạo")
    updated_at = models.DateTimeField(auto_now=True, verbose_name="Ngày cập nhật")

    class Meta:
        verbose_name = "Block mẫu đã lưu"
        verbose_name_plural = "Block mẫu đã lưu"
        ordering = ["-created_at"]

    def __str__(self):
        return f"{self.name} ({self.block_type})"
