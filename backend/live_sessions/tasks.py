import logging
from celery import shared_task
from typing import Optional

from .orchestrator import LiveOrchestrator
from .models import LiveSession
from .platforms.shopee import ShopeeAdapter
from .platforms.exceptions import PlatformAPIError, PlatformAuthError, PlatformRateLimitError
from .services import LiveCommentDedupService, LivePollingLockService

logger = logging.getLogger(__name__)

@shared_task(bind=True, max_retries=3)
def handle_live_message(self, session_id: str, user_message: str, correlation_id: Optional[str] = None):
    """
    Celery task để xử lý comment từ live stream một cách bất đồng bộ.
    Tránh blocking ASGI event loop.
    """
    logger.info(f"Task handle_live_message started for session {session_id} with correlation_id {correlation_id}")
    
    orchestrator = LiveOrchestrator()
    try:
        result = orchestrator.process_comment(
            session_id=session_id,
            user_message=user_message,
            correlation_id=correlation_id
        )
        return result
    except Exception as e:
        logger.error(f"Task handle_live_message failed for session {session_id}: {e}")
        # Không retry cho các lỗi logic business, chỉ retry cho network issues nếu cần
        # MVP: không retry vô hạn.
        raise

@shared_task(bind=True, max_retries=10)
def poll_shopee_live_comments(self, session_id: str):
    """
    Background polling task for Shopee LIVE comments.
    """
    logger.info(f"Starting poll_shopee_live_comments for session {session_id}")
    
    # 1. Resolve LiveSession
    try:
        session = LiveSession.objects.get(id=session_id)
    except LiveSession.DoesNotExist:
        logger.warning(f"Session {session_id} not found. Stopping polling.")
        return
        
    company_id = session.company_id
    
    # 2. Validate status
    if session.status != LiveSession.STATUS_RUNNING:
        logger.info(f"Session {session_id} is not RUNNING (status: {session.status}). Stopping polling.")
        return
        
    # 3. Acquire Redis polling lock
    if not LivePollingLockService.acquire_lock(str(company_id), str(session_id)):
        logger.info(f"Could not acquire polling lock for session {session_id}. Another worker is running.")
        return
        
    try:
        # 4. Fetch comments
        adapter = ShopeeAdapter(company_id=company_id)
        comments, has_more = adapter.get_comments(session_id=str(session_id), offset=0)
        
        processed_count = 0
        for comment in comments:
            if processed_count >= 50:
                break
                
            # 5. Dedup per comment
            is_new = LiveCommentDedupService.is_new_comment(
                str(company_id), str(session_id), comment.platform_comment_id
            )
            
            if is_new:
                # 6. Forward to handle_live_message
                handle_live_message.delay(
                    session_id=str(session_id),
                    user_message=comment.text,
                    correlation_id=comment.event_id
                )
            
            processed_count += 1
            
        if len(comments) >= 50 and has_more:
            logger.warning(f"[Session {session_id}] Pagination truncation: Processed {processed_count} comments, but has_more=True remains.")
            
        # Release lock immediately before scheduling next tick
        LivePollingLockService.release_lock(str(company_id), str(session_id))
        
        # 7. Schedule next poll
        session.refresh_from_db()
        if session.status == LiveSession.STATUS_RUNNING:
            poll_shopee_live_comments.apply_async(kwargs={"session_id": session_id}, countdown=3)
            
    except PlatformAuthError as e:
        logger.error(f"PlatformAuthError polling Shopee for session {session_id}: {e}")
        session.change_status(LiveSession.STATUS_ERROR)
        LivePollingLockService.release_lock(str(company_id), str(session_id))
        return
    except PlatformRateLimitError as e:
        logger.warning(f"Rate limited polling Shopee for session {session_id}: {e}. Backing off 10s.")
        LivePollingLockService.release_lock(str(company_id), str(session_id))
        # Schedule with backoff
        session.refresh_from_db()
        if session.status == LiveSession.STATUS_RUNNING:
            poll_shopee_live_comments.apply_async(kwargs={"session_id": session_id}, countdown=10)
        return
    except PlatformAPIError as e:
        logger.error(f"PlatformAPIError polling Shopee for session {session_id}: {e}")
        LivePollingLockService.release_lock(str(company_id), str(session_id))
        # Retry using celery mechanism (wait 3s normally)
        try:
            self.retry(countdown=3)
        except self.MaxRetriesExceededError:
            logger.error(f"Max retries exceeded for session {session_id} polling. Transitioning to ERROR.")
            session.change_status(LiveSession.STATUS_ERROR)
        return
    except Exception as e:
        logger.error(f"Unexpected error polling Shopee for session {session_id}: {e}")
        LivePollingLockService.release_lock(str(company_id), str(session_id))
        try:
            self.retry(countdown=3)
        except self.MaxRetriesExceededError:
            session.change_status(LiveSession.STATUS_ERROR)
        return
