"""
zalo_integration/tasks.py
Celery background tasks cho module Zalo Integration.

Lịch chạy (cấu hình trong settings.py CELERY_BEAT_SCHEDULE):
- refresh_all_zalo_tokens   : Mỗi 1 giờ (kiểm tra nếu token còn < 30 phút thì mới refresh)
- cleanup_stale_leads       : 3 giờ sáng mỗi ngày
- send_zns_task             : On-demand (triggered bởi user action)
"""

import logging
from datetime import timedelta

from celery import shared_task
from django.utils import timezone

logger = logging.getLogger(__name__)


# ── Task 1: Auto-Refresh tất cả Access Tokens ────────────────────────────────

@shared_task(name="zalo.refresh_all_tokens", bind=True, max_retries=0)
def refresh_all_zalo_tokens(self):
    """
    Quét tất cả ZaloOaConfig còn active.
    Nếu token sắp hết hạn (< 30 phút) hoặc đã hết hạn -> gọi Zalo API để refresh.
    Chạy mỗi giờ qua Celery Beat.
    
    Lưu ý: Zalo cấp access_token sống 1 giờ và refresh_token là single-use.
    Cửa sổ 30 phút đảm bảo không refresh ngay sau khi OAuth vừa lấy token mới.
    """
    from zalo_integration.models import ZaloOaConfig
    from zalo_integration.services import refresh_zalo_access_token

    configs = ZaloOaConfig.objects.filter(
        is_active=True,
        refresh_token__isnull=False,
    ).exclude(refresh_token="")

    total = configs.count()
    refreshed = 0
    failed = 0
    failed_oa_names = []

    logger.info(f"[ZaloTask:RefreshTokens] Bắt đầu kiểm tra {total} OA config(s)...")

    for config in configs:
        now = timezone.now()
        expires_at = config.token_expires_at
        
        # Log trạng thái chi tiết của từng OA
        if expires_at:
            remaining = (expires_at - now).total_seconds()
            logger.info(f"[ZaloTask:RefreshTokens] OA '{config.oa_name}': token hết hạn lúc {expires_at}, còn {remaining:.0f}s ({remaining/3600:.1f}h)")
        else:
            logger.info(f"[ZaloTask:RefreshTokens] OA '{config.oa_name}': chưa có token_expires_at -> cần refresh")

        # Refresh nếu: chưa có expires_at, hoặc token còn dưới 30 phút, hoặc đã hết hạn
        if config.is_token_near_expiry:
            logger.info(f"[ZaloTask:RefreshTokens] → Token cần refresh, đang gọi Zalo API cho OA: '{config.oa_name}'...")
            success = refresh_zalo_access_token(config)
            if success:
                refreshed += 1
                logger.info(f"[ZaloTask:RefreshTokens] ✅ Refresh thành công cho OA: '{config.oa_name}'")
            else:
                failed += 1
                failed_oa_names.append(config.oa_name)
                logger.error(f"[ZaloTask:RefreshTokens] ❌ Refresh THẤT BẠI cho OA: '{config.oa_name}'")
        else:
            logger.info(f"[ZaloTask:RefreshTokens] ⏭️ Token OA '{config.oa_name}' vẫn còn hạn, bỏ qua.")

    # Gửi thông báo trong hệ thống nếu có OA refresh thất bại
    if failed > 0:
        try:
            from notifications.models import Notification
            from users.models import User
            
            superadmins = User.objects.filter(is_superuser=True, is_active=True).select_related('company')
            for admin in superadmins:
                if not admin.company:
                    continue
                Notification.objects.create(
                    company=admin.company,
                    recipient=admin,
                    type=Notification.TYPE_SYSTEM_UPDATE,
                    title="⚠️ Zalo Token Refresh thất bại",
                    message=f"Không thể tự động làm mới token cho {failed} Zalo OA: {', '.join(failed_oa_names)}. Vui lòng vào Cấu hình Zalo OA và bấm 'Lấy Token' để cấp lại.",
                    link="/settings/zalo",
                )
            logger.info(f"[ZaloTask:RefreshTokens] Đã gửi thông báo cho {superadmins.count()} SuperAdmin về token refresh thất bại.")
        except Exception as e:
            logger.warning(f"[ZaloTask:RefreshTokens] Không thể gửi thông báo: {e}")

    result = {
        "total_configs": total,
        "refreshed": refreshed,
        "failed": failed,
        "failed_oa_names": failed_oa_names,
        "skipped": total - refreshed - failed,
    }
    logger.info(f"[ZaloTask:RefreshTokens] Hoàn tất: {result}")
    return result


