from django.urls import include, path
from rest_framework.routers import DefaultRouter
from rest_framework_simplejwt.views import TokenRefreshView

from .views import (
    ChangePasswordView,
    CompanyRegistrationView,
    CompanySettingsView,
    UpdateSequenceView,
    CompanyViewSet,
    CurrentUserView,
    CustomTokenObtainPairView,
    PermissionViewSet,
    PublicSettingsView,
    RoleViewSet,
    DepartmentViewSet,
    SystemSettingsView,
    SubscriptionPlanViewSet,
    UserQuotaView,
    UserViewSet,
    MyCompanyView,
    SystemModuleView,
)

router = DefaultRouter()
router.register("companies", CompanyViewSet, basename="company")
router.register("departments", DepartmentViewSet, basename="department")
router.register("roles", RoleViewSet, basename="role")
router.register("users", UserViewSet, basename="user")
router.register("permissions", PermissionViewSet, basename="permission")
router.register("subscription-plans", SubscriptionPlanViewSet, basename="subscription-plan")

urlpatterns = [
    path("modules/", SystemModuleView.as_view(), name="system-modules"),
    
    # Auth
    path("login/", CustomTokenObtainPairView.as_view(), name="token-obtain-pair"),
    path("token/refresh/", TokenRefreshView.as_view(), name="token-refresh"),
    
    # Public Settings
    path("public-settings/", PublicSettingsView.as_view(), name="public-settings"),

    # Profile & Settings
    path("me/", CurrentUserView.as_view(), name="current-user"),
    path("change-password/", ChangePasswordView.as_view(), name="change-password"),
    path("my-company/", MyCompanyView.as_view(), name="my-company"),
    path("company-settings/", CompanySettingsView.as_view(), name="company-settings"),
    path("company-settings/update-sequence/", UpdateSequenceView.as_view(), name="update-sequence"),
    path("system-settings/", SystemSettingsView.as_view(), name="system-settings"),
    path("quota/", UserQuotaView.as_view(), name="user-quota"),

    # Registration
    path("register-company/", CompanyRegistrationView.as_view(), name="register-company"),

    # Router (companies, roles, users, permissions)
    path("", include(router.urls)),
]

