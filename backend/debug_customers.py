import os, django
os.environ['DJANGO_SETTINGS_MODULE'] = 'core.settings'
django.setup()

from crm.models import Customer
print('Customer db_table:', Customer._meta.db_table)
print('Total customers all companies:', Customer.objects.count())

from django.db import connection
with connection.cursor() as cursor:
    cursor.execute("SELECT tablename FROM pg_tables WHERE schemaname='public' ORDER BY tablename")
    tables = cursor.fetchall()
print([t[0] for t in tables if 'customer' in t[0].lower()])

# Check the screenshot shows customer 82 -> Lê Đình Tuyền with phone 0989130265
# But lead has phone 0989198265 -- different phones!
# Let's check customer 82
try:
    c82 = Customer.objects.get(id=82)
    print(f'Customer 82: {c82.name}, phone: {c82.phone}, assigned_to_id: {c82.assigned_to_id}')
except Customer.DoesNotExist:
    print('Customer 82 not found in crm_Customer')
