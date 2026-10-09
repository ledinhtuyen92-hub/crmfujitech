from rest_framework.routers import DefaultRouter
from .views import LivePlatformProductViewSet, LiveDeviceViewSet, LiveSessionViewSet, DeviceSessionViewSet, serve_audio_asset, PlatformAccountViewSet, LiveMediaAssetViewSet

router = DefaultRouter()
router.register(r'platform-products', LivePlatformProductViewSet, basename='platform-products')
router.register(r'platform-accounts', PlatformAccountViewSet, basename='platform-accounts')
router.register(r'devices', LiveDeviceViewSet, basename='devices')
router.register(r'sessions', LiveSessionViewSet, basename='sessions')
router.register(r'device/sessions', DeviceSessionViewSet, basename='device-sessions')
router.register(r'media-assets', LiveMediaAssetViewSet, basename='media-assets')

from django.urls import path
from .oauth_views import ShopeeConnectView, ShopeeCallbackView
from .views_shopee import ShopeeProductListView, ShopeeProductMappingView

urlpatterns = [
    path('audio/<str:token>/', serve_audio_asset, name='serve-audio-asset'),
    path('platforms/shopee/connect/', ShopeeConnectView.as_view(), name='shopee-connect'),
    path('platforms/shopee/callback/', ShopeeCallbackView.as_view(), name='shopee-callback'),
    path('platforms/shopee/products/', ShopeeProductListView.as_view(), name='shopee-products'),
    path('platforms/shopee/mapping/', ShopeeProductMappingView.as_view(), name='shopee-mapping'),
    path('sessions/<str:pk>/hls-proxy/<path:hls_path>', LiveSessionViewSet.as_view({'get': 'hls_proxy_custom'}), name='session-hls-proxy'),
] + router.urls
