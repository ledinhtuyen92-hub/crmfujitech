from django.contrib.auth import get_user_model
from rest_framework import generics, permissions, serializers, status, viewsets
from rest_framework.decorators import action
from rest_framework.response import Response
from rest_framework.views import APIView
from rest_framework_simplejwt.serializers import TokenObtainPairSerializer
from rest_framework_simplejwt.views import TokenObtainPairView

from .models import Company, CompanySettings, Permission, Role, Department
from .permissions import IsCompanyAdmin, IsSuperAdmin, IsCompanyAdminOrReadOnly, CanManageCompanySettings, ActionBasedPermission
from .serializers import (
    ChangePasswordSerializer,
    CompanyRegistrationSerializer,
    CompanySerializer,
    CompanySettingsSerializer,
    PermissionSerializer,
    RoleSerializer,
    DepartmentSerializer,
    UserQuotaSerializer,
    UserSerializer,
    SystemSettingsSerializer,
    MyCompanySerializer,
)

User = get_user_model()


# ─────────────────────────────────────────────
# Custom JWT Login — validate workspace_id
# ─────────────────────────────────────────────

class CustomTokenObtainPairSerializer(TokenObtainPairSerializer):
    """
    Mở rộng TokenObtainPairSerializer để hỗ trợ trường workspace_id.
    - Người dùng thông thường: bắt buộc nhập workspace_id để xác định công ty.
    - Superuser hệ thống: workspace_id là "SYSTEM" hoặc để trống.
    """

    workspace_id = serializers.CharField(required=False, allow_blank=True, default="")

    def validate(self, attrs):
        workspace_id = attrs.pop("workspace_id", "").strip().upper()

        # Gọi validation gốc để lấy token
        data = super().validate(attrs)

        user = self.user

        # Kiểm tra workspace_id cho tài khoản công ty
        if not user.is_superuser:
            if not workspace_id:
                raise serializers.ValidationError(
                    {"workspace_id": "Vui lòng nhập Mã công ty (Workspace ID)."}
                )
            # Kiểm tra user thuộc đúng công ty
            if not user.company:
                raise serializers.ValidationError(
                    "Tài khoản của bạn chưa được gán vào công ty nào."
                )
            if user.company.workspace_id.upper() != workspace_id:
                raise serializers.ValidationError(
                    {"workspace_id": "Mã công ty không đúng."}
                )
            if not user.company.is_active:
                raise serializers.ValidationError(
                    "Công ty của bạn đã bị vô hiệu hóa. Vui lòng liên hệ quản trị viên hệ thống."
                )

        if not user.is_active:
            raise serializers.ValidationError(
                "Tài khoản của bạn đã bị khóa. Vui lòng liên hệ quản trị viên."
            )

        # Thêm thông tin user vào response token
        data["user"] = UserSerializer(user, context=self.context).data
        return data

    @classmethod
    def get_token(cls, user):
        token = super().get_token(user)
        
        # Lấy expiration time từ cấu hình hệ thống thay vì fix cứng trong settings.py
        from .models import SystemSettings
        from datetime import timedelta
        import datetime
        
        settings = SystemSettings.load()
        # Tính lại ngày hết hạn dựa vào jwt_expiration_hours
        exp_time = datetime.datetime.utcnow() + timedelta(hours=settings.jwt_expiration_hours)
        token['exp'] = int(exp_time.timestamp())
        
        return token


class CustomTokenObtainPairView(TokenObtainPairView):
    serializer_class = CustomTokenObtainPairSerializer


# ─────────────────────────────────────────────
# Current User Info
# ─────────────────────────────────────────────

class CurrentUserView(APIView):
    """GET /api/users/me/ — Trả về thông tin user đang đăng nhập."""

    permission_classes = [permissions.IsAuthenticated]

    def get(self, request):
        serializer = UserSerializer(request.user, context={"request": request})
        return Response(serializer.data)


# ─────────────────────────────────────────────
# Change Password
# ─────────────────────────────────────────────

