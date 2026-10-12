"""
JWT Token Authentication Middleware cho Django Channels WebSocket.
Cho phép xác thực qua query param: ws://.../?token=<access_token>
"""
import logging
from urllib.parse import parse_qs

from channels.db import database_sync_to_async
from channels.middleware import BaseMiddleware
from django.contrib.auth import get_user_model
from django.contrib.auth.models import AnonymousUser

logger = logging.getLogger(__name__)

User = get_user_model()


@database_sync_to_async
def get_user_from_token(token_key: str):
    """Xác thực JWT token và trả về User, hoặc AnonymousUser nếu không hợp lệ."""
    try:
        from rest_framework_simplejwt.tokens import AccessToken
        from rest_framework_simplejwt.exceptions import InvalidToken, TokenError

        token = AccessToken(token_key)
        user_id = token["user_id"]
        return User.objects.get(id=user_id, is_active=True)
    except Exception as exc:
        logger.debug("WebSocket JWT auth failed: %s", exc)
        return AnonymousUser()


class JWTAuthMiddleware(BaseMiddleware):
    """
    Middleware xác thực JWT cho WebSocket connections.
    Token được truyền qua query string: ?token=<access_token>
    """

    async def __call__(self, scope, receive, send):
        # Bỏ qua nếu user đã được xác thực từ middleware ngoài
        if "user" in scope and hasattr(scope["user"], "is_authenticated") and scope["user"].is_authenticated:
            return await super().__call__(scope, receive, send)

        # Lấy token từ query string
        query_string = scope.get("query_string", b"").decode()
        params = parse_qs(query_string)
        token_list = params.get("token", [])

        if token_list:
            scope["user"] = await get_user_from_token(token_list[0])
        else:
            scope["user"] = AnonymousUser()

        return await super().__call__(scope, receive, send)


def JWTAuthMiddlewareStack(inner):
    """Wrapper tiện lợi kết hợp JWTAuthMiddleware."""
    return JWTAuthMiddleware(inner)
