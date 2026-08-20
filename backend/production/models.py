from django.db import models


class Factory(models.Model):
    """Nhà máy sản xuất / Xưởng — cô lập theo từng công ty."""

    company = models.ForeignKey(
        "users.Company",
        on_delete=models.CASCADE,
        related_name="factories",
        verbose_name="Công ty",
    )
    name = models.CharField(max_length=150, verbose_name="Tên nhà máy")
    location = models.CharField(max_length=255, blank=True, verbose_name="Địa chỉ nhà máy")
    linked_warehouse = models.ForeignKey(
        "inventory.Warehouse",
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="linked_factories",
        verbose_name="Kho liên kết",
        help_text="Kho vật tư mặc định cho nhà máy này",
    )
    is_active = models.BooleanField(default=True, verbose_name="Đang hoạt động")

    class Meta:
        verbose_name = "Nhà máy"
        verbose_name_plural = "Nhà máy"
        constraints = [
            models.UniqueConstraint(
                fields=["company", "name"],
                name="unique_factory_per_company",
            )
        ]

    def __str__(self):
        return f"{self.name} ({self.company.name})"

class ProductionOrder(models.Model):
    """Lệnh sản xuất — được tạo tự động hoặc thủ công sau khi đơn hàng được duyệt."""

    STATUS_PENDING = "pending"
    STATUS_IN_PROGRESS = "in_progress"
    STATUS_COMPLETED = "completed"
    STATUS_CANCELLED = "cancelled"
    STATUS_CHOICES = [
        (STATUS_PENDING, "Chờ sản xuất"),
        (STATUS_IN_PROGRESS, "Đang sản xuất"),
        (STATUS_COMPLETED, "Hoàn thành"),
        (STATUS_CANCELLED, "Đã hủy"),
    ]

    company = models.ForeignKey(
        "users.Company",
        on_delete=models.CASCADE,
        related_name="production_orders",
        verbose_name="Công ty",
    )
    production_order_code = models.CharField(
        max_length=50,
        verbose_name="Mã lệnh sản xuất",
        help_text="Format: [PREFIX]-LSX-[YYYYMMDD]-[SEQ]",
        null=True,
        blank=True,
        db_index=True,
    )
    order = models.ForeignKey(
        "orders.Order",
        on_delete=models.PROTECT,
        related_name="production_orders",
        verbose_name="Đơn hàng",
    )
    factory = models.ForeignKey(
        Factory,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="production_orders",
        verbose_name="Nhà máy thực hiện",
    )
    status = models.CharField(
        max_length=20,
        choices=STATUS_CHOICES,
        default=STATUS_PENDING,
        verbose_name="Trạng thái",
        db_index=True,
    )
    start_date = models.DateField(
        null=True,
        blank=True,
        verbose_name="Ngày bắt đầu sản xuất",
    )
    end_date = models.DateField(
        null=True,
        blank=True,
        verbose_name="Ngày kết thúc dự kiến",
    )
    notes = models.TextField(blank=True, verbose_name="Ghi chú")
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        verbose_name = "Lệnh sản xuất"
        verbose_name_plural = "Lệnh sản xuất"
        ordering = ["-created_at"]
        constraints = [
            models.CheckConstraint(
                check=(
                    models.Q(start_date__isnull=True)
                    | models.Q(end_date__isnull=True)
                    | models.Q(end_date__gte=models.F("start_date"))
                ),
                name="production_order_end_date_gte_start_date",
            ),
        ]

    def __str__(self):
        code = self.production_order_code or f"LSX-{self.pk:04d}"
        return f"{code} — {self.order.order_number}"


class ProductionStep(models.Model):
    """Công đoạn sản xuất trong một lệnh sản xuất."""

    STATUS_PENDING = "pending"
    STATUS_IN_PROGRESS = "in_progress"
    STATUS_DONE = "done"
    STATUS_CHOICES = [
        (STATUS_PENDING, "Chờ thực hiện"),
        (STATUS_IN_PROGRESS, "Đang thực hiện"),
        (STATUS_DONE, "Hoàn thành"),
    ]

    production_order = models.ForeignKey(
        "production.ProductionOrder",
        on_delete=models.CASCADE,
        related_name="steps",
        verbose_name="Lệnh sản xuất",
    )
    step_name = models.CharField(max_length=150, verbose_name="Tên công đoạn")
    sequence = models.PositiveSmallIntegerField(
        default=1,
        verbose_name="Thứ tự",
        help_text="Số thứ tự thực hiện trong lệnh sản xuất.",
    )
    assigned_to = models.ForeignKey(
        "users.User",
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="assigned_production_steps",
        verbose_name="Nhân viên phụ trách",
    )
    status = models.CharField(
        max_length=20,
        choices=STATUS_CHOICES,
        default=STATUS_PENDING,
        verbose_name="Trạng thái",
    )
    started_at = models.DateTimeField(null=True, blank=True, verbose_name="Thời điểm bắt đầu")
    completed_at = models.DateTimeField(null=True, blank=True, verbose_name="Thời điểm hoàn thành")
    notes = models.TextField(blank=True, verbose_name="Ghi chú công đoạn")

    class Meta:
        verbose_name = "Công đoạn sản xuất"
        verbose_name_plural = "Công đoạn sản xuất"
        ordering = ["production_order", "sequence"]
        constraints = [
            models.CheckConstraint(
                check=(
                    models.Q(started_at__isnull=True)
                    | models.Q(completed_at__isnull=True)
                    | models.Q(completed_at__gte=models.F("started_at"))
                ),
                name="production_step_completed_at_gte_started_at",
            ),
        ]

    def __str__(self):
        return f"{self.production_order} — Bước {self.sequence}: {self.step_name}"

    def save(self, *args, **kwargs):
        super().save(*args, **kwargs)
        po = self.production_order
        
        # Không tự động thay đổi nếu LSX đã bị hủy
        if po.status == po.STATUS_CANCELLED:
            return

        total_steps = po.steps.count()
        done_steps = po.steps.filter(status=self.STATUS_DONE).count()
        pending_steps = po.steps.filter(status=self.STATUS_PENDING).count()
        
        if total_steps > 0:
            if done_steps == total_steps:
                new_status = po.STATUS_COMPLETED
            elif pending_steps == total_steps:
                new_status = po.STATUS_PENDING
            else:
                new_status = po.STATUS_IN_PROGRESS
                
            if po.status != new_status:
                po.status = new_status
                po.save(update_fields=["status", "updated_at"])
                
                if new_status == po.STATUS_COMPLETED:
                    try:
                        from orders.workflow import OrderWorkflowEngine
                        OrderWorkflowEngine.trigger_next_step(po.order, current_step="production")
                    except Exception as exc:
                        import logging
                        logging.getLogger(__name__).error("Workflow trigger failed after production completion: %s", exc)
