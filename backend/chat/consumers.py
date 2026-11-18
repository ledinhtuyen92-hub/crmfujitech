import json
import logging
from channels.generic.websocket import AsyncWebsocketConsumer
from channels.db import database_sync_to_async
from django.utils import timezone
from .models import Conversation, ConversationParticipant, ChatMessage
from .serializers import ChatMessageSerializer
from .presence import add_user_presence, remove_user_presence, get_online_user_ids

logger = logging.getLogger(__name__)


@database_sync_to_async
def is_participant(user_id, conversation_id):
    return ConversationParticipant.objects.filter(
        user_id=user_id,
        conversation_id=conversation_id
    ).exists()


@database_sync_to_async
def get_participant_user_ids(conversation_id):
    return list(
        ConversationParticipant.objects.filter(
            conversation_id=conversation_id
        ).values_list("user_id", flat=True)
    )


@database_sync_to_async
def save_message_to_db(user, conversation_id, content, message_type="text", context_data=None):
    conv = Conversation.objects.filter(id=conversation_id).first()
    if not conv:
        return None, None

    if isinstance(context_data, str):
        try:
            context_data = json.loads(context_data)
        except Exception:
            context_data = {}
    if not isinstance(context_data, dict):
        context_data = {}

    msg = ChatMessage.objects.create(
        conversation=conv,
        sender=user,
        message_type=message_type,
        content=content or "",
        context_data=context_data,
    )

    # Tự động gỡ ẩn hội thoại cho tất cả thành viên khi có tin nhắn mới
    conv.participants.filter(is_hidden=True).update(is_hidden=False)

    # Cập nhật thông tin tin nhắn cuối cùng trên hội thoại
    sender_name = user.full_name or user.username
    last_text = content
    if message_type == ChatMessage.MSG_IMAGE:
        last_text = "[Hình ảnh]"
    elif message_type == ChatMessage.MSG_FILE:
        last_text = f"[Tệp tin] {msg.file_name or ''}"
    elif message_type == ChatMessage.MSG_CONTEXT_DOC:
        doc_code = (context_data or {}).get("doc_code", "Chứng từ")
        last_text = f"[Chứng từ CRM] {doc_code}"

    conv.last_message_text = last_text
    conv.last_message_at = msg.created_at
    conv.last_sender_name = sender_name
    conv.save(update_fields=["last_message_text", "last_message_at", "last_sender_name", "updated_at"])

    # Tự động cập nhật last_read_message_id cho chính người gửi
    ConversationParticipant.objects.filter(
        conversation=conv,
        user=user
    ).update(
        last_read_message_id=msg.id,
        last_read_at=msg.created_at
    )

    # Serialize message
    data = ChatMessageSerializer(msg).data
    return msg, data


@database_sync_to_async
def update_read_receipt(user, conversation_id, last_message_id):
    p = ConversationParticipant.objects.filter(
        conversation_id=conversation_id,
        user=user
    ).first()
    if p:
        if last_message_id and last_message_id > p.last_read_message_id:
            p.last_read_message_id = last_message_id
            p.last_read_at = timezone.now()
            p.save(update_fields=["last_read_message_id", "last_read_at"])
            return True
    return False


