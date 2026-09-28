from django.db import models

class LivePlatformProduct(models.Model):
    """
    Mapping giữa một sản phẩm CRM và một nền tảng bán hàng Livestream (TikTok, Shopee, Custom)
    Lưu trữ Affiliate URL và cấu hình riêng cho từng nền tảng.
    """
    PLATFORM_TIKTOK = 'tiktok'
    PLATFORM_SHOPEE = 'shopee'
    PLATFORM_CUSTOM = 'custom'
    
    PLATFORM_CHOICES = [
        (PLATFORM_TIKTOK, 'TikTok'),
        (PLATFORM_SHOPEE, 'Shopee'),
        (PLATFORM_CUSTOM, 'Custom/Web'),
    ]

    company = models.ForeignKey(
        "users.Company",
        on_delete=models.CASCADE,
        related_name="live_platform_products",
        verbose_name="Công ty",
    )
    product = models.ForeignKey(
        "inventory.Product",
        on_delete=models.CASCADE,
        related_name="live_platform_mappings",
        verbose_name="Sản phẩm",
    )
    platform = models.CharField(
        max_length=50,
        choices=PLATFORM_CHOICES,
        verbose_name="Nền tảng",
    )
    platform_product_id = models.CharField(
        max_length=255, 
        blank=True, 
        null=True,
        verbose_name="ID Sản phẩm trên nền tảng"
    )
    affiliate_url = models.URLField(
        max_length=1000, 
        blank=True, 
        null=True,
        verbose_name="Affiliate URL"
    )
    live_price_override = models.DecimalField(
        max_digits=15, 
        decimal_places=2, 
        null=True, 
        blank=True,
        verbose_name="Giá bán ghi đè (Flash Sale)"
    )
    is_active = models.BooleanField(
        default=True, 
        verbose_name="Đang hoạt động"
    )
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        verbose_name = "Live Platform Product"
        verbose_name_plural = "Live Platform Products"
        constraints = [
            models.UniqueConstraint(
                fields=["company", "product", "platform"],
                name="unique_company_product_platform"
            )
        ]

    def __str__(self):
        return f"{self.product.name} - {self.get_platform_display()} ({self.company.name})"

import uuid
from django.utils import timezone
from django.core.exceptions import ValidationError

class PlatformAccount(models.Model):
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    company = models.ForeignKey(
        "users.Company",
        on_delete=models.CASCADE,
        related_name="platform_accounts",
        verbose_name="Công ty",
    )
    platform = models.CharField(
        max_length=50,
        choices=LivePlatformProduct.PLATFORM_CHOICES,
        verbose_name="Nền tảng",
    )
    account_id = models.CharField(max_length=255, verbose_name="External Account ID")
    display_name = models.CharField(max_length=255, verbose_name="Tên hiển thị")
    
    # Security Note: Should be encrypted in production
    access_token = models.TextField(blank=True, null=True, verbose_name="Access Token")
    refresh_token = models.TextField(blank=True, null=True, verbose_name="Refresh Token")
    token_expires_at = models.DateTimeField(blank=True, null=True, verbose_name="Token Hết hạn")
    
    scopes = models.TextField(blank=True, null=True, verbose_name="Scopes")
    status = models.CharField(max_length=50, default="active", verbose_name="Trạng thái")
    metadata = models.JSONField(default=dict, blank=True, verbose_name="Metadata")
    
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        verbose_name = "Tài khoản nền tảng"
        verbose_name_plural = "Tài khoản nền tảng"
        constraints = [
            models.UniqueConstraint(
                fields=["company", "platform", "account_id"],
                name="unique_platform_account"
            )
        ]

    def save(self, *args, **kwargs):
        from .platforms.security import encrypt_token, decrypt_token
        
        def encrypt_if_needed(val):
            if not val:
                return val
            try:
                # If it can be decrypted, it's already encrypted
                decrypt_token(val)
                return val
            except Exception:
                return encrypt_token(val)

        self.access_token = encrypt_if_needed(self.access_token)
        self.refresh_token = encrypt_if_needed(self.refresh_token)
        super().save(*args, **kwargs)

    def get_decrypted_access_token(self):
        from .platforms.security import decrypt_token
        try:
            return decrypt_token(self.access_token)
        except Exception:
            return self.access_token

    def get_decrypted_refresh_token(self):
        from .platforms.security import decrypt_token
        try:
            return decrypt_token(self.refresh_token)
        except Exception:
            return self.refresh_token

    def __str__(self):
        return f"{self.display_name} ({self.get_platform_display()})"


class LiveDevice(models.Model):
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    company = models.ForeignKey(
        "users.Company",
        on_delete=models.CASCADE,
        related_name="live_devices",
        verbose_name="Công ty",
    )
    name = models.CharField(max_length=255, verbose_name="Tên thiết bị")
    token_hash = models.CharField(max_length=128, verbose_name="Token Hash")
    is_active = models.BooleanField(default=True, verbose_name="Đang hoạt động")
    last_seen_at = models.DateTimeField(null=True, blank=True, verbose_name="Lần cuối online")
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        verbose_name = "Thiết bị Live Studio"
        verbose_name_plural = "Thiết bị Live Studio"
        ordering = ["-created_at"]

    def __str__(self):
        return f"{self.name} ({self.company.name})"


