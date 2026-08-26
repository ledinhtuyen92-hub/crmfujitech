import os, django
os.environ.setdefault("DJANGO_SETTINGS_MODULE", "core.settings")
django.setup()

from facebook_integration.models import FacebookLead, FacebookPageConfig
from ai_agents.tasks import _apply_extracted_info
from users.models import User

# Delete any customer with phone '0999888777' first
from crm.models import Customer
Customer.objects.filter(phone='0999888777').delete()

# Create a dummy FB lead
u = User.objects.get(id=3)
company = u.company
page_config = FacebookPageConfig.objects.filter(company=company).first()
lead = FacebookLead.objects.create(
    company=company,
    page_config=page_config,
    fb_user_id='dummy_12345',
    fb_user_name='Dummy User',
)
print("Before extract: Lead assigned_to:", lead.assigned_to_id)

_apply_extracted_info(lead, '0999888777', None, None, 'facebook')

# Reload lead from DB
lead.refresh_from_db()
print("After extract: Lead assigned_to:", lead.assigned_to_id)
print("Customer ID linked:", lead.customer_id)

c = Customer.objects.get(phone='0999888777')
print("Customer assigned_to:", c.assigned_to_id)