class ChangePasswordView(APIView):
    """POST /api/users/change-password/ — Đổi mật khẩu."""

    permission_classes = [permissions.IsAuthenticated]

    def post(self, request):
        serializer = ChangePasswordSerializer(data=request.data, context={"request": request})
        serializer.is_valid(raise_exception=True)
        request.user.set_password(serializer.validated_data["new_password"])
        request.user.save(update_fields=["password"])
        return Response({"detail": "Đổi mật khẩu thành công."}, status=status.HTTP_200_OK)


# ─────────────────────────────────────────────
# Tenant Mixin
# ─────────────────────────────────────────────

class TenantQuerySetMixin:
    """Mixin đảm bảo mọi queryset đều filter theo công ty của user."""

    def get_company(self):
        return self.request.user.company

    def get_queryset(self):
        queryset = super().get_queryset()
        user = self.request.user
        
        from .models import SystemSettings
        settings = SystemSettings.load()
        
        # Ở chế độ Relaxed, Superadmin luôn xem được tất cả dữ liệu (không bị khoá vào công ty của mình)
        # Ở chế độ Strict, Superadmin nếu bị gán vào 1 công ty thì chỉ xem được dữ liệu công ty đó
        if user.is_superuser:
            if settings.tenant_isolation_mode == 'relaxed' or user.company_id is None:
                return queryset
                
        return queryset.filter(company=self.get_company())

    def perform_create(self, serializer):
        company = self.get_company()
        if company is None:
            raise serializers.ValidationError(
                {"company": "Superadmin hệ thống phải được gán công ty để tạo dữ liệu."}
            )
        serializer.save(company=company)


# ─────────────────────────────────────────────
# Company ViewSet (chỉ System Admin)
# ─────────────────────────────────────────────

class CompanyViewSet(viewsets.ModelViewSet):
    """CRUD công ty — chỉ System Administrator mới được truy cập."""

    queryset = Company.objects.prefetch_related("users").order_by("-created_at")
    serializer_class = CompanySerializer
    permission_classes = [IsSuperAdmin]

    def perform_create(self, serializer):
        serializer.save()

    def perform_destroy(self, instance):
        # Khi xoá công ty, Django's collector có thể bị vướng ProtectedError 
        # do các liên kết chéo (vd: Quotation -> Customer là PROTECT).
        # Ta cần xoá thủ công các dữ liệu có Protected ForeignKey trước.
        try:
            from sales.models import Quotation
            from orders.models import Order
            from production.models import ProductionOrder
            from inventory.models import InventoryTransaction, Product
            from crm.models import CustomerInteraction, Customer
            
            CustomerInteraction.objects.filter(customer__company=instance).delete()
            ProductionOrder.objects.filter(company=instance).delete()
            Order.objects.filter(company=instance).delete()
            Quotation.objects.filter(company=instance).delete()
            InventoryTransaction.objects.filter(warehouse__company=instance).delete()
            Product.objects.filter(company=instance).delete()
            Customer.objects.filter(company=instance).delete()
        except Exception as e:
            pass # Cứ để instance.delete() catch phần còn lại
            
        instance.delete()

    @action(detail=True, methods=["post"])
    def toggle_system_keys(self, request, pk=None):
        company = self.get_object()
        from ai_agents.models import CompanyAiSettings
        settings, _ = CompanyAiSettings.objects.get_or_create(company=company)
        # Super Admin bật tắt quyền allow_system_keys
        new_status = request.data.get('allow_system_keys', True)
        settings.allow_system_keys = new_status
        # Tự động tắt use_system_keys nếu thu hồi quyền
        if not new_status:
            settings.use_system_keys = False
        settings.save(update_fields=['allow_system_keys', 'use_system_keys'])
        return Response({'status': 'ok', 'allow_system_keys': settings.allow_system_keys})

    @action(detail=True, methods=["post"])
    def recreate_admin(self, request, pk=None):
        from rest_framework.response import Response
        from rest_framework import status
        from django.db import transaction
        
        company = self.get_object()
        
        # Check if an admin already exists
        has_admin = User.objects.filter(company=company, is_company_admin=True).exists()
        if has_admin:
            return Response(
                {"detail": "Công ty này đã có tài khoản Giám đốc (Admin)."}, 
                status=status.HTTP_400_BAD_REQUEST
            )
        
        try:
            with transaction.atomic():
                username = f"admin_{company.workspace_id.lower()}"
                # check if username exists
                if User.objects.filter(username=username).exists():
                    import uuid
                    username = f"{username}_{str(uuid.uuid4())[:4]}"
                    
                email = f"{username}@crm.local"
                
                # Fetch role director or create
                role_director, _ = Role.objects.get_or_create(
                    company=company,
                    name="Giám đốc Điều hành",
                    defaults={"description": "Toàn quyền quản trị hệ thống"},
                )
                
                # Give all perms
                all_perms = Permission.objects.all()
                role_director.permissions.set(all_perms)
                
                admin_user = User.objects.create(
                    username=username,
                    email=email,
                    full_name=f"Giám đốc",
                    company=company,
                    role=role_director,
                    is_company_admin=True,
                )
                admin_user.set_password("123456")
                admin_user.save()
                
            return Response({
                "detail": "Đã tạo lại tài khoản Giám đốc thành công.",
                "username": admin_user.username,
                "password": "123456"
            })
        except Exception as e:
            return Response({"detail": str(e)}, status=status.HTTP_400_BAD_REQUEST)



