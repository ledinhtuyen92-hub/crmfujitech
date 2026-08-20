import os
import django

os.environ.setdefault("DJANGO_SETTINGS_MODULE", "core.settings")
django.setup()

from sales.models import Quotation
from orders.models import Order

print("Backfilling snapshot for Quotations...")
count = 0
for q in Quotation.objects.all():
    if not q.customer_name_snapshot and q.customer:
        q.customer_name_snapshot = q.customer.name or ''
        q.customer_company_snapshot = getattr(q.customer, 'company_name', '') or ''
        q.customer_tax_code_snapshot = getattr(q.customer, 'tax_code', '') or ''
        q.customer_phone_snapshot = getattr(q.customer, 'phone', '') or ''
        q.customer_address_snapshot = getattr(q.customer, 'address', '') or ''
        q.customer_city_snapshot = getattr(q.customer, 'city', '') or ''
        q.save(update_fields=[
            'customer_name_snapshot', 'customer_company_snapshot',
            'customer_tax_code_snapshot', 'customer_phone_snapshot',
            'customer_address_snapshot', 'customer_city_snapshot'
        ])
        count += 1
print(f"Updated {count} quotations.")

print("Backfilling snapshot for Orders...")
count = 0
for o in Order.objects.all():
    if not o.customer_name_snapshot and o.customer:
        o.customer_name_snapshot = o.customer.name or ''
        o.customer_company_snapshot = getattr(o.customer, 'company_name', '') or ''
        o.customer_tax_code_snapshot = getattr(o.customer, 'tax_code', '') or ''
        o.customer_phone_snapshot = getattr(o.customer, 'phone', '') or ''
        o.customer_address_snapshot = getattr(o.customer, 'address', '') or ''
        o.customer_city_snapshot = getattr(o.customer, 'city', '') or ''
        o.save(update_fields=[
            'customer_name_snapshot', 'customer_company_snapshot',
            'customer_tax_code_snapshot', 'customer_phone_snapshot',
            'customer_address_snapshot', 'customer_city_snapshot'
        ])
        count += 1
print(f"Updated {count} orders.")
