import logging
from urllib.parse import parse_qs

from channels.db import database_sync_to_async
from channels.middleware import BaseMiddleware
from django.contrib.auth.models import AnonymousUser
from rest_framework.exceptions import AuthenticationFailed
from django.contrib.auth.hashers import check_password

from .models import LiveDevice

logger = logging.getLogger(__name__)

class AnonymousDevice:
    @property
    def is_authenticated(self):
        return False
    
    @property
    def id(self):
        return None

@database_sync_to_async
def get_device_from_token(token: str):
    """
    Xác thực Device Token.
    Token format expected: ldt_<device_id_hex>_<secret>
    """
    token_parts = token.split('_', 2)
    if len(token_parts) != 3 or token_parts[0] != 'ldt':
        return AnonymousDevice()

    device_id_hex = token_parts[1]
    
    try:
        device = LiveDevice.objects.get(id=device_id_hex)
    except (LiveDevice.DoesNotExist, ValueError):
        return AnonymousDevice()

    if not device.is_active:
        return AnonymousDevice()
        
    if not device.company.is_active:
        return AnonymousDevice()

    if not check_password(token, device.token_hash):
        return AnonymousDevice()

    # Thêm cờ để nhận diện đây là một "authenticated device"
    device.is_authenticated = True
    return device


class DeviceAuthMiddleware(BaseMiddleware):
    """
    Middleware xác thực Device cho WebSocket connections.
    Preferred: Authorization: Device ldt_<id>_<secret>
    Fallback: ?device_token=ldt_<id>_<secret>
    """

    async def __call__(self, scope, receive, send):
        token = None
        
        # 1. Preferred: Lấy token từ Authorization header
        headers = dict(scope.get("headers", []))
        if b"authorization" in headers:
            auth_header = headers[b"authorization"].decode()
            parts = auth_header.split()
            if len(parts) == 2 and parts[0] == "Device":
                token = parts[1]

        # 2. Fallback: Lấy token từ query string
        if not token:
            query_string = scope.get("query_string", b"").decode()
            params = parse_qs(query_string)
            token_list = params.get("device_token", [])
            if token_list:
                token = token_list[0]

        if token:
            scope["device"] = await get_device_from_token(token)
        else:
            scope["device"] = AnonymousDevice()

        return await super().__call__(scope, receive, send)

def DeviceAuthMiddlewareStack(inner):
    return DeviceAuthMiddleware(inner)
