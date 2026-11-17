"""
ASGI config for core project — hỗ trợ cả HTTP và WebSocket (Django Channels).
"""
import os

from channels.routing import ProtocolTypeRouter, URLRouter
from django.core.asgi import get_asgi_application

os.environ.setdefault("DJANGO_SETTINGS_MODULE", "core.settings")

# Phải gọi trước khi import bất cứ thứ gì từ Django
django_asgi_app = get_asgi_application()

from notifications.middleware import JWTAuthMiddlewareStack  # noqa: E402
from notifications.routing import websocket_urlpatterns as notif_ws_urlpatterns  # noqa: E402
from chat.routing import websocket_urlpatterns as chat_ws_urlpatterns  # noqa: E402

application = ProtocolTypeRouter({
    "http": django_asgi_app,
    "websocket": JWTAuthMiddlewareStack(
        URLRouter(notif_ws_urlpatterns + chat_ws_urlpatterns)
    ),
})
