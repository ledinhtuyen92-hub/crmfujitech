from decimal import Decimal
from django.test import TestCase
from rest_framework import status
from rest_framework.test import APIClient

from users.models import Company, User, Role, Permission, CompanySettings
from crm.models import Customer
from inventory.models import Product, ProductCategory, Warehouse, StockLevel, InventoryTransaction
from orders.models import Order, OrderItem
from core.numbering import derive_code_from_order


class OrderExportLockAndReversalTests(TestCase):
    def setUp(self):
        self.client = APIClient()
        self.company = Company.objects.create(name="Fujitech Test Corp", is_active=True)
        self.settings = CompanySettings.objects.create(
            company=self.company,
            order_prefix="FT",
            code_include_date=False,
        )
        
        # Tạo role với các quyền cần thiết
        self.role = Role.objects.create(company=self.company, name="Admin Kho & Đơn")
        for perm_code in [
            "orders.view", "orders.create", "orders.edit", "orders.approve",
            "inventory.view", "inventory.approve_export", "inventory.delete_history",
        ]:
            perm, _ = Permission.objects.get_or_create(code=perm_code, defaults={"name": perm_code, "module": "orders"})
            self.role.permissions.add(perm)

        self.user = User.objects.create_user(
            username="admin_test",
            email="admin@fujitech.test",
            password="Password123!",
            company=self.company,
            role=self.role,
            is_company_admin=True,
        )
        self.client.force_authenticate(self.user)

        self.customer = Customer.objects.create(company=self.company, name="Khách hàng A", phone="0912345678")
        self.category = ProductCategory.objects.create(company=self.company, name="Nhôm Kính", is_inventory_tracked=True)
        self.product = Product.objects.create(
            company=self.company,
            category=self.category,
            sku="SP-TEST-01",
            name="Cửa nhôm kính",
            price=Decimal("1000000"),
            unit="bộ",
        )
        self.warehouse = Warehouse.objects.create(company=self.company, name="Kho Chính")
        self.stock = StockLevel.objects.create(
            product=self.product,
            warehouse=self.warehouse,
            quantity=50
        )

        # Tạo đơn hàng
        self.order = Order.objects.create(
            company=self.company,
            customer=self.customer,
            order_number="FT-DH-999",
            status=Order.STATUS_APPROVED,
            delivery_address="Hà Nội",
            created_by=self.user,
        )
        self.item = OrderItem.objects.create(
            order=self.order,
            product=self.product,
            product_name=self.product.name,
            quantity=5,
            unit_price=Decimal("1000000"),
            line_total=Decimal("5000000"),
        )

    def test_export_lock_and_cancellation_workflow(self):
        # 1. Tạo lệnh xuất kho và duyệt hoàn thành
        txn_code = derive_code_from_order(self.order.order_number, self.company, "export")
        self.assertEqual(txn_code, "FT-EXP-999")

        txn = InventoryTransaction.objects.create(
            company=self.company,
            reference_order=self.order,
            transaction_code=txn_code,
            type=InventoryTransaction.TYPE_EXPORT,
            status=InventoryTransaction.STATUS_PENDING,
            product=self.product,
            quantity=5,
            warehouse=self.warehouse,
            created_by=self.user,
        )

        # Duyệt xuất kho -> trừ tồn kho
        res_approve = self.client.post(f"/api/inventory/transactions/{txn.id}/approve/", {"warehouse_id": self.warehouse.id})
        self.assertEqual(res_approve.status_code, status.HTTP_200_OK)
        
        self.stock.refresh_from_db()
        self.assertEqual(self.stock.quantity, 45) # 50 - 5 = 45

        # 2. Thử sửa đơn hàng (thay đổi số lượng từ 5 lên 10) -> BỊ CHẶN
        patch_payload = {
            "items": [
                {
                    "product": self.product.id,
                    "product_name": self.product.name,
                    "quantity": 10,
                    "unit_price": 1000000,
                    "line_total": 10000000,
                }
            ]
        }
        res_patch_fail = self.client.patch(f"/api/orders/orders/{self.order.id}/", patch_payload, format="json")
        self.assertEqual(res_patch_fail.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertIn("items", res_patch_fail.data)
        self.assertIn("FT-EXP-999", str(res_patch_fail.data["items"]))

        # Sửa thông tin phi hàng hóa (địa chỉ giao hàng) -> THÀNH CÔNG
        res_patch_addr = self.client.patch(f"/api/orders/orders/{self.order.id}/", {"delivery_address": "Đà Nẵng"}, format="json")
        self.assertEqual(res_patch_addr.status_code, status.HTTP_200_OK)
        self.order.refresh_from_db()
        self.assertEqual(self.order.delivery_address, "Đà Nẵng")

        # 3. Hủy phiếu xuất kho bằng action cancel-by-code
        res_cancel = self.client.post("/api/inventory/transactions/cancel-by-code/", {
            "code": txn_code,
            "reason": "Hủy phiếu xuất kho để cập nhật lại số lượng hàng"
        })
        self.assertEqual(res_cancel.status_code, status.HTTP_200_OK)

        # Kiểm tra tồn kho ĐÃ ĐƯỢC TỰ ĐỘNG HOÀN TRẢ
        self.stock.refresh_from_db()
        self.assertEqual(self.stock.quantity, 50) # 45 + 5 = 50

        # Kiểm tra trạng thái phiếu xuất kho cũ là 'rejected'
        txn.refresh_from_db()
        self.assertEqual(txn.status, InventoryTransaction.STATUS_REJECTED)

        # 4. Lúc này đơn hàng ĐÃ ĐƯỢC MỞ KHÓA -> Sửa số lượng thành 10 thành công
        res_patch_success = self.client.patch(f"/api/orders/orders/{self.order.id}/", patch_payload, format="json")
        self.assertEqual(res_patch_success.status_code, status.HTTP_200_OK)
        self.order.refresh_from_db()
        self.assertEqual(self.order.items.count(), 1)
        self.assertEqual(self.order.items.first().quantity, 10)

        # 5. Kiểm tra mã xuất kho khi sinh lại: GIỮ NGUYÊN FT-EXP-999
        new_txn_code = derive_code_from_order(self.order.order_number, self.company, "export")
        self.assertEqual(new_txn_code, "FT-EXP-999")

    def test_cancel_export_strictly_requires_role_permission(self):
        """Kiểm tra: Admin/SuperAdmin không có role chứa inventory.approve_export sẽ bị chặn 403."""
        # Tạo phiếu xuất kho hoàn thành
        txn = InventoryTransaction.objects.create(
            company=self.company,
            transaction_code="FT-EXP-888",
            type=InventoryTransaction.TYPE_EXPORT,
            status=InventoryTransaction.STATUS_COMPLETED,
            product=self.product,
            warehouse=self.warehouse,
            quantity=2,
            reference_order=self.order,
        )

        # 1. Tạo user là Company Admin nhưng Role KHÔNG có quyền inventory.approve_export
        role_no_perm = Role.objects.create(company=self.company, name="Admin Không Có Quyền Kho")
        admin_no_perm = User.objects.create_user(
            username="admin_no_perm",
            email="no_perm@fujitech.test",
            password="Password123!",
            company=self.company,
            role=role_no_perm,
            is_company_admin=True,
        )
        self.client.force_authenticate(admin_no_perm)

        res_fail = self.client.post("/api/inventory/transactions/cancel-by-code/", {
            "code": "FT-EXP-888",
            "reason": "Thử hủy nhưng không có quyền role"
        })
        self.assertEqual(res_fail.status_code, status.HTTP_403_FORBIDDEN)
        self.assertIn("Chỉ nhân sự có vai trò được phân quyền", str(res_fail.data.get("detail", "")))

        # 2. Cấp quyền inventory.approve_export vào role -> Hủy THÀNH CÔNG
        perm_approve = Permission.objects.get(code="inventory.approve_export")
        role_no_perm.permissions.add(perm_approve)

        res_ok = self.client.post("/api/inventory/transactions/cancel-by-code/", {
            "code": "FT-EXP-888",
            "reason": "Hủy hợp lệ sau khi được cấp quyền vai trò"
        })
        self.assertEqual(res_ok.status_code, status.HTTP_200_OK)
        txn.refresh_from_db()
        self.assertEqual(txn.status, InventoryTransaction.STATUS_REJECTED)
