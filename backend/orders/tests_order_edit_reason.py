import json
from decimal import Decimal
from django.contrib.auth import get_user_model
from django.contrib.contenttypes.models import ContentType
from rest_framework.test import APITestCase
from rest_framework import status

from users.models import Company, Role, Permission
from crm.models import Customer
from orders.models import Order, OrderItem
from approvals.models import ApprovalRequest

User = get_user_model()


class OrderEditReasonTestCase(APITestCase):
    def setUp(self):
        self.company = Company.objects.create(name="Test Company", workspace_id="TESTCO")

        # Permissions
        self.perm_orders_view = Permission.objects.create(code="orders.view", name="View orders", module="orders")
        self.perm_orders_edit = Permission.objects.create(code="orders.edit", name="Edit orders", module="orders")
        self.perm_orders_req_appr = Permission.objects.create(code="orders.require_approval", name="Require approval", module="orders")

        # Role
        self.role = Role.objects.create(company=self.company, name="Staff")
        self.role.permissions.add(self.perm_orders_view, self.perm_orders_edit, self.perm_orders_req_appr)

        # User
        self.user = User.objects.create_user(
            username="staff_user",
            password="password123",
            company=self.company,
            role=self.role,
            full_name="Nguyễn Văn Nhân Viên"
        )
        self.client.force_authenticate(user=self.user)

        # Customer
        self.customer = Customer.objects.create(company=self.company, name="Khách Hàng Test")

        # Initial Order
        self.order = Order.objects.create(
            company=self.company,
            customer=self.customer,
            created_by=self.user,
            order_number="FT-DH-TEST-REASON",
            status="approved",
            subtotal=Decimal("10000000"),
            total_amount=Decimal("10000000"),
        )
        self.item1 = OrderItem.objects.create(
            order=self.order,
            product_name="Cửa phòng 1",
            unit_price=Decimal("5000000"),
            quantity=2,
            line_total=Decimal("10000000"),
        )

    def test_edit_order_records_reason_and_auto_diff(self):
        # Update order: add 1 item quantity -> total becomes 15,000,000
        url = f"/api/orders/orders/{self.order.id}/"
        payload = {
            "customer": self.customer.id,
            "status": "approved", # user submits as approved, but require_approval will put to pending
            "subtotal": 15000000,
            "total_amount": 15000000,
            "edit_reason": "Khách hàng yêu cầu đặt thêm 1 bộ cửa phụ",
            "items": [
                {
                    "product": None,
                    "product_name": "Cửa phòng 1",
                    "unit_price": 5000000,
                    "quantity": 3,
                    "line_total": 15000000,
                }
            ]
        }

        response = self.client.patch(url, data=json.dumps(payload), content_type="application/json")
        self.assertEqual(response.status_code, status.HTTP_200_OK, response.data)

        self.order.refresh_from_db()
        # Status should revert to pending
        self.assertEqual(self.order.status, "pending")

        # Check ApprovalRequest created
        ct = ContentType.objects.get_for_model(self.order)
        req = ApprovalRequest.objects.filter(content_type=ct, object_id=self.order.id, status=ApprovalRequest.STATUS_PENDING).first()
        self.assertIsNotNone(req)
        self.assertIn("Khách hàng yêu cầu đặt thêm 1 bộ cửa phụ", req.description)
        self.assertIn("10,000,000", req.description)
        self.assertIn("15,000,000", req.description)
        self.assertIn("+5,000,000", req.description)

        # Check custom_data edit_history
        self.assertIn("edit_history", self.order.custom_data)
        history = self.order.custom_data["edit_history"]
        self.assertEqual(len(history), 1)
        entry = history[0]
        self.assertEqual(entry["reason"], "Khách hàng yêu cầu đặt thêm 1 bộ cửa phụ")
        self.assertEqual(entry["user_name"], "Nguyễn Văn Nhân Viên")
        self.assertEqual(entry["old_total"], 10000000.0)
        self.assertEqual(entry["new_total"], 15000000.0)
        self.assertEqual(entry["diff_amount"], 5000000.0)
        self.assertEqual(entry["old_qty"], 2)
        self.assertEqual(entry["new_qty"], 3)
