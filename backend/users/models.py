from django.contrib.auth.models import AbstractUser
from django.core.exceptions import ValidationError
from django.db import models
from django.utils.text import slugify


class Company(models.Model):
    name = models.CharField(max_length=255, verbose_name="Tên công ty")
    workspace_id = models.SlugField(
        max_length=60,
        unique=True,
        verbose_name="Workspace ID",
        help_text="Mã định danh công ty khi đăng nhập (vd: ANPHAT). Tự động tạo từ mã số thuế nếu để trống.",
    )
    tax_code = models.CharField(max_length=50, unique=True, verbose_name="Mã số thuế")
    address = models.TextField(blank=True, verbose_name="Địa chỉ")
    phone = models.CharField(max_length=20, blank=True, verbose_name="Số điện thoại công ty")
    logo = models.ImageField(
        upload_to="company_logos/",
        blank=True,
        null=True,
        verbose_name="Logo công ty",
    )
    stamp_image = models.ImageField(
        upload_to="company_stamps/",
        blank=True,
        null=True,
        verbose_name="Ảnh con dấu công ty",
    )
    director_signature = models.ImageField(
        upload_to="company_signatures/",
        blank=True,
        null=True,
        verbose_name="Ảnh chữ ký giám đốc",
    )
    director_name = models.CharField(
        max_length=150,
        blank=True,
        verbose_name="Họ tên Người đại diện / Giám đốc",
    )
    director_title = models.CharField(
        max_length=100,
        blank=True,
        default="Giám đốc",
        verbose_name="Chức danh",
    )
    is_active = models.BooleanField(default=True, verbose_name="Đang hoạt động")
    user_limit = models.PositiveIntegerField(
        null=True,
        blank=True,
        verbose_name="Giới hạn nhân viên",
        help_text="Số tài khoản nhân viên tối đa. Để trống = không giới hạn.",
    )
    quotation_template = models.ForeignKey(
        "sales.QuotationTemplate",
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="companies",
        verbose_name="Mẫu báo giá áp dụng",
    )
    created_at = models.DateTimeField(auto_now_add=True)


    class Meta:
        ordering = ["name"]
        verbose_name = "Công ty"
        verbose_name_plural = "Công ty"

    def save(self, *args, **kwargs):
        # Tự động generate workspace_id từ tax_code nếu chưa có
        if not self.workspace_id:
            self.workspace_id = slugify(self.tax_code).upper().replace("-", "")
        super().save(*args, **kwargs)

    def __str__(self):
        return self.name


class Permission(models.Model):
    code = models.CharField(max_length=100, unique=True, verbose_name="Mã quyền")
    name = models.CharField(max_length=150, verbose_name="Tên quyền")
    module = models.CharField(
        max_length=50,
        blank=True,
        default="",
        verbose_name="Module",
        help_text="Tên module chứa quyền này (vd: crm, sales, inventory...)",
    )

    class Meta:
        ordering = ["module", "code"]
        verbose_name = "Quyền"
        verbose_name_plural = "Quyền"

    def __str__(self):
        return f"{self.name} ({self.code})"


class Department(models.Model):
    company = models.ForeignKey(
        Company,
        on_delete=models.CASCADE,
        related_name="departments",
        verbose_name="Công ty",
    )
    name = models.CharField(max_length=150, verbose_name="Tên phòng ban")
    description = models.TextField(blank=True, verbose_name="Mô tả")
    manager = models.ForeignKey(
        "User",
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="managed_departments",
        verbose_name="Trưởng phòng",
    )
    factory = models.ForeignKey(
        "production.Factory",
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="departments",
        verbose_name="Nhà máy trực thuộc",
        help_text="Nếu phòng ban này thuộc một nhà máy sản xuất, hãy chọn nhà máy tương ứng.",
    )
    created_at = models.DateTimeField(auto_now_add=True)
    is_sales_department = models.BooleanField(
        default=False,
        verbose_name="Thống kê Doanh số Sales",
        help_text="Bật để tính doanh số của phòng ban này vào báo cáo Sales Tốt/Yếu nhất."
    )

    class Meta:
        ordering = ["name"]
        verbose_name = "Phòng ban"
        verbose_name_plural = "Phòng ban"
        constraints = [
            models.UniqueConstraint(
                fields=["company", "name"],
                name="unique_department_name_per_company",
            )
        ]

    def __str__(self):
        return f"{self.name} — {self.company.name}"


