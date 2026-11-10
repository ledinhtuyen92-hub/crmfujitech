from decimal import Decimal
from rest_framework.test import APITestCase
from users.models import Company, User, Role
from crm.models import Customer
from orders.models import Order, OrderItem
from orders.serializers import OrderSerializer, OrderItemSerializer

class OrderItemSymbolUpdateTests(APITestCase):
    def setUp(self):
        self.company = Company.objects.create(name="Test Co", tax_code="123456")
        self.user = User.objects.create_user(
            username="admin_test",
            email="admin@test.com",
            password="password123",
            company=self.company,
            is_company_admin=True,
        )
        self.client.force_authenticate(self.user)
        self.customer = Customer.objects.create(
            company=self.company,
            name="Nguyen Van Dan",
            phone="0985416586",
        )

    def test_order_item_symbol_create_and_update(self):
        # 1. Create order with symbol 'D12'
        order = Order.objects.create(
            company=self.company,
            customer=self.customer,
            order_number="FT-DH-TEST-1",
            created_by=self.user,
            subtotal=Decimal("4600000"),
            total_amount=Decimal("4600000"),
        )
        item = OrderItem.objects.create(
            order=order,
            product_name="Cua Composite cao cap TP",
            unit_price=Decimal("4600000"),
            quantity=1,
            line_total=Decimal("4600000"),
            custom_data={"symbol": "D12", "unit": "cái"},
        )

        # Check representation has symbol
        ser = OrderItemSerializer(item)
        self.assertEqual(ser.data["symbol"], "D12")

        # 2. Update order with new symbol 'D15'
        update_data = {
            "items": [
                {
                    "product_name": "Cua Composite cao cap TP",
                    "unit_price": 4600000,
                    "quantity": 1,
                    "symbol": "D15",
                    "custom_data": {"symbol": "D15", "unit": "cái"},
                }
            ]
        }
        order_ser = OrderSerializer(instance=order, data=update_data, partial=True)
        self.assertTrue(order_ser.is_valid(), order_ser.errors)
        order_ser.save()

        # Reload items
        order.refresh_from_db()
        items = list(order.items.all())
        self.assertEqual(len(items), 1)
        self.assertEqual(items[0].custom_data.get("symbol"), "D15")

        # Representation check
        fresh_ser = OrderSerializer(order)
        self.assertEqual(fresh_ser.data["items"][0]["symbol"], "D15")

    def test_order_item_symbol_root_precedence(self):
        # Test that passing 'symbol' at root of item payload overrides stale custom_data['symbol']
        order = Order.objects.create(
            company=self.company,
            customer=self.customer,
            order_number="FT-DH-TEST-2",
            created_by=self.user,
        )
        update_data = {
            "items": [
                {
                    "product_name": "Test Item",
                    "unit_price": 100000,
                    "quantity": 1,
                    "symbol": "D15",
                    "custom_data": {"symbol": "D12"}, # stale symbol in custom_data
                }
            ]
        }
        order_ser = OrderSerializer(instance=order, data=update_data, partial=True)
        self.assertTrue(order_ser.is_valid(), order_ser.errors)
        order_ser.save()

        order.refresh_from_db()
        items = list(order.items.all())
        self.assertEqual(items[0].custom_data.get("symbol"), "D15")

    def test_order_item_clear_symbol(self):
        # Test clearing symbol to empty string
        order = Order.objects.create(
            company=self.company,
            customer=self.customer,
            order_number="FT-DH-TEST-3",
            created_by=self.user,
        )
        OrderItem.objects.create(
            order=order,
            product_name="Test Item",
            unit_price=Decimal("100000"),
            quantity=1,
            line_total=Decimal("100000"),
            custom_data={"symbol": "D12"},
        )
        update_data = {
            "items": [
                {
                    "product_name": "Test Item",
                    "unit_price": 100000,
                    "quantity": 1,
                    "symbol": "",
                    "custom_data": {"symbol": ""},
                }
            ]
        }
        order_ser = OrderSerializer(instance=order, data=update_data, partial=True)
        self.assertTrue(order_ser.is_valid(), order_ser.errors)
        order_ser.save()

        order.refresh_from_db()
        items = list(order.items.all())
        self.assertEqual(items[0].custom_data.get("symbol"), "")

    def test_order_item_unit_and_spec_update(self):
        # Test updating unit and spec
        order = Order.objects.create(
            company=self.company,
            customer=self.customer,
            order_number="FT-DH-TEST-4",
            created_by=self.user,
        )
        item = OrderItem.objects.create(
            order=order,
            product_name="Cua Go",
            unit_price=Decimal("1000000"),
            quantity=2,
            line_total=Decimal("2000000"),
            spec="He 55",
            custom_data={"unit": "cái", "symbol": "D1"},
        )
        # Check initial representation
        ser = OrderItemSerializer(item)
        self.assertEqual(ser.data["unit"], "cái")
        self.assertEqual(ser.data["spec"], "He 55")

        # Update unit to 'bộ' and spec to 'He 93'
        update_data = {
            "items": [
                {
                    "product_name": "Cua Go",
                    "unit_price": 1000000,
                    "quantity": 2,
                    "unit": "bộ",
                    "spec": "He 93",
                    "symbol": "D1",
                }
            ]
        }
        order_ser = OrderSerializer(instance=order, data=update_data, partial=True)
        self.assertTrue(order_ser.is_valid(), order_ser.errors)
        order_ser.save()

        order.refresh_from_db()
        items = list(order.items.all())
        self.assertEqual(items[0].custom_data.get("unit"), "bộ")
        self.assertEqual(items[0].spec, "He 93")

        fresh_ser = OrderSerializer(order)
        self.assertEqual(fresh_ser.data["items"][0]["unit"], "bộ")
        self.assertEqual(fresh_ser.data["items"][0]["spec"], "He 93")
