from django.contrib.auth import get_user_model
from django.db import transaction
from rest_framework import serializers

from .models import Company, CompanySettings, Permission, Role

User = get_user_model()

import re
from .models import SystemSettings

def validate_strong_password(password):
    if not password:
        return password
        
    settings = SystemSettings.load()
    if settings.require_strong_password:
        is_valid = True
        if len(password) < 8:
            is_valid = False
        elif not re.search(r'[A-Z]', password):
            is_valid = False
        elif not re.search(r'[a-z]', password):
            is_valid = False
        elif not re.search(r'\d', password):
            is_valid = False
        elif not re.search(r'[^A-Za-z0-9]', password):
            is_valid = False
            
        if not is_valid:
            raise serializers.ValidationError("Mật khẩu phải dài ít nhất 8 ký tự, bao gồm chữ in hoa, chữ thường, số và ký tự đặc biệt theo yêu cầu của hệ thống.")
    return password


# ─────────────────────────────────────────────
# Permission
# ─────────────────────────────────────────────

class PermissionSerializer(serializers.ModelSerializer):
    class Meta:
        model = Permission
        fields = ["id", "code", "name", "module"]


# ─────────────────────────────────────────────
# Department (Phòng ban)
# ─────────────────────────────────────────────

from .models import Department

class DepartmentSerializer(serializers.ModelSerializer):
    company = serializers.PrimaryKeyRelatedField(read_only=True)
    manager_name = serializers.CharField(source="manager.full_name", read_only=True)
    user_count = serializers.SerializerMethodField()

    class Meta:
        model = Department
        fields = [
            "id",
            "company",
            "name",
            "description",
            "manager",
            "manager_name",
            "created_at",
            "is_sales_department",
            "factory",
            "user_count",
        ]
        read_only_fields = ["created_at"]

    def get_user_count(self, obj):
        return obj.users.count()

    def validate_name(self, value):
        request = self.context["request"]
        company = request.user.company
        if company is None:
            raise serializers.ValidationError(
                "Tài khoản chưa được gán công ty."
            )
        queryset = Department.objects.filter(company=company, name__iexact=value.strip())
        if self.instance:
            queryset = queryset.exclude(pk=self.instance.pk)
        if queryset.exists():
            raise serializers.ValidationError("Tên phòng ban đã tồn tại.")
        return value.strip()


# ─────────────────────────────────────────────
# Role (Vai trò / Chức danh)
# ─────────────────────────────────────────────

class RoleSerializer(serializers.ModelSerializer):
    company = serializers.PrimaryKeyRelatedField(read_only=True)
    permissions = serializers.PrimaryKeyRelatedField(
        queryset=Permission.objects.all(),
        many=True,
        required=False,
    )
    permission_details = PermissionSerializer(
        source="permissions",
        many=True,
        read_only=True,
    )
    user_count = serializers.SerializerMethodField()

    class Meta:
        model = Role
        fields = [
            "id",
            "company",
            "name",
            "description",
            "permissions",
            "permission_details",
            "user_count",
            "is_auto_assign_target",
        ]

    def get_user_count(self, obj):
        return obj.users.count()

    def validate_name(self, value):
        request = self.context["request"]
        company = request.user.company
        if company is None:
            raise serializers.ValidationError(
                "Superadmin hệ thống phải được gán công ty trước khi tạo vai trò."
            )
        queryset = Role.objects.filter(company=company, name__iexact=value.strip())
        if self.instance:
            queryset = queryset.exclude(pk=self.instance.pk)
        if queryset.exists():
            raise serializers.ValidationError("Tên vai trò đã tồn tại trong công ty.")
        return value.strip()

    def validate_permissions(self, value):
        request = self.context.get("request")
        if not request or not hasattr(request, "user"):
            return value
        company = getattr(request.user, "company", None)
        if company and hasattr(company, "settings"):
            core_modules = ["dashboard", "reports", "settings"]
            active_modules = company.settings.active_modules if isinstance(company.settings.active_modules, list) else []
            allowed_modules = set(core_modules + active_modules)
            value = [p for p in value if p.module in allowed_modules]
        return value