class Role(models.Model):
    company = models.ForeignKey(
        Company,
        on_delete=models.CASCADE,
        related_name="roles",
        verbose_name="Công ty",
    )
    name = models.CharField(max_length=150, verbose_name="Tên vai trò")
    description = models.TextField(blank=True, verbose_name="Mô tả")
    permissions = models.ManyToManyField(
        Permission,
        blank=True,
        related_name="roles",
        verbose_name="Danh sách quyền",
    )
    is_auto_assign_target = models.BooleanField(
        default=False,
        verbose_name="Nhận khách tự động",
        help_text="Vai trò này được nhận khách từ chức năng phân bổ tự động",
    )

    class Meta:
        ordering = ["name"]
        verbose_name = "Vai trò"
        verbose_name_plural = "Vai trò"
        constraints = [
            models.UniqueConstraint(
                fields=["company", "name"],
                name="unique_role_name_per_company",
            )
        ]

    def __str__(self):
        return f"{self.name} — {self.company.name}"


class User(AbstractUser):
    email = models.EmailField(unique=True, verbose_name="Email")
    full_name = models.CharField(max_length=255, verbose_name="Họ và tên")
    phone = models.CharField(max_length=20, blank=True, verbose_name="Số điện thoại")
    job_title = models.CharField(
        max_length=150,
        blank=True,
        verbose_name="Chức danh",
        help_text="Chức danh hiển thị (vd: Giám đốc kinh doanh, Kế toán trưởng...)",
    )
    avatar = models.ImageField(
        upload_to="avatars/",
        blank=True,
        null=True,
        verbose_name="Ảnh đại diện",
    )
    company = models.ForeignKey(
        Company,
        on_delete=models.CASCADE,
        related_name="users",
        null=True,
        blank=True,
        verbose_name="Công ty",
    )
    role = models.ForeignKey(
        Role,
        on_delete=models.SET_NULL,
        related_name="users",
        null=True,
        blank=True,
        verbose_name="Vai trò",
    )
    is_company_admin = models.BooleanField(
        default=False,
        verbose_name="Là Admin công ty",
        help_text="Tài khoản quản trị cao nhất của công ty (Owner/Giám đốc). Có toàn quyền trong công ty.",
    )
    is_auto_assign_target = models.BooleanField(
        default=False,
        verbose_name="Nhận khách tự động",
        help_text="Ghi đè cấu hình Role: Nếu bật, tài khoản này sẽ được chia khách tự động.",
    )
    department = models.ForeignKey(
        "Department",
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="users",
        verbose_name="Phòng ban",
    )
    created_at = models.DateTimeField(auto_now_add=True)

    REQUIRED_FIELDS = ["email", "full_name"]

    class Meta:
        verbose_name = "Người dùng"
        verbose_name_plural = "Người dùng"

    def get_permission_codes(self):
        """Trả về set các permission code của user."""
        if self.is_superuser or self.is_company_admin:
            # Admin có toàn bộ quyền
            return set(Permission.objects.values_list("code", flat=True))
        if not self.role:
            return set()
        return set(self.role.permissions.values_list("code", flat=True))

    def has_perm_code(self, code: str) -> bool:
        """Kiểm tra nhanh một permission code."""
        if self.is_superuser or self.is_company_admin:
            return True
        if not self.role:
            return False
        return self.role.permissions.filter(code=code).exists()

    def clean(self):
        super().clean()
        if self.role_id and self.company_id != self.role.company_id:
            raise ValidationError({"role": "Vai trò phải thuộc cùng công ty với người dùng."})

    def __str__(self):
        return self.full_name or self.username

from django.apps import apps

def get_available_modules():
    """Tự động scan các apps để lấy danh sách module được đăng ký."""
    modules = []
    for app_config in apps.get_app_configs():
        if hasattr(app_config, 'crm_modules'):
            modules.extend(app_config.crm_modules)
    return modules

def get_default_modules():
    return [m["code"] for m in get_available_modules()]


def get_default_pipeline_labels():
    return {
        "new": "Khách mới",
        "potential": "Tiềm năng",
        "active": "Đang hoạt động",
        "has_order": "Đã có đơn hàng",
        "repeat_order": "Mua thêm đơn hàng",
        "lost": "Đã mất",
        "inactive": "Không hoạt động",
    }


