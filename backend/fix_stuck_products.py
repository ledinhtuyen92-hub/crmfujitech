import os
import django

# Thiết lập môi trường Django
os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'core.settings')
django.setup()

from inventory.models import Product, ProductCategory

def fix_stuck_products():
    # Tìm các sản phẩm là 'Dịch vụ' (service) nhưng danh mục lại là 'Hàng hóa' (product)
    stuck_services = Product.objects.filter(product_type='service', category__category_type='product')
    count1 = stuck_services.count()
    if count1 > 0:
        print(f"Đã tìm thấy {count1} dịch vụ bị kẹt danh mục hàng hóa. Đang gỡ bỏ danh mục...")
        stuck_services.update(category=None)

    # Tìm các sản phẩm là 'Hàng hóa' (product) nhưng danh mục lại là 'Dịch vụ' (service)
    stuck_products = Product.objects.filter(product_type='product', category__category_type='service')
    count2 = stuck_products.count()
    if count2 > 0:
        print(f"Đã tìm thấy {count2} hàng hóa bị kẹt danh mục dịch vụ. Đang gỡ bỏ danh mục...")
        stuck_products.update(category=None)

    if count1 == 0 and count2 == 0:
        print("Không có sản phẩm/dịch vụ nào bị kẹt.")
    else:
        print("Đã xử lý xong! Các mục bị kẹt giờ sẽ xuất hiện ở mục 'Chưa phân loại'.")

if __name__ == '__main__':
    fix_stuck_products()