# ─────────────────────────────────────────────
# User (Người dùng / Nhân viên)
# ─────────────────────────────────────────────

class UserSerializer(serializers.ModelSerializer):
    password = serializers.CharField(write_only=True, required=False, min_length=8)
    company = serializers.PrimaryKeyRelatedField(read_only=True)
    company_name = serializers.CharField(source="company.name", read_only=True)
    role_name = serializers.CharField(source="role.name", read_only=True)
    department_name = serializers.CharField(source="department.name", read_only=True)
    permissions = serializers.SerializerMethodField()
    active_modules = serializers.SerializerMethodField()
    pipeline_status_labels = serializers.SerializerMethodField()
    custom_info_templates = serializers.SerializerMethodField()
    managed_department_ids = serializers.SerializerMethodField()

    company_id = serializers.IntegerField(write_only=True, required=False)

    class Meta:
        model = User
        fields = [
            "id",
            "username",
            "email",
            "password",
            "full_name",
            "phone",
            "job_title",
            "company",
            "company_name",
            "active_modules",
            "pipeline_status_labels",
            "custom_info_templates",
            "role",
            "role_name",
            "permissions",
            "is_superuser",
            "is_company_admin",
            "is_active",
            "department",
            "department_name",
            "created_at",
            "company_id",
            "managed_department_ids",
        ]
        read_only_fields = ["created_at", "permissions", "is_superuser", "company", "active_modules", "pipeline_status_labels", "custom_info_templates"]

    def get_permissions(self, obj):
        """Trả về danh sách permission code của user."""
        return list(obj.get_permission_codes())

    def get_active_modules(self, obj):
        if obj.company and hasattr(obj.company, 'settings'):
            return obj.company.settings.active_modules
        return []

    def get_pipeline_status_labels(self, obj):
        if obj.company and hasattr(obj.company, 'settings') and obj.company.settings.pipeline_status_labels:
            return obj.company.settings.pipeline_status_labels
        from users.models import get_default_pipeline_labels
        return get_default_pipeline_labels()

    def get_custom_info_templates(self, obj):
        if obj.company and hasattr(obj.company, 'settings') and obj.company.settings.custom_info_templates:
            return obj.company.settings.custom_info_templates
        return []

    def get_managed_department_ids(self, obj):
        return list(obj.managed_departments.values_list("id", flat=True))

    def validate(self, attrs):
        request = self.context["request"]
        acting_user = request.user
        
        # Lấy company từ payload nếu là superuser, nếu không thì lấy company của người tạo
        company_id = attrs.pop("company_id", None)
        if acting_user.is_superuser and company_id:
            try:
                company = Company.objects.get(id=company_id)
            except Company.DoesNotExist:
                raise serializers.ValidationError({"company_id": "Công ty không tồn tại."})
        else:
            company = acting_user.company

        if company is None and not acting_user.is_superuser:
            raise serializers.ValidationError("Tài khoản của bạn chưa được gán công ty.")

        # Gán company vào attrs để create/update sử dụng
        if company:
            attrs["company"] = company

        role = attrs.get("role", getattr(self.instance, "role", None))
        if role and company and role.company_id != company.id:
            raise serializers.ValidationError(
                {"role": "Vai trò không thuộc công ty của nhân viên."}
            )

        department = attrs.get("department", getattr(self.instance, "department", None))
        if department and company and department.company_id != company.id:
            raise serializers.ValidationError(
                {"department": "Phòng ban không thuộc công ty của nhân viên."}
            )

        return attrs

    def create(self, validated_data):
        password = validated_data.pop("password", None)
        if not password:
            raise serializers.ValidationError({"password": "Mật khẩu là bắt buộc."})
        validate_strong_password(password)
        user = User(**validated_data)
        user.set_password(password)
        user.save()
        return user

    def update(self, instance, validated_data):
        password = validated_data.pop("password", None)
        instance = super().update(instance, validated_data)
        if password:
            validate_strong_password(password)
            instance.set_password(password)
            instance.save(update_fields=["password"])
        return instance


