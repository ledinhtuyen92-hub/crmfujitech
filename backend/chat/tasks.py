import logging
import os
from datetime import timedelta
from celery import shared_task
from django.utils import timezone
from .models import ChatCompanyConfig, ChatMessage, Conversation
from users.models import Company

logger = logging.getLogger(__name__)


@shared_task(name="chat.cleanup_old_messages")
def cleanup_old_messages():
    """
    Tự động quét và dọn dẹp các tin nhắn chat cũ theo chính sách lưu trữ (retention_days)
    của từng công ty. Chạy ngầm định kỳ mỗi đêm lúc 02:00 sáng qua Celery Beat.
    """
    now = timezone.now()
    total_deleted_msgs = 0
    total_deleted_files = 0

    companies = Company.objects.all()
    for company in companies:
        config, _ = ChatCompanyConfig.objects.get_or_create(company=company)
        retention_days = config.retention_days

        # 0 = Lưu vĩnh viễn, không xóa
        if retention_days <= 0:
            continue

        cutoff_date = now - timedelta(days=retention_days)
        old_messages = ChatMessage.objects.filter(
            conversation__company=company,
            created_at__lt=cutoff_date
        )

        count = old_messages.count()
        if count == 0:
            continue

        # Xóa file vật lý trước khi xóa bản ghi
        for msg in old_messages.exclude(file=""):
            try:
                if msg.file and os.path.isfile(msg.file.path):
                    os.remove(msg.file.path)
                    total_deleted_files += 1
            except Exception as e:
                logger.warning("Lỗi xóa file chat cũ %s: %s", msg.id, e)

        # Xóa bản ghi tin nhắn trong DB
        deleted, _ = old_messages.delete()
        total_deleted_msgs += deleted
        logger.info(
            "Đã dọn dẹp %d tin nhắn chat cũ hơn %d ngày cho công ty %s",
            deleted, retention_days, company.name
        )

    logger.info(
        "Hoàn thành cleanup_old_messages: đã xóa %d tin nhắn và %d tệp tin vật lý.",
        total_deleted_msgs, total_deleted_files
    )
    return {
        "deleted_messages": total_deleted_msgs,
        "deleted_files": total_deleted_files,
    }


@shared_task(name="chat.clean_old_files_only")
def clean_old_files_only(company_id, days=30):
    """
    Dọn dẹp riêng các tệp tin / hình ảnh cũ hơn X ngày để giải phóng dung lượng ổ cứng,
    trong khi vẫn giữ lại nội dung văn bản tin nhắn.
    """
    cutoff = timezone.now() - timedelta(days=days)
    msgs = ChatMessage.objects.filter(
        conversation__company_id=company_id,
        created_at__lt=cutoff
    ).exclude(file="")

    deleted_files = 0
    for msg in msgs:
        try:
            if msg.file and os.path.isfile(msg.file.path):
                os.remove(msg.file.path)
                deleted_files += 1
            msg.file = None
            msg.file_name = f"[Tệp cũ đã dọn dẹp] {msg.file_name}"
            msg.save(update_fields=["file", "file_name"])
        except Exception as e:
            logger.warning("Lỗi dọn tệp tin chat: %s", e)

    return {"deleted_files": deleted_files}