# ─────────────────────────────────────────────
# Company Registration (Đăng ký tự do)
# ─────────────────────────────────────────────

class CompanyRegistrationView(generics.CreateAPIView):
    """POST /api/users/register-company/ — Đăng ký tài khoản công ty mới (không cần auth)."""

    serializer_class = CompanyRegistrationSerializer
    permission_classes = [permissions.AllowAny]

    def post(self, request, *args, **kwargs):
        from .models import SystemSettings
        settings = SystemSettings.load()
        if not settings.enable_public_registration:
            from rest_framework import status
            from rest_framework.response import Response
            return Response(
                {"detail": "Tính năng đăng ký hiện đang tạm khóa bởi Quản trị viên."},
                status=status.HTTP_403_FORBIDDEN
            )
        return super().post(request, *args, **kwargs)



# ─────────────────────────────────────────────
# Department ViewSet (Company Admin)
# ─────────────────────────────────────────────

class DepartmentViewSet(TenantQuerySetMixin, viewsets.ModelViewSet):
    """CRUD phòng ban trong công ty — chỉ Company Admin mới tạo/sửa/xóa."""

    queryset = Department.objects.select_related("company", "manager").prefetch_related("users")
    serializer_class = DepartmentSerializer
    permission_classes = [ActionBasedPermission]
    action_permissions = {
        "create": "settings.departments",
        "update": "settings.departments",
        "partial_update": "settings.departments",
        "destroy": "settings.departments",
    }
    pagination_class = None

    def perform_create(self, serializer):
        company = self.get_company()
        if company is None:
            raise serializers.ValidationError(
                {"company": "Superadmin hệ thống phải được gán công ty để tạo phòng ban."}
            )
        serializer.save(company=company)


# ─────────────────────────────────────────────
# Role ViewSet (Company Admin)
# ─────────────────────────────────────────────

class RoleViewSet(TenantQuerySetMixin, viewsets.ModelViewSet):
    """CRUD vai trò/chức danh trong công ty — chỉ Company Admin mới tạo/sửa/xóa."""

    queryset = Role.objects.select_related("company").prefetch_related("permissions", "users")
    serializer_class = RoleSerializer
    permission_classes = [ActionBasedPermission]
    action_permissions = {
        "list": "settings.roles",
        "retrieve": "settings.roles",
        "create": "settings.roles",
        "update": "settings.roles",
        "partial_update": "settings.roles",
        "destroy": "settings.roles",
    }
    pagination_class = None


# ─────────────────────────────────────────────
# User ViewSet (Company Admin)
# ─────────────────────────────────────────────

