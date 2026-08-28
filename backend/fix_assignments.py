import os
import django

os.environ.setdefault("DJANGO_SETTINGS_MODULE", "core.settings")
django.setup()

from facebook_integration.models import FacebookLead
from zalo_integration.models import SocialLead

c1, c2 = 0, 0
for fb in FacebookLead.objects.filter(customer__isnull=False):
    if fb.assigned_to_id != fb.customer.assigned_to_id:
        fb.assigned_to_id = fb.customer.assigned_to_id
        fb.save(update_fields=['assigned_to', 'updated_at'])
        c1 += 1

for zl in SocialLead.objects.filter(converted_customer__isnull=False):
    if zl.assigned_to_id != zl.converted_customer.assigned_to_id:
        zl.assigned_to_id = zl.converted_customer.assigned_to_id
        zl.save(update_fields=['assigned_to', 'updated_at'])
        c2 += 1

print(f"Updated {c1} FB leads and {c2} Zalo leads.")
