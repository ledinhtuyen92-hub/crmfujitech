import io
import os
import json
import logging
from PIL import Image as PILImage

logger = logging.getLogger(__name__)
from django.core.files.base import ContentFile
from django.db.models import Q
from django.utils import timezone
from rest_framework import permissions, status, viewsets
from rest_framework.decorators import action, api_view, permission_classes
from rest_framework.response import Response
from rest_framework.views import APIView
from asgiref.sync import async_to_sync
from channels.layers import get_channel_layer

from .models import Conversation, ConversationParticipant, ChatMessage, ChatCompanyConfig
from .serializers import (
    ChatMessageSerializer,
    ConversationDetailSerializer,
    ChatCompanyConfigSerializer,
)
from users.models import User, Department
from orders.models import Order
from sales.models import Quotation
from inventory.models import InventoryTransaction
from crm.models import Customer


class ConversationViewSet(viewsets.ModelViewSet):
    """Quản lý các cuộc trò chuyện (Danh sách, Tạo mới, Chi tiết)."""
    permission_classes = [permissions.IsAuthenticated]
    serializer_class = ConversationDetailSerializer
    pagination_class = None

    def _sync_user_department_conversations(self, user):
        """Tự động đồng bộ các nhóm phòng ban mà user trực thuộc, kiêm nhiệm hoặc có quyền theo dõi."""
        if not user or not user.is_authenticated or not user.company_id:
            return

        # 1. Nếu user có quyền chat.view_all_departments hoặc là admin công ty / superuser:
        # Tự động có quyền tham gia TẤT CẢ các nhóm phòng ban trong công ty để điều hành & giám sát
        can_view_all = (
            user.is_company_admin
            or user.is_superuser
            or user.has_perm_code("chat.view_all_departments")
        )

        if can_view_all:
            dept_ids = set(Department.objects.filter(company_id=user.company_id).values_list("id", flat=True))
        else:
            # 2. Ngược lại: User chỉ tham gia đúng phòng ban chính và các phòng ban kiêm nhiệm (dựa 100% vào quan hệ ID)
            dept_ids = set()
            if user.department_id:
                dept_ids.add(user.department_id)
            if hasattr(user, "extra_departments"):
                dept_ids.update(user.extra_departments.values_list("id", flat=True))

        if not dept_ids:
            return

        for dept in Department.objects.filter(id__in=dept_ids, company_id=user.company_id):
            clean_name = dept.name.strip()
            title = clean_name if clean_name.lower().startswith(("phòng", "ban")) else f"Phòng {clean_name}"
            conv, created = Conversation.objects.get_or_create(
                company_id=user.company_id,
                type=Conversation.TYPE_DEPARTMENT,
                department=dept,
                defaults={"title": title, "created_by": user}
            )
            if not created and conv.title != title:
                conv.title = title
                conv.save(update_fields=["title"])

            ConversationParticipant.objects.get_or_create(conversation=conv, user=user)

        # Loại bỏ user khỏi các nhóm phòng ban không còn thuộc về/kiêm nhiệm
        ConversationParticipant.objects.filter(
            conversation__company_id=user.company_id,
            conversation__type=Conversation.TYPE_DEPARTMENT,
            user=user
        ).exclude(conversation__department_id__in=dept_ids).delete()

    def list(self, request, *args, **kwargs):
        if request.user and request.user.is_authenticated and request.user.company_id:
            from chat.presence import record_user_heartbeat
            record_user_heartbeat(request.user.company_id, request.user.id)
        self._sync_user_department_conversations(request.user)
        return super().list(request, *args, **kwargs)

    def get_queryset(self):
        user = self.request.user
        return Conversation.objects.filter(
            company_id=user.company_id,
            is_active=True,
            participants__user=user,
            participants__is_hidden=False
        ).distinct().order_by("-last_message_at", "-created_at")

    def create(self, request, *args, **kwargs):
        user = request.user
        if user.company_id:
            from chat.presence import record_user_heartbeat
            record_user_heartbeat(user.company_id, user.id)
        conv_type = request.data.get("type", Conversation.TYPE_DIRECT)
        title = request.data.get("title", "").strip()
        partner_id = request.data.get("partner_id")
        member_ids = request.data.get("member_ids") or []

        if conv_type == Conversation.TYPE_DIRECT:
            if not partner_id:
                return Response({"detail": "Vui lòng chọn người cần trò chuyện."}, status=status.HTTP_400_BAD_REQUEST)
            if int(partner_id) == user.id:
                return Response({"detail": "Không thể tự trò chuyện 1-1 với chính mình."}, status=status.HTTP_400_BAD_REQUEST)

            partner = User.objects.filter(id=partner_id, company_id=user.company_id, is_active=True).first()
            if not partner:
                return Response({"detail": "Không tìm thấy đồng nghiệp này trong công ty."}, status=status.HTTP_404_NOT_FOUND)

            # Kiểm tra xem đã có hội thoại 1-1 giữa 2 người chưa
            existing = Conversation.objects.filter(
                company_id=user.company_id,
                type=Conversation.TYPE_DIRECT,
                is_active=True,
                participants__user=user
            ).filter(participants__user=partner).first()

            if existing:
                existing.participants.filter(user=user).update(is_hidden=False)
                serializer = self.get_serializer(existing)
                return Response(serializer.data, status=status.HTTP_200_OK)

            # Tạo mới hội thoại 1-1
            conv = Conversation.objects.create(
                company=user.company,
                type=Conversation.TYPE_DIRECT,
                created_by=user,
            )
            ConversationParticipant.objects.create(conversation=conv, user=user)
            ConversationParticipant.objects.create(conversation=conv, user=partner)

            serializer = self.get_serializer(conv)
            return Response(serializer.data, status=status.HTTP_201_CREATED)

        elif conv_type == Conversation.TYPE_GROUP:
            if not title:
                return Response({"detail": "Vui lòng nhập tên nhóm trò chuyện."}, status=status.HTTP_400_BAD_REQUEST)

            conv = Conversation.objects.create(
                company=user.company,
                type=Conversation.TYPE_GROUP,
                title=title,
                created_by=user,
            )
            # Người tạo là admin
            ConversationParticipant.objects.create(conversation=conv, user=user, is_admin=True)

            # Thêm các thành viên được chọn
            all_member_ids = set(member_ids)
            all_member_ids.discard(user.id)
            valid_members = User.objects.filter(id__in=all_member_ids, company_id=user.company_id, is_active=True)
            for m in valid_members:
                ConversationParticipant.objects.create(conversation=conv, user=m)

            serializer = self.get_serializer(conv)
            return Response(serializer.data, status=status.HTTP_201_CREATED)

        return Response({"detail": "Loại hội thoại không hợp lệ."}, status=status.HTTP_400_BAD_REQUEST)

    def _purge_conversation(self, conv):
        """Xóa triệt để cuộc trò chuyện và toàn bộ tệp tin vật lý trên đĩa cứng."""
        for msg in conv.messages.exclude(file=""):
            try:
                if msg.file and os.path.isfile(msg.file.path):
                    os.remove(msg.file.path)
            except Exception:
                pass
        conv.delete()

    def _broadcast_deleted(self, conv_id, participant_ids):
        """Phát sóng sự kiện xóa cuộc trò chuyện qua WebSocket."""
        try:
            channel_layer = get_channel_layer()
            if channel_layer:
                for pid in participant_ids:
                    async_to_sync(channel_layer.group_send)(
                        f"chat_user_{pid}",
                        {
                            "type": "conversation_deleted_broadcast",
                            "conversation_id": conv_id,
                        }
                    )
        except Exception:
            pass

    def destroy(self, request, *args, **kwargs):
        """
        Xóa cuộc trò chuyện theo cơ chế phân quyền chuẩn doanh nghiệp:
        1. Chat 1-1:
           - Ẩn ở phía người bấm (is_hidden=True, cleared_at=now). Người đối diện vẫn giữ 100% lịch sử.
           - Nếu CẢ 2 BÊN đều đã bấm xóa: Tự động xóa triệt để khỏi DB và ổ cứng server (Đồng thuận).
        2. Chat Nhóm (Group):
           - Thành viên thường: Rời nhóm (xóa participant của họ khỏi nhóm).
           - Trưởng nhóm / Admin: Giải tán nhóm (Xóa triệt để cho tất cả thành viên).
        3. Chat Phòng ban (Department):
           - Chỉ Quản trị viên mới được xóa.
        """
        conv = self.get_object()
        user = request.user
        if user.company_id:
            from chat.presence import record_user_heartbeat
            record_user_heartbeat(user.company_id, user.id)
        conv_id = conv.id

        if conv.type == Conversation.TYPE_DEPARTMENT:
            if not (user.is_company_admin or user.is_superuser):
                return Response({"detail": "Nhóm phòng ban do hệ thống quản lý, chỉ Quản trị viên mới được xóa."}, status=status.HTTP_403_FORBIDDEN)
            participant_ids = list(conv.participants.values_list("user_id", flat=True))
            self._purge_conversation(conv)
            self._broadcast_deleted(conv_id, participant_ids)
            return Response({"detail": "Đã xóa cuộc trò chuyện phòng ban triệt để.", "purged": True}, status=status.HTTP_200_OK)

        elif conv.type == Conversation.TYPE_DIRECT:
            p = conv.participants.filter(user=user).first()
            if p:
                p.is_hidden = True
                p.cleared_at = timezone.now()
                p.save(update_fields=["is_hidden", "cleared_at"])

            # Kiểm tra xem có còn thành viên nào chưa ẩn không
            remaining_active = conv.participants.filter(is_hidden=False).count()
            if remaining_active == 0:
                # Cả 2 bên đều đã bấm xóa -> XÓA TRIỆT ĐỂ!
                self._purge_conversation(conv)
                return Response({
                    "detail": "Cả hai bên đều đã xóa. Hệ thống đã xóa triệt để cuộc trò chuyện.",
                    "purged": True
                }, status=status.HTTP_200_OK)
            else:
                return Response({
                    "detail": "Đã xóa cuộc trò chuyện ở phía bạn. Người đối diện vẫn giữ lịch sử.",
                    "purged": False
                }, status=status.HTTP_200_OK)

        elif conv.type == Conversation.TYPE_GROUP:
            is_creator = conv.created_by_id == user.id
            is_grp_admin = conv.participants.filter(user=user, is_admin=True).exists()
            is_admin = is_creator or is_grp_admin or user.is_company_admin or user.is_superuser

            if is_admin:
                # Giải tán nhóm triệt để
                participant_ids = list(conv.participants.values_list("user_id", flat=True))
                self._purge_conversation(conv)
                self._broadcast_deleted(conv_id, participant_ids)
                return Response({
                    "detail": "Đã giải tán nhóm và xóa triệt để dữ liệu.",
                    "purged": True
                }, status=status.HTTP_200_OK)
            else:
                # Thành viên rời nhóm
                conv.participants.filter(user=user).delete()
                return Response({
                    "detail": "Bạn đã rời khỏi nhóm trò chuyện.",
                    "purged": False
                }, status=status.HTTP_200_OK)

        return Response({"detail": "Loại hội thoại không hợp lệ."}, status=status.HTTP_400_BAD_REQUEST)

    @action(detail=True, methods=["post"])
    def clear_messages(self, request, pk=None):
        """Xóa lịch sử tin nhắn trong cuộc trò chuyện."""
        conv = self.get_object()
        user = request.user
        if user.company_id:
            from chat.presence import record_user_heartbeat
            record_user_heartbeat(user.company_id, user.id)

        if conv.type == Conversation.TYPE_DIRECT:
            p = conv.participants.filter(user=user).first()
            if p:
                p.cleared_at = timezone.now()
                p.save(update_fields=["cleared_at"])
            return Response({"detail": "Đã xóa lịch sử tin nhắn ở phía bạn."})

        elif conv.type == Conversation.TYPE_GROUP:
            is_creator = conv.created_by_id == user.id
            is_grp_admin = conv.participants.filter(user=user, is_admin=True).exists()
            is_admin = is_creator or is_grp_admin or user.is_company_admin or user.is_superuser

            if not is_admin:
                p = conv.participants.filter(user=user).first()
                if p:
                    p.cleared_at = timezone.now()
                    p.save(update_fields=["cleared_at"])
                return Response({"detail": "Đã xóa lịch sử tin nhắn ở phía bạn."})

            # Trưởng nhóm / Admin: Xóa triệt để toàn bộ tin nhắn nhóm
            for msg in conv.messages.exclude(file=""):
                try:
                    if msg.file and os.path.isfile(msg.file.path):
                        os.remove(msg.file.path)
                except Exception:
                    pass

            conv.messages.all().delete()
            conv.last_message_text = ""
            conv.last_message_at = None
            conv.last_sender_name = ""
            conv.save(update_fields=["last_message_text", "last_message_at", "last_sender_name", "updated_at"])
            conv.participants.update(last_read_message_id=0)

            try:
                channel_layer = get_channel_layer()
                if channel_layer:
                    for p in conv.participants.all():
                        async_to_sync(channel_layer.group_send)(
                            f"chat_user_{p.user_id}",
                            {
                                "type": "conversation_cleared_broadcast",
                                "conversation_id": conv.id,
                            }
                        )
            except Exception:
                pass

            return Response({"detail": "Đã xóa toàn bộ lịch sử tin nhắn nhóm."}, status=status.HTTP_200_OK)

        return Response({"detail": "Không thể xóa tin nhắn nhóm phòng ban."}, status=status.HTTP_400_BAD_REQUEST)

    @action(detail=True, methods=["get"])
    def messages(self, request, pk=None):
        """Lấy danh sách tin nhắn theo phân trang Cursor (trước ID chỉ định), tôn trọng cleared_at."""
        conv = self.get_object()
        user = request.user
        if user.company_id:
            from chat.presence import record_user_heartbeat
            record_user_heartbeat(user.company_id, user.id)

        p = conv.participants.filter(user=user).first()
        cleared_at = p.cleared_at if p else None

        before_id = request.query_params.get("before_id")
        limit = min(int(request.query_params.get("limit", 30)), 50)

        qs = conv.messages.filter(is_deleted=False)
        if cleared_at:
            qs = qs.filter(created_at__gt=cleared_at)
        if before_id:
            qs = qs.filter(id__lt=before_id)

        # Lấy các tin mới nhất theo thứ tự ngược rồi đảo lại xuôi dòng
        messages = list(qs.order_by("-created_at")[:limit])
        messages.reverse()

        # Tự động cập nhật đã đọc
        if messages:
            last_msg_id = messages[-1].id
            if p and last_msg_id > p.last_read_message_id:
                p.last_read_message_id = last_msg_id
                p.last_read_at = timezone.now()
                p.save(update_fields=["last_read_message_id", "last_read_at"])

        serializer = ChatMessageSerializer(messages, many=True)
        return Response({
            "results": serializer.data,
            "has_more": qs.count() > limit if not before_id else ChatMessage.objects.filter(conversation=conv, is_deleted=False, id__lt=messages[0].id if messages else 0).exists()
        })

    @action(detail=True, methods=["post"], url_path=r"messages/(?P<message_id>\d+)/recall")
    def recall_message(self, request, pk=None, message_id=None):
        """
        Thu hồi tin nhắn đã gửi (Unsend / Recall).
        Chỉ người gửi tin nhắn (hoặc Admin công ty) được thu hồi.
        Giới hạn thời gian: Trong vòng 60 phút từ khi gửi (hoặc Admin không giới hạn).
        """
        conv = self.get_object()
        user = request.user
        if user.company_id:
            from chat.presence import record_user_heartbeat
            record_user_heartbeat(user.company_id, user.id)

        msg = conv.messages.filter(id=message_id, is_deleted=False).first()
        if not msg:
            return Response({"detail": "Không tìm thấy tin nhắn cần thu hồi."}, status=status.HTTP_404_NOT_FOUND)

        if msg.is_recalled:
            return Response({"detail": "Tin nhắn này đã được thu hồi trước đó."}, status=status.HTTP_400_BAD_REQUEST)

        # Chỉ chính chủ người gửi mới được thu hồi tin nhắn
        if msg.sender_id != user.id:
            return Response({"detail": "Bạn chỉ có thể thu hồi tin nhắn do chính mình gửi."}, status=status.HTTP_403_FORBIDDEN)

        diff_minutes = (timezone.now() - msg.created_at).total_seconds() / 60.0
        if diff_minutes > 60:
            return Response({"detail": "Đã quá thời hạn 60 phút, không thể thu hồi tin nhắn này."}, status=status.HTTP_400_BAD_REQUEST)

        # Xóa file vật lý trên đĩa nếu có
        try:
            if msg.file and os.path.isfile(msg.file.path):
                os.remove(msg.file.path)
                msg.file = None
        except Exception as e:
            logger.warning("Lỗi xóa file vật lý khi thu hồi tin nhắn: %s", e)

        msg.is_recalled = True
        msg.recalled_at = timezone.now()
        msg.content = "Tin nhắn đã được thu hồi"
        msg.context_data = {}
        msg.save(update_fields=["is_recalled", "recalled_at", "content", "context_data", "file"])

        # Nếu là tin cuối của hội thoại, cập nhật lại last_message_text
        last_msg = conv.messages.filter(is_deleted=False).last()
        if last_msg and last_msg.id == msg.id:
            conv.last_message_text = "Tin nhắn đã được thu hồi"
            conv.save(update_fields=["last_message_text", "updated_at"])

        msg_data = ChatMessageSerializer(msg).data

        # Phát sóng real-time thông báo thu hồi
        try:
            channel_layer = get_channel_layer()
            if channel_layer:
                for p in conv.participants.all():
                    async_to_sync(channel_layer.group_send)(
                        f"chat_user_{p.user_id}",
                        {
                            "type": "message_recalled_broadcast",
                            "conversation_id": conv.id,
                            "message_id": msg.id,
                            "message": msg_data,
                        }
                    )
                async_to_sync(channel_layer.group_send)(
                    f"chat_conversation_{conv.id}",
                    {
                        "type": "message_recalled_broadcast",
                        "conversation_id": conv.id,
                        "message_id": msg.id,
                        "message": msg_data,
                    }
                )
        except Exception as e:
            logger.warning("Lỗi broadcast message_recalled: %s", e)

        return Response(msg_data, status=status.HTTP_200_OK)

    @action(detail=True, methods=["post"])
    def send(self, request, pk=None):
        """Gửi tin nhắn qua REST API (hỗ trợ cả văn bản, file đính kèm và thẻ chứng từ CRM)."""
        conv = self.get_object()
        user = request.user
        if user.company_id:
            from chat.presence import record_user_heartbeat
            record_user_heartbeat(user.company_id, user.id)

        content = request.data.get("content", "").strip()
        message_type = request.data.get("message_type", ChatMessage.MSG_TEXT)
        context_data = request.data.get("context_data") or {}
        if isinstance(context_data, str):
            try:
                context_data = json.loads(context_data)
            except Exception:
                context_data = {}
        if not isinstance(context_data, dict):
            context_data = {}

        file_obj = request.FILES.get("file")
        file_name = request.data.get("file_name", "")

        if not content and not file_obj and message_type != ChatMessage.MSG_CONTEXT_DOC:
            return Response({"detail": "Nội dung tin nhắn không được để trống."}, status=status.HTTP_400_BAD_REQUEST)

        # Kiểm tra cấu hình công ty về upload file
        config, _ = ChatCompanyConfig.objects.get_or_create(company=user.company)
        if file_obj and not config.allow_file_upload:
            return Response({"detail": "Công ty đã tắt tính năng gửi tệp tin."}, status=status.HTTP_403_FORBIDDEN)

        file_size = 0
        if file_obj:
            file_size = file_obj.size
            if file_size > config.max_file_size_mb * 1024 * 1024:
                return Response(
                    {"detail": f"Dung lượng tệp vượt quá giới hạn cho phép ({config.max_file_size_mb} MB)."},
                    status=status.HTTP_400_BAD_REQUEST
                )
            if not file_name:
                file_name = file_obj.name

            # Tự động nén ảnh nếu bật cấu hình
            if config.auto_compress_images and file_obj.content_type.startswith("image/"):
                file_obj = compress_image_file(file_obj)
                message_type = ChatMessage.MSG_IMAGE
            elif not message_type or message_type == ChatMessage.MSG_TEXT:
                message_type = ChatMessage.MSG_FILE

        msg = ChatMessage.objects.create(
            conversation=conv,
            sender=user,
            message_type=message_type,
            content=content,
            file=file_obj,
            file_name=file_name,
            file_size=file_size,
            context_data=context_data,
        )

        # Cập nhật thông tin tin nhắn cuối cùng trên cuộc trò chuyện
        sender_name = user.full_name or user.username
        last_text = content
        if message_type == ChatMessage.MSG_IMAGE:
            last_text = "[Hình ảnh]"
        elif message_type == ChatMessage.MSG_FILE:
            last_text = f"[Tệp tin] {file_name}"
        elif message_type == ChatMessage.MSG_CONTEXT_DOC:
            doc_code = (context_data or {}).get("doc_code", "Chứng từ")
            last_text = f"[Chứng từ CRM] {doc_code}"

        conv.last_message_text = last_text
        conv.last_message_at = msg.created_at
        conv.last_sender_name = sender_name
        conv.save(update_fields=["last_message_text", "last_message_at", "last_sender_name", "updated_at"])

        # Tự động gỡ ẩn hội thoại cho tất cả thành viên khi có tin nhắn mới
        conv.participants.filter(is_hidden=True).update(is_hidden=False)

        # Cập nhật đã đọc cho người gửi
        ConversationParticipant.objects.filter(
            conversation=conv,
            user=user
        ).update(last_read_message_id=msg.id, last_read_at=msg.created_at)

        msg_data = ChatMessageSerializer(msg).data

        # Phát sóng thời gian thực qua Django Channels
        try:
            channel_layer = get_channel_layer()
            if channel_layer:
                # Gửi tới từng thành viên qua channel cá nhân
                for p in conv.participants.all():
                    async_to_sync(channel_layer.group_send)(
                        f"chat_user_{p.user_id}",
                        {
                            "type": "chat_message_broadcast",
                            "conversation_id": conv.id,
                            "message": msg_data,
                        }
                    )
                # Gửi tới phòng hội thoại
                async_to_sync(channel_layer.group_send)(
                    f"chat_conversation_{conv.id}",
                    {
                        "type": "chat_message_broadcast",
                        "conversation_id": conv.id,
                        "message": msg_data,
                    }
                )
        except Exception:
            pass

        return Response(msg_data, status=status.HTTP_201_CREATED)

    @action(detail=True, methods=["post"])
    def read(self, request, pk=None):
        """Đánh dấu đã đọc tất cả tin nhắn trong cuộc trò chuyện."""
        conv = self.get_object()
        user = request.user
        if user.company_id:
            from chat.presence import record_user_heartbeat
            record_user_heartbeat(user.company_id, user.id)
        last_msg = conv.messages.filter(is_deleted=False).last()
        last_id = last_msg.id if last_msg else 0

        p = conv.participants.filter(user=user).first()
        if p and last_id > p.last_read_message_id:
            p.last_read_message_id = last_id
            p.last_read_at = timezone.now()
            p.save(update_fields=["last_read_message_id", "last_read_at"])

            try:
                channel_layer = get_channel_layer()
                if channel_layer:
                    async_to_sync(channel_layer.group_send)(
                        f"chat_conversation_{conv.id}",
                        {
                            "type": "read_receipt_broadcast",
                            "conversation_id": conv.id,
                            "user_id": user.id,
                            "last_read_message_id": last_id,
                        }
                    )
            except Exception:
                pass

        return Response({"status": "ok", "last_read_message_id": last_id})