class CompanySettings(models.Model):
    """Cấu hình nghiệp vụ của công ty — 1:1 với Company."""

    ROUTING_MANUAL = "manual"
    ROUTING_ROUND_ROBIN = "round_robin"
    ROUTING_CHOICES = [
        (ROUTING_MANUAL, "Thủ công (Trưởng phòng gán)"),
        (ROUTING_ROUND_ROBIN, "Tự động Round-robin"),
    ]

    company = models.OneToOneField(
        Company,
        on_delete=models.CASCADE,
        related_name="settings",
        verbose_name="Công ty",
    )
    order_prefix = models.CharField(
        max_length=10,
        default="DH",
        verbose_name="Tiền tố mã đơn hàng",
        help_text="VD: 'DH' → Mã đơn: DH-20240101-001",
    )
    continuous_sequence_numbering = models.BooleanField(
        default=False,
        verbose_name="Sinh số thứ tự liên tục",
        help_text="Nếu bật, số thứ tự (001, 002...) sẽ tăng liên tục không reset về 1 mỗi ngày.",
    )
    inactive_days_threshold = models.PositiveIntegerField(
        default=0,
        verbose_name="Số ngày tính là khách ngủ đông",
        help_text="Điền 0 để tắt chức năng tự động đánh dấu khách ngủ đông."
    )
    lead_routing = models.CharField(
        max_length=20,
        choices=ROUTING_CHOICES,
        default=ROUTING_MANUAL,
        verbose_name="Phương thức phân bổ Lead",
    )
    timezone = models.CharField(
        max_length=50,
        default="Asia/Ho_Chi_Minh",
        verbose_name="Múi giờ",
    )
    active_modules = models.JSONField(
        default=get_default_modules,
        blank=True,
        verbose_name="Các phân hệ kích hoạt",
        help_text="Danh sách mã phân hệ được phép sử dụng (vd: crm, sales, products, inventory, production, orders)",
    )
    pipeline_status_labels = models.JSONField(
        default=get_default_pipeline_labels,
        blank=True,
        verbose_name="Tên tùy chỉnh các trạng thái Pipeline",
    )
    custom_info_templates = models.JSONField(
        default=list,
        blank=True,
        verbose_name="Mẫu thêm thông tin",
        help_text="Danh sách các hạng mục thông tin tùy chỉnh được lưu lại",
    )
    quotation_template = models.ForeignKey(
        "sales.QuotationTemplate",
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="company_settings",
        verbose_name="Mẫu báo giá áp dụng",
    )
    default_quotation_terms = models.TextField(
        blank=True,
        default="",
        verbose_name="Ghi chú & Điều khoản báo giá mặc định",
    )
    custom_quotation_title = models.CharField(
        max_length=100,
        blank=True,
        null=True,
        verbose_name="Tiêu đề mẫu in Báo giá",
    )
    custom_order_title = models.CharField(
        max_length=100,
        blank=True,
        null=True,
        verbose_name="Tiêu đề mẫu in Đơn hàng",
    )
    default_warranty_content = models.TextField(
        blank=True,
        default="",
        verbose_name="Nội dung bảo hành mặc định",
    )
    default_warranty_rules = models.TextField(
        blank=True,
        default="",
        verbose_name="Quy định bảo hành mặc định",
    )
    website_api_key = models.CharField(
        max_length=64,
        blank=True,
        null=True,
        verbose_name="Mã API Website (Webhook)",
        help_text="Token bảo mật để kết nối dữ liệu từ Website về CRM",
    )
    is_website_integration_active = models.BooleanField(
        default=False,
        verbose_name="Kích hoạt nhận dữ liệu Website",
        help_text="Nếu tắt, CRM sẽ từ chối mọi yêu cầu gửi dữ liệu khách hàng từ Website",
    )

    class Meta:

        verbose_name = "Cấu hình công ty"
        verbose_name_plural = "Cấu hình công ty"

    def __str__(self):
        return f"Settings — {self.company.name}"

    def save(self, *args, **kwargs):
        super().save(*args, **kwargs)
        self.clean_revoked_module_permissions()

    def clean_revoked_module_permissions(self):
        """Khi Admin hệ thống thu hồi quyền sử dụng module (ví dụ bỏ Zalo khỏi active_modules),
        tự động gỡ bỏ các quyền thuộc module đó khỏi tất cả vai trò (Role) trong công ty."""
        if not self.company_id:
            return
        try:
            core_modules = ["dashboard", "reports", "settings"]
            active = self.active_modules if isinstance(self.active_modules, list) else []
            allowed = set(core_modules + active)

            revoked_perms = Permission.objects.exclude(module__in=allowed)
            if not revoked_perms.exists():
                return

            roles = Role.objects.filter(company_id=self.company_id)
            for role in roles:
                role.permissions.remove(*revoked_perms)
        except Exception:
            pass


class SubscriptionPlan(models.Model):
    code = models.CharField(max_length=50, unique=True, verbose_name="Mã gói")
    name = models.CharField(max_length=150, verbose_name="Tên gói")
    user_limit = models.IntegerField(verbose_name="Giới hạn người dùng", help_text="Nhập 99999 cho Không giới hạn")
    is_default = models.BooleanField(default=False, verbose_name="Gói hệ thống (không xoá được)")
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        verbose_name = "Gói đăng ký"
        verbose_name_plural = "Gói đăng ký"
        ordering = ["user_limit"]

    def __str__(self):
        return f"{self.name} ({self.user_limit} users)"


