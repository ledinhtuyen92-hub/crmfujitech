"""
zalo_integration/views.py
API Views: Webhook handler + CRUD ViewSets cho module Zalo.
"""

import json
import logging
import uuid

from django.db import transaction
from django.utils import timezone
from rest_framework import status, viewsets
from rest_framework.decorators import action
from rest_framework.permissions import AllowAny, IsAuthenticated
from rest_framework.response import Response
from rest_framework.views import APIView

from users.permissions import (
    IsActiveUserAndCompany,
    CheckDataMaintenanceMode,
    IsModuleActivePermission,
    ActionBasedPermission,
)

    ZaloLeadTag, ZaloLeadNote, ZaloQuickReply
)
from core.pagination import InboxPagination
from .serializers import (
    ConvertLeadSerializer,
    SocialLeadDetailSerializer,
    SocialLeadListSerializer,
    SocialLeadUpdateSerializer,
    ZaloMessageLogSerializer,
    ZaloMessageTemplateSerializer,
    ZaloOaConfigSerializer,
    ZaloOaConfigWriteSerializer,
    ZaloMessageSerializer,
    ZaloLeadTagSerializer,
    ZaloLeadNoteSerializer,
    ZaloQuickReplySerializer,
)
from .services import (
    convert_social_lead,
    fetch_zalo_user_profile,
    refresh_zalo_access_token,
    send_zns_message,
    verify_zalo_webhook_signature,
    send_zalo_chat_message,
    upload_file_to_zalo,
)

logger = logging.getLogger(__name__)


# ── Webhook Handler ───────────────────────────────────────────────────────────

