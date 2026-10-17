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

    @classmethod
    def record_token_usage(cls, company_id, session_id, input_tokens=0, output_tokens=0, cost_usd=0.0):
        """Ghi nhận token và chi phí tích lũy theo thời gian thực cho phiên live"""
        if not redis_client:
            return {
                'total_tokens': input_tokens + output_tokens,
                'total_input_tokens': input_tokens,
                'total_output_tokens': output_tokens,
                'total_cost_usd': round(float(cost_usd), 5),
                'total_ai_replies': 1
            }
        key = cls._get_key(company_id, session_id)
        total_tokens = input_tokens + output_tokens
        try:
            redis_client.hincrby(key, 'total_input_tokens', int(input_tokens))
            redis_client.hincrby(key, 'total_output_tokens', int(output_tokens))
            redis_client.hincrby(key, 'total_tokens', int(total_tokens))
            redis_client.hincrby(key, 'total_ai_replies', 1)
            redis_client.hincrbyfloat(key, 'total_cost_usd', float(cost_usd))
            redis_client.expire(key, cls.TTL_SECONDS)
        except Exception as e:
            logger.warning(f"Error recording token usage in LiveContext: {e}")
        return cls.get_token_usage(company_id, session_id)

    @classmethod
    def get_token_usage(cls, company_id, session_id):
        """Lấy tổng hợp token và chi phí tích lũy của phiên live"""
        if not redis_client:
            return {
                'total_tokens': 0,
                'total_input_tokens': 0,
                'total_output_tokens': 0,
                'total_cost_usd': 0.0,
                'total_ai_replies': 0,
            }
        key = cls._get_key(company_id, session_id)
        try:
            raw = redis_client.hmget(key, ['total_tokens', 'total_input_tokens', 'total_output_tokens', 'total_cost_usd', 'total_ai_replies'])
            return {
                'total_tokens': int(raw[0] or 0),
                'total_input_tokens': int(raw[1] or 0),
                'total_output_tokens': int(raw[2] or 0),
                'total_cost_usd': round(float(raw[3] or 0.0), 5),
                'total_ai_replies': int(raw[4] or 0),
            }
        except Exception as e:
            logger.debug(f"Error getting token usage from LiveContext: {e}")
            return {
                'total_tokens': 0,
                'total_input_tokens': 0,
                'total_output_tokens': 0,
                'total_cost_usd': 0.0,
                'total_ai_replies': 0,
            }

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
