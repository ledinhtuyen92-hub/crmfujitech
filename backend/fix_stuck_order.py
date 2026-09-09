import os
import django

# Thiết lập môi trường Django
os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'core.settings')
django.setup()

from orders.models import Order
from inventory.models import InventoryTransaction

def fix_order(order_number):
    try:
        order = Order.objects.get(order_number=order_number)
        print(f"Đã tìm thấy đơn hàng: {order.order_number} - Trạng thái: {order.status}")
        
        txns = order.inventory_transactions.all()
        count = txns.count()
        if count > 0:
            print(f"Đang có {count} giao dịch kho liên kết với đơn hàng này:")
            for txn in txns:
                print(f"  - Mã phiếu: {txn.transaction_code} | Loại: {txn.get_type_display()} | Trạng thái: {txn.get_status_display()}")
            
            # Gỡ liên kết tất cả các phiếu kho khỏi đơn hàng này để cho phép xoá
            print("=> Đang tiến hành gỡ liên kết phiếu kho khỏi đơn hàng để anh có thể xoá...")
            txns.update(reference_order=None)
            print("✅ Đã gỡ liên kết thành công! Bây giờ anh có thể xoá đơn hàng trên giao diện.")
        else:
            print("Không có giao dịch kho nào liên kết với đơn hàng này.")
            # Xoá force luôn nếu muốn
            print("Đang tiến hành xoá ép buộc đơn hàng...")
            order.delete()
            print("✅ Đã xoá đơn hàng thành công!")
            
    except Order.DoesNotExist:
        print(f"Không tìm thấy đơn hàng {order_number}!")

if __name__ == '__main__':
    fix_order('FT-DH-03092026-017')
