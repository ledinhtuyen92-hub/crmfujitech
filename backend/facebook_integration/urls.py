"""
facebook_integration/urls.py
"""

from django.urls import include, path
from rest_framework.routers import DefaultRouter

from .views import (
    FacebookLeadViewSet, FacebookPageConfigViewSet, FacebookWebhookView, QuickMediaAssetViewSet,
    FacebookLeadTagViewSet, FacebookLeadNoteViewSet, FacebookQuickReplyViewSet,
    FacebookPostRuleViewSet, FacebookKeywordRuleViewSet, FacebookBotActivityLogViewSet,
)

router = DefaultRouter()
router.register(r"pages", FacebookPageConfigViewSet, basename="facebook-pages")
router.register(r"leads", FacebookLeadViewSet, basename="facebook-leads")
router.register(r"quick-media", QuickMediaAssetViewSet, basename="facebook-quick-media")
router.register(r"lead-tags", FacebookLeadTagViewSet, basename="facebook-lead-tags")
router.register(r"lead-notes", FacebookLeadNoteViewSet, basename="facebook-lead-notes")
router.register(r"quick-replies", FacebookQuickReplyViewSet, basename="facebook-quick-replies")
router.register(r"post-rules", FacebookPostRuleViewSet, basename="facebook-post-rules")
router.register(r"keyword-rules", FacebookKeywordRuleViewSet, basename="facebook-keyword-rules")
router.register(r"bot-logs", FacebookBotActivityLogViewSet, basename="facebook-bot-logs")

urlpatterns = [
    path("webhook/", FacebookWebhookView.as_view(), name="facebook-webhook"),
    path("", include(router.urls)),
]