class ZaloWebhookView(APIView):
    """
    Nhận và xử lý Webhook events từ Zalo OA.
    Endpoint này PUBLIC (không cần JWT) vì Zalo server gọi vào.
    Xác thực bằng chữ ký HMAC-SHA256.
    """
    permission_classes = [AllowAny]
    authentication_classes = []

    def get(self, request):
        """Zalo Webhook Verification Challenge."""
        challenge = request.GET.get("challenge", "")
        return Response({"challenge": challenge})

    def post(self, request):
        """Nhận Webhook event."""
        body = request.body
        received_sig = request.META.get("HTTP_X_ZEVENT_SIGNATURE", "")

        # Parse data
        try:
            data = json.loads(body)
        except json.JSONDecodeError:
            return Response({"error": "Invalid JSON"}, status=status.HTTP_400_BAD_REQUEST)

        # Tìm OA Config theo oa_id (vì 1 app_id có thể dùng cho nhiều OA)
        oa_id_raw = data.get("oa_id") or data.get("recipient", {}).get("id")
        oa_id = str(oa_id_raw).strip() if oa_id_raw else ""
        app_id = str(data.get("app_id", "")).strip()
        
        try:
            oa_config = ZaloOaConfig.objects.select_related("company").get(
                oa_id=oa_id, is_active=True
            )
        except ZaloOaConfig.DoesNotExist:
            logger.warning(f"[Webhook] Không tìm thấy OA config cho oa_id={oa_id}")
            # Phải trả về 200 OK để Zalo chấp nhận cấu hình Webhook (Zalo test webhook gửi dummy oa_id)
            return Response({"error": "Unknown oa_id"}, status=status.HTTP_200_OK)

        # Xác thực chữ ký
        webhook_secret = oa_config.get_webhook_secret()
        if webhook_secret:
            timestamp_str = str(data.get("timestamp", ""))
            app_id_str = str(app_id)
            if not verify_zalo_webhook_signature(body, received_sig, app_id_str, timestamp_str, webhook_secret):
                logger.warning(f"[Webhook] Chữ ký không hợp lệ từ oa_id={oa_id}")
                return Response({"error": "Invalid signature"}, status=status.HTTP_403_FORBIDDEN)

        event_name = data.get("event_name", "")
        company = oa_config.company
        
        active_modules = company.settings.active_modules if hasattr(company, "settings") else []
        if not active_modules or "zalo" not in active_modules:
            logger.warning(f"[Webhook Zalo] Module zalo bị tắt/thu hồi cho công ty {company.id}")
            return Response({"error": "Module zalo disabled"}, status=status.HTTP_200_OK)

        if event_name.startswith("user_send_"):
            self._handle_message(company, oa_config, data)
        elif event_name.startswith("oa_send_"):
            self._handle_oa_send_message(company, oa_config, data)
        elif event_name == "follow":
            self._handle_follow(company, oa_config, data)
        elif event_name == "unfollow":
            self._handle_unfollow(company, oa_config, data)
        else:
            logger.debug(f"[Webhook] Unhandled event: {event_name}")

        return Response({"status": "ok"})

    def _handle_message(self, company, oa_config, data):
        """Xử lý khi user nhắn tin vào OA."""
        sender = data.get("sender", {})
        zalo_uid = sender.get("id")
        if not zalo_uid:
            return

        message_text = data.get("message", {}).get("text", "")

        # Tạo hoặc lấy SocialLead hiện có
        social_lead, created = SocialLead.objects.get_or_create(
            company=company,
            platform=SocialLead.PLATFORM_ZALO,
            social_id=zalo_uid,
            defaults={
                "oa_config": oa_config,
                "display_name": sender.get("display_name", ""),
                "status": SocialLead.STATUS_CHATTING,
            },
        )

        if created:
            logger.info(f"[Webhook] Tạo SocialLead mới: uid={zalo_uid} ({company.name})")
            # Lấy thêm profile từ Zalo API (avatar, tên đầy đủ)
            if oa_config.access_token:
                profile = fetch_zalo_user_profile(oa_config, zalo_uid)
                if profile:
                    social_lead.display_name = profile.get("display_name") or social_lead.display_name
                    social_lead.avatar_url = profile.get("avatar_url")

        # Cập nhật thông tin tương tác mới nhất
        from django.utils import timezone
        social_lead.last_message = message_text[:500]
        social_lead.last_interaction_date = timezone.now()
        if social_lead.status == SocialLead.STATUS_NEW:
            social_lead.status = SocialLead.STATUS_CHATTING
        social_lead.has_unread_message = True
        social_lead.unread_count = (social_lead.unread_count or 0) + 1
        social_lead.has_ai_followed_up = False
        social_lead.save()

        # Phát hiện SĐT trong tin nhắn của khách (luồng Hybrid 2 bước)
        # Bước 1: Regex phát hiện số điện thoại ngay lập tức → lưu vào DB để UI hiển thị liền
        from .services import smart_extract_vn_phone, extract_and_process_phone_regex
        if message_text:
            norm_phone = smart_extract_vn_phone(message_text)
            if norm_phone and not social_lead.detected_phone:
                social_lead.detected_phone = norm_phone
                social_lead.save(update_fields=['detected_phone'])

            # Bước 2: Quyết định luồng xử lý tạo KH CRM
            # - Chỉ gọi AI Hybrid task (bất đồng bộ) khi CẢ HAI cờ đều BẬT:
            #   + oa_config.is_ai_active = True (AI toàn OA bật)
            #   + social_lead.is_ai_active = True (AI hội thoại chưa bị Sale tắt)
            # - Mọi trường hợp còn lại → dùng RegEx đồng bộ để đảm bảo tạo KH CRM
            #   ngay lập tức, không phụ thuộc vào Celery worker.
            #
            # BUG FIX: Dùng oa_config.is_ai_active (cờ toàn OA), không phải
            # social_lead.is_ai_active (per-conversation, mặc định=True cho mọi hội thoại mới).
            # Đồng thời refresh từ DB để tránh đọc giá trị cũ từ memory.
            social_lead.refresh_from_db(fields=['is_ai_active'])
            conversation_ai_active = social_lead.is_ai_active
            oa_ai_active = (
                social_lead.oa_config is not None
                and social_lead.oa_config.is_ai_active
                and social_lead.oa_config.ai_agent_id
            )
            if oa_ai_active and conversation_ai_active:
                # Cả AI OA lẫn AI hội thoại đều BẬT → gọi AI Hybrid
                from ai_agents.tasks import async_extract_contact_info_hybrid
                async_extract_contact_info_hybrid.delay(social_lead.id, message_text, 'zalo', company.id)
            else:
                # AI tắt (toàn OA hoặc hội thoại cụ thể) → dùng RegEx đồng bộ
                # để đảm bảo tự động tạo KH CRM ngay lập tức
                extract_and_process_phone_regex(social_lead, message_text)

        # Lưu vào ZaloMessage — dùng get_or_create để chống duplicate khi Zalo retry webhook
        from .models import ZaloMessage
        
        message_id = data.get("message", {}).get("msg_id", "")
        attachments = data.get("message", {}).get("attachments", [])
        attachment_url = ""
        attachment_type = ""
        
        if attachments and len(attachments) > 0:
            att = attachments[0]
            attachment_type = att.get("type", "")
            if attachment_type in ("image", "file", "audio", "video", "sticker", "gif"):
                attachment_url = att.get("payload", {}).get("url", "")
                if not attachment_url and attachment_type == "sticker":
                    attachment_url = att.get("payload", {}).get("sticker_url", "")
                    
        # Fallback: Zalo OA also sends sticker/gif directly under message
        if not attachment_url:
            message_obj = data.get("message", {})
            if "sticker" in message_obj:
                attachment_type = "sticker"
                attachment_url = message_obj.get("sticker", {}).get("url", "") or message_obj.get("sticker", {}).get("sticker_url", "")
            elif "gif" in message_obj:
                attachment_type = "gif"
                attachment_url = message_obj.get("gif", {}).get("url", "") or message_obj.get("gif", {}).get("gif_url", "")

        msg_created = False
        if message_id:
            new_msg, msg_created = ZaloMessage.objects.get_or_create(
                zalo_msg_id=message_id,
                defaults={
                    "company": company,
                    "social_lead": social_lead,
                    "direction": ZaloMessage.DIRECTION_INBOUND,
                    "content": message_text,
                    "attachment_url": attachment_url,
                    "attachment_type": attachment_type,
                }
            )
        else:
            # Không có msg_id (hiếm) → tạo mới luôn
            new_msg = ZaloMessage.objects.create(
                company=company,
                social_lead=social_lead,
                direction=ZaloMessage.DIRECTION_INBOUND,
                content=message_text,
                attachment_url=attachment_url,
                attachment_type=attachment_type,
            )
            msg_created = True

        # Push realtime notification cho nhân viên phụ trách
        if social_lead.assigned_to:
            self._push_notification(social_lead, message_text)

        # Trigger AI — chỉ khi tin nhắn mới (msg_created=True), tránh trigger lại khi Zalo retry
        if msg_created and social_lead.oa_config and social_lead.oa_config.is_ai_active and social_lead.oa_config.ai_agent_id:
            if not message_text:
                social_lead.refresh_from_db(fields=['is_ai_active'])
            if social_lead.is_ai_active:
                from ai_agents.tasks import trigger_zalo_ai
                trigger_zalo_ai(social_lead.id, trigger_msg_id=new_msg.id if new_msg else None)

    def _handle_oa_send_message(self, company, oa_config, data):
        """Xử lý khi OA (nhân viên hoặc AI) nhắn tin cho user (webhook echo)."""
        recipient = data.get("recipient", {})
        zalo_uid = recipient.get("id")
        if not zalo_uid:
            return

        message_text = data.get("message", {}).get("text", "")
        message_id = data.get("message", {}).get("msg_id", "")

        # Tìm kiếm hoặc tạo SocialLead
        social_lead, created = SocialLead.objects.get_or_create(
            company=company,
            platform=SocialLead.PLATFORM_ZALO,
            social_id=zalo_uid,
            defaults={
                "oa_config": oa_config,
                "status": SocialLead.STATUS_CHATTING,
            },
        )

        from django.utils import timezone
        social_lead.last_message = message_text[:500] or "[Đính kèm]"
        social_lead.last_interaction_date = timezone.now()
        social_lead.has_unread_message = False
        social_lead.unread_count = 0
        social_lead.save(update_fields=["last_message", "last_interaction_date", "has_unread_message", "unread_count"])

        from .models import ZaloMessage
        
        attachments = data.get("message", {}).get("attachments", [])
        attachment_url = ""
        attachment_type = ""
        
        if attachments and len(attachments) > 0:
            att = attachments[0]
            attachment_type = att.get("type", "")
            if attachment_type in ["image", "file", "audio"]:
                attachment_url = att.get("payload", {}).get("url", "")

        if message_id:
            ZaloMessage.objects.get_or_create(
                zalo_msg_id=message_id,
                defaults={
                    "company": company,
                    "social_lead": social_lead,
                    "direction": ZaloMessage.DIRECTION_OUTBOUND,
                    "content": message_text,
                    "attachment_url": attachment_url,
                    "attachment_type": attachment_type,
                    "sender_role": "system",
                    "sender_name": "OA Zalo",
                }
            )

    def _handle_follow(self, company, oa_config, data):
        """Xử lý khi user follow OA."""
        follower = data.get("follower", {})
        zalo_uid = follower.get("id")
        if not zalo_uid:
            return

        SocialLead.objects.get_or_create(
            company=company,
            platform=SocialLead.PLATFORM_ZALO,
            social_id=zalo_uid,
            defaults={
                "oa_config": oa_config,
                "display_name": follower.get("display_name", ""),
                "status": SocialLead.STATUS_NEW,
            },
        )

    def _handle_unfollow(self, company, oa_config, data):
        """Xử lý khi user unfollow OA — archive lead nếu chưa convert."""
        follower = data.get("follower", {})
        zalo_uid = follower.get("id")
        if not zalo_uid:
            return

        SocialLead.objects.filter(
            company=company,
            platform=SocialLead.PLATFORM_ZALO,
            social_id=zalo_uid,
            status__in=[SocialLead.STATUS_NEW, SocialLead.STATUS_CHATTING],
        ).update(status=SocialLead.STATUS_ARCHIVED)

    def _push_notification(self, social_lead, message_text):
        """Gửi realtime notification qua WebSocket."""
        try:
            from channels.layers import get_channel_layer
            from asgiref.sync import async_to_sync

            channel_layer = get_channel_layer()
            group_name = f"user_{social_lead.assigned_to.id}"
            async_to_sync(channel_layer.group_send)(
                group_name,
                {
                    "type": "send_notification",
                    "data": {
                        "type": "zalo_new_message",
                        "title": f"💬 Tin nhắn Zalo từ {social_lead.display_name or 'Khách'}",
                        "message": message_text[:100],
                        "link": f"/zalo/inbox/{social_lead.id}",
                    },
                },
            )
        except Exception as e:
            logger.warning(f"[Webhook] Không thể push notification: {e}")


