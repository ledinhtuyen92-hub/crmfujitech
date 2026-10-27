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
        trigger_key = f"receipt:{instance.id}"
        if ZnsSendQueue.objects.filter(campaign=campaign, trigger_object=trigger_key).exists() or \
           ZaloMessageLog.objects.filter(campaign=campaign, trigger_object=trigger_key).exists():
            return
        from .zns_mapping import build_zns_context
        order = getattr(instance, "order", None)
        params = build_zns_context(
            customer=customer,
            order=order,
            receipt=instance,
            company=company,
            template=campaign.template,
        )
        _enqueue_zns(campaign=campaign, recipient_phone=customer.phone, recipient_name=customer.name,
                     template_data=params, trigger_object=trigger_key)
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
    from .zns_mapping import build_zns_context
    order = getattr(instance, "order", None)
    fallback_params = build_zns_context(
        customer=customer,
        order=order,
        receipt=instance,
        company=company,
        template=template,
    )
    from .tasks import send_zns_task
    log = ZaloMessageLog.objects.create(
        company=company, template=template, customer=customer, recipient_phone=customer.phone,
        params_sent=fallback_params,
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
    trigger_key = f"order:{instance.id}"
    if ZnsSendQueue.objects.filter(campaign=campaign, trigger_object=trigger_key).exists() or \
       ZaloMessageLog.objects.filter(campaign=campaign, trigger_object=trigger_key).exists():
        return
    from .zns_mapping import build_zns_context
    params = build_zns_context(
        customer=customer,
        order=instance,
        company=company,
        template=campaign.template,
    )
    _enqueue_zns(campaign=campaign, recipient_phone=customer.phone, recipient_name=customer.name,
                 template_data=params, trigger_object=trigger_key)


def _match_delivery_status(current_status, trigger_statuses):
    if not trigger_statuses:
        return False
    if current_status in trigger_statuses:
        return True
    alias_map = {
        "completed": ["delivered", "hoan_thanh", "da_giao"],
        "delivered": ["completed", "hoan_thanh", "da_giao"],
        "in_transit": ["shipping", "dang_giao"],
        "shipping": ["in_transit", "dang_giao"],
    }
    for al in alias_map.get(current_status, []):
        if al in trigger_statuses:
            return True
    return False


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
    if campaigns.exists():
        for campaign in campaigns:
            if not campaign.template:
                continue
            trigger_statuses = campaign.config_json.get("trigger_statuses", [])
            if not _match_delivery_status(instance.status, trigger_statuses):
                continue
            trigger_key = f"order:{instance.id}:status:{instance.status}"
            if ZnsSendQueue.objects.filter(campaign=campaign, trigger_object=trigger_key).exists() or \
               ZaloMessageLog.objects.filter(campaign=campaign, trigger_object=trigger_key).exists():
                continue
            from .zns_mapping import build_zns_context
            params = build_zns_context(
                customer=customer,
                order=instance,
                company=company,
                extra={"status": instance.get_status_display()},
                template=campaign.template,
            )
            _enqueue_zns(campaign=campaign, recipient_phone=customer.phone, recipient_name=customer.name,
                         template_data=params, trigger_object=trigger_key)
        return
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


# Signal 4: Giao hang qua module Delivery (Lệnh giao hàng)

try:
    from delivery.models import DeliveryOrder, WarrantyCard

    @receiver(post_save, sender=DeliveryOrder)
    def trigger_zns_on_delivery_order(sender, instance, created, **kwargs):
        order = instance.order
        if not order:
            return
        company = instance.company
        if not _guard_company(company):
            return
        customer = getattr(order, "customer", None)
        if not customer or not customer.phone:
            return
        campaigns = ZnsCampaign.objects.filter(
            company=company, campaign_type=ZnsCampaign.TYPE_DELIVERY, is_active=True,
        ).select_related("template")
        for campaign in campaigns:
            if not campaign.template:
                continue
            trigger_statuses = campaign.config_json.get("trigger_statuses", [])
            if not _match_delivery_status(instance.status, trigger_statuses):
                continue
            trigger_key = f"delivery_order:{instance.id}:status:{instance.status}"
            if ZnsSendQueue.objects.filter(campaign=campaign, trigger_object=trigger_key).exists() or \
               ZaloMessageLog.objects.filter(campaign=campaign, trigger_object=trigger_key).exists():
                continue
            from .zns_mapping import build_zns_context
            params = build_zns_context(
                customer=customer,
                order=order,
                company=company,
                extra={
                    "status": instance.get_status_display(),
                    "tracking_code": instance.delivery_code or "",
                    "carrier_name": instance.shipper_name or "",
                    "delivery_address": instance.shipping_address or getattr(order, "delivery_address", ""),
                },
                template=campaign.template,
            )
            _enqueue_zns(campaign=campaign, recipient_phone=customer.phone, recipient_name=customer.name,
                         template_data=params, trigger_object=trigger_key)

    @receiver(post_save, sender=WarrantyCard)
    def trigger_zns_on_warranty_card(sender, instance, created, **kwargs):
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
            if "warranty_done" not in trigger_statuses and "warranty" not in trigger_statuses:
                continue
            trigger_key = f"warranty:{instance.id}"
            if ZnsSendQueue.objects.filter(campaign=campaign, trigger_object=trigger_key).exists() or \
               ZaloMessageLog.objects.filter(campaign=campaign, trigger_object=trigger_key).exists():
                continue
            from .zns_mapping import build_zns_context
            params = build_zns_context(
                customer=customer,
                order=instance.order,
                company=company,
                extra={
                    "warranty_code": instance.warranty_code or "",
                    "status": "Hoàn thành bảo hành",
                },
                template=campaign.template,
            )
            _enqueue_zns(campaign=campaign, recipient_phone=customer.phone, recipient_name=customer.name,
                         template_data=params, trigger_object=trigger_key)
except ImportError:
    pass


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
