from datetime import timedelta
from django.utils import timezone
from rest_framework import status
from rest_framework.test import APITestCase
from users.models import Company, Department, Role, User
from .models import Conversation, ConversationParticipant, ChatMessage, ChatCompanyConfig
from .tasks import cleanup_old_messages


class ChatSystemTests(APITestCase):
    def setUp(self):
        self.company = Company.objects.create(name="Fujitech Test", tax_code="0123456789")
        self.dept = Department.objects.create(company=self.company, name="Kinh doanh")
        self.role = Role.objects.create(company=self.company, name="Nhân viên kinh doanh")

        self.user_a = User.objects.create_user(
            username="user_a",
            email="user_a@test.com",
            password="password123",
            company=self.company,
            department=self.dept,
            role=self.role,
            full_name="Nguyễn Văn A"
        )
        self.user_b = User.objects.create_user(
            username="user_b",
            email="user_b@test.com",
            password="password123",
            company=self.company,
            department=self.dept,
            role=self.role,
            full_name="Trần Thị B"
        )
        self.user_c = User.objects.create_user(
            username="user_c",
            email="user_c@test.com",
            password="password123",
            company=self.company,
            department=self.dept,
            role=self.role,
            full_name="Lê Văn C"
        )

        self.client.force_authenticate(user=self.user_a)

    def test_create_direct_conversation_and_reuse(self):
        """Tạo hội thoại 1-1 và đảm bảo tái sử dụng, không trùng lặp."""
        res1 = self.client.post("/api/chat/conversations/", {
            "type": "direct",
            "partner_id": self.user_b.id,
        })
        self.assertEqual(res1.status_code, status.HTTP_201_CREATED)
        conv_id = res1.data["id"]

        # Gọi lại lần 2 từ user A
        res2 = self.client.post("/api/chat/conversations/", {
            "type": "direct",
            "partner_id": self.user_b.id,
        })
        self.assertEqual(res2.status_code, status.HTTP_200_OK)
        self.assertEqual(res2.data["id"], conv_id)

        # User B gọi lại với user A
        self.client.force_authenticate(user=self.user_b)
        res3 = self.client.post("/api/chat/conversations/", {
            "type": "direct",
            "partner_id": self.user_a.id,
        })
        self.assertEqual(res3.status_code, status.HTTP_200_OK)
        self.assertEqual(res3.data["id"], conv_id)

    def test_send_message_and_unread_tracking(self):
        """Gửi tin nhắn, kiểm tra số tin chưa đọc và đánh dấu đã đọc."""
        # Tạo hội thoại 1-1
        conv_res = self.client.post("/api/chat/conversations/", {
            "type": "direct",
            "partner_id": self.user_b.id,
        })
        conv_id = conv_res.data["id"]

        # User A gửi 2 tin nhắn (1 tin text, 1 tin đính kèm chứng từ CRM)
        send_res1 = self.client.post(f"/api/chat/conversations/{conv_id}/send/", {
            "content": "Chào em, check đơn hàng giúp anh!",
            "message_type": "text",
        })
        self.assertEqual(send_res1.status_code, status.HTTP_201_CREATED)

        send_res2 = self.client.post(f"/api/chat/conversations/{conv_id}/send/", {
            "content": "Chi tiết đơn hàng đây:",
            "message_type": "context_doc",
            "context_data": {
                "doc_type": "order",
                "doc_id": 99,
                "doc_code": "FT-DH-747",
                "title": "Đơn hàng Anh Song",
                "extra": "61,770,000 đ",
            }
        }, format="json")
        self.assertEqual(send_res2.status_code, status.HTTP_201_CREATED)

        # User A gửi tin đính kèm chứng từ qua multipart/form-data với context_data là chuỗi JSON
        import json
        send_res3 = self.client.post(f"/api/chat/conversations/{conv_id}/send/", {
            "content": "[Chứng từ CRM] Đơn hàng: FT-DH-747",
            "message_type": "context_doc",
            "context_data": json.dumps({
                "doc_type": "order",
                "doc_id": 99,
                "doc_code": "FT-DH-747",
                "title": "Đơn hàng Anh Song",
                "extra": "61,770,000 đ",
            })
        }, format="multipart")
        self.assertEqual(send_res3.status_code, status.HTTP_201_CREATED)
        self.assertIsInstance(send_res3.data["context_data"], dict)
        self.assertEqual(send_res3.data["context_data"]["doc_code"], "FT-DH-747")

        # Chuyển sang user B kiểm tra danh sách hội thoại
        self.client.force_authenticate(user=self.user_b)
        list_res = self.client.get("/api/chat/conversations/")
        self.assertEqual(list_res.status_code, status.HTTP_200_OK)
        items = list_res.data.get("results", list_res.data) if isinstance(list_res.data, dict) else list_res.data
        conv_data = next((c for c in items if c["id"] == conv_id), None)
        self.assertIsNotNone(conv_data)
        self.assertEqual(conv_data["unread_count"], 3)

        # User B đánh dấu đã đọc
        read_res = self.client.post(f"/api/chat/conversations/{conv_id}/read/")
        self.assertEqual(read_res.status_code, status.HTTP_200_OK)

        # Kiểm tra lại số tin chưa đọc về 0
        list_res2 = self.client.get("/api/chat/conversations/")
        items2 = list_res2.data.get("results", list_res2.data) if isinstance(list_res2.data, dict) else list_res2.data
        conv_data2 = next((c for c in items2 if c["id"] == conv_id), None)
        self.assertEqual(conv_data2["unread_count"], 0)

    def test_create_group_conversation(self):
        """Tạo nhóm chat nhiều thành viên."""
        res = self.client.post("/api/chat/conversations/", {
            "type": "group",
            "title": "Nhóm Dự Án Cửa Nhôm",
            "member_ids": [self.user_b.id, self.user_c.id],
        }, format="json")
        self.assertEqual(res.status_code, status.HTTP_201_CREATED)
        self.assertEqual(res.data["title"], "Nhóm Dự Án Cửa Nhôm")
        self.assertEqual(len(res.data["participants"]), 3)

    def test_cleanup_old_messages_task(self):
        """Kiểm tra tác vụ Celery Beat tự động dọn dẹp tin nhắn cũ theo retention_days."""
        config, _ = ChatCompanyConfig.objects.get_or_create(
            company=self.company,
            defaults={"retention_days": 30}
        )
        config.retention_days = 30
        config.save()

        conv = Conversation.objects.create(company=self.company, type=Conversation.TYPE_DIRECT, created_by=self.user_a)

        # Tạo 1 tin nhắn cũ hơn 40 ngày (vượt quá 30 ngày)
        old_msg = ChatMessage.objects.create(
            conversation=conv,
            sender=self.user_a,
            content="Tin nhắn rất cũ cần xóa",
        )
        ChatMessage.objects.filter(id=old_msg.id).update(created_at=timezone.now() - timedelta(days=45))

        # Tạo 1 tin nhắn mới (hôm nay)
        new_msg = ChatMessage.objects.create(
            conversation=conv,
            sender=self.user_a,
            content="Tin nhắn mới hôm nay",
        )

        # Chạy tác vụ dọn dẹp
        result = cleanup_old_messages()
        self.assertGreaterEqual(result["deleted_messages"], 1)

        # Xác nhận tin cũ đã bị xóa, tin mới vẫn còn
        self.assertFalse(ChatMessage.objects.filter(id=old_msg.id).exists())
        self.assertTrue(ChatMessage.objects.filter(id=new_msg.id).exists())

    def test_message_recall(self):
        """Kiểm tra chức năng thu hồi tin nhắn trong vòng 60 phút."""
        conv_res = self.client.post("/api/chat/conversations/", {
            "type": "direct",
            "partner_id": self.user_b.id,
        })
        conv_id = conv_res.data["id"]

        # User A gửi 1 tin nhắn
        send_res = self.client.post(f"/api/chat/conversations/{conv_id}/send/", {
            "content": "Nhầm số tiền đơn hàng rồi, chờ tí!",
            "message_type": "text",
        })
        msg_id = send_res.data["id"]

        # User B thử thu hồi tin của User A -> Bị từ chối 403
        self.client.force_authenticate(user=self.user_b)
        recall_fail = self.client.post(f"/api/chat/conversations/{conv_id}/messages/{msg_id}/recall/")
        self.assertEqual(recall_fail.status_code, status.HTTP_403_FORBIDDEN)

        # Quản trị viên (Superuser / Company Admin) dù tham gia cuộc trò chuyện cũng KHÔNG được phép thu hồi tin nhắn của người khác
        admin_user = User.objects.create_superuser(
            username="admin_super",
            email="admin_super@test.com",
            password="password123",
            company=self.company
        )
        ConversationParticipant.objects.create(conversation_id=conv_id, user=admin_user)
        self.client.force_authenticate(user=admin_user)
        admin_recall_fail = self.client.post(f"/api/chat/conversations/{conv_id}/messages/{msg_id}/recall/")
        self.assertEqual(admin_recall_fail.status_code, status.HTTP_403_FORBIDDEN)

        # User A tự thu hồi tin của chính mình -> Thành công 200
        self.client.force_authenticate(user=self.user_a)
        recall_ok = self.client.post(f"/api/chat/conversations/{conv_id}/messages/{msg_id}/recall/")
        self.assertEqual(recall_ok.status_code, status.HTTP_200_OK)
        self.assertTrue(recall_ok.data["is_recalled"])
        self.assertEqual(recall_ok.data["content"], "Tin nhắn đã được thu hồi")

        # Kiểm tra trong DB
        msg_db = ChatMessage.objects.get(id=msg_id)
        self.assertTrue(msg_db.is_recalled)
        self.assertEqual(msg_db.content, "Tin nhắn đã được thu hồi")

    def test_delete_conversation_for_me_and_mutual_purge(self):
        """
        Kiểm tra xóa ở phía tôi:
        - User A xóa: Ẩn với A, nhưng B vẫn thấy và đọc được 100%.
        - Khi B cũng xóa: Đồng thuận -> Xóa triệt để khỏi database.
        """
        conv_res = self.client.post("/api/chat/conversations/", {
            "type": "direct",
            "partner_id": self.user_b.id,
        })
        conv_id = conv_res.data["id"]

        self.client.post(f"/api/chat/conversations/{conv_id}/send/", {
            "content": "Hợp đồng đã ký xong",
            "message_type": "text",
        })

        # User A bấm xóa cuộc trò chuyện
        del_a = self.client.delete(f"/api/chat/conversations/{conv_id}/")
        self.assertEqual(del_a.status_code, status.HTTP_200_OK)
        self.assertFalse(del_a.data["purged"])

        # Danh sách của User A không còn hiển thị
        list_a = self.client.get("/api/chat/conversations/")
        items_a = list_a.data.get("results", list_a.data) if isinstance(list_a.data, dict) else list_a.data
        self.assertFalse(any(c["id"] == conv_id for c in items_a))

        # Cuộc trò chuyện VẪN TỒN TẠI trong database
        self.assertTrue(Conversation.objects.filter(id=conv_id).exists())

        # Phía User B vẫn thấy cuộc trò chuyện và vẫn đọc được tin nhắn
        self.client.force_authenticate(user=self.user_b)
        list_b = self.client.get("/api/chat/conversations/")
        items_b = list_b.data.get("results", list_b.data) if isinstance(list_b.data, dict) else list_b.data
        self.assertTrue(any(c["id"] == conv_id for c in items_b))

        msgs_b = self.client.get(f"/api/chat/conversations/{conv_id}/messages/")
        self.assertEqual(len(msgs_b.data["results"]), 1)

        # Bây giờ User B cũng bấm xóa -> XÓA TRIỆT ĐỂ KHỎI DATABASE!
        del_b = self.client.delete(f"/api/chat/conversations/{conv_id}/")
        self.assertEqual(del_b.status_code, status.HTTP_200_OK)
        self.assertTrue(del_b.data["purged"])

        # Xác nhận cuộc trò chuyện đã bị xóa triệt để khỏi DB
        self.assertFalse(Conversation.objects.filter(id=conv_id).exists())