# ── ZaloOaConfig ViewSet ─────────────────────────────────────────────────────

class ZaloOaConfigViewSet(viewsets.ModelViewSet):
    """CRUD cho cấu hình Zalo OA. Filter nghiêm ngặt theo company."""
    module_code = "zalo"
    permission_classes = [
        IsAuthenticated,
        IsActiveUserAndCompany,
        CheckDataMaintenanceMode,
        IsModuleActivePermission,
        ActionBasedPermission,
    ]
    action_permissions = {
        "list": ["zalo.config", "zalo.manage_templates", "zalo.send_zns", "zalo.view"],
        "retrieve": ["zalo.config", "zalo.manage_templates", "zalo.send_zns", "zalo.view"],
        "create": "zalo.config",
        "update": "zalo.config",
        "partial_update": "zalo.config",
        "destroy": "zalo.config",
    }

    def get_queryset(self):
        return ZaloOaConfig.objects.filter(company=self.request.user.company)

    def get_serializer_class(self):
        if self.action in ["create", "update", "partial_update"]:
            return ZaloOaConfigWriteSerializer
        return ZaloOaConfigSerializer

    def perform_create(self, serializer):
        serializer.save(company=self.request.user.company)

    @action(detail=True, methods=["get"], url_path="token-logs")
    def token_logs(self, request, pk=None):
        """Trả về 50 lần refresh token gần nhất của OA này."""
        config = self.get_object()
        logs = config.token_refresh_logs.all()[:30]
        data = [{
            "id": log.id,
            "status": log.status,
            "trigger": log.trigger,
            "trigger_display": log.get_trigger_display(),
            "error_message": log.error_message,
            "old_expires_at": log.old_expires_at,
            "new_expires_at": log.new_expires_at,
            "created_at": log.created_at,
        } for log in logs]
        return Response(data)

    def perform_destroy(self, instance):
        """Soft delete: Ngắt kết nối Zalo OA (is_active=False) để giữ an toàn toàn bộ lịch sử hội thoại/tin nhắn."""
        instance.is_active = False
        instance.access_token = ""
        instance.refresh_token = ""
        instance.token_expires_at = None
        instance.save(update_fields=["is_active", "access_token", "refresh_token", "token_expires_at", "updated_at"])

    @action(detail=True, methods=["delete", "post"], url_path="permanent-delete")
    def permanent_delete(self, request, pk=None):
        """Xóa vĩnh viễn Zalo OA và toàn bộ hội thoại/tin nhắn liên quan (chỉ dùng khi thực sự cần)."""
        instance = self.get_object()
        oa_name = instance.oa_name
        leads_count = instance.social_leads.count()
        instance.delete()
        return Response({
            "detail": f"Đã xóa vĩnh viễn Zalo OA {oa_name} và {leads_count} hội thoại liên quan."
        })

    @action(detail=True, methods=["post"], url_path="reconnect")
    def reconnect(self, request, pk=None):
        """Khôi phục trạng thái hoạt động cho Zalo OA (is_active=True)."""
        instance = self.get_object()
        instance.is_active = True
        instance.save(update_fields=["is_active", "updated_at"])
        return Response({
            "detail": f"Đã khôi phục kết nối cho Zalo OA {instance.oa_name}.",
            "data": ZaloOaConfigSerializer(instance).data
        })

    @action(detail=True, methods=["post"], url_path="refresh-token")
    def refresh_token(self, request, pk=None):
        """Manually refresh access token."""
        config = self.get_object()
        success = refresh_zalo_access_token(config, trigger="manual")
        if success:
            config.refresh_from_db()
            serializer = ZaloOaConfigSerializer(config)
            return Response({
                "detail": "Token đã được làm mới thành công.",
                "data": serializer.data,
            })
        err_reason = getattr(config, "_last_refresh_error", None)
        msg = f"Zalo từ chối gia hạn Token ({err_reason}). Bạn vui lòng bấm nút 'Đăng nhập & Lấy Token' để cấp lại mã refresh mới." if err_reason else "Không thể làm mới token. Vui lòng bấm 'Đăng nhập & Lấy Token' để cấp lại."
        return Response(
            {"detail": msg},
            status=status.HTTP_400_BAD_REQUEST,
        )

    @action(detail=True, methods=["post"], url_path="verify-token")
    def verify_token(self, request, pk=None):
        """Kiểm tra token hiện tại thuộc Zalo OA nào thông qua Zalo Open API."""
        config = self.get_object()
        if not config.is_active or not config.access_token:
            return Response({"error": f"OA '{config.oa_name}' đang ngắt kết nối hoặc chưa có Access Token. Vui lòng bấm 'Đăng nhập & Lấy Token'."}, status=status.HTTP_400_BAD_REQUEST)
        from zalo_integration.services import fetch_zalo_oa_info
        oa_info = fetch_zalo_oa_info(config.access_token)
        if not oa_info:
            return Response({"error": "Token không hợp lệ hoặc đã hết hạn trên Zalo. Vui lòng bấm 'Đăng nhập & Lấy Token' để cấp lại."}, status=status.HTTP_400_BAD_REQUEST)
        
        config.oa_id = oa_info["oa_id"]
        if oa_info["name"]:
            config.oa_name = oa_info["name"]
        config.save(update_fields=["oa_id", "oa_name"])
        serializer = ZaloOaConfigSerializer(config)
        return Response({
            "detail": f"Token chuẩn xác của Zalo OA: {oa_info['name']} (ID: {oa_info['oa_id']})",
            "data": serializer.data,
            "oa_info": oa_info
        })

    @action(detail=False, methods=["post"], url_path="exchange-oauth-code")
    def exchange_oauth_code(self, request):
        """
        Đổi Authorization Code từ Zalo lấy Access Token & Refresh Token.
        """
        code = request.data.get("code")
        config_id = request.data.get("config_id")
        if not code:
            return Response({"error": "Thiếu mã xác thực (code)"}, status=status.HTTP_400_BAD_REQUEST)

        if config_id:
            config = ZaloOaConfig.objects.filter(company=request.user.company, id=config_id).first()
        else:
            config = ZaloOaConfig.objects.filter(company=request.user.company).order_by("-id").first()
        
        # API của Zalo yêu cầu truyền code, app_id, secret_key
        app_id = config.get_app_id()
        secret_key = config.get_secret_key()
        
        if not config or not app_id or not secret_key:
            return Response({"error": "Cấu hình App ID/Secret chưa đầy đủ."}, status=status.HTTP_400_BAD_REQUEST)

        url = "https://oauth.zaloapp.com/v4/oa/access_token"
        headers = {"Content-Type": "application/x-www-form-urlencoded", "secret_key": secret_key}
        data = {
            "app_id": app_id,
            "grant_type": "authorization_code",
            "code": code
        }

        try:
            import requests
            from django.utils import timezone
            from datetime import timedelta
            from zalo_integration.services import fetch_zalo_oa_info

            resp = requests.post(url, headers=headers, data=data, timeout=10)
            res_json = resp.json()

            if "access_token" in res_json:
                new_token = res_json.get("access_token")
                oa_info = fetch_zalo_oa_info(new_token)
                
                # Cập nhật chính xác thông tin OA thật từ Zalo vào đúng config đang thao tác
                if oa_info and oa_info.get("oa_id"):
                    config.oa_id = oa_info["oa_id"]
                    if oa_info.get("name"):
                        config.oa_name = oa_info["name"]

                old_expires = config.token_expires_at
                config.access_token = new_token
                config.refresh_token = res_json.get("refresh_token")
                expires_in = int(res_json.get("expires_in", 90000))
                config.token_expires_at = timezone.now() + timedelta(seconds=expires_in)
                config.save()

                # Ghi log OAuth thành công
                from zalo_integration.models import ZaloTokenRefreshLog
                ZaloTokenRefreshLog.objects.create(
                    oa_config=config, status="success", trigger="oauth",
                    old_expires_at=old_expires, new_expires_at=config.token_expires_at,
                )

                serializer = ZaloOaConfigSerializer(config)
                oa_label = f"{config.oa_name} (ID: {config.oa_id})" if config.oa_id else config.oa_name
                return Response({
                    "detail": f"Cấp quyền thành công cho Zalo OA: {oa_label}",
                    "data": serializer.data,
                })
            else:
                err_msg = res_json.get("error_name") or res_json.get("error_description") or str(res_json)
                logger.error(f"[ZaloOAuth] Lỗi đổi token: {res_json}")
                # Ghi log OAuth thất bại
                from zalo_integration.models import ZaloTokenRefreshLog
                ZaloTokenRefreshLog.objects.create(
                    oa_config=config, status="failed", trigger="oauth",
                    error_message=f"OAuth error: {err_msg}",
                    old_expires_at=config.token_expires_at,
                )
                return Response(
                    {"error": f"Zalo từ chối đổi Token: {err_msg}"},
                    status=status.HTTP_400_BAD_REQUEST,
                )
        except Exception as exc:
            logger.error(f"[ZaloOAuth] Lỗi kết nối Zalo OAuth: {exc}")
            return Response(
                {"error": f"Lỗi kết nối tới Zalo server: {str(exc)}"},
                status=status.HTTP_500_INTERNAL_SERVER_ERROR,
            )



