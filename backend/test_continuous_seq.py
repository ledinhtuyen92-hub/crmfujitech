import os
import django
import sys
from datetime import date, timedelta

os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'core.settings')
django.setup()

from users.models import Company, CompanySettings, CompanySequence
from core.numbering import generate_order_number

company = Company.objects.first()

print(f"--- Bắt đầu test sinh mã liên tục cho công ty: {company.name} ---")

settings, _ = CompanySettings.objects.get_or_create(company=company)
settings.continuous_sequence_numbering = True
settings.save()
print("\n[✓] Đã BẬT cấu hình 'Sinh số thứ tự liên tục toàn bộ thời gian'.")

# Clear sequence for testing
CompanySequence.objects.filter(company=company, prefix__contains="DH").delete()

print("\n[Ngày 1] Khách hàng tạo 3 đơn hàng trong ngày hôm nay:")
print("Đơn hàng 1:", generate_order_number(company))
print("Đơn hàng 2:", generate_order_number(company))
print("Đơn hàng 3:", generate_order_number(company))

print("\n[Ngày 2] Sang ngày hôm sau (qua 12h đêm):")
class MockDate:
    @classmethod
    def today(cls):
        return date.today() + timedelta(days=1)

import core.numbering
core.numbering.date = MockDate

print("Đơn hàng 4:", generate_order_number(company))
print("Đơn hàng 5:", generate_order_number(company))

print("\n[✓] Đã TẮT cấu hình (quay lại chế độ reset số theo ngày).")
settings.continuous_sequence_numbering = False
settings.save()
company.refresh_from_db()

print("Đơn hàng 6 (cùng Ngày 2):", generate_order_number(company))
print("Đơn hàng 7 (cùng Ngày 2):", generate_order_number(company))
