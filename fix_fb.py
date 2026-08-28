
with open('backend/facebook_integration/services.py', 'r', encoding='utf-8') as f:
    c = f.read()
import re
new_code = '''# -- X? lý Webhook Message t? Meta ----------------------------------------------

import hmac
import hashlib

def verify_facebook_webhook_signature(request_body: bytes, received_signature: str, app_secret: str) -> bool:
    if not received_signature or not app_secret:
        return False
    try:
        expected_mac = hmac.new(app_secret.encode('utf-8'), request_body, hashlib.sha256).hexdigest()
        expected_signature = f'sha256={expected_mac}'
        return hmac.compare_digest(expected_signature, received_signature)
    except Exception as e:
        logger.error(f'Error verifying FB signature: {e}')
        return False

def process_fb_webhook_message(entry: dict):'''
c = re.sub(r'# -- X? lý Webhook Message t? Meta ----------------------------------------------\s+def process_fb_webhook_message\(entry: dict\):', new_code, c)
with open('backend/facebook_integration/services.py', 'w', encoding='utf-8') as f:
    f.write(c)