# ── SocialLead ViewSet ────────────────────────────────────────────────────────

class SocialLeadViewSet(viewsets.ModelViewSet):
    """
    Quản lý Social Leads — Tầng 1 của Phễu.
    Filter nghiêm ngặt theo company.
    """
    module_code = "zalo"
    permission_classes = [
        IsAuthenticated,
        IsActiveUserAndCompany,
        CheckDataMaintenanceMode,
        IsModuleActivePermission,
    ]
    pagination_class = InboxPagination
    action_permissions = {
        "list": ["zalo.view", "crm.view_all", "crm.view_assigned"],
        "retrieve": ["zalo.view", "crm.view_all", "crm.view_assigned"],
        "create": "zalo.view",
        "update": "zalo.view",
        "partial_update": "zalo.view",
        "destroy": "zalo.delete_conversation",
        "reply": "zalo.view",
        "convert_to_customer": "zalo.view",
        "messages": ["zalo.view", "crm.view_all", "crm.view_assigned"],
        "notes": ["zalo.view", "crm.view_all", "crm.view_assigned"],
        "assign": "zalo.view",
    }

    def get_queryset(self):
        user = self.request.user
        qs = SocialLead.objects.filter(
            company=user.company
        ).select_related("assigned_to", "oa_config")

        # ── Cơ chế tầm nhìn giới hạn (giống Pancake) ─────────────────────────
        # Admin công ty và Superuser luôn thấy tất cả hội thoại
        # Nhân viên có quyền "zalo.view_all_inbox" thấy tất cả hội thoại
        # Nhân viên có quyền "zalo.view_unassigned_inbox" thấy: Chưa phân công + Đã phân công cho chính mình
        # Nhân viên KHÔNG có quyền đó chỉ thấy: Đã phân công cho chính mình
        is_admin = user.is_superuser or user.is_company_admin
        if not is_admin:
            has_view_all = (
                user.role and user.role.permissions.filter(code="zalo.view_all_inbox").exists()
            )
            if not has_view_all:
                from django.db.models import Q
                has_view_unassigned = (
                    user.role and user.role.permissions.filter(code="zalo.view_unassigned_inbox").exists()
                )
                if has_view_unassigned:
                    qs = qs.filter(Q(assigned_to__isnull=True) | Q(assigned_to=user))
                else:
                    qs = qs.filter(assigned_to=user)
        # ─────────────────────────────────────────────────────────────────────


        # Filter theo status
        status_filter = self.request.query_params.get("status")
        if status_filter == "not_added":
            qs = qs.filter(is_customer_converted=False)
        elif status_filter == "converted":
            qs = qs.filter(is_customer_converted=True)
        elif status_filter:
            qs = qs.filter(status=status_filter)

        # Filter theo platform
        platform = self.request.query_params.get("platform")
        if platform:
            qs = qs.filter(platform=platform)

        # Tìm kiếm
        search = self.request.query_params.get("search")
        if search:
            from django.db.models import Q
            qs = qs.filter(
                Q(display_name__icontains=search) |
                Q(social_id__icontains=search) |
                Q(last_message__icontains=search)
            )

        # Filter theo SĐT phát hiện
        has_phone = self.request.query_params.get("has_phone")
        if has_phone in ["true", "1", "True"]:
            qs = qs.exclude(detected_phone="")
        elif has_phone in ["false", "0", "False"]:
            from django.db.models import Q
            qs = qs.filter(Q(detected_phone="") | Q(detected_phone__isnull=True))

        # Filter theo Zalo OA Config (đa trang OA)
        oa_config_id = self.request.query_params.get("oa_config")
        if oa_config_id and str(oa_config_id) != "all":
            qs = qs.filter(oa_config_id=oa_config_id)

        # Filter theo VIP Star
        is_starred = self.request.query_params.get("is_starred")
        if is_starred in ["true", "1", "True"]:
            qs = qs.filter(is_starred=True)

        # Filter theo Nhãn (Tag)
        tag_id = self.request.query_params.get("tag")
        if tag_id:
            qs = qs.filter(tags__id=tag_id)

        # Filter theo Sale phụ trách
        assigned_filter = self.request.query_params.get("assigned_to")
        if assigned_filter:
            if assigned_filter in ["my", "me"]:
                qs = qs.filter(assigned_to=self.request.user)
            elif str(assigned_filter) == "unassigned":
                qs = qs.filter(assigned_to__isnull=True)
            elif str(assigned_filter) != "all":
                qs = qs.filter(assigned_to_id=assigned_filter)

        from django.db.models import Subquery, OuterRef
        from .models import ZaloMessage
        latest_direction_sq = Subquery(
            ZaloMessage.objects.filter(social_lead=OuterRef("pk"))
            .order_by("-created_at")
            .values("direction")[:1]
        )
        qs = qs.annotate(latest_direction=latest_direction_sq)

        reply_filter = self.request.query_params.get("reply_filter")
        if reply_filter == "unanswered":
            qs = qs.filter(latest_direction=ZaloMessage.DIRECTION_INBOUND)
        elif reply_filter == "read_unanswered":
            qs = qs.filter(latest_direction=ZaloMessage.DIRECTION_INBOUND, has_unread_message=False)

        sort_by = self.request.query_params.get("sort_by")
        if sort_by == "waiting_longest":
            if not reply_filter:
                qs = qs.filter(latest_direction=ZaloMessage.DIRECTION_INBOUND)
            return qs.order_by("last_interaction_date").distinct()
        elif sort_by == "time_asc":
            return qs.order_by("last_interaction_date").distinct()
        else:
            return qs.order_by("-last_interaction_date").distinct()

    def get_serializer_class(self):
        if self.action in ["update", "partial_update"]:
            return SocialLeadUpdateSerializer
        if self.action == "retrieve":
            return SocialLeadDetailSerializer
        return SocialLeadListSerializer

    def create(self, request, *args, **kwargs):
        return Response(
            {"detail": "SocialLead được tạo tự động qua Webhook. Không thể tạo thủ công."},
            status=status.HTTP_405_METHOD_NOT_ALLOWED,
        )

    def destroy(self, request, *args, **kwargs):
        has_perm = (
            request.user.is_superuser
            or request.user.is_company_admin
            or (request.user.role and request.user.role.permissions.filter(code="zalo.delete_conversation").exists())
        )
        if not has_perm:
            return Response(
                {"error": "Bạn không có quyền xóa hội thoại Zalo. Vui lòng liên hệ quản trị viên để được cấp quyền."},
                status=status.HTTP_403_FORBIDDEN,
            )
        return super().destroy(request, *args, **kwargs)

    @action(detail=True, methods=["post"], url_path="convert")
    def convert(self, request, pk=None):
        """Chuyển đổi SocialLead -> Customer khi Sale có được SĐT."""
        social_lead = self.get_object()
        serializer = ConvertLeadSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)

        phone_number = serializer.validated_data["phone_number"]
        customer_name = serializer.validated_data.get("customer_name", "").strip()
        assigned_to_id = serializer.validated_data.get("assigned_to")
        email = serializer.validated_data.get("email", "").strip()
        address = serializer.validated_data.get("address", "").strip()

        assigned_user = None
        if assigned_to_id:
            from users.models import User
            try:
                assigned_user = User.objects.get(
                    id=assigned_to_id, company=request.user.company
                )
            except User.DoesNotExist:
                pass

        try:
            customer = convert_social_lead(social_lead, phone_number, assigned_user, customer_name=customer_name, email=email, address=address, action_user=request.user)
            return Response({
                "detail": "Chuyển đổi thành công! Hồ sơ khách hàng đã được tạo.",
                "customer_id": customer.id,
                "customer_name": customer.name,
                "customer_phone": customer.phone,
            })
        except ValueError as e:
            return Response({"detail": str(e)}, status=status.HTTP_400_BAD_REQUEST)

    @action(detail=False, methods=["post"], url_path="scan-phones")
    def scan_phones(self, request):
        """Quét toàn bộ hội thoại Zalo để phát hiện SĐT, Email, Địa chỉ & tự động thêm khách hàng nếu bật cấu hình."""
        from .services import extract_and_process_phone_regex
        from .models import ZaloMessage
        leads = SocialLead.objects.filter(company=request.user.company)
        scanned_count = 0
        detected_count = 0
        for lead in leads:
            msgs = ZaloMessage.objects.filter(social_lead=lead, direction=ZaloMessage.DIRECTION_INBOUND).order_by("-created_at")[:50]
            text_pool = "\n".join([m.content for m in msgs if m.content] + [lead.last_message or ""])
            # Dùng Regex trực tiếp — không qua AI để kết quả đồng bộ ngay lập tức
            phone = extract_and_process_phone_regex(lead, text_pool)
            scanned_count += 1
            if phone or lead.detected_email or lead.detected_address:
                detected_count += 1
        return Response({
            "detail": f"Đã quét {scanned_count} cuộc trò chuyện, phát hiện thông tin liên hệ trong {detected_count} hội thoại.",
            "scanned_count": scanned_count,
            "detected_count": detected_count
        })

    @action(detail=True, methods=["post"], url_path="rescan-phone")
    def rescan_phone(self, request, pk=None):
        """Quét lại tất cả tin nhắn cũ của một hội thoại Zalo để tìm SĐT, Email, Địa chỉ."""
        from .services import extract_and_process_phone_regex
        from .models import ZaloMessage
        lead = self.get_object()
        msgs = ZaloMessage.objects.filter(social_lead=lead, direction=ZaloMessage.DIRECTION_INBOUND).order_by("-created_at")
        text_pool = "\n".join([m.content for m in msgs if m.content] + [lead.last_message or ""])
        # Dùng Regex trực tiếp — không qua AI để kết quả đồng bộ ngay lập tức
        phone = extract_and_process_phone_regex(lead, text_pool)
        if phone or lead.detected_email or lead.detected_address:
            return Response({
                "detail": f"Đã quét thành công. SĐT: {lead.detected_phone or '---'}, Email: {lead.detected_email or '---'}, Địa chỉ: {lead.detected_address or '---'}",
                "phone": lead.detected_phone,
                "email": lead.detected_email,
                "address": lead.detected_address
            })
        return Response(
            {"error": "Không tìm thấy thông tin liên hệ nào trong lịch sử tin nhắn của hội thoại này."},
            status=status.HTTP_400_BAD_REQUEST
        )

    @action(detail=True, methods=["post"], url_path="assign")
    def assign(self, request, pk=None):
        """Phân công nhân viên cho SocialLead."""
        social_lead = self.get_object()
        assigned_to_id = request.data.get("assigned_to")

        if not assigned_to_id:
            social_lead.assigned_to = None
            social_lead.save(update_fields=["assigned_to"])
            return Response({"detail": "Đã xóa phân công."})

        from users.models import User
        try:
            user = User.objects.get(id=assigned_to_id, company=request.user.company)
        except User.DoesNotExist:
            return Response(
                {"detail": "Nhân viên không hợp lệ."},
                status=status.HTTP_400_BAD_REQUEST,
            )

        social_lead.assigned_to = user
        social_lead.save(update_fields=["assigned_to"])
        return Response({"detail": f"Đã phân công cho {user.get_full_name()}."})

    @action(detail=True, methods=["post"], url_path="toggle_star")
    def toggle_star(self, request, pk=None):
        """Bật/tắt trạng thái VIP cho hội thoại Zalo."""
        lead = self.get_object()
        lead.is_starred = not lead.is_starred
        lead.save(update_fields=["is_starred", "updated_at"])
        return Response({"is_starred": lead.is_starred})

    @action(detail=True, methods=["post"], url_path="manage_tags")
    def manage_tags(self, request, pk=None):
        """Quản lý danh sách thẻ/nhãn của hội thoại."""
        lead = self.get_object()
        tag_ids = request.data.get("tag_ids", [])
        tags = ZaloLeadTag.objects.filter(company=request.user.company, id__in=tag_ids)
        lead.tags.set(tags)
        return Response({"tags": ZaloLeadTagSerializer(lead.tags.all(), many=True).data})

    @action(detail=True, methods=["get", "post"], url_path="notes")
    def notes(self, request, pk=None):
        """Lấy danh sách hoặc thêm ghi chú nội bộ cho hội thoại."""
        lead = self.get_object()
        if request.method == "POST":
            content = request.data.get("content", "").strip()
            if not content:
                return Response({"error": "Nội dung không được rỗng"}, status=status.HTTP_400_BAD_REQUEST)
            note = ZaloLeadNote.objects.create(lead=lead, user=request.user, content=content)
            return Response(ZaloLeadNoteSerializer(note).data, status=status.HTTP_201_CREATED)
        notes_qs = lead.internal_notes.select_related("user").all()
        return Response(ZaloLeadNoteSerializer(notes_qs, many=True).data)

    @action(detail=True, methods=["get"])
    def messages(self, request, pk=None):
        """Lấy danh sách tin nhắn của 1 Lead và đánh dấu đã đọc."""
        lead = self.get_object()
        
        if lead.has_unread_message or (lead.unread_count and lead.unread_count > 0):
            lead.has_unread_message = False
            lead.unread_count = 0
            lead.save(update_fields=["has_unread_message", "unread_count"])
            
        from .models import ZaloMessage
        qs = ZaloMessage.objects.filter(social_lead=lead).order_by("created_at")
        serializer = ZaloMessageSerializer(qs, many=True)
        return Response(serializer.data)

    @action(detail=True, methods=["post"], url_path="send-message")
    def send_message(self, request, pk=None):
        """Sale gửi tin nhắn Text hoặc đính kèm File qua Zalo OA."""
        social_lead = self.get_object()
        oa_config = social_lead.oa_config

        if not oa_config:
            return Response({"error": "Không tìm thấy OA config"}, status=status.HTTP_400_BAD_REQUEST)

        if not oa_config.is_active:
            return Response({"error": "OA này đang tạm dừng"}, status=status.HTTP_400_BAD_REQUEST)

        text = request.data.get("text", "").strip()
        request_phone = request.data.get("request_phone") in ["true", "True", True, 1, "1"]
        request_email = request.data.get("request_email") in ["true", "True", True, 1, "1"]
        file_obj = request.FILES.get("file")

        if not text and not file_obj and not request_phone and not request_email:
            return Response({"error": "Vui lòng nhập nội dung, đính kèm file hoặc yêu cầu SĐT/Email."}, status=status.HTTP_400_BAD_REQUEST)

        if request_email and not text:
            text = oa_config.request_email_template if oa_config and oa_config.request_email_template else "Xin chào quý khách! Để thuận tiện gửi thông tin và tài liệu, xin vui lòng chia sẻ địa chỉ Email của quý khách tại đây ạ."
        elif request_phone and not text:
            text = oa_config.request_phone_template if oa_config and oa_config.request_phone_template else "Vui lòng chia sẻ số điện thoại để chúng tôi có thể liên hệ hỗ trợ tốt nhất."

        file_token = ""
        image_id = ""
        attachment_url = ""
        attachment_type = ""
        force_as_file = request.data.get("force_as_file") in ["true", "True", True, 1, "1"]

        # Nếu có file, upload lên Zalo trước
        if file_obj:
            if file_obj.content_type.startswith("image/") and not force_as_file:
                from .services import upload_image_to_zalo
                image_id = upload_image_to_zalo(oa_config, file_obj)
                if image_id:
                    attachment_type = "image"
                else:
                    return Response({"error": "Upload ảnh lên Zalo thất bại (OA chưa nâng cấp)."}, status=status.HTTP_500_INTERNAL_SERVER_ERROR)
            else:
                from .services import upload_file_to_zalo
                file_token = upload_file_to_zalo(oa_config, file_obj)
                if not file_token:
                    return Response({"error": "Upload file lên Zalo thất bại."}, status=status.HTTP_500_INTERNAL_SERVER_ERROR)
                attachment_type = "file"
            
        # Gửi qua API Zalo
        res = send_zalo_chat_message(
            oa_config, social_lead.social_id, 
            text=text, 
            file_token=file_token, 
            image_id=image_id, 
            request_phone=request_phone
        )
        
        is_mock = False
        if res.get("error", 0) != 0:
            err_code = res.get("error", 0)
            err_msg = str(res.get("message", ""))
            
            # Chỉ bật chế độ giả lập (demo/mock) nếu chưa cấu hình App ID thật hoặc đang test trên Lead Demo mẫu
            is_demo_lead = str(social_lead.social_id).startswith("demo_") or str(social_lead.social_id).endswith("_zalo")
            if not oa_config.get_app_id() or is_demo_lead:
                logger.warning(f"[ZaloChat] Chưa cấu hình App ID thật hoặc đang test trên Lead Demo ({err_code}: {err_msg}). Chuyển sang chế độ giả lập Demo.")
                is_mock = True
                msg_id = f"demo_zalo_{uuid.uuid4().hex[:8]}"
            else:
                # Dịch mã lỗi từ máy chủ Zalo sang tiếng Việt để báo rõ nguyên nhân cho người dùng
                code_str = str(err_code)
                msg_lower = err_msg.lower()
                if err_code in [-216, -201] or "invalid user_id" in msg_lower or "user not found" in msg_lower:
                    explanation = f"Khách hàng chưa tương tác với Zalo OA trong vòng 48 giờ qua, hoặc số điện thoại/ID Zalo không hợp lệ (Lỗi Zalo {err_code}: {err_msg}). Zalo quy định OA chỉ được nhắn tin chat thông thường nếu khách đã nhắn tin cho OA trong 48h hoặc khách nằm trong danh sách Tester của App đang phát triển."
                elif err_code in [-213, -214] or "48h" in msg_lower or "window" in msg_lower or "not allowed" in msg_lower:
                    explanation = f"Đã quá 48 giờ kể từ lần cuối khách hàng gửi tin nhắn cho Zalo OA (Lỗi Zalo {err_code}: {err_msg}). Theo quy định của Zalo, sau 48h bạn cần sử dụng Mẫu Zalo ZNS để liên hệ với khách."
                elif err_code in [-124, -14, -202] or "token" in msg_lower or "expired" in msg_lower:
                    explanation = f"Access Token của Zalo OA đã hết hạn hoặc bị Zalo thu hồi (Lỗi Zalo {err_code}: {err_msg}). Vui lòng vào Cấu hình Zalo OA bấm 'Đăng nhập & Lấy Token' để làm mới."
                elif err_code in [-204, -205, -209] or "permission" in msg_lower or "app" in msg_lower:
                    explanation = f"Ứng dụng Zalo (Zalo App) chưa được cấp quyền gửi tin nhắn hoặc đang ở chế độ Đang phát triển mà tài khoản này chưa được thêm vào danh sách Tester (Lỗi Zalo {err_code}: {err_msg})."
                elif err_code in [-230, -232] or "quota" in msg_lower or "limit" in msg_lower:
                    explanation = f"Zalo OA đã hết hạn mức (quota) gửi tin nhắn miễn phí trong tháng hoặc bị giới hạn (Lỗi Zalo {err_code}: {err_msg})."
                else:
                    explanation = f"Zalo từ chối gửi tin nhắn (Mã lỗi {err_code}: {err_msg}). Vui lòng kiểm tra lại cấu hình Zalo App và quyền gửi tin."

                return Response(
                    {
                        "error": explanation,
                        "zalo_error_code": err_code,
                        "zalo_message": err_msg,
                        "details": res
                    },
                    status=status.HTTP_400_BAD_REQUEST
                )
        else:
            msg_id = res.get("data", {}).get("message_id", "")

        # Ghi vào DB
        from .models import ZaloMessage
        from django.utils import timezone
        
        msg = ZaloMessage.objects.create(
            company=request.user.company,
            social_lead=social_lead,
            direction=ZaloMessage.DIRECTION_OUTBOUND,
            content=text,
            attachment_url=attachment_url,
            attachment_type=attachment_type,
            zalo_msg_id=msg_id,
            sender_user=request.user,
            sender_role="sale",
            sender_name=getattr(request.user, 'fullname', request.user.username),
        )

        # Cập nhật Lead
        social_lead.last_message = text[:500] if text else "[File đính kèm]"
        social_lead.last_interaction_date = timezone.now()
        social_lead.has_ai_followed_up = False
        social_lead.save(update_fields=["last_message", "last_interaction_date", "updated_at", "has_ai_followed_up"])

        data = ZaloMessageSerializer(msg).data
        if is_mock:
            data["is_mock"] = True
            data["note"] = "💡 [Chế độ thử nghiệm]: Access token Zalo OA hiện tại hết hạn hoặc là tài khoản Demo. Tin nhắn đã được lưu vào hệ thống CRM để kiểm thử trải nghiệm."
        return Response(data, status=status.HTTP_201_CREATED)


