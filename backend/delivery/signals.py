import logging
from datetime import timedelta
from django.db.models.signals import post_save
from django.dispatch import receiver
from django.utils import timezone

from production.models import ProductionOrder
from .models import DeliveryOrder, WarrantyCard

logger = logging.getLogger(__name__)


@receiver(post_save, sender=ProductionOrder)
def auto_create_delivery_order(sender, instance, created, **kwargs):
    """
    Tự động tạo lệnh giao hàng khi Lệnh sản xuất chuyển sang Hoàn thành.
    """
    if kwargs.get('raw'):
        return
    if instance.status == ProductionOrder.STATUS_COMPLETED:
        # Nhạc trưởng Workflow sẽ tự động kiểm tra xem module nào được bật tiếp theo
        from orders.workflow import OrderWorkflowEngine
        OrderWorkflowEngine.trigger_next_step(instance.order, current_step="production")


def create_warranty_cards_for_order(order):
    import datetime
    from django.utils import timezone
    from .models import WarrantyCard
    
    months = order.warranty_months if hasattr(order, 'warranty_months') and order.warranty_months else 12
    start_date = timezone.now().date()
    
    month = start_date.month - 1 + months
    year = start_date.year + month // 12
    month = month % 12 + 1
    day = min(start_date.day, [31,
        29 if year % 4 == 0 and not year % 400 == 0 else 28,
        31,30,31,30,31,31,30,31,30,31][month-1])
    end_date = datetime.date(year, month, day)

    company_settings = getattr(order.company, "settings", None)
    default_content = company_settings.default_warranty_content if company_settings else ""
    default_rules = company_settings.default_warranty_rules if company_settings else ""

    # 1. Tạo Phiếu bảo hành
    warranty, created_warranty = WarrantyCard.objects.get_or_create(
        order=order,
        defaults={
            "company": order.company,
            "customer": order.customer,
            "status": WarrantyCard.STATUS_ACTIVE,
            "start_date": start_date,
            "end_date": end_date,
            "terms": f"Bảo hành {months} tháng kể từ ngày giao hàng/hoàn thành.",
            "warranty_content": default_content,
            "warranty_rules": default_rules,
        }
    )
    if created_warranty or not warranty.warranty_code:
        # Generate warranty code
        from core.numbering import derive_code_from_order
        warranty.warranty_code = derive_code_from_order(order.order_number, order.company, "bh")
        warranty.save(update_fields=["warranty_code"])
        logger.info(f"Auto-created/updated WarrantyCard {warranty.warranty_code} for Order {order.order_number}")

@receiver(post_save, sender=DeliveryOrder)
def handle_delivery_order_completed(sender, instance, created, **kwargs):
    """
    Kích hoạt bước tiếp theo (hoàn thành) khi Giao hàng hoàn thành.
    """
    if kwargs.get('raw'):
        return
    if instance.status == DeliveryOrder.STATUS_DELIVERED:
        from orders.workflow import OrderWorkflowEngine
        OrderWorkflowEngine.trigger_next_step(instance.order, current_step="delivery")
