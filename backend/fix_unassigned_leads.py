"""
Script vá lại tất cả FacebookLead và SocialLead chưa được phân công (assigned_to=None)
bằng cách tìm customer cùng fb_user_id / social_id đã có người phụ trách.
Chạy trên VPS: python fix_unassigned_leads.py
"""
import os, django
os.environ.setdefault("DJANGO_SETTINGS_MODULE", "core.settings")
django.setup()

from facebook_integration.models import FacebookLead
from zalo_integration.models import SocialLead

fb_fixed = 0
# Fix FacebookLead chưa có assigned_to
unassigned_fb = FacebookLead.objects.filter(assigned_to__isnull=True)
print(f"Tổng FacebookLead chưa được phân công: {unassigned_fb.count()}")

for lead in unassigned_fb:
    # Nếu lead đã link với customer có assigned_to, thì lấy luôn
    if lead.customer and lead.customer.assigned_to:
        lead.assigned_to = lead.customer.assigned_to
        lead.is_customer_converted = True
        lead.save(update_fields=["assigned_to", "is_customer_converted"])
        print(f"  Fixed FB Lead #{lead.id} ({lead.fb_user_name}) -> from OWN customer -> assigned_to: {lead.assigned_to}")
        fb_fixed += 1
        continue

    # Nếu chưa có, tìm lead khác cùng công ty + cùng fb_user_id đã có customer với assigned_to
    sibling = FacebookLead.objects.filter(
        company=lead.company,
        fb_user_id=lead.fb_user_id,
        customer__isnull=False,
        customer__assigned_to__isnull=False,
    ).exclude(id=lead.id).select_related('customer').first()

    if sibling:
        lead.assigned_to = sibling.customer.assigned_to
        lead.customer = sibling.customer
        lead.is_customer_converted = True
        lead.save(update_fields=["assigned_to", "customer", "is_customer_converted"])
        print(f"  Fixed FB Lead #{lead.id} ({lead.fb_user_name}) -> assigned_to: {lead.assigned_to}")
        fb_fixed += 1

print(f"\nĐã fix {fb_fixed} FacebookLead.\n")

zalo_fixed = 0
# Fix SocialLead chưa có assigned_to
unassigned_zl = SocialLead.objects.filter(assigned_to__isnull=True)
print(f"Tổng SocialLead chưa được phân công: {unassigned_zl.count()}")

for lead in unassigned_zl:
    if hasattr(lead, 'converted_customer') and lead.converted_customer and lead.converted_customer.assigned_to:
        lead.assigned_to = lead.converted_customer.assigned_to
        lead.save(update_fields=["assigned_to"])
        print(f"  Fixed Zalo Lead #{lead.id} ({lead.display_name}) -> from OWN customer -> assigned_to: {lead.assigned_to}")
        zalo_fixed += 1
        continue

    sibling = SocialLead.objects.filter(
        company=lead.company,
        social_id=lead.social_id,
        converted_customer__isnull=False,
        converted_customer__assigned_to__isnull=False,
    ).exclude(id=lead.id).select_related('converted_customer').first()

    if sibling:
        lead.assigned_to = sibling.converted_customer.assigned_to
        lead.save(update_fields=["assigned_to"])
        print(f"  Fixed Zalo Lead #{lead.id} ({lead.display_name}) -> assigned_to: {lead.assigned_to}")
        zalo_fixed += 1

print(f"\nĐã fix {zalo_fixed} SocialLead.")
print(f"\n✅ Hoàn thành! Tổng: {fb_fixed} FB + {zalo_fixed} Zalo leads đã được vá.")
