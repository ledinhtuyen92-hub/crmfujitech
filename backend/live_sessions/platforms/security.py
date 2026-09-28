import os
from django.conf import settings
from cryptography.fernet import Fernet, InvalidToken

def get_encryption_key() -> bytes:
    key = getattr(settings, 'PLATFORM_CREDENTIAL_KEY', None)
    if not key:
        key = os.environ.get('FUJITECH_PLATFORM_CREDENTIAL_KEY')
    if not key:
        raise RuntimeError(
            "Missing FUJITECH_PLATFORM_CREDENTIAL_KEY in environment or PLATFORM_CREDENTIAL_KEY in settings. "
            "Credential encryption requires a valid Fernet key."
        )
    # Ensure it's bytes
    if isinstance(key, str):
        key = key.encode('utf-8')
    return key

def encrypt_token(plaintext: str) -> str:
    if not plaintext:
        return plaintext
    key = get_encryption_key()
    f = Fernet(key)
    return f.encrypt(plaintext.encode('utf-8')).decode('utf-8')

def decrypt_token(ciphertext: str) -> str:
    if not ciphertext:
        return ciphertext
    key = get_encryption_key()
    f = Fernet(key)
    try:
        return f.decrypt(ciphertext.encode('utf-8')).decode('utf-8')
    except InvalidToken:
        raise ValueError("Invalid encryption token or wrong encryption key.")