# ─────────────────────────────────────────────
# MyCompany (dành cho Company Admin)
# ─────────────────────────────────────────────

class MyCompanySerializer(serializers.ModelSerializer):
    class Meta:
        model = Company
        fields = [
            "id", "name", "workspace_id", "tax_code", "address", "phone", "logo",
            "stamp_image", "director_signature", "director_name", "director_title",
        ]
        read_only_fields = ["id", "workspace_id"]


# ─────────────────────────────────────────────
# Company (dành cho System Admin)
# ─────────────────────────────────────────────

class CompanySerializer(serializers.ModelSerializer):
    user_count = serializers.SerializerMethodField()
    owner_email = serializers.SerializerMethodField()

    # Các trường dùng để tạo tài khoản Giám đốc ban đầu khi SuperAdmin thêm công ty
    admin_username = serializers.CharField(write_only=True, required=False, allow_blank=True)
    admin_password = serializers.CharField(write_only=True, required=False, allow_blank=True, min_length=6)
    admin_email = serializers.EmailField(write_only=True, required=False, allow_blank=True)
    admin_fullname = serializers.CharField(write_only=True, required=False, allow_blank=True)

    active_modules = serializers.SerializerMethodField()
    set_active_modules = serializers.ListField(
        child=serializers.CharField(),
        required=False,
        write_only=True,
    )
    
    allow_system_keys = serializers.SerializerMethodField()

    class Meta:
        model = Company
        fields = [
            "id",
            "name",
            "workspace_id",
            "tax_code",
            "address",
            "phone",
            "logo",
            "stamp_image",
            "director_signature",
            "director_name",
            "director_title",
            "user_limit",
            "is_active",
            "created_at",
            "user_count",
            "owner_email",
            "admin_username",
            "admin_password",
            "admin_email",
            "admin_fullname",
            "active_modules",
            "set_active_modules",
            "allow_system_keys",
        ]
        read_only_fields = ["created_at", "active_modules", "allow_system_keys"]

    def get_user_count(self, obj):
        return obj.users.count()

    def get_owner_email(self, obj):
        owner = obj.users.filter(is_company_admin=True).first()
        return owner.email if owner else None

    def get_active_modules(self, obj):
        if hasattr(obj, 'settings'):
            return obj.settings.active_modules
        return []

    def get_allow_system_keys(self, obj):
        try:
            return obj.ai_settings.allow_system_keys
        except Exception:
            return False

    def validate_admin_username(self, value):
        if value and User.objects.filter(username__iexact=value).exists():
            raise serializers.ValidationError(f"Tên đăng nhập '{value}' đã tồn tại trên hệ thống.")
        return value

    def validate_admin_email(self, value):
        if value and User.objects.filter(email__iexact=value).exists():
            raise serializers.ValidationError(f"Email '{value}' đã được sử dụng.")
        return value

    def validate_workspace_id(self, value):
        if not value:
            return value
        value = value.strip().upper().replace(" ", "")
        qs = Company.objects.filter(workspace_id__iexact=value)
        if self.instance:
            qs = qs.exclude(pk=self.instance.pk)
        if qs.exists():
            raise serializers.ValidationError("Workspace ID này đã được sử dụng.")
        return value

    @transaction.atomic
    def create(self, validated_data):
        admin_username = validated_data.pop("admin_username", None)
        admin_password = validated_data.pop("admin_password", None)
        admin_email = validated_data.pop("admin_email", None)
        admin_fullname = validated_data.pop("admin_fullname", None)
        set_active_modules = validated_data.pop("set_active_modules", None)

        company = super().create(validated_data)

        # Khởi tạo cài đặt mặc định cho công ty
        settings = CompanySettings.objects.create(company=company)
        if set_active_modules is not None:
            settings.active_modules = set_active_modules
            settings.save(update_fields=["active_modules"])

        # Tự động tạo tài khoản Giám đốc nếu có nhập thông tin admin
        if admin_username and admin_password:
            director_role, _ = Role.objects.get_or_create(
                company=company,
                name="Giám đốc",
                defaults={"description": "Vai trò quản trị cao nhất của công ty."}
            )
            # Giám đốc mặc định có toàn bộ quyền
            director_role.permissions.set(Permission.objects.all())

            User.objects.create_user(
                username=admin_username,
                password=admin_password,
                email=admin_email or f"{admin_username}@saas.local",
                full_name=admin_fullname or "Giám đốc",
                company=company,
                role=director_role,
                is_company_admin=True,
                job_title="Giám đốc",
            )

        return company

    def update(self, instance, validated_data):
        active_modules = validated_data.pop("active_modules", None)
        
        company = super().update(instance, validated_data)
        
        if active_modules is not None:
            settings, _ = CompanySettings.objects.get_or_create(company=company)
            settings.active_modules = active_modules
            settings.save(update_fields=["active_modules"])
            
        return company

    def update(self, instance, validated_data):
        set_active_modules = validated_data.pop("set_active_modules", None)
        
        company = super().update(instance, validated_data)
        
        if set_active_modules is not None:
            settings, _ = CompanySettings.objects.get_or_create(company=company)
            settings.active_modules = set_active_modules
            settings.save(update_fields=["active_modules"])
            
        return company

    def validate_tax_code(self, value):
        value = value.strip()
        qs = Company.objects.filter(tax_code__iexact=value)
        if self.instance:
            qs = qs.exclude(pk=self.instance.pk)
        if qs.exists():
            raise serializers.ValidationError("Mã số thuế đã được đăng ký.")
        return value


