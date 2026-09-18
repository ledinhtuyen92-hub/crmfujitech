from django.db import models
from django.utils import timezone

class SystemBackupConfig(models.Model):
    SCHEDULE_CHOICES = [
        ('daily', 'Hàng ngày'),
        ('weekly', 'Hàng tuần'),
        ('hourly', 'Hàng giờ'),
    ]

    is_active = models.BooleanField(default=False, verbose_name="Kích hoạt tự động sao lưu")
    schedule_type = models.CharField(max_length=20, choices=SCHEDULE_CHOICES, default='daily')
    schedule_time = models.TimeField(default='02:00:00', verbose_name="Thời gian chạy (Daily/Weekly)", null=True, blank=True)
    schedule_day_of_week = models.IntegerField(default=6, verbose_name="Ngày chạy (Weekly: 0=T2, 6=CN)", null=True, blank=True)
    

    # Cloudflare R2 Settings
    r2_endpoint_url = models.CharField(max_length=255, blank=True, null=True, verbose_name="R2 Endpoint URL")
    r2_access_key = models.CharField(max_length=255, blank=True, null=True, verbose_name="R2 Access Key")
    r2_secret_key = models.CharField(max_length=255, blank=True, null=True, verbose_name="R2 Secret Key")
    r2_bucket_name = models.CharField(max_length=100, blank=True, null=True, verbose_name="R2 Bucket Name")
    
    # Retention Policy
    keep_latest_count = models.IntegerField(default=10, verbose_name="Số lượng bản ghi giữ lại trên Cloud")
    
    updated_at = models.DateTimeField(auto_now=True)

    def __str__(self):
        return "Cấu hình Backup Hệ thống"
    
    class Meta:
        verbose_name = "Cấu hình Backup"
        verbose_name_plural = "Cấu hình Backup"

    def save(self, *args, **kwargs):
        # Đảm bảo chỉ có 1 bản ghi cấu hình
        if not self.pk and SystemBackupConfig.objects.exists():
            return
        super().save(*args, **kwargs)

class BackupHistoryLog(models.Model):
    STATUS_CHOICES = [
        ('success', 'Thành công'),
        ('error', 'Lỗi'),
        ('running', 'Đang chạy'),
    ]
    ACTION_CHOICES = [
        ('backup', 'Sao lưu (Backup)'),
        ('restore', 'Phục hồi (Restore)'),
    ]

    action_type = models.CharField(max_length=20, choices=ACTION_CHOICES, default='backup')
    start_time = models.DateTimeField(default=timezone.now)
    end_time = models.DateTimeField(null=True, blank=True)
    status = models.CharField(max_length=20, choices=STATUS_CHOICES, default='running')
    logs = models.TextField(blank=True, null=True)
    
    class Meta:
        ordering = ['-start_time']
        verbose_name = "Lịch sử Backup"
        verbose_name_plural = "Lịch sử Backup"

    def __str__(self):
        return f"Backup lúc {self.start_time.strftime('%Y-%m-%d %H:%M:%S')} - {self.get_status_display()}"
