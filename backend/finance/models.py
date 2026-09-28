from django.db import models
from django.utils import timezone


class OrderPaymentMilestone(models.Model):
    """Kỳ thanh toán theo Đơn hàng (Cọc Kỳ 1 / Trước giao hàng Kỳ 2 / Bảo hành...)"""

    TYPE_DEPOSIT = "deposit"
    TYPE_BEFORE_DELIVERY = "before_delivery"
    TYPE_AFTER_DELIVERY = "after_delivery"
    TYPE_WARRANTY = "warranty"
    TYPE_CHOICES = [
        (TYPE_DEPOSIT, "Kỳ 1: Đặt cọc (Trước sản xuất)"),
        (TYPE_BEFORE_DELIVERY, "Kỳ 2: Trước giao hàng / Xuất kho"),
        (TYPE_AFTER_DELIVERY, "Kỳ 3: Sau giao hàng & Lắp đặt"),
        (TYPE_WARRANTY, "Kỳ 4: Giữ lại bảo hành"),
    ]

    STATUS_PENDING = "pending"
    STATUS_PARTIAL = "partial"
    STATUS_PAID = "paid"
    STATUS_CHOICES = [
        (STATUS_PENDING, "Chờ thu"),
        (STATUS_PARTIAL, "Thu một phần"),
        (STATUS_PAID, "Đã hoàn tất"),
    ]

    company = models.ForeignKey(
        "users.Company",
        on_delete=models.CASCADE,
        related_name="payment_milestones",
        verbose_name="Công ty",
    )
    order = models.ForeignKey(
        "orders.Order",
        on_delete=models.CASCADE,
        related_name="payment_milestones",
        verbose_name="Đơn hàng",
    )
    milestone_type = models.CharField(
        max_length=30,
        choices=TYPE_CHOICES,
        default=TYPE_DEPOSIT,
        verbose_name="Loại kỳ thanh toán",
    )
    title = models.CharField(max_length=200, verbose_name="Tiêu đề kỳ")
    percentage = models.DecimalField(
        max_digits=5, decimal_places=2, default=0, verbose_name="Tỷ lệ %"
    )
    amount = models.DecimalField(
        max_digits=15, decimal_places=2, verbose_name="Số tiền phải thu"
    )
    paid_amount = models.DecimalField(
        max_digits=15, decimal_places=2, default=0, verbose_name="Số tiền đã thu"
    )
    status = models.CharField(
        max_length=20,
        choices=STATUS_CHOICES,
        default=STATUS_PENDING,
        verbose_name="Trạng thái",
    )
    due_date = models.DateField(null=True, blank=True, verbose_name="Hạn thanh toán")
    note = models.TextField(blank=True, verbose_name="Ghi chú")
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        verbose_name = "Kỳ thanh toán đơn hàng"
        verbose_name_plural = "Kỳ thanh toán đơn hàng"
        ordering = ["id"]

    def __str__(self):
        return f"{self.title} - {self.order.order_number}"

    def update_paid_status(self):
        """Cập nhật trạng thái paid_amount và status từ các phiếu thu."""
        total_receipts = (
            self.receipts.aggregate(s=models.Sum("amount"))["s"] or 0
        )
        self.paid_amount = total_receipts
        if float(self.paid_amount) >= float(self.amount):
            self.status = self.STATUS_PAID
        elif float(self.paid_amount) > 0:
            self.status = self.STATUS_PARTIAL
        else:
            self.status = self.STATUS_PENDING
        self.save(update_fields=["paid_amount", "status", "updated_at"])