# ─────────────────────────────────────────────
# Company Registration (Đăng ký công ty mới)
# ─────────────────────────────────────────────

class CompanyRegistrationSerializer(serializers.Serializer):
    # Thông tin công ty
    company_name = serializers.CharField(max_length=255)
    workspace_id = serializers.SlugField(
        max_length=60,
        required=False,
        allow_blank=True,
        help_text="Để trống để tự động tạo từ mã số thuế.",
    )
    tax_code = serializers.CharField(max_length=50)
    address = serializers.CharField(required=False, allow_blank=True, default="")

    # Tài khoản Owner
    username = serializers.CharField(max_length=150)
    email = serializers.EmailField()
    password = serializers.CharField(write_only=True, min_length=8)
    full_name = serializers.CharField(max_length=255)
    phone = serializers.CharField(max_length=20, required=False, allow_blank=True, default="")

    def validate_tax_code(self, value):
        value = value.strip()
        if Company.objects.filter(tax_code__iexact=value).exists():
            raise serializers.ValidationError("Mã số thuế đã được đăng ký.")
        return value

    def validate_workspace_id(self, value):
        if not value:
            return value
        value = value.strip().upper().replace(" ", "")
        
        import re
        if not re.match(r'^[A-Z0-9]+$', value):
            raise serializers.ValidationError("Mã Workspace chỉ được chứa chữ cái in hoa và số, viết liền không dấu.")
            
        if Company.objects.filter(workspace_id__iexact=value).exists():
            raise serializers.ValidationError("Workspace ID này đã được sử dụng.")
        return value

    def validate_username(self, value):
        if User.objects.filter(username__iexact=value).exists():
            raise serializers.ValidationError("Tên đăng nhập đã tồn tại.")
        return value

    def validate_email(self, value):
        if User.objects.filter(email__iexact=value).exists():
            raise serializers.ValidationError("Email đã tồn tại.")
        return value

    def validate_password(self, value):
        return validate_strong_password(value)

    @transaction.atomic
    def create(self, validated_data):
        from .models import SystemSettings
        settings = SystemSettings.load()
        
        workspace_id = validated_data.get("workspace_id") or None
        company = Company.objects.create(
            name=validated_data["company_name"],
            workspace_id=workspace_id or "",  # models.save() sẽ auto-generate nếu rỗng
            tax_code=validated_data["tax_code"],
            address=validated_data["address"],
            user_limit=settings.default_user_limit,
        )

        # Tạo cài đặt mặc định cho công ty
        CompanySettings.objects.create(company=company)

        # Tạo vai trò "Giám đốc" mặc định với toàn bộ quyền
        director_role = Role.objects.create(
            company=company,
            name="Giám đốc",
            description="Vai trò quản trị cao nhất của công ty.",
        )
        director_role.permissions.set(Permission.objects.all())

        # Tạo tài khoản Owner (is_company_admin=True)
        owner = User.objects.create_user(
            username=validated_data["username"],
            email=validated_data["email"],
            password=validated_data["password"],
            full_name=validated_data["full_name"],
            phone=validated_data["phone"],
            job_title="Giám đốc",
            company=company,
            role=director_role,
            is_company_admin=True,
        )
        return owner

    def to_representation(self, instance):
        return {
            "company": {
                "id": instance.company_id,
                "name": instance.company.name,
                "workspace_id": instance.company.workspace_id,
                "tax_code": instance.company.tax_code,
                "address": instance.company.address,
                "created_at": instance.company.created_at,
            },
            "user": UserSerializer(instance, context=self.context).data,
        }