class UserViewSet(TenantQuerySetMixin, viewsets.ModelViewSet):
    """CRUD nhân viên trong công ty — Company Admin tạo/sửa/xóa, nhân viên thường chỉ đọc."""

    queryset = User.objects.select_related("company", "role").prefetch_related("role__permissions")
    serializer_class = UserSerializer
    permission_classes = [IsCompanyAdminOrReadOnly]

    def get_queryset(self):
        qs = super().get_queryset()
        # Ẩn tài khoản superuser khỏi danh sách nếu người dùng hiện tại không phải superuser
        if not self.request.user.is_superuser:
            qs = qs.filter(is_superuser=False)
            
        company_id = self.request.query_params.get("company")
        if company_id:
            qs = qs.filter(company_id=company_id)
            
        role_param = self.request.query_params.get("role")
        factory_id = self.request.query_params.get("factory_id")
        
        if role_param == 'shipper':
            qs = qs.filter(role__permissions__code="delivery.shipper")
            if factory_id:
                from django.db.models import Q
                qs = qs.filter(
                    Q(department__isnull=True) |
                    Q(department__factory__isnull=True) |
                    Q(department__factory_id=factory_id)
                )
            
        return qs

    def perform_create(self, serializer):
        company = self.get_company()
        if company is None:
            raise serializers.ValidationError(
                {"company": "Superadmin hệ thống phải được gán công ty để tạo nhân viên."}
            )
        # Kiểm tra giới hạn số nhân viên
        current_count = User.objects.filter(company=company, is_active=True).count()
        if company.user_limit and current_count >= company.user_limit:
            raise serializers.ValidationError(
                f"Đã đạt giới hạn số nhân viên ({company.user_limit}). "
                f"Vui lòng nâng cấp gói dịch vụ."
            )
        serializer.save(company=company)

    def perform_destroy(self, instance):
        if instance.is_superuser:
            raise serializers.ValidationError(
                "Không thể xóa tài khoản Quản trị hệ thống (Superadmin)!"
            )
        
        from django.db import transaction
        
        # Tìm tài khoản admin công ty (hoặc chính người đang thực hiện thao tác xóa) để chuyển giao dữ liệu
        company_admin = None
        if self.request.user and (self.request.user.is_company_admin or self.request.user.is_superuser) and self.request.user.id != instance.id:
            company_admin = self.request.user
        elif instance.company:
            company_admin = User.objects.filter(company=instance.company, is_company_admin=True, is_active=True).exclude(id=instance.id).first()
            if not company_admin:
                company_admin = User.objects.filter(company=instance.company, is_superuser=True).exclude(id=instance.id).first()
        if not company_admin:
            company_admin = User.objects.filter(is_superuser=True).exclude(id=instance.id).first()

        with transaction.atomic():
            if company_admin:
                from crm.models import Customer, CustomerInteraction
                from sales.models import Quotation
                from orders.models import Order
                from production.models import ProductionStep
                from inventory.models import InventoryTransaction
                from notifications.models import Notification
                from users.models import Department
                from django.contrib.admin.models import LogEntry

                # 1. CRM
                Customer.objects.filter(assigned_to=instance).update(assigned_to=None)
                Customer.objects.filter(created_by=instance).update(created_by=company_admin)
                CustomerInteraction.objects.filter(created_by=instance).update(created_by=company_admin)

                # 2. Sales & Orders
                Quotation.objects.filter(created_by=instance).update(created_by=company_admin)
                Order.objects.filter(created_by=instance).update(created_by=company_admin)
                Order.objects.filter(approved_by=instance).update(approved_by=company_admin)

                # 3. Production & Inventory
                ProductionStep.objects.filter(assigned_to=instance).update(assigned_to=company_admin)
                InventoryTransaction.objects.filter(created_by=instance).update(created_by=company_admin)

                # 4. Users / HR
                Department.objects.filter(manager=instance).update(manager=company_admin)
                
                # 5. Notifications & Logs
                Notification.objects.filter(sender=instance).update(sender=company_admin)
                LogEntry.objects.filter(user=instance).delete()

            super().perform_destroy(instance)

    def perform_update(self, serializer):
        instance = self.get_object()
        # Không cho phép khoá, đổi is_superuser hoặc is_staff của Superadmin
        if instance.is_superuser:
            data = self.request.data
            if 'is_active' in data and not data['is_active']:
                raise serializers.ValidationError(
                    "Không thể khoá tài khoản Quản trị hệ thống (Superadmin)!"
                )
            if 'is_superuser' in data and not data['is_superuser']:
                raise serializers.ValidationError(
                    "Không thể tước quyền Superadmin!"
                )
        serializer.save()

    from rest_framework.decorators import action
    from rest_framework.response import Response
    from rest_framework import status

    @action(detail=True, methods=["post"])
    def reset_password(self, request, pk=None):
        user = self.get_object()
        new_password = request.data.get("new_password")
        if not new_password:
            return Response({"new_password": "Vui lòng nhập mật khẩu mới."}, status=status.HTTP_400_BAD_REQUEST)
        
        from .serializers import validate_strong_password
        try:
            validate_strong_password(new_password)
        except serializers.ValidationError as e:
            return Response({"new_password": e.detail}, status=status.HTTP_400_BAD_REQUEST)
            
        user.set_password(new_password)
        user.save(update_fields=["password"])
        return Response({"detail": f"Đã đặt lại mật khẩu thành công cho {user.username}."})


