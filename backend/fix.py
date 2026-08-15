import codecs

with open('orders/signals.py', 'rb') as f:
    content = f.read()

text = content.decode('utf-8', errors='ignore')
idx = text.find('def _handle_order_pending')
if idx != -1:
    clean_text = text[:idx]
    
    correct_code = '''
def _handle_order_pending(order):
    """
    Xu ly khi don hang chuyen ve lai trang thai Cho duyet (VD: do nguoi dung chinh sua don hang):
    1. Huy Lenh san xuat (neu chua hoan thanh)
    2. Huy Lenh xuat kho (neu chua hoan thanh)
    """
    try:
        from production.models import ProductionOrder
        from inventory.models import InventoryTransaction

        # 1. Huy lenh san xuat chua hoan thanh
        ProductionOrder.objects.filter(
            order=order
        ).exclude(
            status=ProductionOrder.STATUS_COMPLETED
        ).update(status=ProductionOrder.STATUS_CANCELLED)
        
        # 2. Huy cac lenh xuat kho cho duyet
        InventoryTransaction.objects.filter(
            reference_order=order,
            status=InventoryTransaction.STATUS_PENDING,
            type=InventoryTransaction.TYPE_EXPORT
        ).update(status=InventoryTransaction.STATUS_REJECTED)
        
        import logging
        logger = logging.getLogger(__name__)
        logger.info("Successfully cancelled related MO and Export transactions for pending order %s", order.order_number)
    except Exception as exc:
        import logging
        logger = logging.getLogger(__name__)
        logger.error("Failed to cancel related transactions for order %s: %s", order.order_number, exc)
'''
    final_text = clean_text + correct_code
    with codecs.open('orders/signals.py', 'w', 'utf-8') as f2:
        f2.write(final_text)