def compress_image_file(uploaded_file, max_dimension=1600, quality=80):
    """Nén ảnh tự động để giảm dung lượng lưu trữ trước khi lưu vào đĩa."""
    try:
        img = PILImage.open(uploaded_file)
        img_format = img.format or "JPEG"

        # Chuyển đổi RGBA sang RGB nếu định dạng là JPEG
        if img.mode in ("RGBA", "P") and img_format.upper() in ("JPEG", "JPG"):
            img = img.convert("RGB")

        # Resize nếu kích thước vượt quá max_dimension
        w, h = img.size
        if w > max_dimension or h > max_dimension:
            if w > h:
                new_w = max_dimension
                new_h = int(h * (max_dimension / w))
            else:
                new_h = max_dimension
                new_w = int(w * (max_dimension / h))
            img = img.resize((new_w, new_h), PILImage.Resampling.LANCZOS)

        output_io = io.BytesIO()
        if img_format.upper() in ("PNG", "WEBP"):
            img.save(output_io, format="WEBP", quality=quality, optimize=True)
            ext = ".webp"
        else:
            img.save(output_io, format="JPEG", quality=quality, optimize=True)
            ext = ".jpg"

        output_io.seek(0)
        base_name, _ = os.path.splitext(uploaded_file.name)
        new_filename = f"{base_name}{ext}"
        return ContentFile(output_io.read(), name=new_filename)
    except Exception:
        # Nếu có lỗi khi nén thì giữ nguyên file gốc
        uploaded_file.seek(0)
        return uploaded_file


