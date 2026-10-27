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


@shared_task(name="facebook.poll_recent_comments")
def poll_recent_comments_task():
    """
    Tác vụ định kỳ quét và phản hồi bình luận mới cho các trang đang bật Auto Bot.
    Chạy dự phòng để đảm bảo 100% bình luận được phản hồi ngay cả khi Meta Webhook bị trễ/lỗi.
    """
    from facebook_integration.models import FacebookPageConfig
    from facebook_integration.services import scan_and_reply_page_comments

    active_pages = FacebookPageConfig.objects.filter(is_active=True, enable_bot=True)
    total_processed = 0

    for page in active_pages:
        try:
            res = scan_and_reply_page_comments(page)
            total_processed += res.get("processed", 0)
        except Exception as e:
            logger.error(f"[FB Poll Task] Error polling comments for page {page.page_id}: {e}")

    return {"total_replied": total_processed}


@shared_task(name="facebook.cleanup_stale_bot_logs")
def cleanup_stale_bot_logs_task(days: int = 90):
    """
    Tác vụ định kỳ (mỗi ngày lúc 3:30 sáng):
    Tự động xóa các bản ghi nhật ký hoạt động của Bot cũ hơn 90 ngày
    để giữ cho cơ sở dữ liệu luôn tinh gọn, tối ưu hiệu năng.
    """
    from facebook_integration.models import FacebookBotActivityLog
    cutoff_date = timezone.now() - timedelta(days=days)
    deleted_count, _ = FacebookBotActivityLog.objects.filter(created_at__lt=cutoff_date).delete()
    if deleted_count > 0:
        logger.info(f"[FacebookTask:CleanupBotLogs] Đã tự động xóa {deleted_count} bản ghi nhật ký Bot cũ hơn {days} ngày.")
    return {"deleted_count": deleted_count}

