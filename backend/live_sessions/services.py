import json
import redis
import logging
from django.conf import settings

logger = logging.getLogger(__name__)

def get_redis_client():
    url = getattr(settings, "CELERY_BROKER_URL", "redis://redis:6379/1")
    # Thay đổi thành DB 2
    if url.endswith("/1") or url.endswith("/0"):
        url = url[:-2] + "/2"
    elif not url.endswith("/") and not url[-1].isdigit():
        url = url + "/2"
    return redis.Redis.from_url(url, decode_responses=True)

try:
    redis_client = get_redis_client()
except Exception as e:
    logger.error(f"Failed to init Redis for LiveContext: {e}")
    redis_client = None

class LiveContextService:
    TTL_SECONDS = 86400  # 24 hours

    @staticmethod
    def _get_key(company_id, session_id):
        return f"live:company:{company_id}:session:{session_id}:context"

    @classmethod
    def set_context(cls, company_id, session_id, context_dict):
        if not redis_client:
            return
        key = cls._get_key(company_id, session_id)
        
        mapping = {}
        for k, v in context_dict.items():
            if isinstance(v, (dict, list, bool, int, float)):
                mapping[k] = json.dumps(v)
            else:
                mapping[k] = str(v)

        if mapping:
            redis_client.hset(key, mapping=mapping)
            redis_client.expire(key, cls.TTL_SECONDS)

    @classmethod
    def get_context(cls, company_id, session_id):
        if not redis_client:
            return {}
        key = cls._get_key(company_id, session_id)
        raw_data = redis_client.hgetall(key)
        
        result = {}
        for k, v in raw_data.items():
            try:
                result[k] = json.loads(v)
            except (json.JSONDecodeError, TypeError):
                result[k] = v
        return result

    @classmethod
    def update_context(cls, company_id, session_id, updates):
        cls.set_context(company_id, session_id, updates)

    @classmethod
    def add_to_history(cls, company_id, session_id, role, content, max_length=10):
        if not redis_client:
            return
            
        context = cls.get_context(company_id, session_id)
        history = context.get('recent_history', [])
        if not isinstance(history, list):
            history = []
            
        history.append({"role": role, "content": content})
        
        if len(history) > max_length:
            history = history[-max_length:]
            
        cls.update_context(company_id, session_id, {'recent_history': history})

    @classmethod
    def clear_context(cls, company_id, session_id):
        if not redis_client:
            return
        key = cls._get_key(company_id, session_id)
        redis_client.delete(key)

class LiveCommentDedupService:
    TTL_SECONDS = 3600

    @classmethod
    def is_new_comment(cls, company_id: str, session_id: str, comment_id: str) -> bool:
        if not redis_client:
            return True
            
        key = f"live:comment:dedup:{company_id}:{session_id}:{comment_id}"
        # Use SET NX EX
        # Returns True if set was successful (new comment)
        return bool(redis_client.set(key, "1", nx=True, ex=cls.TTL_SECONDS))

class LivePollingLockService:
    TTL_SECONDS = 10
    
    @classmethod
    def acquire_lock(cls, company_id: str, session_id: str) -> bool:
        if not redis_client:
            return True
            
        key = f"live:polling:lock:{company_id}:{session_id}"
        return bool(redis_client.set(key, "1", nx=True, ex=cls.TTL_SECONDS))
        
    @classmethod
    def release_lock(cls, company_id: str, session_id: str):
        if not redis_client:
            return
            
        key = f"live:polling:lock:{company_id}:{session_id}"
        redis_client.delete(key)