@api_view(["GET"])
@permission_classes([permissions.IsAuthenticated])
def get_colleagues(request):
    """Lấy danh sách đồng nghiệp trong cùng công ty để bắt đầu chat 1-1."""
    user = request.user
    q = request.query_params.get("q", "").strip()

    qs = User.objects.filter(company_id=user.company_id, is_active=True).exclude(id=user.id)
    if q:
        qs = qs.filter(Q(full_name__icontains=q) | Q(username__icontains=q) | Q(email__icontains=q))

    from chat.presence import get_online_user_ids_sync, record_user_heartbeat
    record_user_heartbeat(user.company_id, user.id)
    online_ids = get_online_user_ids_sync(user.company_id)

    results = []
    for u in qs.select_related("department", "role").order_by("full_name")[:100]:
        results.append({
            "id": u.id,
            "full_name": u.full_name,
            "username": u.username,
            "avatar": u.avatar.url if u.avatar else None,
            "department_name": u.department.name if u.department else "",
            "role_name": u.role.name if u.role else "",
            "is_online": u.id in online_ids,
        })
    return Response(results)


@api_view(["GET"])
@permission_classes([permissions.IsAuthenticated])
def get_department_groups(request):
    """
    Lấy danh sách các nhóm phòng ban trong công ty.
    Tự động đồng bộ và thêm các nhân sự thuộc phòng ban vào nhóm tương ứng.
    Hỗ trợ:
    - Nhân sự thuộc phòng ban chính (department)
    - Nhân sự kiêm nhiệm nhiều phòng ban (extra_departments)
    - Người dùng có quyền xem/tham gia toàn bộ phòng ban (chat.view_all_departments / is_company_admin)
    """
    user = request.user
    departments = Department.objects.filter(company_id=user.company_id)
    results = []

    # Danh sách user có quyền tham gia tất cả các nhóm phòng ban (dựa trên quyền RBAC & cờ Admin)
    company_users = User.objects.filter(company_id=user.company_id, is_active=True).prefetch_related("role__permissions", "extra_departments")
    view_all_user_ids = {
        u.id for u in company_users
        if u.is_company_admin or u.is_superuser or u.has_perm_code("chat.view_all_departments")
    }

    for dept in departments:
        clean_name = dept.name.strip()
        title = clean_name if clean_name.lower().startswith(("phòng", "ban")) else f"Phòng {clean_name}"
        conv, created = Conversation.objects.get_or_create(
            company_id=user.company_id,
            type=Conversation.TYPE_DEPARTMENT,
            department=dept,
            defaults={
                "title": title,
                "created_by": user,
            }
        )
        if not created and conv.title != title:
            conv.title = title
            conv.save(update_fields=["title"])

        # Nhân sự thuộc phòng ban này: phòng chính, kiêm nhiệm, hoặc quyền theo dõi toàn bộ
        q = Q(department=dept) | Q(id__in=view_all_user_ids)
        if hasattr(User, "extra_departments"):
            q |= Q(extra_departments=dept)

        dept_users = User.objects.filter(Q(company_id=user.company_id, is_active=True) & q).distinct()
        for du in dept_users:
            ConversationParticipant.objects.get_or_create(conversation=conv, user=du)
        # Loại bỏ các thành viên cũ không còn thuộc phòng ban này
        ConversationParticipant.objects.filter(conversation=conv).exclude(user__in=dept_users).delete()

        # Kiểm tra xem user hiện tại có thuộc nhóm này không
        if ConversationParticipant.objects.filter(conversation=conv, user=user).exists():
            serializer = ConversationDetailSerializer(conv, context={"request": request})
            results.append(serializer.data)

    return Response(results)


