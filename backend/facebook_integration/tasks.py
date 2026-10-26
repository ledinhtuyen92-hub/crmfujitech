"""
facebook_integration/tasks.py
Các tác vụ định kỳ (Celery Tasks) cho module Facebook.
"""

import logging
from datetime import timedelta
from celery import shared_task
from django.utils import timezone

logger = logging.getLogger(__name__)


@shared_task(name="facebook.cleanup_stale_leads")
def cleanup_stale_facebook_leads_task():
    """
    Tác vụ chạy định kỳ (mỗi ngày lúc 3:00 sáng):
    Quét và tự động ẩn (archived) các hội thoại FacebookLead rác / không tương tác:
    - Trang Facebook có bật is_active = True
    - FacebookLead không có SĐT (detected_phone trống)
    - FacebookLead chưa liên kết với Khách hàng CRM (customer = None)
    - Không có tin nhắn tương tác trong X ngày qua (> page_config.lead_cleanup_days)
    """
    from facebook_integration.models import FacebookPageConfig, FacebookLead

    configs = FacebookPageConfig.objects.filter(is_active=True)
    total_archived = 0

    for config in configs:
        cutoff_date = timezone.now() - timedelta(days=config.lead_cleanup_days)

        stale_leads = FacebookLead.objects.filter(
            page_config=config,
            is_archived=False,
            customer__isnull=True,
            detected_phone__isnull=True,
            last_message_at__lt=cutoff_date,
        )

        count = stale_leads.count()
        if count > 0:
            updated = stale_leads.update(is_archived=True)
            total_archived += updated
            logger.info(
                f"[FacebookTask:CleanupLeads] Trang {config.page_name} (Công ty {config.company.name}): "
                f"Đã ẩn (archive) {updated} FacebookLead không tương tác > {config.lead_cleanup_days} ngày."
            )

    if total_archived == 0:
        logger.info("[FacebookTask:CleanupLeads] ✅ Database sạch sẽ, không có FacebookLead nào cần dọn dẹp.")

    return {"archived_count": total_archived}


@shared_task(name="facebook.handle_comment_event")
def handle_fb_comment_task(page_id: str, value: dict):
    """
    Xử lý sự kiện bình luận Facebook bất đồng bộ qua Celery Worker:
    - Like bình luận
    - Trả lời bình luận
    - Gửi tin nhắn riêng (Private Reply)
    - Ghi log tương tác
    """
    try:
        from facebook_integration.services import process_fb_comment_bot_event
        process_fb_comment_bot_event(page_id, value)
    except Exception as e:
        logger.error(f"[FB Task] Error processing comment event for page {page_id}: {e}")