class PaymentReceipt(models.Model):
    """Phiếu thu tiền gắn với Kỳ thanh toán & Đơn hàng."""

    METHOD_TRANSFER = "transfer"
    METHOD_CASH = "cash"
    METHOD_CARD = "card"
    METHOD_CHOICES = [
        (METHOD_TRANSFER, "Chuyển khoản ngân hàng"),
        (METHOD_CASH, "Tiền mặt"),
        (METHOD_CARD, "Thẻ / POS"),
    ]

    company = models.ForeignKey(
        "users.Company",
        on_delete=models.CASCADE,
        related_name="payment_receipts",
        verbose_name="Công ty",
    )
    receipt_code = models.CharField(
        max_length=50, verbose_name="Mã phiếu thu", unique=True
    )
    order = models.ForeignKey(
        "orders.Order",
        on_delete=models.CASCADE,
        related_name="payment_receipts",
        verbose_name="Đơn hàng",
    )
    milestone = models.ForeignKey(
        OrderPaymentMilestone,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="receipts",
        verbose_name="Kỳ thanh toán",
    )
    amount = models.DecimalField(
        max_digits=15, decimal_places=2, verbose_name="Số tiền thu"
    )
    payment_method = models.CharField(
        max_length=20,
        choices=METHOD_CHOICES,
        default=METHOD_TRANSFER,
        verbose_name="Hình thức",
    )
    payment_date = models.DateField(
        default=timezone.localdate, verbose_name="Ngày thu tiền"
    )
    reference_code = models.CharField(
        max_length=100, blank=True, verbose_name="Mã GD Ngân hàng"
    )
    note = models.TextField(blank=True, verbose_name="Ghi chú")
    created_by = models.ForeignKey(
        "users.User",
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="created_receipts",
        verbose_name="Người lập phiếu",
    )
    attachments = models.JSONField(
        default=list, blank=True, null=True, verbose_name="Chứng từ đính kèm"
    )
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        verbose_name = "Phiếu thu tiền"
        verbose_name_plural = "Phiếu thu tiền"
        ordering = ["-payment_date", "-created_at"]

    def __str__(self):
        return f"{self.receipt_code} - {self.amount}đ ({self.order.order_number})"

    @property
    def customer(self):
        return self.order.customer if (self.order_id and hasattr(self, "order") and self.order) else None

    def save(self, *args, **kwargs):
        super().save(*args, **kwargs)
        # Đồng bộ trạng thái milestone
        if self.milestone:
            self.milestone.update_paid_status()
        # Đồng bộ trạng thái tài chính của đơn hàng
        self.sync_order_financial_status()

    def sync_order_financial_status(self):
        order = self.order
        total_paid = float(order.paid_amount)
        total_order = float(order.total_amount or 0)

        if total_order > 0 and total_paid >= total_order:
            order.financial_status = order.FIN_STATUS_FULLY_PAID
        elif order.financial_status == order.FIN_STATUS_CREDIT_APPROVED:
            pass # Giữ nguyên trạng thái Duyệt xuất nợ ngoại lệ nếu chưa thu đủ
        elif total_paid > 0:
            order.financial_status = order.FIN_STATUS_DEPOSIT_PAID
        else:
            order.financial_status = order.FIN_STATUS_UNPAID
        order.save(update_fields=["financial_status"])
        try:
            from orders.signals import check_and_trigger_mo_gate
            check_and_trigger_mo_gate(order)
        except Exception:
            pass

    def delete(self, *args, **kwargs):
        milestone = self.milestone
        order = self.order
        super().delete(*args, **kwargs)
        
        if milestone:
            milestone.update_paid_status()
        
        if order:
            total_paid = float(order.paid_amount)
            total_order = float(order.total_amount or 0)
            if total_order > 0 and total_paid >= total_order:
                order.financial_status = order.FIN_STATUS_FULLY_PAID
            elif order.financial_status == order.FIN_STATUS_CREDIT_APPROVED:
                pass # Giữ nguyên trạng thái Duyệt xuất nợ ngoại lệ nếu chưa thu đủ
            elif total_paid > 0:
                order.financial_status = order.FIN_STATUS_DEPOSIT_PAID
            else:
                order.financial_status = order.FIN_STATUS_UNPAID
            order.save(update_fields=["financial_status"])
            try:
                from orders.signals import check_and_trigger_mo_gate
                check_and_trigger_mo_gate(order)
            except Exception:
                pass
