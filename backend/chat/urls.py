from django.urls import path, include
from rest_framework.routers import DefaultRouter
from .views import (
    ConversationViewSet,
    get_colleagues,
    get_department_groups,
    search_crm_documents,
    ChatCompanyConfigView,
    trigger_clean_old_chat_files,
)

router = DefaultRouter()
router.register(r"conversations", ConversationViewSet, basename="conversation")

urlpatterns = [
    path("", include(router.urls)),
    path("colleagues/", get_colleagues, name="chat-colleagues"),
    path("department-groups/", get_department_groups, name="chat-department-groups"),
    path("search-crm-docs/", search_crm_documents, name="chat-search-crm-docs"),
    path("config/", ChatCompanyConfigView.as_view(), name="chat-config"),
    path("clean-old-files/", trigger_clean_old_chat_files, name="chat-clean-old-files"),
]

