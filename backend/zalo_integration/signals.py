import logging
from datetime import timedelta

from django.db.models.signals import post_save, post_delete
from django.dispatch import receiver
from django.utils import timezone

from .models import ZaloOaConfig, ZaloMessageLog, ZaloMessageTemplate, SocialLead, ZnsCampaign, ZnsSendQueue
from crm.models import Customer
from finance.models import PaymentReceipt
from orders.models import Order

logger = logging.getLogger(__name__)


# Helper: Day vao hang doi gui ZNS

def _enqueue_zns(campaign, recipient_phone, recipient_name, template_data, trigger_object=""):
    delay = campaign.config_json.get("delay_minutes", 0)
    scheduled_at = timezone.now() + timedelta(minutes=delay)
    ZnsSendQueue.objects.create(
        campaign=campaign,
        recipient_phone=recipient_phone,
        recipient_name=recipient_name,
        template_data=template_data,
        trigger_object=trigger_object,
        scheduled_at=scheduled_at,
    )
    logger.info(f"[ZNS Queue] Campaign ''{campaign.name}'' -> {recipient_phone} | Gui luc: {scheduled_at} (delay {delay} phut)")


def _guard_company(company):
    if not company or not company.is_active:
        return False
    try:
        if not company.settings:
            return False
    except Exception:
        return False
    if "zalo" not in (company.settings.active_modules or []):
        return False
    from users.models import SystemSettings
    if SystemSettings.load().maintenance_mode:
        return False
    return True


# Signal 1: Thu tien - Khi PhieuThu duoc tao moi

@receiver(post_save, sender=PaymentReceipt)
def trigger_zns_on_payment_receipt(sender, instance, created, **kwargs):
    if not created:
        return
    company = instance.company
    if not _guard_company(company):
        return
    customer = getattr(instance, "customer", None) or (
        instance.order.customer if hasattr(instance, "order") and instance.order else None
    )
    if not customer or not customer.phone:
        return
    receipt_code = getattr(instance, "receipt_code", None) or f"PT-{instance.id}"
    campaign = ZnsCampaign.objects.filter(
        company=company, campaign_type=ZnsCampaign.TYPE_PAYMENT, is_active=True,
    ).select_related("template").first()
    if campaign and campaign.template:
        already = ZnsSendQueue.objects.filter(
            campaign=campaign, trigger_object=f"receipt:{instance.id}",
        ).exclude(status=ZnsSendQueue.STATUS_FAILED).exists()
        if already:
            return
        params = {"customer_name": customer.name, "amount": str(instance.amount), "receipt_code": receipt_code}
        _enqueue_zns(campaign=campaign, recipient_phone=customer.phone, recipient_name=customer.name,
                     template_data=params, trigger_object=f"receipt:{instance.id}")
        return
    # Fallback toggle cu
    config = ZaloOaConfig.objects.filter(company=company, is_active=True).first()
    if not config or not config.auto_send_payment_zns:
        return
    if ZaloMessageLog.objects.filter(company=company, customer=customer, params_sent__receipt_code=receipt_code).exists():
        return
    template = ZaloMessageTemplate.objects.filter(
        company=company,
        template_type__in=[ZaloMessageTemplate.TYPE_CARE, ZaloMessageTemplate.TYPE_ORDER_CONFIRM, ZaloMessageTemplate.TYPE_CUSTOM],
        is_active=True,
    ).first()
    if not template:
        logger.warning(f"[Zalo Signal] Khong tim thay mau ZNS cho PaymentReceipt (Company: {company.name})")
        return
    from .tasks import send_zns_task
    log = ZaloMessageLog.objects.create(
        company=company, template=template, customer=customer, recipient_phone=customer.phone,
        params_sent={"customer_name": customer.name, "amount": str(instance.amount), "receipt_code": receipt_code},
        trigger_object=f"receipt:{instance.id}", status=ZaloMessageLog.STATUS_PENDING,
    )
    send_zns_task.delay(log.id)
    logger.info(f"[Zalo Signal][Fallback] ZNS PaymentReceipt #{instance.id}")


# Signal 2: Don hang moi tao - Xac nhan don

