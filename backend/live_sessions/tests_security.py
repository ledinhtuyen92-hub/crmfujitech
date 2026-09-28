import os
import importlib
from django.test import TestCase
from django.conf import settings
from unittest.mock import patch
from users.models import Company
from .models import PlatformAccount, LivePlatformProduct
from .platforms.security import encrypt_token, decrypt_token, get_encryption_key
from cryptography.fernet import Fernet

class SecurityTests(TestCase):
    def setUp(self):
        # We need a valid key for testing since we rely on it
        self.test_key = Fernet.generate_key()
        self.company = Company.objects.create(name="Sec Company")

    @patch('live_sessions.platforms.security.get_encryption_key')
    def test_encrypt_decrypt_token(self, mock_get_key):
        mock_get_key.return_value = self.test_key
        
        plaintext = "my_super_secret_token"
        ciphertext = encrypt_token(plaintext)
        
        self.assertNotEqual(plaintext, ciphertext)
        self.assertTrue(ciphertext.startswith('gAAAAA'))
        
        decrypted = decrypt_token(ciphertext)
        self.assertEqual(decrypted, plaintext)

    @patch('live_sessions.platforms.security.get_encryption_key')
    def test_platform_account_save_encrypts(self, mock_get_key):
        mock_get_key.return_value = self.test_key
        
        account = PlatformAccount.objects.create(
            company=self.company,
            platform=LivePlatformProduct.PLATFORM_SHOPEE,
            account_id="shopee_sec",
            display_name="Shopee Sec",
            access_token="plain_access",
            refresh_token="plain_refresh"
        )
        
        # Check DB values directly via raw SQL or just reading the attribute
        # Since save() modifies the object in memory
        self.assertNotEqual(account.access_token, "plain_access")
        self.assertTrue(account.access_token.startswith('gAAAAA'))
        
        # Test decryption methods
        self.assertEqual(account.get_decrypted_access_token(), "plain_access")
        self.assertEqual(account.get_decrypted_refresh_token(), "plain_refresh")
        
        # Test double save (should not double encrypt)
        cipher_before = account.access_token
        account.save()
        self.assertEqual(account.access_token, cipher_before)

    @patch('live_sessions.platforms.security.get_encryption_key')
    def test_decrypt_with_wrong_key(self, mock_get_key):
        mock_get_key.return_value = self.test_key
        ciphertext = encrypt_token("secret")
        
        # Change key
        wrong_key = Fernet.generate_key()
        mock_get_key.return_value = wrong_key
        
        with self.assertRaises(ValueError) as context:
            decrypt_token(ciphertext)
        
        self.assertIn("Invalid encryption token or wrong encryption key", str(context.exception))

    def test_missing_key_fails_fast(self):
        # By default, tests don't have FUJITECH_PLATFORM_CREDENTIAL_KEY set in env 
        # and settings.PLATFORM_CREDENTIAL_KEY is probably None unless loaded from .env
        with patch('live_sessions.platforms.security.getattr') as mock_getattr, \
             patch('os.environ.get') as mock_env_get:
            
            mock_getattr.return_value = None
            mock_env_get.return_value = None
            
            with self.assertRaises(RuntimeError) as context:
                get_encryption_key()
            
            self.assertIn("Missing FUJITECH_PLATFORM_CREDENTIAL_KEY", str(context.exception))
