from django.db import models
from django.utils import timezone


class Order(models.Model):
    """Đơn hàng — trung tâm của workflow: Chờ duyệt → Chấp thuận → Xuất kho."""

    STATUS_PENDING = "pending"
    STATUS_APPROVED = "approved"
    STATUS_REJECTED = "rejected"
    STATUS_CANCELLED = "cancelled"
    STATUS_COMPLETED = "completed"
    STATUS_CHOICES = [
        (STATUS_PENDING, "Chờ duyệt"),
        (STATUS_APPROVED, "Đã được duyệt"),
        (STATUS_REJECTED, "Đã từ chối"),
        (STATUS_CANCELLED, "Đã hủy"),
        (STATUS_COMPLETED, "Hoàn thành"),
    ]

    FIN_STATUS_UNPAID = "unpaid"
    FIN_STATUS_DEPOSIT_PAID = "deposit_paid"
    FIN_STATUS_FULLY_PAID = "fully_paid"
    FIN_STATUS_CREDIT_APPROVED = "credit_approved"
    FIN_STATUS_CHOICES = [
        (FIN_STATUS_UNPAID, "Chờ thanh toán / Chờ cọc"),
        (FIN_STATUS_DEPOSIT_PAID, "Đã cọc (Đủ ĐK sản xuất)"),
        (FIN_STATUS_FULLY_PAID, "Đã thanh toán đủ (Đủ ĐK xuất kho)"),
        (FIN_STATUS_CREDIT_APPROVED, "Duyệt xuất nợ ngoại lệ"),
    ]

    company = models.ForeignKey(
        "users.Company",
        on_delete=models.CASCADE,
        related_name="orders",
        verbose_name="Công ty",
    )
    order_number = models.CharField(
        max_length=50,
        verbose_name="Mã đơn hàng",
        help_text="Format: [PREFIX]-[YYYYMMDD]-[SEQ], VD: DH-20240101-001",
    )
    customer = models.ForeignKey(
        "crm.Customer",
        on_delete=models.PROTECT,
        related_name="orders",
        verbose_name="Khách hàng",
    )
    # --- Snapshot fields ---
    customer_name_snapshot = models.CharField(max_length=255, blank=True, verbose_name="Tên khách hàng (snapshot)")
    customer_company_snapshot = models.CharField(max_length=255, blank=True, verbose_name="Tên công ty KH (snapshot)")
    customer_tax_code_snapshot = models.CharField(max_length=50, blank=True, verbose_name="Mã số thuế KH (snapshot)")
    customer_phone_snapshot = models.CharField(max_length=50, blank=True, verbose_name="SĐT KH (snapshot)")
    customer_address_snapshot = models.TextField(blank=True, verbose_name="Địa chỉ KH (snapshot)")
    customer_city_snapshot = models.CharField(max_length=100, blank=True, verbose_name="Thành phố KH (snapshot)")
    quotation = models.ForeignKey(
        "sales.Quotation",
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="orders",
        verbose_name="Báo giá gốc",
    )
    created_by = models.ForeignKey(
        "users.User",
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="created_orders",
        verbose_name="Người tạo",
    )
    approved_by = models.ForeignKey(
        "users.User",
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="approved_orders",
        verbose_name="Người duyệt",
    )
    status = models.CharField(
        max_length=20,
        choices=STATUS_CHOICES,
        default=STATUS_PENDING,
        verbose_name="Trạng thái",
        db_index=True,
    )
    financial_status = models.CharField(
        max_length=30,
        choices=FIN_STATUS_CHOICES,
        default=FIN_STATUS_UNPAID,
        verbose_name="Trạng thái tài chính",
        db_index=True,
    )
    
    PAYMENT_TARGET_CHOICES = [
        ("personal", "Cá nhân"),
        ("company", "Công ty"),
    ]
    payment_target = models.CharField(
        max_length=20,
        choices=PAYMENT_TARGET_CHOICES,
        null=True,
        blank=True,
        verbose_name="Đối tượng thanh toán",
        db_index=True,
    )
    payment_term = models.CharField(
        max_length=150,
        default="Cọc 30% - Giao hàng 70%",
        verbose_name="Mẫu thanh toán",
    )
    payment_terms_schedule = models.JSONField(
        default=list,
        blank=True,
        verbose_name="Tiến độ thanh toán",
    )
    installation_date = models.DateField(
        null=True,
        blank=True,
        verbose_name="Ngày lắp đặt",
    )
    notes = models.TextField(blank=True, verbose_name="Ghi chú")
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
    validity_days = models.PositiveIntegerField(
        default=30,
        verbose_name="Hiệu lực (ngày)",
    )
    discount_total = models.DecimalField(
        max_digits=15,
        decimal_places=2,
        default=0,
        verbose_name="Tổng chiết khấu",
    )
    total_amount = models.DecimalField(
        max_digits=15,
        decimal_places=2,
        default=0,
        verbose_name="Tổng cộng sau thuế",
    )
    approved_at = models.DateTimeField(
        null=True,
        blank=True,
        verbose_name="Thời điểm duyệt",
    )
    custom_data = models.JSONField(
        default=dict,
        blank=True,
        verbose_name="Dữ liệu mở rộng theo mẫu",
    )
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        verbose_name = "Đơn hàng"
        verbose_name_plural = "Đơn hàng"
        ordering = ["-created_at"]
        constraints = [
            models.UniqueConstraint(
                fields=["company", "order_number"],
                name="unique_order_number_per_company",
            ),
            models.CheckConstraint(
                check=models.Q(total_amount__gte=0),
                name="order_total_amount_gte_0",
            ),
            models.CheckConstraint(
                check=models.Q(discount_total__gte=0),
                name="order_discount_total_gte_0",
            ),
        ]

    def __str__(self):
        return self.order_number

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

    @property
    def paid_amount(self):
        try:
            total = self.payment_receipts.aggregate(s=models.Sum("amount"))["s"] or 0
            return float(total)
        except Exception:
            return 0.0

    @property
    def remaining_debt(self):
        return max(0.0, float(self.total_amount or 0) - self.paid_amount)

    def approve(self, approved_by_user):
        """
        Duyệt đơn hàng — chỉ gọi từ API view sau khi kiểm tra quyền.
        Tự động set approved_by, approved_at và trigger xuất kho.
        """
        if self.status != self.STATUS_PENDING:
            raise ValueError("Chỉ có thể duyệt đơn đang ở trạng thái 'Chờ duyệt'.")
        self.status = self.STATUS_APPROVED
        self.approved_by = approved_by_user
        self.approved_at = timezone.now()
        self.save(update_fields=["status", "approved_by", "approved_at", "updated_at"])
        
        # Tự động khởi tạo Công nợ / Kỳ thanh toán
        self.generate_payment_milestones()

    def generate_payment_milestones(self):
        """Khởi tạo OrderPaymentMilestone dựa vào payment_terms_schedule."""
        if not self.payment_terms_schedule:
            return
            
        from finance.models import OrderPaymentMilestone
        
        existing_milestones = OrderPaymentMilestone.objects.filter(order=self)
        if existing_milestones.exists():
            has_receipts = False
            for m in existing_milestones:
                if m.receipts.exists():
                    has_receipts = True
                    break
            if has_receipts:
                return
            existing_milestones.delete()
            
        total = float(self.total_amount or 0)
        
        for idx, term in enumerate(self.payment_terms_schedule):
            try:
                title = term.get("title", f"Kỳ {idx + 1}")
                percentage = float(term.get("percentage", 0))
                m_type = term.get("type", OrderPaymentMilestone.TYPE_DEPOSIT)
                amount = (total * percentage) / 100.0
                
                OrderPaymentMilestone.objects.create(
                    company=self.company,
                    order=self,
                    milestone_type=m_type,
                    title=title,
                    percentage=percentage,
                    amount=amount,
                    status=OrderPaymentMilestone.STATUS_PENDING
                )
            except Exception:
                pass

    def handle_approval_result(self, approval_status, acted_by=None):
        if approval_status == "approved":
            if self.status == self.STATUS_PENDING:
                self.approve(approved_by_user=acted_by)
            else:
                self.financial_status = self.FIN_STATUS_CREDIT_APPROVED
                self.save(update_fields=["financial_status", "updated_at"])
                try:
                    from orders.signals import check_and_trigger_mo_gate
                    check_and_trigger_mo_gate(self)
                except Exception:
                    pass
        elif approval_status == "rejected":
            if self.status == self.STATUS_PENDING:
                self.status = self.STATUS_REJECTED
                if acted_by:
                    self.approved_by = acted_by
                self.save(update_fields=["status", "approved_by", "updated_at"])

    def __str__(self):
        return self.order_number