# ─────────────────────────────────────────────
# Permission ViewSet (Read-only)
# ─────────────────────────────────────────────

class PermissionViewSet(viewsets.ReadOnlyModelViewSet):
    """GET permissions — dùng để hiển thị danh sách quyền khi cấu hình vai trò."""
    serializer_class = PermissionSerializer
    permission_classes = [IsCompanyAdmin]
    pagination_class = None

    def get_queryset(self):
        company = self.request.user.company
        if not company:
            return Permission.objects.none()
            
        # Core modules are always available for permission assignment
        core_modules = ["dashboard", "reports", "settings"]
        active_modules = company.settings.active_modules if hasattr(company, "settings") else []
        allowed_modules = core_modules + active_modules
        
        return Permission.objects.filter(module__in=allowed_modules).order_by("module", "code")


# ─────────────────────────────────────────────
# MyCompany API
# ─────────────────────────────────────────────

from rest_framework.parsers import MultiPartParser, FormParser, JSONParser

class MyCompanyView(generics.RetrieveUpdateAPIView):
    """
    GET  /api/users/my-company/  — Lấy thông tin tài khoản công ty hiện tại (Tên, MST, Địa chỉ, Hotline, Logo).
    PATCH /api/users/my-company/ — Cập nhật thông tin và upload logo công ty.
    Chỉ Company Admin mới có quyền cập nhật, user trong công ty có thể xem.
    """
    serializer_class = MyCompanySerializer
    permission_classes = [permissions.IsAuthenticated]
    parser_classes = [MultiPartParser, FormParser, JSONParser]
    http_method_names = ["get", "patch", "put"]

    def get_permissions(self):
        if self.request.method in permissions.SAFE_METHODS:
            return [permissions.IsAuthenticated()]
        return [CanManageCompanySettings()]

    def get_object(self):
        if not self.request.user.company:
            from rest_framework.exceptions import NotFound
            raise NotFound("Tài khoản chưa được gán công ty nào.")
        return self.request.user.company


# ─────────────────────────────────────────────
# CompanySettings API
# ─────────────────────────────────────────────

class CompanySettingsView(generics.RetrieveUpdateAPIView):
    """
    GET  /api/users/company-settings/  — Lấy cài đặt hiện tại của công ty.
    PATCH /api/users/company-settings/ — Cập nhật cài đặt.
    Chỉ Company Admin mới có quyền.
    """

    serializer_class = CompanySettingsSerializer
    http_method_names = ["get", "patch"]

    def get_permissions(self):
        return [permissions.IsAuthenticated()]

    def update(self, request, *args, **kwargs):
        user = request.user
        is_admin = user.is_superuser or user.is_company_admin or (user.role and user.role.permissions.filter(code="settings.company").exists())
        
        if not is_admin:
            keys = request.data.keys()
            perms = user.role.permissions.values_list('code', flat=True) if user.role else []
            
            allowed = False
            # Allow website_integration.manage to update its specific settings
            if 'website_integration.manage' in perms and all(k in ['is_website_integration_active', 'website_api_key'] for k in keys):
                allowed = True
            
            # Allow ai_agent.manage_keys to update AI system keys usage
            if 'ai_agent.manage_keys' in perms and all(k in ['use_system_keys'] for k in keys):
                allowed = True
                
            if not allowed:
                from rest_framework.exceptions import PermissionDenied
                raise PermissionDenied("Bạn không có quyền cập nhật cấu hình công ty này.")
                
        return super().update(request, *args, **kwargs)

    def get_object(self):
        settings_obj, _ = CompanySettings.objects.get_or_create(
            company=self.request.user.company
        )
        return settings_obj


