import logging
from .services import redis_client

logger = logging.getLogger(__name__)

class SequenceUnavailableException(Exception):
    pass

class LiveSequenceService:
    """
    Service để quản lý sequence number cho các messages chiều Cloud -> Device.
    Sử dụng Redis DB2 (cùng database với LiveContext).
    """
    TTL_SECONDS = 86400  # 24 hours, same as LiveContextService

    @staticmethod
    def _get_key(company_id: str, session_id: str, direction: str) -> str:
        return f"live:company:{company_id}:session:{session_id}:sequence:{direction}"

    @classmethod
    def get_next_sequence(cls, company_id: str, session_id: str, direction: str = "cloud_to_device") -> int:
        """
        Lấy sequence tiếp theo một cách atomic bằng Redis INCR.
        Đồng thời reset TTL của key nếu cần thiết.
        """
        if not redis_client:
            logger.error("Redis client is not available for LiveSequenceService.")
            raise SequenceUnavailableException("Redis client unavailable.")
            
        key = cls._get_key(company_id, session_id, direction)
        
        try:
            # INCR creates the key if it doesn't exist and increments to 1
            seq = redis_client.incr(key)
            
            # Set expiration if it's the first time or periodically refresh TTL
            # Using TTL to check if it has an expiration set (-1 means no expiry)
            ttl = redis_client.ttl(key)
            if ttl == -1 or ttl == -2:
                redis_client.expire(key, cls.TTL_SECONDS)
                
            return seq
        except Exception as e:
            logger.error(f"Error incrementing sequence for {key}: {e}")
            raise SequenceUnavailableException(f"Failed to increment sequence: {e}")

    @classmethod
    def clear_sequence(cls, company_id: str, session_id: str, direction: str = "cloud_to_device"):
        """
        Xoá sequence counter. Thường được gọi khi session thực sự kết thúc (tearDown).
        Không gọi hàm này khi Device chỉ đơn thuần disconnect/reconnect.
        """
        if not redis_client:
            return
            
        key = cls._get_key(company_id, session_id, direction)
        try:
            redis_client.delete(key)
        except Exception as e:
            logger.error(f"Error clearing sequence for {key}: {e}")
