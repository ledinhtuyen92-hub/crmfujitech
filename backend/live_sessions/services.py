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
    def clear_context(cls, company_id, session_id):
        if not redis_client:
            return
        key = cls._get_key(company_id, session_id)
        redis_client.delete(key)