class UpdateSequenceView(APIView):
    """
    POST /api/users/company-settings/update-sequence/
    API để cập nhật trực tiếp số thứ tự bắt đầu của một loại phiếu (mặc định DH).
    Chỉ Company Admin mới có quyền.
    """
    permission_classes = [IsCompanyAdmin]

    def post(self, request, *args, **kwargs):
        company = request.user.company
        if not company:
            return Response({"error": "Người dùng không thuộc công ty nào."}, status=status.HTTP_400_BAD_REQUEST)

        doc_type = request.data.get("prefix", "DH") # Actually this is doc_type, default DH
        next_sequence = request.data.get("next_sequence")

        if not next_sequence:
            return Response({"error": "Thiếu thông tin next_sequence."}, status=status.HTTP_400_BAD_REQUEST)

        try:
            next_sequence = int(next_sequence)
        except ValueError:
            return Response({"error": "next_sequence phải là số nguyên."}, status=status.HTTP_400_BAD_REQUEST)

        if next_sequence <= 0:
            return Response({"error": "next_sequence phải lớn hơn 0."}, status=status.HTTP_400_BAD_REQUEST)

        from core.numbering import resolve_doc_prefix
        prefix = resolve_doc_prefix(company, doc_type)

        settings = getattr(company, "settings", None)
        is_continuous = settings and settings.continuous_sequence_numbering
        
        from datetime import date
        date_str = "ALL_TIME" if is_continuous else date.today().strftime("%d%m%Y")

        from django.db import transaction
        from users.models import CompanySequence

        with transaction.atomic():
            seq_obj, created = CompanySequence.objects.select_for_update().get_or_create(
                company=company,
                prefix=prefix,
                date_str=date_str,
                defaults={"last_seq": 0},
            )

            current_max = seq_obj.last_seq
            if next_sequence <= current_max:
                return Response(
                    {"error": f"Số thứ tự tiếp theo ({next_sequence}) phải lớn hơn số thứ tự đã cấp lớn nhất hiện tại ({current_max})."},
                    status=status.HTTP_400_BAD_REQUEST
                )

            seq_obj.last_seq = next_sequence - 1
            seq_obj.save(update_fields=["last_seq"])

        return Response({
            "message": f"Cập nhật thành công. Đơn hàng tiếp theo sẽ bắt đầu từ số {next_sequence}.",
            "prefix": prefix,
            "next_sequence": next_sequence
        }, status=status.HTTP_200_OK)


# ─────────────────────────────────────────────
# System Settings API (Superadmin only)
# ─────────────────────────────────────────────

class SystemSettingsView(generics.RetrieveUpdateAPIView):
    """
    GET  /api/users/system-settings/  — Lấy cấu hình toàn hệ thống.
    PATCH /api/users/system-settings/ — Cập nhật cấu hình toàn hệ thống.
    """
    serializer_class = SystemSettingsSerializer
    permission_classes = [IsSuperAdmin]

    def get_object(self):
        from .models import SystemSettings
        return SystemSettings.load()

# ─────────────────────────────────────────────
# Subscription Plan API
# ─────────────────────────────────────────────

from .models import SubscriptionPlan
from .serializers import SubscriptionPlanSerializer

class SubscriptionPlanViewSet(viewsets.ModelViewSet):
    """
    CRUD cho Gói đăng ký.
    - Superadmin: Toàn quyền.
    - User thường (kể cả chưa auth, hoặc auth): Chỉ được GET để xem danh sách gói.
    """
    queryset = SubscriptionPlan.objects.all()
    serializer_class = SubscriptionPlanSerializer
    
    def get_permissions(self):
        if self.request.method in permissions.SAFE_METHODS:
            return [permissions.AllowAny()]
        return [IsSuperAdmin()]


# ─────────────────────────────────────────────
# Public Settings API (AllowAny)
# ─────────────────────────────────────────────

