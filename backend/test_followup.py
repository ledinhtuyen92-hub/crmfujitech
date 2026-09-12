import os
import django
os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'core.settings')
django.setup()

from django.utils import timezone
from datetime import timedelta
from facebook_integration.models import FacebookLead
from ai_agents.tasks import ai_drip_followup
from ai_agents.models import AiAgent

print("Starting test...")

agent = AiAgent.objects.filter(enable_drip_followup=True, is_active=True).first()
if not agent:
    print("No active AI agent with drip followup enabled found.")
    exit()

hours = agent.drip_followup_hours or 24

# Find a lead to test with
lead = FacebookLead.objects.filter(page_config__ai_agent=agent).last()
if not lead:
    print("No Facebook lead found for this agent.")
    exit()

print(f"Using Lead: {lead.id} - {lead.fb_user_name}")

# Manipulate data to force it into the followup window
lead.has_ai_followed_up = False
lead.has_unread_message = False
lead.is_customer_converted = False
lead.last_message_at = timezone.now() - timedelta(hours=hours + 1)
lead.save()
print(f"Set lead {lead.id} last_message_at to {lead.last_message_at} and has_ai_followed_up=False")

print("Running ai_drip_followup() task synchronously...")
ai_drip_followup()
print("Task finished.")

lead.refresh_from_db()
print(f"After task: has_ai_followed_up = {lead.has_ai_followed_up}")