class LiveSession(models.Model):
    STATUS_DRAFT = 'draft'
    STATUS_READY = 'ready'
    STATUS_RUNNING = 'running'
    STATUS_PAUSED = 'paused'
    STATUS_HUMAN_TAKEOVER = 'human_takeover'
    STATUS_STOPPED = 'stopped'
    STATUS_ERROR = 'error'

    STATUS_CHOICES = [
        (STATUS_DRAFT, 'Bản nháp'),
        (STATUS_READY, 'Sẵn sàng'),
        (STATUS_RUNNING, 'Đang chạy'),
        (STATUS_PAUSED, 'Tạm dừng'),
        (STATUS_HUMAN_TAKEOVER, 'Người kiểm soát'),
        (STATUS_STOPPED, 'Đã dừng'),
        (STATUS_ERROR, 'Lỗi'),
    ]

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    company = models.ForeignKey(
        "users.Company",
        on_delete=models.CASCADE,
        related_name="live_sessions",
        verbose_name="Công ty",
    )
    device = models.ForeignKey(
        LiveDevice,
        on_delete=models.PROTECT,
        related_name="sessions",
        verbose_name="Thiết bị",
    )
    platform = models.CharField(
        max_length=50,
        choices=LivePlatformProduct.PLATFORM_CHOICES,
        verbose_name="Nền tảng",
    )
    platform_account = models.ForeignKey(
        PlatformAccount,
        on_delete=models.PROTECT,
        null=True,
        blank=True,
        related_name="sessions",
        verbose_name="Tài khoản nền tảng",
    )
    product = models.ForeignKey(
        "inventory.Product",
        on_delete=models.PROTECT,
        related_name="live_sessions",
        verbose_name="Sản phẩm đang live",
    )
    ai_agent = models.ForeignKey(
        "ai_agents.AiAgent",
        on_delete=models.PROTECT,
        related_name="live_sessions",
        verbose_name="AI Agent",
    )
    status = models.CharField(
        max_length=20,
        choices=STATUS_CHOICES,
        default=STATUS_DRAFT,
        verbose_name="Trạng thái",
    )
    external_session_id = models.CharField(
        max_length=255, 
        null=True, 
        blank=True, 
        verbose_name="ID Phiên Live (Platform)"
    )
    stream_url = models.URLField(
        max_length=1000, 
        null=True, 
        blank=True, 
        verbose_name="RTMP Stream URL"
    )
    started_at = models.DateTimeField(null=True, blank=True, verbose_name="Thời gian bắt đầu")
    ended_at = models.DateTimeField(null=True, blank=True, verbose_name="Thời gian kết thúc")
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        verbose_name = "Phiên Livestream"
        verbose_name_plural = "Phiên Livestream"
        ordering = ["-created_at"]

    def __str__(self):
        return f"Session {self.id} - {self.get_platform_display()}"

    def clean(self):
        if self.device_id and self.company_id != self.device.company_id:
            raise ValidationError("Thiết bị không thuộc cùng công ty với phiên Live.")
        if self.product_id and self.company_id != self.product.company_id:
            raise ValidationError("Sản phẩm không thuộc cùng công ty với phiên Live.")
        if self.ai_agent_id and self.company_id != self.ai_agent.company_id:
            raise ValidationError("AI Agent không thuộc cùng công ty với phiên Live.")
        if self.platform_account_id and self.company_id != self.platform_account.company_id:
            raise ValidationError("Tài khoản nền tảng không thuộc cùng công ty với phiên Live.")
        if self.platform_account_id and self.platform != self.platform_account.platform:
            raise ValidationError("Nền tảng của phiên Live không khớp với nền tảng của tài khoản.")

    def change_status(self, new_status):
        valid_transitions = {
            self.STATUS_DRAFT: [self.STATUS_READY],
            self.STATUS_READY: [self.STATUS_RUNNING, self.STATUS_DRAFT],
            self.STATUS_RUNNING: [self.STATUS_PAUSED, self.STATUS_HUMAN_TAKEOVER, self.STATUS_STOPPED, self.STATUS_ERROR],
            self.STATUS_PAUSED: [self.STATUS_RUNNING, self.STATUS_STOPPED],
            self.STATUS_HUMAN_TAKEOVER: [self.STATUS_RUNNING, self.STATUS_STOPPED],
            self.STATUS_STOPPED: [],  # Terminal state
            self.STATUS_ERROR: [self.STATUS_STOPPED],
        }

        if new_status not in valid_transitions.get(self.status, []):
            raise ValidationError(f"Không thể chuyển từ trạng thái {self.status} sang {new_status}")
        
        self.status = new_status
        if new_status == self.STATUS_RUNNING and not self.started_at:
            self.started_at = timezone.now()
        if new_status == self.STATUS_STOPPED and not self.ended_at:
            self.ended_at = timezone.now()
        
        self.save()