# ── ZaloMessageTemplate ViewSet ───────────────────────────────────────────────

class ZaloMessageTemplateViewSet(viewsets.ModelViewSet):
    """Quản lý mẫu ZNS. Filter theo company."""
    serializer_class = ZaloMessageTemplateSerializer
    module_code = "zalo"
    permission_classes = [
        IsAuthenticated,
        IsActiveUserAndCompany,
        CheckDataMaintenanceMode,
        IsModuleActivePermission,
        ActionBasedPermission,
    ]
    action_permissions = {
        "list": ["zalo.manage_templates", "zalo.send_zns", "zalo.config"],
        "retrieve": ["zalo.manage_templates", "zalo.send_zns", "zalo.config"],
        "create": "zalo.manage_templates",
        "update": "zalo.manage_templates",
        "partial_update": "zalo.manage_templates",
        "destroy": "zalo.manage_templates",
        "send_zns": "zalo.send_zns",
        "bulk_send": "zalo.send_zns",
    }

    def get_queryset(self):
        qs = ZaloMessageTemplate.objects.filter(company=self.request.user.company)
        is_active = self.request.query_params.get("is_active")
        if is_active is not None:
            qs = qs.filter(is_active=is_active.lower() == "true")
        return qs.order_by("-created_at")

    def perform_create(self, serializer):
        serializer.save(company=self.request.user.company)

    @action(detail=False, methods=["post"], url_path="send")
    def send_zns(self, request):
        """Gửi ZNS đến khách hàng hoặc social lead."""
        serializer = SendZNSSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        data = serializer.validated_data

        company = request.user.company

        # Lấy template
        try:
            template = ZaloMessageTemplate.objects.get(
                id=data["template_id"], company=company, is_active=True
            )
        except ZaloMessageTemplate.DoesNotExist:
            return Response(
                {"detail": "Mẫu ZNS không hợp lệ hoặc không hoạt động."},
                status=status.HTTP_404_NOT_FOUND,
            )

        # Tạo log record trước
        log = ZaloMessageLog.objects.create(
            company=company,
            template=template,
            sent_by=request.user,
            recipient_phone=data["recipient_phone"],
            recipient_zalo_id=data.get("recipient_zalo_id", ""),
            params_sent=data.get("params", {}),
            social_lead_id=data.get("social_lead_id"),
            customer_id=data.get("customer_id"),
            status=ZaloMessageLog.STATUS_PENDING,
        )

        # Đưa vào queue background processing
        from .tasks import send_zns_task
        send_zns_task.delay(log.id)

        return Response(
            {"detail": "Đã tạo yêu cầu gửi ZNS thành công", "log_id": log.id},
            status=status.HTTP_200_OK,
        )

    @action(detail=False, methods=["post"], url_path="bulk-send")
    def bulk_send(self, request):
        """Gửi ZNS hàng loạt cho nhiều khách hàng."""
        from .serializers import BulkSendZNSSerializer
        from users.models import Customer
        from .tasks import send_zns_task

        serializer = BulkSendZNSSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        data = serializer.validated_data

        company = request.user.company
        template_id = data["template_id"]
        customer_ids = data["customer_ids"]
        base_params = data.get("params", {})

        # 1. Lấy template
        try:
            template = ZaloMessageTemplate.objects.get(
                id=template_id, company=company, is_active=True
            )
        except ZaloMessageTemplate.DoesNotExist:
            return Response(
                {"detail": "Mẫu ZNS không hợp lệ hoặc không hoạt động."},
                status=status.HTTP_404_NOT_FOUND,
            )

        # 2. Lấy danh sách khách hàng hợp lệ
        customers = Customer.objects.filter(id__in=customer_ids, company=company).exclude(phone="")
        if not customers.exists():
            return Response(
                {"detail": "Không tìm thấy khách hàng nào có số điện thoại hợp lệ."},
                status=status.HTTP_400_BAD_REQUEST,
            )

        # 3. Tạo logs và đẩy vào Celery
        logs_created = 0
        schema = template.params_schema or {}
        needs_name = any(k.endswith("name") or k.endswith("ten") or k.startswith("ten_") for k in schema.keys())
        
        for customer in customers:
            # Tự động map tên khách hàng nếu mẫu yêu cầu
            params = base_params.copy()
            if needs_name:
                for k in schema.keys():
                    if k.endswith("name") or k.endswith("ten") or k.startswith("ten_"):
                        if k not in params:
                            params[k] = customer.name

            # Tạo ZaloMessageLog
            log = ZaloMessageLog.objects.create(
                company=company,
                template=template,
                recipient_phone=customer.phone,
                customer=customer,
                params_sent=params,
                status=ZaloMessageLog.STATUS_PENDING,
            )
            
            # Gửi task vào Celery
            send_zns_task.delay(log.id)
            logs_created += 1

        return Response(
            {
                "detail": f"Đã đưa {logs_created} yêu cầu ZNS vào hàng đợi thành công.",
                "total_queued": logs_created
            },
            status=status.HTTP_200_OK,
        )