# ── Task 2: Auto-Cleanup Stale Social Leads ───────────────────────────────────

@shared_task(name="zalo.cleanup_stale_leads", bind=True, max_retries=0)
def cleanup_stale_social_leads(self):
    """
    Archive SocialLead ở trạng thái 'new' hoặc 'chatting' mà
    không có tương tác trong X ngày qua (X cấu hình theo công ty).

    Dùng soft-delete (đổi status -> 'archived') thay vì xóa cứng
    để giữ audit trail và tránh mất data quan trọng.

    Chạy lúc 3 giờ sáng mỗi ngày qua Celery Beat.
    """
    from zalo_integration.models import SocialLead, ZaloOaConfig

    configs = ZaloOaConfig.objects.filter(is_active=True)
    total_archived = 0

    for config in configs:
        cutoff_date = timezone.now() - timedelta(days=config.lead_cleanup_days)
        
        stale_leads = SocialLead.objects.filter(
            company=config.company,
            status__in=[SocialLead.STATUS_NEW, SocialLead.STATUS_CHATTING],
            last_interaction_date__lt=cutoff_date,
        )

        count = stale_leads.count()
        if count > 0:
            updated = stale_leads.update(status=SocialLead.STATUS_ARCHIVED)
            total_archived += updated
            logger.info(f"[ZaloTask:CleanupLeads] Công ty {config.company.name}: Đã archive {updated} SocialLead (> {config.lead_cleanup_days} ngày).")

    if total_archived == 0:
        logger.info("[ZaloTask:CleanupLeads] ✅ Database sạch sẽ, không có lead nào cần cleanup.")

    return {"archived_count": total_archived}


# ── Task 3: Gửi ZNS (On-demand) ──────────────────────────────────────────────

@shared_task(
    name="zalo.send_zns",
    bind=True,
    max_retries=3,
    default_retry_delay=60,  # Retry sau 60 giây
)
def send_zns_task(self, log_id: int):
    """
    Gửi ZNS dựa trên ZaloMessageLog record đã được tạo sẵn.
    Được trigger từ View khi user bấm nút "Gửi ZNS".

    Retry logic:
    - Lần 1 retry: sau 60 giây
    - Lần 2 retry: sau 120 giây
    - Lần 3 retry: sau 180 giây
    - Sau 3 lần: đánh dấu log là FAILED.
    """
    from zalo_integration.services import send_zns_message

    logger.info(f"[ZaloTask:SendZNS] Bắt đầu gửi ZNS log_id={log_id}...")

    try:
        success = send_zns_message(log_id)
        if success:
            logger.info(f"[ZaloTask:SendZNS] ✅ Gửi thành công log_id={log_id}")
        else:
            logger.warning(f"[ZaloTask:SendZNS] ⚠️ Gửi thất bại log_id={log_id}")
            # Retry nếu còn lượt
            raise self.retry(
                exc=Exception(f"ZNS send failed for log_id={log_id}"),
                countdown=60 * (self.request.retries + 1),
            )
    except Exception as exc:
        if self.request.retries >= self.max_retries:
            logger.error(f"[ZaloTask:SendZNS] ❌ Hết lượt retry cho log_id={log_id}: {exc}")
            # Đánh dấu thất bại cuối cùng
            from zalo_integration.models import ZaloMessageLog
            ZaloMessageLog.objects.filter(id=log_id).update(
                status=ZaloMessageLog.STATUS_FAILED,
                error_message=f"Thất bại sau {self.max_retries} lần thử: {str(exc)}",
            )
        else:
            raise self.retry(exc=exc, countdown=60 * (self.request.retries + 1))

    return {"log_id": log_id, "success": success}


# ── Task 4: Gửi ZNS Chúc mừng sinh nhật tự động ─────────────────────────────