class ChatConsumer(AsyncWebsocketConsumer):
    """
    WebSocket consumer xử lý tin nhắn chat thời gian thực.
    Endpoint: ws://<host>/ws/chat/?token=<jwt_access_token>
    """

    async def connect(self):
        user = self.scope.get("user")
        if not user or not user.is_authenticated:
            logger.warning("Chat WebSocket rejected: Unauthenticated user.")
            await self.close(code=4001)
            return

        self.user = user
        self.user_group = f"chat_user_{user.id}"
        self.company_presence_group = f"chat_presence_company_{user.company_id}"

        # Tham gia channel riêng của user (nhận thông báo tin mới / unread)
        await self.channel_layer.group_add(self.user_group, self.channel_name)
        # Tham gia channel hiện diện của công ty
        if user.company_id:
            await self.channel_layer.group_add(self.company_presence_group, self.channel_name)

        await self.accept()

        # Gửi thông báo kết nối thành công
        await self.send(text_data=json.dumps({
            "type": "connection_established",
            "user_id": user.id,
            "full_name": user.full_name or user.username,
        }))

        # Ghi nhận trạng thái online vào Redis
        is_first_tab = await add_user_presence(user.company_id, user.id, self.channel_name)

        # Gửi danh sách toàn bộ đồng nghiệp đang online cho chính người dùng này
        if user.company_id:
            online_users = await get_online_user_ids(user.company_id)
            await self.send(text_data=json.dumps({
                "type": "initial_presence",
                "online_user_ids": list(online_users),
            }))

        # Nếu là tab đầu tiên của user, thông báo Online cho các đồng nghiệp khác
        if is_first_tab and user.company_id:
            await self.channel_layer.group_send(
                self.company_presence_group,
                {
                    "type": "presence_status",
                    "user_id": user.id,
                    "status": "online",
                }
            )

    async def disconnect(self, close_code):
        if hasattr(self, "user_group"):
            await self.channel_layer.group_discard(self.user_group, self.channel_name)
        if hasattr(self, "company_presence_group") and self.user.company_id:
            await self.channel_layer.group_discard(self.company_presence_group, self.channel_name)

            # Xóa connection khỏi Redis
            is_last_tab = await remove_user_presence(self.user.company_id, self.user.id, self.channel_name)

            # Chỉ thông báo Offline nếu user đã đóng toàn bộ các tab
            if is_last_tab:
                await self.channel_layer.group_send(
                    self.company_presence_group,
                    {
                        "type": "presence_status",
                        "user_id": self.user.id,
                        "status": "offline",
                    }
                )

    async def receive(self, text_data):
        try:
            data = json.loads(text_data)
        except Exception:
            return

        action = data.get("action")
        conv_id = data.get("conversation_id")

        if action == "join_conversation" and conv_id:
            # Kiểm tra quyền tham gia
            if await is_participant(self.user.id, conv_id):
                group_name = f"chat_conversation_{conv_id}"
                await self.channel_layer.group_add(group_name, self.channel_name)
                await self.send(text_data=json.dumps({
                    "type": "joined_conversation",
                    "conversation_id": conv_id,
                }))

        elif action == "leave_conversation" and conv_id:
            group_name = f"chat_conversation_{conv_id}"
            await self.channel_layer.group_discard(group_name, self.channel_name)

        elif action == "send_message" and conv_id:
            content = data.get("content", "").strip()
            msg_type = data.get("message_type", "text")
            context_data = data.get("context_data") or {}

            if not content and msg_type == "text":
                return

            if await is_participant(self.user.id, conv_id):
                msg_obj, msg_data = await save_message_to_db(
                    self.user, conv_id, content, msg_type, context_data
                )
                if msg_data:
                    # Gửi tin nhắn tới channel cá nhân của tất cả thành viên trong hội thoại
                    participant_ids = await get_participant_user_ids(conv_id)
                    for pid in participant_ids:
                        await self.channel_layer.group_send(
                            f"chat_user_{pid}",
                            {
                                "type": "chat_message_broadcast",
                                "message": msg_data,
                                "conversation_id": conv_id,
                            }
                        )
                    # Và gửi tới phòng hội thoại nếu có client đang join
                    await self.channel_layer.group_send(
                        f"chat_conversation_{conv_id}",
                        {
                            "type": "chat_message_broadcast",
                            "message": msg_data,
                            "conversation_id": conv_id,
                        }
                    )

        elif action == "typing" and conv_id:
            is_typing = bool(data.get("is_typing", True))
            if await is_participant(self.user.id, conv_id):
                participant_ids = await get_participant_user_ids(conv_id)
                for pid in participant_ids:
                    if pid != self.user.id:
                        await self.channel_layer.group_send(
                            f"chat_user_{pid}",
                            {
                                "type": "typing_broadcast",
                                "conversation_id": conv_id,
                                "user_id": self.user.id,
                                "user_name": self.user.full_name or self.user.username,
                                "is_typing": is_typing,
                            }
                        )

        elif action == "read_messages" and conv_id:
            last_msg_id = data.get("last_message_id")
            if last_msg_id and await update_read_receipt(self.user, conv_id, last_msg_id):
                participant_ids = await get_participant_user_ids(conv_id)
                for pid in participant_ids:
                    if pid != self.user.id:
                        await self.channel_layer.group_send(
                            f"chat_user_{pid}",
                            {
                                "type": "read_receipt_broadcast",
                                "conversation_id": conv_id,
                                "user_id": self.user.id,
                                "last_read_message_id": last_msg_id,
                            }
                        )

    # ── Channel layer handlers ────────────────────────────────────────────────
    async def chat_message_broadcast(self, event):
        await self.send(text_data=json.dumps({
            "type": "new_message",
            "conversation_id": event["conversation_id"],
            "message": event["message"],
        }))

    async def new_message_notification(self, event):
        await self.send(text_data=json.dumps({
            "type": "unread_notification",
            "conversation_id": event["conversation_id"],
            "message": event["message"],
        }))

    async def typing_broadcast(self, event):
        # Không gửi lại cho chính người đang gõ
        if event["user_id"] != self.user.id:
            await self.send(text_data=json.dumps({
                "type": "user_typing",
                "conversation_id": event["conversation_id"],
                "user_id": event["user_id"],
                "user_name": event["user_name"],
                "is_typing": event["is_typing"],
            }))

    async def read_receipt_broadcast(self, event):
        await self.send(text_data=json.dumps({
            "type": "messages_read",
            "conversation_id": event["conversation_id"],
            "user_id": event["user_id"],
            "last_read_message_id": event["last_read_message_id"],
        }))

    async def presence_status(self, event):
        # Trạng thái online/offline của đồng nghiệp
        if event["user_id"] != self.user.id:
            await self.send(text_data=json.dumps({
                "type": "presence_update",
                "user_id": event["user_id"],
                "status": event["status"],
            }))

    async def conversation_deleted_broadcast(self, event):
        await self.send(text_data=json.dumps({
            "type": "conversation_deleted",
            "conversation_id": event["conversation_id"],
        }))

    async def conversation_cleared_broadcast(self, event):
        await self.send(text_data=json.dumps({
            "type": "conversation_cleared",
            "conversation_id": event["conversation_id"],
        }))

    async def message_recalled_broadcast(self, event):
        await self.send(text_data=json.dumps({
            "type": "message_recalled",
            "conversation_id": event["conversation_id"],
            "message_id": event["message_id"],
            "message": event["message"],
        }))