class PublicSettingsView(APIView):
    """
    GET /api/users/public-settings/ — Lấy cấu hình public (ví dụ: enable_public_registration).
    """
    permission_classes = [permissions.AllowAny]

    def get(self, request):
        from .models import SystemSettings
        settings = SystemSettings.load()
        return Response({
            "enable_public_registration": settings.enable_public_registration,
            "maintenance_mode": settings.maintenance_mode,
        })


# ─────────────────────────────────────────────
# User quota check endpoint
# ─────────────────────────────────────────────

class UserQuotaView(APIView):
    """
    GET /api/users/quota/ — Trả về thông tin hạn mức (quota) tài khoản nhân viên của công ty.
    """
    permission_classes = [permissions.IsAuthenticated]

    def get(self, request):
        company = request.user.company
        if not company:
            return Response(
                {"detail": "Tài khoản không thuộc công ty nào."},
                status=status.HTTP_400_BAD_REQUEST,
            )
        active_users = User.objects.filter(company=company, is_active=True).count()
        user_limit = company.user_limit
        if user_limit is not None:
            remaining_users = max(0, user_limit - active_users)
            can_add_user = active_users < user_limit
        else:
            remaining_users = None
            can_add_user = True

        serializer = UserQuotaSerializer({
            "user_limit": user_limit,
            "active_users": active_users,
            "remaining_users": remaining_users,
            "can_add_user": can_add_user,
        })
        return Response(serializer.data)

# ─────────────────────────────────────────────
# System Module View
# ─────────────────────────────────────────────

from rest_framework.views import APIView
from users.models import get_available_modules

class SystemModuleView(APIView):
    """GET list of available modules in the system"""
    permission_classes = [permissions.IsAuthenticated]

    def get(self, request, *args, **kwargs):
        return Response(get_available_modules())


class SyncSequenceView(APIView):
    """
    POST /api/users/company-settings/sync-sequence/
    """
    permission_classes = [IsCompanyAdmin]

    def post(self, request, *args, **kwargs):
        company = request.user.company
        if not company:
            return Response({"error": "Người dùng không thuộc công ty nào."}, status=status.HTTP_400_BAD_REQUEST)
            
        doc_type = request.data.get("prefix")
        if not doc_type or doc_type not in ["DH", "BG"]:
            return Response({"error": "Loại chứng từ không hợp lệ."}, status=status.HTTP_400_BAD_REQUEST)
            
        from core.numbering import resolve_doc_prefix
        prefix = resolve_doc_prefix(company, doc_type)
        
        settings = getattr(company, "settings", None)
        is_continuous = settings and settings.continuous_sequence_numbering
        
        from datetime import date
        date_str = "ALL_TIME" if is_continuous else date.today().strftime("%d%m%Y")
        
        from orders.models import Order
        from sales.models import Quotation
        model_map = {
            "DH": (Order, "order_number"),
            "BG": (Quotation, "quotation_number"),
        }
        
        model_cls, field_name = model_map[doc_type]
        codes = model_cls.objects.filter(company=company).values_list(field_name, flat=True)
        
        max_seq = 0
        for code in codes:
            if not code:
                continue
            parts = code.split("-")
            if len(parts) < 3:
                continue
            try:
                seq = int(parts[-1])
                parsed_date_str = parts[-2]
                parsed_prefix = "-".join(parts[:-2])
                
                if parsed_prefix == prefix and (is_continuous or parsed_date_str == date_str):
                    if seq > max_seq:
                        max_seq = seq
            except (ValueError, IndexError):
                continue
                
        from django.db import transaction
        from users.models import CompanySequence
        
        with transaction.atomic():
            seq_obj, created = CompanySequence.objects.select_for_update().get_or_create(
                company=company,
                prefix=prefix,
                date_str=date_str,
                defaults={"last_seq": 0},
            )
            seq_obj.last_seq = max_seq
            seq_obj.save(update_fields=["last_seq"])
            
        return Response({
            "message": f"Đã đồng bộ thành công! Mã số lớn nhất hiện tại là {max_seq}.",
            "prefix": prefix,
            "next_sequence": max_seq + 1
        })