class OrderItem(models.Model):
    """Dòng sản phẩm trong đơn hàng — hỗ trợ kích thước (width × height) và chiết khấu."""

    order = models.ForeignKey(
        "orders.Order",
        on_delete=models.CASCADE,
        related_name="items",
        verbose_name="Đơn hàng",
    )
    product = models.ForeignKey(
        "inventory.Product",
        on_delete=models.PROTECT,
        related_name="order_items",
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
    # Snapshot thông tin sản phẩm tại thời điểm lập đơn
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
        verbose_name="Diện tích (m2)",
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
        null=True,
        verbose_name="URL hình ảnh sản phẩm",
    )
    custom_data = models.JSONField(
        default=dict,
        blank=True,
        verbose_name="Dữ liệu tùy chỉnh khác (công thức, quy cách...)",
    )

    class Meta:
        ordering = ['id']
        verbose_name = "Dòng đơn hàng"
        verbose_name_plural = "Dòng đơn hàng"
        constraints = [
            models.CheckConstraint(
                check=models.Q(quantity__gt=0),
                name="order_item_quantity_gt_0",
            ),
            models.CheckConstraint(
                check=models.Q(unit_price__gte=0),
                name="order_item_unit_price_gte_0",
            ),
            models.CheckConstraint(
                check=models.Q(discount_percent__gte=0) & models.Q(discount_percent__lte=100),
                name="order_item_discount_percent_valid",
            ),
        ]

    def __str__(self):
        return f"{self.order.order_number} — {self.product_name} x{self.quantity}"
