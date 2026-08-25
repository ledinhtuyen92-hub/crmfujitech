import os
import django

os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'fujitech.settings')
django.setup()

from users.models import User, CompanySettings
from users.serializers import UserSerializer

u = User.objects.first()
print(f'User custom_info_templates: {u.company.settings.custom_info_templates if hasattr(u.company, "settings") else None}')
