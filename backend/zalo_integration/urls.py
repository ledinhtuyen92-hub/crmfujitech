from django.urls import include, path
from rest_framework.routers import DefaultRouter

from .views import (
    ZaloMessageLogViewSet,
    ZaloMessageTemplateViewSet,
    ZaloOaConfigViewSet,
    ZaloWebhookView,
    SocialLeadViewSet,
    ZaloLeadTagViewSet,
    ZaloQuickReplyViewSet,
    ZnsCampaignViewSet,
)

router = DefaultRouter()
router.register(r"config", ZaloOaConfigViewSet, basename="zalo-config")
router.register(r"social-leads", SocialLeadViewSet, basename="social-lead")
router.register(r"templates", ZaloMessageTemplateViewSet, basename="zalo-template")
router.register(r"message-logs", ZaloMessageLogViewSet, basename="zalo-log")
router.register(r"tags", ZaloLeadTagViewSet, basename="zalo-tag")
router.register(r"quick-replies", ZaloQuickReplyViewSet, basename="zalo-quick-reply")
router.register(r"campaigns", ZnsCampaignViewSet, basename="zns-campaign")

urlpatterns = [
    path("webhook/", ZaloWebhookView.as_view(), name="zalo-webhook"),
    path("", include(router.urls)),
]