# ─────────────────────────────────────────────
# CompanySettings
# ─────────────────────────────────────────────

class CompanySettingsSerializer(serializers.ModelSerializer):
    quotation_template_detail = serializers.SerializerMethodField()

    class Meta:
        model = CompanySettings
        fields = ["id", "order_prefix", "lead_routing", "timezone", "active_modules", "pipeline_status_labels", "quotation_template", "default_quotation_terms", "quotation_template_detail", "custom_quotation_title", "custom_order_title", "default_warranty_content", "default_warranty_rules", "inactive_days_threshold", "website_api_key", "is_website_integration_active", "continuous_sequence_numbering", "custom_info_templates"]

    def get_quotation_template_detail(self, obj):
        if obj.quotation_template:
            from sales.serializers import QuotationTemplateSerializer
            return QuotationTemplateSerializer(obj.quotation_template).data
        return None

    def update(self, instance, validated_data):
        res = super().update(instance, validated_data)
        if "quotation_template" in validated_data:
            instance.company.quotation_template = validated_data["quotation_template"]
            instance.company.save(update_fields=["quotation_template"])
        return res


# ─────────────────────────────────────────────
# Change Password
# ─────────────────────────────────────────────

class ChangePasswordSerializer(serializers.Serializer):
    old_password = serializers.CharField(write_only=True)
    new_password = serializers.CharField(write_only=True, min_length=8)

    def validate_old_password(self, value):
        user = self.context["request"].user
        if not user.check_password(value):
            raise serializers.ValidationError("Mật khẩu cũ không đúng.")
        return value

    def validate_new_password(self, value):
        return validate_strong_password(value)


# ─────────────────────────────────────────────
# User Quota Serializer
# ─────────────────────────────────────────────

class UserQuotaSerializer(serializers.Serializer):
    user_limit = serializers.IntegerField(allow_null=True)
    active_users = serializers.IntegerField()
    remaining_users = serializers.IntegerField(allow_null=True)
    can_add_user = serializers.BooleanField()


# ─────────────────────────────────────────────
# Subscription Plan
# ─────────────────────────────────────────────

from .models import SubscriptionPlan

class SubscriptionPlanSerializer(serializers.ModelSerializer):
    class Meta:
        model = SubscriptionPlan
        fields = ["id", "code", "name", "user_limit", "is_default", "created_at"]
        read_only_fields = ["id", "is_default", "created_at"]


# ─────────────────────────────────────────────
# System Settings
# ─────────────────────────────────────────────

from .models import SystemSettings

class SystemSettingsSerializer(serializers.ModelSerializer):
    class Meta:
        model = SystemSettings
        fields = [
            "require_strong_password",
            "enable_public_registration",
            "default_plan",
            "default_user_limit",
            "tenant_isolation_mode",
            "jwt_expiration_hours",
            "max_file_upload_mb",
            "maintenance_mode",
            "zalo_app_id",
            "zalo_app_secret",
            "zalo_webhook_secret",
            "facebook_app_id",
            "facebook_app_secret",
            "facebook_webhook_secret",
        ]