# ── ZaloMessageLog ViewSet (Read Only) ───────────────────────────────────────

class ZaloMessageLogViewSet(viewsets.ReadOnlyModelViewSet):
    """Lịch sử gửi ZNS — chỉ đọc."""
    serializer_class = ZaloMessageLogSerializer
    module_code = "zalo"
    permission_classes = [
        IsAuthenticated,
        IsActiveUserAndCompany,
        CheckDataMaintenanceMode,
        IsModuleActivePermission,
        ActionBasedPermission,
    ]
    action_permissions = {
        "list": ["zalo.view", "zalo.send_zns", "crm.view_all", "crm.view_assigned", "sales.view_all", "sales.view_assigned"],
        "retrieve": ["zalo.view", "zalo.send_zns", "crm.view_all", "crm.view_assigned", "sales.view_all", "sales.view_assigned"],
    }

    def get_queryset(self):
        qs = ZaloMessageLog.objects.filter(
            company=self.request.user.company
        ).select_related("template", "social_lead", "customer", "sent_by")

        status_filter = self.request.query_params.get("status")
        if status_filter:
            qs = qs.filter(status=status_filter)

        return qs.order_by("-sent_at")


# ── ZaloLeadTag ViewSet ──────────────────────────────────────────────────────

class ZaloLeadTagViewSet(viewsets.ModelViewSet):
    """Quản lý nhãn hội thoại Zalo theo công ty."""
    serializer_class = ZaloLeadTagSerializer
    module_code = "zalo"
    permission_classes = [
        IsAuthenticated,
        IsActiveUserAndCompany,
        CheckDataMaintenanceMode,
        IsModuleActivePermission,
        ActionBasedPermission,
    ]
    action_permissions = {
        "list": ["zalo.view", "zalo.config"],
        "retrieve": ["zalo.view", "zalo.config"],
        "create": ["zalo.view", "zalo.config"],
        "update": ["zalo.view", "zalo.config"],
        "partial_update": ["zalo.view", "zalo.config"],
        "destroy": ["zalo.view", "zalo.config"],
    }

    def get_queryset(self):
        return ZaloLeadTag.objects.filter(company=self.request.user.company).order_by("name")

    def perform_create(self, serializer):
        serializer.save(company=self.request.user.company)


# ── ZaloQuickReply ViewSet ───────────────────────────────────────────────────

class ZaloQuickReplyViewSet(viewsets.ModelViewSet):
    """Quản lý tin nhắn mẫu Zalo theo công ty."""
    serializer_class = ZaloQuickReplySerializer
    module_code = "zalo"
    permission_classes = [
        IsAuthenticated,
        IsActiveUserAndCompany,
        CheckDataMaintenanceMode,
        IsModuleActivePermission,
        ActionBasedPermission,
    ]
    action_permissions = {
        "list": ["zalo.view", "zalo.config"],
        "retrieve": ["zalo.view", "zalo.config"],
        "create": ["zalo.view", "zalo.config"],
        "update": ["zalo.view", "zalo.config"],
        "partial_update": ["zalo.view", "zalo.config"],
        "destroy": ["zalo.view", "zalo.config"],
    }

    def get_queryset(self):
        return ZaloQuickReply.objects.filter(company=self.request.user.company).order_by("title")

    def perform_create(self, serializer):
        serializer.save(company=self.request.user.company, created_by=self.request.user)