@shared_task(
    name="zalo.send_birthday_zns",
    bind=True,
    max_retries=1,
)
def send_birthday_zns_to_customers(self):
    """
    Quét tất cả các Khách hàng có ngày sinh là hôm nay.
    Nếu công ty của khách hàng có bật `auto_send_birthday_zns`, 
    sẽ tìm mẫu ZNS loại `birthday` và gửi đi.
    """
    from django.utils import timezone
    from zalo_integration.models import ZaloOaConfig, ZaloMessageTemplate, ZaloMessageLog
    from crm.models import Customer
    from zalo_integration.services import send_zns_message
    
    logger.info("[ZaloTask:SendBirthdayZNS] Bắt đầu quét khách hàng sinh nhật hôm nay...")
    
    today = timezone.now().date()
    
    # Kiểm tra chế độ bảo trì toàn hệ thống
    from users.models import SystemSettings
    if SystemSettings.load().maintenance_mode:
        logger.info("[ZaloTask:SendBirthdayZNS] Hệ thống đang ở chế độ bảo trì, tạm dừng tự động gửi ZNS sinh nhật.")
        return {"success": True, "sent_count": 0}

    # 1. Tìm các cấu hình OA có bật tự động gửi sinh nhật và đang active
    configs = ZaloOaConfig.objects.filter(is_active=True, auto_send_birthday_zns=True).select_related('company')
    if not configs.exists():
        logger.info("[ZaloTask:SendBirthdayZNS] Không có công ty nào bật tính năng này.")
        return {"success": True, "sent_count": 0}

    valid_company_ids = []
    for config in configs:
        company = config.company
        if not company or not company.is_active:
            continue
        if not hasattr(company, "settings") or not company.settings:
            continue
        if "zalo" not in (company.settings.active_modules or []):
            continue
        valid_company_ids.append(company.id)

    if not valid_company_ids:
        logger.info("[ZaloTask:SendBirthdayZNS] Không có công ty hợp lệ (hoặc module Zalo bị tắt).")
        return {"success": True, "sent_count": 0}
    
    # 2. Tìm các Customer có sinh nhật hôm nay thuộc các công ty hợp lệ đó
    birthday_customers = Customer.objects.filter(
        company_id__in=valid_company_ids,
        birthday__day=today.day,
        birthday__month=today.month,
        phone__isnull=False
    ).exclude(phone="")
    
    if not birthday_customers.exists():
        logger.info("[ZaloTask:SendBirthdayZNS] Không có khách hàng nào sinh nhật hôm nay.")
        return {"success": True, "sent_count": 0}

    sent_count = 0
    for customer in birthday_customers:
        # Chống gửi lặp lại trong cùng ngày hôm nay cho khách hàng
        if ZaloMessageLog.objects.filter(
            company_id=customer.company_id,
            customer=customer,
            template__template_type=ZaloMessageTemplate.TYPE_BIRTHDAY,
            sent_at__date=today
        ).exists():
            logger.info(f"[ZaloTask:SendBirthdayZNS] Khách hàng #{customer.id} ({customer.phone}) đã được gửi ZNS chúc mừng sinh nhật hôm nay.")
            continue

        # Tìm template birthday của công ty
        template = ZaloMessageTemplate.objects.filter(
            company_id=customer.company_id,
            template_type=ZaloMessageTemplate.TYPE_BIRTHDAY,
            is_active=True
        ).first()
        
        if not template:
            logger.warning(f"[ZaloTask:SendBirthdayZNS] Cty {customer.company_id} chưa có mẫu ZNS sinh nhật.")
            continue
            
        # Tạo ZaloMessageLog
        log = ZaloMessageLog.objects.create(
            company_id=customer.company_id,
            template=template,
            customer=customer,
            recipient_phone=customer.phone,
            params_sent={
                "customer_name": customer.name or "Quý khách",
                # Các tham số khác có thể thêm nếu mẫu yêu cầu
            },
            status=ZaloMessageLog.STATUS_PENDING
        )
        
        # Gửi ZNS
        try:
            success = send_zns_message(log.id)
            if success:
                sent_count += 1
        except Exception as e:
            logger.error(f"[ZaloTask:SendBirthdayZNS] Lỗi gửi cho {customer.phone}: {str(e)}")

    logger.info(f"[ZaloTask:SendBirthdayZNS] Hoàn thành. Đã gửi {sent_count} ZNS sinh nhật.")
    return {"success": True, "sent_count": sent_count}


# Task: Quet hang doi ZNS (moi 1 phut)