def _format_money(val):
    try:
        return f"{int(float(val or 0)):,} đ"
    except Exception:
        return "0 đ"


@api_view(["GET"])
@permission_classes([permissions.IsAuthenticated])
def search_crm_documents(request):
    """
    Tìm kiếm nhanh chứng từ CRM (Đơn hàng, Báo giá, Phiếu xuất kho, Khách hàng)
    để người dùng gắn thẻ đính kèm vào tin nhắn chat nội bộ.
    """
    user = request.user
    q = request.query_params.get("q", "").strip()
    if not q:
        return Response([])

    results = []

    # 1. Đơn hàng
    try:
        orders = Order.objects.filter(
            company_id=user.company_id
        ).filter(
            Q(order_number__icontains=q) | Q(customer__name__icontains=q) | Q(customer_name_snapshot__icontains=q)
        ).select_related("customer")[:5]

        for o in orders:
            cust_name = o.customer.name if o.customer else (o.customer_name_snapshot or "Khách")
            results.append({
                "doc_type": "order",
                "doc_id": o.id,
                "doc_code": o.order_number,
                "title": f"Đơn hàng: {o.order_number} - {cust_name}",
                "extra": _format_money(getattr(o, "total_amount", 0)),
                "badge_color": "blue",
            })
    except Exception as e:
        logger.warning("Lỗi tìm kiếm đơn hàng CRM: %s", e)

    # 2. Báo giá
    try:
        quotes = Quotation.objects.filter(
            company_id=user.company_id
        ).filter(
            Q(quotation_number__icontains=q) | Q(customer__name__icontains=q) | Q(customer_name_snapshot__icontains=q)
        ).select_related("customer")[:5]

        for qu in quotes:
            cust_name = qu.customer.name if qu.customer else (qu.customer_name_snapshot or "Khách")
            results.append({
                "doc_type": "quotation",
                "doc_id": qu.id,
                "doc_code": qu.quotation_number,
                "title": f"Báo giá: {qu.quotation_number} - {cust_name}",
                "extra": _format_money(getattr(qu, "total_amount", 0)),
                "badge_color": "green",
            })
    except Exception as e:
        logger.warning("Lỗi tìm kiếm báo giá CRM: %s", e)

    # 3. Phiếu xuất kho
    try:
        exports = InventoryTransaction.objects.filter(
            company_id=user.company_id,
            type=InventoryTransaction.TYPE_EXPORT
        ).filter(
            Q(transaction_code__icontains=q) | Q(reference_order__order_number__icontains=q)
        ).select_related("reference_order").order_by("-id")[:15]

        seen_codes = set()
        for exp in exports:
            if exp.transaction_code in seen_codes:
                continue
            seen_codes.add(exp.transaction_code)
            ref_order_code = exp.reference_order.order_number if exp.reference_order else "—"
            results.append({
                "doc_type": "inventory_export",
                "doc_id": exp.id,
                "doc_code": exp.transaction_code,
                "title": f"Phiếu xuất: {exp.transaction_code} (ĐH: {ref_order_code})",
                "extra": exp.get_status_display() if hasattr(exp, "get_status_display") else exp.status,
                "badge_color": "purple",
            })
            if len(seen_codes) >= 5:
                break
    except Exception as e:
        logger.warning("Lỗi tìm kiếm phiếu xuất CRM: %s", e)

    # 4. Khách hàng
    try:
        customers = Customer.objects.filter(
            company_id=user.company_id
        ).filter(
            Q(name__icontains=q) | Q(phone__icontains=q) | Q(company_name__icontains=q)
        )[:5]

        for c in customers:
            results.append({
                "doc_type": "customer",
                "doc_id": c.id,
                "doc_code": f"KH#{c.id}",
                "title": f"Khách hàng: {c.name}",
                "extra": c.phone or c.company_name or "",
                "badge_color": "gold",
            })
    except Exception as e:
        logger.warning("Lỗi tìm kiếm khách hàng CRM: %s", e)

    return Response(results)


