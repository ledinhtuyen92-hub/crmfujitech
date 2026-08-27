from django.contrib import admin
from django.urls import path, include, re_path
from django.views.static import serve
from django.conf import settings
from django.conf.urls.static import static
from django.http import HttpResponse
from .views import UploadAPIView

# Chuyển hướng người dùng chưa đăng nhập về trang đăng nhập của Frontend
admin.site.login_url = '/login'

urlpatterns = [
    path('admin/', admin.site.urls),
    path('api/core/upload/', UploadAPIView.as_view(), name='core-upload'),
    # ── Auth & Users ──────────────────────────────────────────────────
    path('api/users/', include('users.urls')),
    # ── Business Modules ──────────────────────────────────────────────
    path('api/crm/', include('crm.urls')),
    path('api/sales/', include('sales.urls')),
    path('api/orders/', include('orders.urls')),
    path('api/finance/', include('finance.urls')),
    path('api/inventory/', include('inventory.urls')),
    path('api/production/', include('production.urls')),
    path('api/delivery/', include('delivery.urls')),
    # ── Approvals ──────────────────────────────────────────────────
    path('api/approvals/', include('approvals.urls')),
    # ── Notifications ─────────────────────────────────────────────────
    path('api/notifications/', include('notifications.urls')),
    # ── Dashboard ─────────────────────────────────────────────
    path('api/dashboard/', include('dashboard.urls')),
    # ── Zalo Integration (Omnichannel) ─────────────────────────────────
    path('api/zalo/', include('zalo_integration.urls')),
    # ── Facebook Multi-Page Integration ───────────────────────────────
    path('api/facebook/', include('facebook_integration.urls')),
    # ── AI Agents (Multi-Agent Auto-Sale) ─────────────────────────────
    path('api/ai_agents/', include('ai_agents.urls')),
]

# Explicitly serve media files even in DEBUG=False (since Nginx might not be configured for it yet)
urlpatterns += [
    re_path(r'^media/(?P<path>.*)$', serve, {
        'document_root': settings.MEDIA_ROOT,
    }),
]