@shared_task(name="zalo.process_zns_send_queue", bind=True, max_retries=0)
def process_zns_send_queue(self):
    """
    Quet ZnsSendQueue, lay cac ban ghi status=pending va scheduled_at <= now(),
    gui ZNS qua Zalo API, ghi ket qua vao ZaloMessageLog.
    Chay moi 1 phut qua Celery Beat.
    """
    from zalo_integration.models import ZnsSendQueue, ZaloMessageLog
    from zalo_integration.services import send_zns_message

    now = timezone.now()
    queue_items = ZnsSendQueue.objects.filter(
        status=ZnsSendQueue.STATUS_PENDING,
        scheduled_at__lte=now,
    ).select_related("campaign", "campaign__template")[:100]

    if not queue_items.exists():
        return {"processed": 0}

    sent_count = 0
    failed_count = 0

    for item in queue_items:
        campaign = item.campaign
        template = campaign.template

        if not template:
            item.status = ZnsSendQueue.STATUS_FAILED
            item.error_message = "Chien dich khong co mau ZNS"
            item.save(update_fields=["status", "error_message"])
            failed_count += 1
            continue

        log = ZaloMessageLog.objects.create(
            company=campaign.company,
            campaign=campaign,
            template=template,
            recipient_phone=item.recipient_phone,
            params_sent=item.template_data,
            trigger_object=item.trigger_object,
            status=ZaloMessageLog.STATUS_PENDING,
        )

        try:
            success = send_zns_message(log.id)
            if success:
                item.status = ZnsSendQueue.STATUS_SENT
                item.save(update_fields=["status"])
                sent_count += 1
                logger.info(f"[ZNS Queue] Gui thanh cong: {item.recipient_phone} | Campaign: {campaign.name}")
            else:
                item.status = ZnsSendQueue.STATUS_FAILED
                item.error_message = log.error_message or "Gui that bai"
                item.save(update_fields=["status", "error_message"])
                failed_count += 1
        except Exception as e:
            item.status = ZnsSendQueue.STATUS_FAILED
            item.error_message = str(e)
            item.save(update_fields=["status", "error_message"])
            log.status = ZaloMessageLog.STATUS_FAILED
            log.error_message = str(e)
            log.save(update_fields=["status", "error_message"])
            failed_count += 1
            logger.error(f"[ZNS Queue] Loi gui {item.recipient_phone}: {e}")

    logger.info(f"[ZNS Queue] Hoan thanh: {sent_count} thanh cong, {failed_count} that bai.")
    return {"processed": sent_count + failed_count, "sent": sent_count, "failed": failed_count}


# Task: Gui ZNS sinh nhat qua Campaign Engine (moi ngay 08:00)

@shared_task(name="zalo.send_birthday_zns_campaign", bind=True, max_retries=0)
def send_birthday_zns_campaign(self):
    """
    Phien ban moi dung Campaign Engine.
    Quet cac ZnsCampaign type=birthday dang active,
    tim khach hang co sinh nhat hom nay va day vao hang doi.
    """
    from zalo_integration.models import ZnsCampaign, ZnsSendQueue
    from crm.models import Customer

    today = timezone.localdate()
    sent_count = 0

    campaigns = ZnsCampaign.objects.filter(
        campaign_type=ZnsCampaign.TYPE_BIRTHDAY,
        is_active=True,
    ).select_related("template", "company")

    for campaign in campaigns:
        if not campaign.template:
            continue

        days_before = campaign.config_json.get("days_before", 0)
        target_date = today + timezone.timedelta(days=days_before) if days_before else today

        customers = Customer.objects.filter(
            company=campaign.company,
            birthday__month=target_date.month,
            birthday__day=target_date.day,
        ).exclude(phone="").exclude(phone__isnull=True)

        for customer in customers:
            trigger_key = f"birthday:{customer.id}:{today.isoformat()}"
            already = ZnsSendQueue.objects.filter(
                campaign=campaign,
                trigger_object=trigger_key,
            ).exists()
            if already:
                continue

            params = {
                "customer_name": customer.name,
                "birthday": customer.birthday.strftime("%d/%m/%Y") if customer.birthday else "",
            }
            ZnsSendQueue.objects.create(
                campaign=campaign,
                recipient_phone=customer.phone,
                recipient_name=customer.name,
                template_data=params,
                trigger_object=trigger_key,
                scheduled_at=timezone.now(),
            )
            sent_count += 1

    logger.info(f"[ZNS Birthday Campaign] Da day vao queue {sent_count} tin sinh nhat.")
    return {"success": True, "queued": sent_count}
