"""
Django Signals cho CRM app.
Kích hoạt khi Customer.assigned_to thay đổi → gửi notification cho Sale.
"""
import logging

from django.db.models.signals import pre_save, post_save
from django.dispatch import receiver

logger = logging.getLogger(__name__)


@receiver(pre_save, sender="crm.Customer")
def track_customer_assignment(sender, instance, **kwargs):
    """Lưu assigned_to cũ trước khi save để phát hiện thay đổi."""
    if instance.pk:
        try:
            original = sender.objects.get(pk=instance.pk)
            instance._original_assigned_to_id = original.assigned_to_id
        except sender.DoesNotExist:
            instance._original_assigned_to_id = None
    else:
        instance._original_assigned_to_id = None


@receiver(pre_save, sender="crm.Customer")
def auto_assign_customer(sender, instance, **kwargs):
    """Tự động phân bổ Lead xoay vòng đều đặn (True Round-robin) dựa trên thời gian nhận Lead gần nhất."""
    if not instance.pk and not instance.assigned_to:
        company = instance.company
        if company and hasattr(company, "settings") and company.settings.lead_routing == "round_robin":
            from users.models import User
            from django.db.models import Max, F

            sale_user = (
                User.objects.filter(
                    company=company,
                    is_active=True,
                    is_company_admin=False,
                    is_superuser=False,
                    role__is_auto_assign_target=True,
                )
                .annotate(last_lead_time=Max("assigned_customers__created_at"))
                .order_by(F("last_lead_time").asc(nulls_first=True))
                .first()
            )
            if sale_user:
                instance.assigned_to = sale_user
                logger.info("Auto-assigned lead '%s' to user '%s'", instance.name, sale_user.username)


@receiver(post_save, sender="crm.Customer")
def on_customer_saved(sender, instance, created, **kwargs):
    """
    Sau khi lưu Customer:
    - Nếu MỚI TẠO và có assigned_to → gửi notification
    - Nếu CẬP NHẬT và assigned_to THAY ĐỔI → gửi notification
    """
    if not instance.assigned_to:
        return

    original_assigned_id = getattr(instance, "_original_assigned_to_id", None)

    # Chỉ gửi notification khi assigned_to thay đổi
    if instance.assigned_to_id != original_assigned_id:
        try:
            from notifications.utils import notify_customer_assigned
            assigner = getattr(instance, "_assigned_by", None)
            notify_customer_assigned(
                customer=instance,
                assigned_to=instance.assigned_to,
                assigned_by=assigner,
            )
        except Exception as exc:
            logger.error(
                "Failed to send assignment notification for customer %s: %s",
                instance.name,
                exc,
            )

        # ── Tự động đồng bộ Nhân viên phụ trách sang Zalo / Facebook ──
        try:
            from zalo_integration.models import SocialLead
            from facebook_integration.models import FacebookLead

            # Cập nhật các hội thoại Zalo
            updated_zalo = SocialLead.objects.filter(customer_id=instance.pk).update(assigned_to=instance.assigned_to)
            
            # Cập nhật các hội thoại Facebook
            updated_fb = FacebookLead.objects.filter(customer_id=instance.pk).update(assigned_to=instance.assigned_to)

            if updated_zalo > 0 or updated_fb > 0:
                logger.info(
                    "Synced assignment for customer %s to %s Zalo leads and %s FB leads", 
                    instance.name, updated_zalo, updated_fb
                )
        except Exception as exc:
            logger.error(
                "Failed to sync assignment to social leads for customer %s: %s",
                instance.name,
                exc,
            )
        # ─────────────────────────────────────────────────────────────
