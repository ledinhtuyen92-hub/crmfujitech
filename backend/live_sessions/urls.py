from rest_framework.routers import DefaultRouter
from .views import LivePlatformProductViewSet, LiveDeviceViewSet, LiveSessionViewSet, DeviceSessionViewSet

router = DefaultRouter()
router.register(r'platform-products', LivePlatformProductViewSet, basename='platform-products')
router.register(r'devices', LiveDeviceViewSet, basename='devices')
router.register(r'sessions', LiveSessionViewSet, basename='sessions')
router.register(r'device/sessions', DeviceSessionViewSet, basename='device-sessions')

urlpatterns = router.urls
