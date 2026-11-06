from django.urls import reverse
from rest_framework import status
from rest_framework.test import APITestCase
from unittest.mock import patch
from django.contrib.auth import get_user_model

from users.models import Company
from live_sessions.models import LiveDevice, LiveSession, LivePlatformProduct, LiveSessionProduct, LiveSessionVoucher
from ai_agents.models import AiAgent

User = get_user_model()

@patch('users.permissions.ActionBasedPermission.has_permission', return_value=True)
class Phase1MultiProductTests(APITestCase):
    def setUp(self):
        self.company_a = Company.objects.create(name="Company A", is_active=True, workspace_id="ws_a_live", tax_code="TAX_A_LIVE")
        self.user_a = User.objects.create_user(
            username="seller_a", email="seller_a@test.com", password="password", company=self.company_a
        )
        self.device_a = LiveDevice.objects.create(company=self.company_a, name="Device A", is_active=True)
        self.agent_a = AiAgent.objects.create(company=self.company_a, name="AI Host A")

        self.company_b = Company.objects.create(name="Company B", is_active=True, workspace_id="ws_b_live", tax_code="TAX_B_LIVE")
        self.user_b = User.objects.create_user(
            username="seller_b", email="seller_b@test.com", password="password", company=self.company_b
        )

        self.session_a = LiveSession.objects.create(
            company=self.company_a,
            device=self.device_a,
            ai_agent=self.agent_a,
            platform=LivePlatformProduct.PLATFORM_SHOPEE,
            status=LiveSession.STATUS_READY
        )
        self.client.force_authenticate(user=self.user_a)

    def test_session_creation_without_internal_product(self, mock_permission):
        """Test that LiveSession no longer requires an internal CRM product."""
        from live_sessions.serializers import LiveSessionSerializer
        data = {
            "device": self.device_a.id,
            "ai_agent": self.agent_a.id,
            "platform": LivePlatformProduct.PLATFORM_SHOPEE,
            "session_prompt": "Kịch bản bán hàng Shopee đa sản phẩm"
        }
        serializer = LiveSessionSerializer(data=data, context={'request': type('Req', (), {'user': self.user_a})()})
        self.assertTrue(serializer.is_valid(), serializer.errors)
        instance = serializer.save(company=self.company_a)
        self.assertIsNone(instance.product)
        self.assertIsNone(instance.external_product_link)

    def test_session_product_crud_and_autocompute_index(self, mock_permission):
        """Test creating session products with automatic index computation."""
        # Product 1
        res1 = self.client.post('/api/live_sessions/session-products/', {
            "session": str(self.session_a.id),
            "name": "Nồi chiên không dầu Lock&Lock",
            "platform_item_id": "123456789",
            "original_price": "2500000",
            "live_price": "1490000",
            "stock": 50,
            "selling_points": "Dung tích 5.5L, chống dính cao cấp"
        })
        self.assertEqual(res1.status_code, status.HTTP_201_CREATED)
        self.assertEqual(res1.data['item_index'], 1)
        self.assertEqual(res1.data['name'], "Nồi chiên không dầu Lock&Lock")
        prod1_id = res1.data['id']

        # Product 2 - without specifying item_index, should auto increment to 2
        res2 = self.client.post('/api/live_sessions/session-products/', {
            "session": str(self.session_a.id),
            "name": "Bình giữ nhiệt Elmich",
            "platform_item_id": "987654321",
            "original_price": "450000",
            "live_price": "299000",
            "stock": 100,
        })
        self.assertEqual(res2.status_code, status.HTTP_201_CREATED)
        self.assertEqual(res2.data['item_index'], 2)

        # List products for session
        list_res = self.client.get(f'/api/live_sessions/session-products/?session={self.session_a.id}')
        self.assertEqual(list_res.status_code, status.HTTP_200_OK)
        items = list_res.data.get('results', list_res.data) if isinstance(list_res.data, dict) else list_res.data
        self.assertEqual(len(items), 2)
        self.assertEqual(items[0]['item_index'], 1)
        self.assertEqual(items[1]['item_index'], 2)

    def test_pin_and_mutual_exclusion(self, mock_permission):
        """Test pinning a product and ensuring only 1 product is pinned at a time."""
        prod1 = LiveSessionProduct.objects.create(
            session=self.session_a,
            item_index=1,
            name="Sản phẩm 1",
            live_price=100000
        )
        prod2 = LiveSessionProduct.objects.create(
            session=self.session_a,
            item_index=2,
            name="Sản phẩm 2",
            live_price=200000
        )

        # Pin Product 1
        pin_res1 = self.client.post(f'/api/live_sessions/session-products/{prod1.id}/pin/')
        self.assertEqual(pin_res1.status_code, status.HTTP_200_OK)
        self.assertTrue(pin_res1.data['is_pinned'])
        self.assertIsNotNone(pin_res1.data['pinned_at'])

        prod1.refresh_from_db()
        self.assertTrue(prod1.is_pinned)

        # Pin Product 2 -> Product 1 must be unpinned automatically
        pin_res2 = self.client.post(f'/api/live_sessions/session-products/{prod2.id}/pin/')
        self.assertEqual(pin_res2.status_code, status.HTTP_200_OK)
        self.assertTrue(pin_res2.data['is_pinned'])

        prod1.refresh_from_db()
        prod2.refresh_from_db()
        self.assertFalse(prod1.is_pinned)
        self.assertIsNone(prod1.pinned_at)
        self.assertTrue(prod2.is_pinned)

        # Unpin Product 2
        unpin_res = self.client.post(f'/api/live_sessions/session-products/{prod2.id}/unpin/')
        self.assertEqual(unpin_res.status_code, status.HTTP_200_OK)
        self.assertFalse(unpin_res.data['is_pinned'])
        self.assertIsNone(unpin_res.data['pinned_at'])

        prod2.refresh_from_db()
        self.assertFalse(prod2.is_pinned)

    def test_batch_create_products(self, mock_permission):
        """Test importing batch products into a live session."""
        payload = {
            "session_id": str(self.session_a.id),
            "products": [
                {
                    "name": "Áo thun polo nam",
                    "sku": "POLO-01",
                    "original_price": "300000",
                    "live_price": "189000",
                    "platform_item_id": "11111"
                },
                {
                    "name": "Quần short kaki",
                    "sku": "SHORT-02",
                    "original_price": "250000",
                    "live_price": "159000",
                    "platform_item_id": "22222"
                },
                {
                    "name": "Mũ lưỡi trai phong cách",
                    "sku": "HAT-03",
                    "original_price": "120000",
                    "live_price": "69000",
                    "platform_item_id": "33333"
                }
            ]
        }
        res = self.client.post('/api/live_sessions/session-products/batch_create/', payload, format='json')
        self.assertEqual(res.status_code, status.HTTP_201_CREATED)
        self.assertEqual(len(res.data), 3)
        self.assertEqual(res.data[0]['item_index'], 1)
        self.assertEqual(res.data[1]['item_index'], 2)
        self.assertEqual(res.data[2]['item_index'], 3)
        self.assertEqual(LiveSessionProduct.objects.filter(session=self.session_a).count(), 3)

    def test_voucher_crud_and_pinning(self, mock_permission):
        """Test voucher CRUD and pinning."""
        v1 = LiveSessionVoucher.objects.create(
            session=self.session_a,
            voucher_code="GIAM30K",
            discount_text="Giảm 30K đơn từ 200K",
            min_order_value=200000
        )
        v2 = LiveSessionVoucher.objects.create(
            session=self.session_a,
            voucher_code="FREESHIP50",
            discount_text="Miễn phí ship tối đa 50K"
        )

        # Pin voucher 1
        res_pin = self.client.post(f'/api/live_sessions/session-vouchers/{v1.id}/pin/')
        self.assertEqual(res_pin.status_code, status.HTTP_200_OK)
        v1.refresh_from_db()
        self.assertTrue(v1.is_pinned)

        # Pin voucher 2 -> v1 unpinned
        res_pin2 = self.client.post(f'/api/live_sessions/session-vouchers/{v2.id}/pin/')
        self.assertEqual(res_pin2.status_code, status.HTTP_200_OK)
        v1.refresh_from_db()
        v2.refresh_from_db()
        self.assertFalse(v1.is_pinned)
        self.assertTrue(v2.is_pinned)

    def test_tenant_isolation(self, mock_permission):
        """Test that company B cannot access or modify company A's session products."""
        prod = LiveSessionProduct.objects.create(
            session=self.session_a,
            item_index=1,
            name="Sản phẩm bảo mật của A"
        )

        # Switch to User B
        self.client.force_authenticate(user=self.user_b)

        # Attempt to retrieve
        get_res = self.client.get(f'/api/live_sessions/session-products/{prod.id}/')
        self.assertEqual(get_res.status_code, status.HTTP_404_NOT_FOUND)

        # Attempt to pin
        pin_res = self.client.post(f'/api/live_sessions/session-products/{prod.id}/pin/')
        self.assertEqual(pin_res.status_code, status.HTTP_404_NOT_FOUND)