@receiver(post_save, sender=Order)
def trigger_zns_on_order_created(sender, instance, created, **kwargs):
    """Gui ZNS xac nhan khi Don hang duoc TAO MOI. Khong trigger khi cap nhat."""
    if not created:
        return
    company = instance.company
    if not _guard_company(company):
        return
    customer = instance.customer
    if not customer or not customer.phone:
        return
    campaign = ZnsCampaign.objects.filter(
        company=company, campaign_type=ZnsCampaign.TYPE_ORDER_CONFIRM, is_active=True,
    ).select_related("template").first()
    if not campaign or not campaign.template:
        return
    already = ZnsSendQueue.objects.filter(
        campaign=campaign, trigger_object=f"order:{instance.id}",
    ).exclude(status=ZnsSendQueue.STATUS_FAILED).exists()
    if already:
        return
    params = {"customer_name": customer.name, "order_number": instance.order_number}
    _enqueue_zns(campaign=campaign, recipient_phone=customer.phone, recipient_name=customer.name,
                 template_data=params, trigger_object=f"order:{instance.id}")


# Signal 3: Giao hang / Bao hanh - Khi trang thai don thay doi

@receiver(post_save, sender=Order)
def trigger_zns_on_delivery_status(sender, instance, created, **kwargs):
    """Gui ZNS khi Don hang chuyen sang trang thai nam trong trigger_statuses (multi-checkbox)."""
    if created:
        return
    company = instance.company
    if not _guard_company(company):
        return
    customer = instance.customer
    if not customer or not customer.phone:
        return
    campaigns = ZnsCampaign.objects.filter(
        company=company, campaign_type=ZnsCampaign.TYPE_DELIVERY, is_active=True,
    ).select_related("template")
    for campaign in campaigns:
        if not campaign.template:
            continue
        trigger_statuses = campaign.config_json.get("trigger_statuses", [])
        if not trigger_statuses or instance.status not in trigger_statuses:
            continue
        trigger_key = f"order:{instance.id}:status:{instance.status}"
        already = ZnsSendQueue.objects.filter(
            campaign=campaign, trigger_object=trigger_key,
        ).exclude(status=ZnsSendQueue.STATUS_FAILED).exists()
        if already:
            continue
        params = {"customer_name": customer.name, "order_number": instance.order_number, "status": instance.get_status_display()}
        _enqueue_zns(campaign=campaign, recipient_phone=customer.phone, recipient_name=customer.name,
                     template_data=params, trigger_object=trigger_key)
    # Fallback toggle cu hoan thanh don
    if instance.status == Order.STATUS_COMPLETED:
        config = ZaloOaConfig.objects.filter(company=company, is_active=True).first()
        if not config or not config.auto_send_delivery_zns:
            return
        if ZaloMessageLog.objects.filter(company=company, customer=customer, params_sent__order_number=instance.order_number).exists():
            return
        template = ZaloMessageTemplate.objects.filter(
            company=company,
            template_type__in=[ZaloMessageTemplate.TYPE_DELIVERY_WARRANTY, ZaloMessageTemplate.TYPE_CARE, ZaloMessageTemplate.TYPE_CUSTOM],
            is_active=True,
        ).first()
        if not template:
            return
        from .tasks import send_zns_task
        log = ZaloMessageLog.objects.create(
            company=company, template=template, customer=customer, recipient_phone=customer.phone,
            params_sent={"customer_name": customer.name, "order_number": instance.order_number},
            trigger_object=f"order:{instance.id}:completed", status=ZaloMessageLog.STATUS_PENDING,
        )
        send_zns_task.delay(log.id)
        logger.info(f"[Zalo Signal][Fallback] ZNS Order Completed #{instance.id}")


# Sync Customer <-> SocialLead

@receiver(post_delete, sender=Customer)
def sync_social_lead_on_customer_delete(sender, instance, **kwargs):
    if not instance.phone or not instance.company_id:
        return
    leads = SocialLead.objects.filter(company_id=instance.company_id, detected_phone=instance.phone)
    leads.update(is_customer_converted=False, status=SocialLead.STATUS_CHATTING)
    logger.info(f"[Zalo Signal] KH {instance.phone} bi xoa -> cap nhat {leads.count()} SocialLead.")


@receiver(post_save, sender=Customer)
def sync_social_lead_on_customer_save(sender, instance, created, **kwargs):
    if not instance.phone or not instance.company_id:
        return
    SocialLead.objects.filter(company_id=instance.company_id, detected_phone=instance.phone).update(is_customer_converted=True)