class ChatCompanyConfigView(APIView):
    """Cấu hình chính sách lưu trữ và dọn dẹp chat theo công ty."""
    permission_classes = [permissions.IsAuthenticated]

    def get(self, request):
        config, _ = ChatCompanyConfig.objects.get_or_create(company=request.user.company)
        serializer = ChatCompanyConfigSerializer(config)
        return Response(serializer.data)

    def post(self, request):
        user = request.user
        if user.company_id:
            from chat.presence import record_user_heartbeat
            record_user_heartbeat(user.company_id, user.id)
        if not (user.is_company_admin or user.is_superuser or (user.permissions or []).count("chat.admin")):
            return Response({"detail": "Chỉ Quản trị viên mới có quyền thay đổi cấu hình Chat."}, status=status.HTTP_403_FORBIDDEN)

        config, _ = ChatCompanyConfig.objects.get_or_create(company=user.company)
        serializer = ChatCompanyConfigSerializer(config, data=request.data, partial=True)
        if serializer.is_valid():
            serializer.save()
            return Response(serializer.data)
        return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)


@api_view(["POST"])
@permission_classes([permissions.IsAuthenticated])
def trigger_clean_old_chat_files(request):
    """Thao tác thủ công của Admin: Dọn dẹp tệp tin cũ để giải phóng dung lượng ổ cứng."""
    user = request.user
    if not (user.is_company_admin or user.is_superuser or (user.permissions or []).count("chat.admin")):
        return Response({"detail": "Bạn không có quyền thực hiện hành động này."}, status=status.HTTP_403_FORBIDDEN)

    days = int(request.data.get("days", 30))
    from .tasks import clean_old_files_only
    result = clean_old_files_only(user.company_id, days=days)
    return Response({
        "status": "success",
        "detail": f"Đã dọn dẹp {result.get('deleted_files', 0)} tệp tin chat cũ hơn {days} ngày."
    })
