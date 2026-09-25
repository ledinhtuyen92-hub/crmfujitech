from rest_framework.permissions import BasePermission


class IsActiveUserAndCompany(BasePermission):
    """
    Đảm bảo user đang hoạt động và công ty của user cũng đang hoạt động (nếu có).
    Nếu công ty bị khoá, chặn tất cả request API.
    """
    message = "Tài khoản của bạn hoặc công ty đã bị khoá/vô hiệu hóa."

    def has_permission(self, request, view):
        user = request.user
        if not user or not user.is_authenticated:
            return False
            
        if not user.is_active:
            return False
            
        if user.company and not user.company.is_active:
            return False
            
        return True


class IsModuleActivePermission(BasePermission):
    """
    Kiểm tra xem tính năng (module) của API này có được BẬT cho công ty của người dùng hay không.
    View cần định nghĩa thuộc tính `module_code = "crm"` hoặc `module_code = "sales"`.
    """
    message = "Phân hệ này chưa được kích hoạt cho công ty của bạn. Vui lòng liên hệ quản trị viên."

    def has_permission(self, request, view):
        # Nếu view không định nghĩa module_code, bỏ qua kiểm tra
        module_code = getattr(view, 'module_code', None)
        if not module_code:
            return True
            
        user = request.user
        if not user or not user.is_authenticated:
            return False
            
        # Superadmin hệ thống không bị ràng buộc bởi module công ty nếu không thuộc công ty nào
        if user.is_superuser and not user.company_id:
            return True
            
        if not hasattr(user, 'company') or not user.company:
            return False
            
        if not hasattr(user.company, 'settings'):
            return False
            
        active_modules = user.company.settings.active_modules
        if not isinstance(active_modules, list):
            return False
            
        return module_code in active_modules


class CheckDataMaintenanceMode(BasePermission):
    """
    Khi chế độ bảo trì dữ liệu (maintenance_mode) được bật,
    khóa toàn bộ các thao tác thêm/sửa/xóa dữ liệu (POST, PUT, PATCH, DELETE)
    đối với tất cả tài khoản không phải là Quản trị viên hệ thống (Superuser).
    """
    message = "⚠️ Hệ thống đang bảo trì dữ liệu. Các chức năng thêm/sửa/xóa dữ liệu tạm thời bị khóa!"

    def has_permission(self, request, view):
        if request.method in ("GET", "HEAD", "OPTIONS"):
            return True
        if request.user and request.user.is_authenticated and request.user.is_superuser:
            return True
        
        from .models import SystemSettings
        settings = SystemSettings.load()
        if settings.maintenance_mode:
            return False
            
        return True


class IsSuperAdmin(BasePermission):
    """Chỉ cho phép System Administrator (is_superuser=True)."""

    message = "Bạn phải là Quản trị viên hệ thống để thực hiện hành động này."

    def has_permission(self, request, view):
        return bool(request.user and request.user.is_authenticated and request.user.is_superuser)


class IsCompanyAdmin(BasePermission):
    """Cho phép Company Admin (is_company_admin=True) hoặc System Admin."""

    message = "Bạn phải là Quản trị viên công ty để thực hiện hành động này."

    def has_permission(self, request, view):
        return bool(
            request.user
            and request.user.is_authenticated
            and (request.user.is_superuser or request.user.is_company_admin)
        )


class CanManageCompanySettings(BasePermission):
    """Company Admin hoặc nhân viên có quyền settings.company."""

    message = "Bạn không có quyền thay đổi cấu hình công ty."

    def has_permission(self, request, view):
        if not (request.user and request.user.is_authenticated):
            return False
        if request.user.is_superuser or request.user.is_company_admin:
            return True
        if request.user.role and request.user.role.permissions.filter(code="settings.company").exists():
            return True
        return False


class IsCompanyAdminOrReadOnly(BasePermission):
    """Company Admin có toàn quyền; nhân viên thường chỉ đọc."""

    message = "Bạn không có quyền thực hiện thao tác này."

    def has_permission(self, request, view):
        if not (request.user and request.user.is_authenticated):
            return False
        if request.method in ("GET", "HEAD", "OPTIONS"):
            return True
        return request.user.is_superuser or request.user.is_company_admin


class ActionBasedPermission(BasePermission):
    """
    Kiểm tra quyền dựa trên action của ViewSet.
    View cần định nghĩa `action_permissions` dictionary:
    {
        'list': 'crm.view',
        'retrieve': 'crm.view',
        'create': 'crm.create',
        'update': 'crm.edit',
        'partial_update': 'crm.edit',
        'destroy': 'crm.delete',
        'assign': 'crm.assign', # custom actions
    }
    """

    message = "Bạn không có quyền thực hiện hành động này."

    def has_permission(self, request, view):
        if not (request.user and request.user.is_authenticated):
            return False
            
        action_permissions = getattr(view, "action_permissions", {})
        required_perm = action_permissions.get(view.action)
        
        if not required_perm:
            # Nếu action không được định nghĩa trong map, mặc định cho qua (dựa vào IsAuthenticated)
            return True
            
        is_admin = request.user.is_superuser or request.user.is_company_admin
        if is_admin:
            # Admin luôn tự động có các quyền thuộc nhóm Cài đặt (để không bị khóa ngoài hệ thống)
            if isinstance(required_perm, (list, tuple)):
                if any(p.startswith("settings.") for p in required_perm):
                    return True
            elif isinstance(required_perm, str) and required_perm.startswith("settings."):
                return True
            
        if not request.user.role:
            return False
            
        if isinstance(required_perm, (list, tuple)):
            return request.user.role.permissions.filter(code__in=required_perm).exists()
        return request.user.role.permissions.filter(code=required_perm).exists()
