import logging
from django.db.models.signals import post_save, post_delete
from django.dispatch import receiver
from django.utils import timezone
from .models import ZaloOaConfig, ZaloMessageLog, ZaloMessageTemplate, SocialLead
from crm.models import Customer
from finance.models import PaymentReceipt
from orders.models import Order
from .tasks import send_zns_task

logger = logging.getLogger(__name__)

@receiver(post_save, sender=PaymentReceipt)
def trigger_zns_on_payment_receipt(sender, instance, created, **kwargs):
    """
    Tự động gửi ZNS khi Phiếu Thu được tạo (Hoặc chuyển sang trạng thái đã thanh toán).
    Dành cho mục đích cảm ơn khách hàng đã thanh toán.
    """
    if not created:
        return

    from users.models import SystemSettings
    if SystemSettings.load().maintenance_mode:
        return

    company = instance.company
    if not company or not company.is_active:
        return
    try:
        if not company.settings:
            return
    except Exception:
        return
    if "zalo" not in (company.settings.active_modules or []):
        return

    config = ZaloOaConfig.objects.filter(company=company, is_active=True).first()
    if not config or not config.auto_send_payment_zns:
        return

    customer = getattr(instance, "customer", None) or (instance.order.customer if hasattr(instance, "order") and instance.order else None)
    if not customer or not customer.phone:
        return

    receipt_code = instance.receipt_code if hasattr(instance, "receipt_code") else f"PT-{instance.id}"

    # Chống gửi lặp lại cho cùng 1 mã phiếu thu
    if ZaloMessageLog.objects.filter(
        company=company,
        customer=customer,
        params_sent__receipt_code=receipt_code,
    ).exists():
        return

    # Tìm mẫu ZNS loại 'payment_receipt' (hoặc 'order_confirm', 'care' làm fallback)
    template = ZaloMessageTemplate.objects.filter(
        company=company,
        template_type__in=[ZaloMessageTemplate.TYPE_CARE, ZaloMessageTemplate.TYPE_ORDER_CONFIRM, ZaloMessageTemplate.TYPE_CUSTOM],
        is_active=True
    ).first()

    if not template:
        logger.warning(f"[Zalo Signal] Không tìm thấy mẫu ZNS cho PaymentReceipt (Company: {company.name})")
        return

    # Chuẩn bị tham số
    params = {
        "customer_name": customer.name,
        "amount": str(instance.amount),
        "receipt_code": receipt_code
    }

    # Tạo Message Log
    log = ZaloMessageLog.objects.create(
        company=company,
        template=template,
        customer=customer,
        recipient_phone=customer.phone,
        params_sent=params,
        status=ZaloMessageLog.STATUS_PENDING,
    )

    # Đẩy vào Celery queue
    send_zns_task.delay(log.id)
    logger.info(f"[Zalo Signal] Đã kích hoạt auto ZNS cho PaymentReceipt #{instance.id}")


@receiver(post_save, sender=Order)
def trigger_zns_on_order_completed(sender, instance, **kwargs):
    """
    Tự động gửi ZNS (Kèm phiếu bảo hành) khi Đơn hàng chuyển sang trạng thái Hoàn thành.
    """
    # Chỉ trigger khi status == "completed"
    if instance.status != Order.STATUS_COMPLETED:
        return

    from users.models import SystemSettings
    if SystemSettings.load().maintenance_mode:
        return

    company = instance.company
    if not company or not company.is_active:
        return
    try:
        if not company.settings:
            return
    except Exception:
        return
    if "zalo" not in (company.settings.active_modules or []):
        return

    config = ZaloOaConfig.objects.filter(company=company, is_active=True).first()
    if not config or not config.auto_send_delivery_zns:
        return

    customer = instance.customer
    if not customer or not customer.phone:
        return

    # Chống gửi nhiều lần nếu update liên tục (hoặc save lặp lại sau khi hoàn thành)
    # Kiểm tra xem order này đã từng gửi ZNS completed chưa bằng cách check log cũ
    if ZaloMessageLog.objects.filter(
        company=company,
        customer=customer,
        params_sent__order_number=instance.order_number,
    ).exists():
        return

    template = ZaloMessageTemplate.objects.filter(
        company=company,
        template_type__in=[ZaloMessageTemplate.TYPE_DELIVERY_WARRANTY, ZaloMessageTemplate.TYPE_CARE, ZaloMessageTemplate.TYPE_ORDER_CONFIRM, ZaloMessageTemplate.TYPE_CUSTOM],
        is_active=True
    ).first()

    if not template:
        logger.warning(f"[Zalo Signal] Không tìm thấy mẫu ZNS cho Order Completed (Company: {company.name})")
        return

    params = {
        "customer_name": customer.name,
        "order_number": instance.order_number,
        "warranty_link": f"https://system.yourdomain.com/warranty/{instance.order_number}"
    }

    log = ZaloMessageLog.objects.create(
        company=company,
        template=template,
        customer=customer,
        recipient_phone=customer.phone,
        params_sent=params,
        status=ZaloMessageLog.STATUS_PENDING,
    )

    send_zns_task.delay(log.id)
    logger.info(f"[Zalo Signal] Đã kích hoạt auto ZNS cho Order Completed #{instance.id}")


@receiver(post_delete, sender=Customer)
def sync_social_lead_on_customer_delete(sender, instance, **kwargs):
    """
    Khi một Khách hàng bị xóa khỏi hệ thống:
    Tự động cập nhật lại các SocialLead có SĐT tương ứng về trạng thái Chưa thêm KH (is_customer_converted=False).
    """
    if not instance.phone or not instance.company_id:
        return
    leads = SocialLead.objects.filter(
        company_id=instance.company_id,
        detected_phone=instance.phone
    )
    leads.update(
        is_customer_converted=False,
        status=SocialLead.STATUS_CHATTING
    )
    logger.info(f"[Zalo Signal] Khách hàng {instance.phone} bị xoá -> Đã cập nhật lại {leads.count()} SocialLead về Chưa thêm KH.")


@receiver(post_save, sender=Customer)
def sync_social_lead_on_customer_save(sender, instance, created, **kwargs):
    """
    Khi một Khách hàng được tạo mới hoặc cập nhật SĐT:
    Đồng bộ trạng thái is_customer_converted=True cho các SocialLead có cùng SĐT.
    """
    if not instance.phone or not instance.company_id:
        return
    SocialLead.objects.filter(
        company_id=instance.company_id,
        detected_phone=instance.phone
    ).update(is_customer_converted=True)
