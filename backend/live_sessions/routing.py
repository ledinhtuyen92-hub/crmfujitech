from django.urls import re_path

from . import consumers
from .middleware import DeviceAuthMiddlewareStack

websocket_urlpatterns = [
    re_path(r"^ws/live_sessions/(?P<session_id>[0-9a-f-]+)/device/$", DeviceAuthMiddlewareStack(consumers.DeviceAgentConsumer.as_asgi())),
]
