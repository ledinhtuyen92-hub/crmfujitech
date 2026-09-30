import json
import uuid
from unittest.mock import patch, MagicMock
from django.test import TestCase
from django.urls import reverse
from users.models import User, Company
from inventory.models import Product
from .models import PlatformAccount, LivePlatformProduct
from rest_framework.test import APIClient
from .platforms.shopee import ShopeeAdapter, ShopeeClient
from .platforms.exceptions import PlatformAuthError, PlatformAPIError, PlatformRateLimitError
from .platforms.security import encrypt_token

class ShopeePlatformTests(TestCase):
    def setUp(self):
        from cryptography.fernet import Fernet
        self.test_key = Fernet.generate_key()
        
        self.patcher = patch('live_sessions.platforms.security.get_encryption_key')
        self.mock_get_key = self.patcher.start()
        self.mock_get_key.return_value = self.test_key
        
        self.company = Company.objects.create(name="Shopee Company", workspace_id=str(uuid.uuid4()), tax_code=str(uuid.uuid4())[:15])
        self.user = User.objects.create(
            username="shopee_user", 
            company=self.company, 
            is_active=True
        )
        self.client = APIClient()
        self.client.force_authenticate(user=self.user)
        
        # Valid account for testing
        self.account = PlatformAccount.objects.create(
            company=self.company,
            platform=LivePlatformProduct.PLATFORM_SHOPEE,
            account_id="12345",
            display_name="Test Shop",
            access_token="mock_access", # The model save will encrypt it
            refresh_token="mock_refresh",
            status="connected"
        )
        
        self.product = Product.objects.create(
            company=self.company,
            name="Test Product",
            sku="TEST-001",
            price=100000,
            is_active=True
        )

    def tearDown(self):
        self.patcher.stop()

    @patch('live_sessions.platforms.shopee.requests.request')
    def test_get_account_success(self, mock_request):
        mock_resp = MagicMock()
        mock_resp.status_code = 200
        mock_resp.json.return_value = {
            "response": {
                "shop_name": "My Mock Shop",
                "region": "VN"
            }
        }
        mock_request.return_value = mock_resp
        
        adapter = ShopeeAdapter(self.company.id)
        account_info = adapter.get_account()
        
        self.assertEqual(account_info["external_shop_id"], "12345")
        self.assertEqual(account_info["name"], "My Mock Shop")
        self.assertEqual(account_info["metadata"]["region"], "VN")

    def test_get_account_no_auth(self):
        self.account.delete()
        
        adapter = ShopeeAdapter(self.company.id)
        with self.assertRaises(PlatformAuthError):
            adapter.get_account()

    @patch('live_sessions.platforms.shopee.requests.request')
    def test_get_products_success(self, mock_request):
        # We need two mock responses: one for list, one for info
        list_resp = MagicMock()
        list_resp.status_code = 200
        list_resp.json.return_value = {
            "response": {
                "item": [
                    {"item_id": 9991},
                    {"item_id": 9992}
                ]
            }
        }
        
        info_resp = MagicMock()
        info_resp.status_code = 200
        info_resp.json.return_value = {
            "response": {
                "item_list": [
                    {
                        "item_id": 9991,
                        "item_name": "Shopee Item 1",
                        "item_status": "NORMAL",
                        "price_info": [{"original_price": 50000, "currency": "VND"}],
                        "stock_info": [{"normal_stock": 10}],
                        "item_sku": "SHP-01"
                    },
                    {
                        "item_id": 9992,
                        "item_name": "Shopee Item 2",
                        "item_status": "NORMAL",
                        "price_info": [{"original_price": 20000, "currency": "VND"}],
                        "stock_info": [{"normal_stock": 5}],
                        "item_sku": "SHP-02"
                    }
                ]
            }
        }
        
        mock_request.side_effect = [list_resp, info_resp]
        
        adapter = ShopeeAdapter(self.company.id)
        products = adapter.get_products()
        
        self.assertEqual(len(products), 2)
        self.assertEqual(products[0]["external_product_id"], "9991")
        self.assertEqual(products[0]["name"], "Shopee Item 1")
        self.assertEqual(products[0]["price"], 50000)
        self.assertEqual(products[0]["stock"], 10)

    @patch('live_sessions.platforms.shopee.requests.request')
    def test_api_rate_limit(self, mock_request):
        mock_resp = MagicMock()
        mock_resp.status_code = 429
        mock_request.return_value = mock_resp
        
        adapter = ShopeeAdapter(self.company.id)
        with self.assertRaises(PlatformRateLimitError):
            adapter.get_account()

    @patch('live_sessions.platforms.shopee.ShopeeAdapter.get_products')
    def test_product_list_view(self, mock_get_products):
        mock_get_products.return_value = [
            {
                "external_product_id": "9991",
                "name": "Shopee Item 1",
                "price": 50000,
                "stock": 10
            }
        ]
        
        url = reverse('shopee-products')
        response = self.client.get(url)
        
        self.assertEqual(response.status_code, 200)
        self.assertEqual(len(response.data), 1)
        self.assertEqual(response.data[0]["name"], "Shopee Item 1")

    def test_product_mapping_view(self):
        url = reverse('shopee-mapping')
        
        # Valid mapping
        data = {
            "fujitech_product_id": self.product.id,
            "shopee_item_id": "9991"
        }
        
        response = self.client.post(url, data, format='json')
        self.assertEqual(response.status_code, 200)
        self.assertTrue(response.data["created"])
        
        # Check DB
        mapping = LivePlatformProduct.objects.get(
            company=self.company,
            platform_product_id="9991"
        )
        self.assertEqual(mapping.product, self.product)
        self.assertEqual(mapping.platform, LivePlatformProduct.PLATFORM_SHOPEE)
        
        # Test cross-company mapping prevention
        import uuid
        other_company = Company.objects.create(name="Other Co", tax_code=str(uuid.uuid4())[:15], workspace_id=str(uuid.uuid4()))
        other_product = Product.objects.create(
            company=other_company,
            name="Other Product",
            sku="OTH-001",
            price=10000
        )
        
        bad_data = {
            "fujitech_product_id": other_product.id,
            "shopee_item_id": "9992"
        }
        
        bad_response = self.client.post(url, bad_data, format='json')
        self.assertEqual(bad_response.status_code, 404) # get_object_or_404 fails
