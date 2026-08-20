from django.db import models


class DeliveryOrder(models.Model):
    """Lệnh giao hàng được sinh ra tự động từ Đơn hàng (hoặc Lệnh SX)."""

    STATUS_PENDING = "pending"
    STATUS_IN_TRANSIT = "in_transit"
    STATUS_DELIVERED = "delivered"
    STATUS_FAILED = "failed"
    STATUS_CHOICES = [
        (STATUS_PENDING, "Chờ giao hàng"),
        (STATUS_IN_TRANSIT, "Đang giao"),
        (STATUS_DELIVERED, "Giao thành công"),
        (STATUS_FAILED, "Giao thất bại"),
    ]

    company = models.ForeignKey(
        "users.Company",
        on_delete=models.CASCADE,
        related_name="delivery_orders",
        verbose_name="Công ty",
    )
    order = models.OneToOneField(
        "orders.Order",
        on_delete=models.CASCADE,
        related_name="delivery_order",
        verbose_name="Đơn hàng",
    )
    delivery_code = models.CharField(
        max_length=50,
        verbose_name="Mã giao hàng",
        null=True,
        blank=True,
        db_index=True,
    )
    status = models.CharField(
        max_length=20,
        choices=STATUS_CHOICES,
        default=STATUS_PENDING,
        verbose_name="Trạng thái",
        db_index=True,
    )
    shipper_name = models.CharField(max_length=150, blank=True, verbose_name="Người giao hàng")
    shipper_phone = models.CharField(max_length=20, blank=True, verbose_name="SĐT người giao")
    shipper_user = models.ForeignKey(
        "users.User",
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="delivery_tasks",
        verbose_name="Nhân viên giao hàng",
    )
    shipping_address = models.TextField(blank=True, verbose_name="Địa chỉ giao hàng")
    
    expected_date = models.DateField(null=True, blank=True, verbose_name="Ngày dự kiến giao")
    actual_date = models.DateField(null=True, blank=True, verbose_name="Ngày giao thực tế")
    notes = models.TextField(blank=True, verbose_name="Ghi chú")
    
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        verbose_name = "Lệnh giao hàng"
        verbose_name_plural = "Lệnh giao hàng"
        ordering = ["-created_at"]

    def __str__(self):
        code = self.delivery_code or f"GH-{self.pk:04d}"
        return f"{code} — {self.order.order_number}"

    def save(self, *args, **kwargs):
        is_new = self.pk is None
        old_status = None
        if not is_new:
            try:
                old_status = DeliveryOrder.objects.get(pk=self.pk).status
            except DeliveryOrder.DoesNotExist:
                pass
                
        super().save(*args, **kwargs)
        
        if old_status != self.status and self.status == self.STATUS_DELIVERED:
            try:
                from orders.workflow import OrderWorkflowEngine
                OrderWorkflowEngine.trigger_next_step(self.order, current_step="delivery")
            except Exception as exc:
                import logging
                logging.getLogger(__name__).error("Workflow trigger failed after delivery completion: %s", exc)


class WarrantyCard(models.Model):
    """Phiếu bảo hành sinh ra khi giao hàng thành công."""

    STATUS_ACTIVE = "active"
    STATUS_EXPIRED = "expired"
    STATUS_VOID = "void"
    STATUS_CHOICES = [
        (STATUS_ACTIVE, "Đang hiệu lực"),
        (STATUS_EXPIRED, "Hết hạn"),
        (STATUS_VOID, "Đã hủy/Vô hiệu"),
    ]

    company = models.ForeignKey(
        "users.Company",
        on_delete=models.CASCADE,
        related_name="warranty_cards",
        verbose_name="Công ty",
    )
    order = models.OneToOneField(
        "orders.Order",
        on_delete=models.CASCADE,
        related_name="warranty_card",
        verbose_name="Đơn hàng",
    )
    customer = models.ForeignKey(
        "crm.Customer",
        on_delete=models.CASCADE,
        related_name="warranty_cards",
        verbose_name="Khách hàng",
    )
    warranty_code = models.CharField(
        max_length=50,
        verbose_name="Mã bảo hành",
        null=True,
        blank=True,
        db_index=True,
    )
    status = models.CharField(
        max_length=20,
        choices=STATUS_CHOICES,
        default=STATUS_ACTIVE,
        verbose_name="Trạng thái",
        db_index=True,
    )
    start_date = models.DateField(verbose_name="Ngày bắt đầu")
    end_date = models.DateField(verbose_name="Ngày kết thúc")
    terms = models.TextField(blank=True, verbose_name="Điều khoản bảo hành")
    warranty_content = models.TextField(blank=True, verbose_name="Nội dung bảo hành")
    warranty_rules = models.TextField(blank=True, verbose_name="Quy định bảo hành")
    
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        verbose_name = "Phiếu bảo hành"
        verbose_name_plural = "Phiếu bảo hành"
        ordering = ["-created_at"]

    def __str__(self):
        code = self.warranty_code or f"BH-{self.pk:04d}"
        return f"{code} — Khách hàng: {self.customer.full_name}"