class SystemSettings(models.Model):
    """Cấu hình toàn hệ thống (Singleton)"""

    require_strong_password = models.BooleanField(
        default=False,
        verbose_name="Yêu cầu mật khẩu mạnh",
        help_text="Bắt buộc toàn hệ thống dùng mật khẩu mạnh (chữ hoa, chữ thường, số, ký tự đặc biệt).",
    )
    enable_public_registration = models.BooleanField(
        default=True,
        verbose_name="Cho phép đăng ký mới",
        help_text="Bật/tắt tính năng đăng ký doanh nghiệp mới trên hệ thống.",
    )
    default_plan = models.CharField(
        max_length=50,
        default="starter",
        verbose_name="Gói mặc định",
    )
    default_user_limit = models.IntegerField(
        default=5,
        verbose_name="Số tài khoản mặc định",
    )
    tenant_isolation_mode = models.CharField(
        max_length=50,
        default="strict",
        verbose_name="Chế độ cô lập dữ liệu",
    )
    jwt_expiration_hours = models.IntegerField(
        default=24,
        verbose_name="Thời gian hết hạn JWT",
    )
    max_file_upload_mb = models.IntegerField(
        default=25,
        verbose_name="Dung lượng tải file tối đa",
    )
    maintenance_mode = models.BooleanField(
        default=False,
        verbose_name="Chế độ bảo trì dữ liệu",
        help_text="Khóa toàn bộ chức năng thêm/sửa/xóa dữ liệu của các doanh nghiệp, chỉ cho phép đọc và truy cập hệ thống.",
    )
    
    # ── Zalo System-wide Config ──────────────────────────────────────────
    zalo_app_id = models.CharField(
        max_length=100,
        blank=True,
        null=True,
        verbose_name="System Zalo App ID",
        help_text="App ID dùng chung cho các tenant (Lấy từ Zalo Developers).",
    )
    zalo_app_secret = models.CharField(
        max_length=255,
        blank=True,
        null=True,
        verbose_name="System Zalo App Secret",
        help_text="App Secret dùng chung cho các tenant.",
    )
    zalo_webhook_secret = models.CharField(
        max_length=255,
        blank=True,
        null=True,
        verbose_name="System Zalo Webhook Secret",
        help_text="Mac Key dùng chung để xác minh webhook từ Zalo.",
    )

    # ── Facebook System-wide Config ──────────────────────────────────────────
    facebook_app_id = models.CharField(
        max_length=100,
        blank=True,
        null=True,
        verbose_name="System Facebook App ID",
        help_text="App ID dùng chung cho các tenant (Lấy từ Meta Developers).",
    )
    facebook_app_secret = models.CharField(
        max_length=255,
        blank=True,
        null=True,
        verbose_name="Facebook App Secret chung",
        help_text="App Secret mặc định của ứng dụng Facebook hệ thống.",
    )
    facebook_webhook_secret = models.CharField(
        max_length=255,
        blank=True,
        null=True,
        verbose_name="Facebook Webhook Verify Token chung",
        help_text="Mã xác thực webhook hệ thống.",
    )

    class Meta:
        verbose_name = "Cấu hình Hệ thống"
        verbose_name_plural = "Cấu hình Hệ thống"

    @classmethod
    def load(cls):
        obj, created = cls.objects.get_or_create(pk=1)
        return obj

    def save(self, *args, **kwargs):
        self.pk = 1
        super().save(*args, **kwargs)

    def delete(self, *args, **kwargs):
        pass

    def __str__(self):
        return "System Settings"


class CompanySequence(models.Model):
    """
    Bộ đếm số thứ tự TRUNG TÂM cho toàn bộ hệ thống.
    Mỗi (company, prefix, date_str) có một bộ đếm riêng.
    Số chỉ tăng, không bao giờ giảm dù chứng từ bị xóa.
    Đảm bảo mã chứng từ luôn liên tục, không trùng lặp, không lùi số.
    """
    company = models.ForeignKey(
        Company,
        on_delete=models.CASCADE,
        related_name="sequences",
        verbose_name="Công ty",
    )
    prefix = models.CharField(max_length=30, verbose_name="Tiền tố mã (vd: DH, EXP, LSX)")
    date_str = models.CharField(max_length=8, verbose_name="Ngày (DDMMYYYY)")
    last_seq = models.PositiveIntegerField(default=0, verbose_name="Số thứ tự cuối cùng đã cấp")

    class Meta:
        verbose_name = "Bộ đếm số thứ tự"
        verbose_name_plural = "Bộ đếm số thứ tự"
        unique_together = [("company", "prefix", "date_str")]
        indexes = [
            models.Index(fields=["company", "prefix", "date_str"]),
        ]

    def __str__(self):
        return f"{self.company.name} | {self.prefix}-{self.date_str} → {self.last_seq:03d}"

