import os
import django
os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'core.settings')
django.setup()

from django.contrib.auth import get_user_model
from users.models import Company
from live_sessions.models import LiveSession, LiveDevice
from inventory.models import Product
from ai_agents.models import AiAgent
from rest_framework.authtoken.models import Token
import uuid

User = get_user_model()

# Create Company
company, _ = Company.objects.get_or_create(name="Test Company", defaults={"tax_code": "123"})
# Create User
user, _ = User.objects.get_or_create(username="test_live_admin", defaults={"email": "test@fuji.com", "is_superuser": True, "is_staff": True})
user.set_password("123")
if not user.company:
    user.company = company
user.save()

# Get or create token
token, _ = Token.objects.get_or_create(user=user)

# Create Product
product, _ = Product.objects.get_or_create(company=company, name="Test Product", sku="TEST01", defaults={"price": 100000})

# Create AiAgent
ai_agent, _ = AiAgent.objects.get_or_create(company=company, name="Test Agent")

# Create LiveDevice
device, _ = LiveDevice.objects.get_or_create(company=company, name="Local Test PC")

# Create LiveSession
session = LiveSession.objects.create(
    company=company,
    device=device,
    product=product,
    ai_agent=ai_agent,
    status="draft",
    platform="shopee",
    shopee_connection_mode="manual_rtmp",
    stream_url="rtmp://host.docker.internal:1935/live",
    stream_key="test_stream",
    external_session_id="local_shopee_test"
)

print(f"WS_URL: ws://localhost:8000/ws/live/device/{session.id}/")
print(f"TOKEN: {token.key}")
print(f"SESSION_ID: {session.id}")
