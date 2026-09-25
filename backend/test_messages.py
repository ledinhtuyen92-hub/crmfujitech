import os
import django

os.environ.setdefault("DJANGO_SETTINGS_MODULE", "core.settings")
django.setup()

from facebook_integration.models import FacebookLead, FacebookMessage

leads = FacebookLead.objects.order_by('-updated_at')[:3]
for lead in leads:
    print('Lead:', lead.fb_user_name)
    msgs = FacebookMessage.objects.filter(lead=lead).order_by('-created_at')[:3]
    for m in msgs:
        print(f"Role: {m.sender_role}, Text: {m.text[:30]}, Payload: {m.payload}, ID: {m.fb_message_id}")
