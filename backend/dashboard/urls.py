from django.urls import path

from . import views

app_name = "dashboard"

from rest_framework.routers import DefaultRouter

router = DefaultRouter()
router.register(r'backup-config', views.SystemBackupConfigViewSet, basename='backup-config')
router.register(r'backup-history', views.BackupHistoryLogViewSet, basename='backup-history')

urlpatterns = [
    path("summary/", views.summary, name="summary"),
    path("revenue-chart/", views.revenue_chart, name="revenue-chart"),
    path("orders-by-status/", views.orders_by_status, name="orders-by-status"),
    path("top-customers/", views.top_customers, name="top-customers"),
    path("top-sellers/", views.top_sellers, name="top-sellers"),
    path("debt-stats/", views.debt_stats, name="debt-stats"),
]

urlpatterns += router.urls

