"""
Quản lý trạng thái hiện diện (Online / Offline) của người dùng thông qua Redis.
Hỗ trợ cả Async (cho WebSocket Consumer) và Sync (cho Django Views).
"""
import asyncio
import logging
import os
import redis
import redis.asyncio as aioredis

logger = logging.getLogger(__name__)

REDIS_HOST = os.getenv("REDIS_HOST", "redis")
REDIS_PORT = int(os.getenv("REDIS_PORT", "6379"))
REDIS_DB = int(os.getenv("REDIS_PRESENCE_DB", "0"))
REDIS_URL = os.getenv("REDIS_URL") or f"redis://{REDIS_HOST}:{REDIS_PORT}/{REDIS_DB}"

# Khách async tái sử dụng theo event loop
_async_redis = None
_async_redis_loop = None


def get_async_redis():
    global _async_redis, _async_redis_loop
    try:
        current_loop = asyncio.get_running_loop()
    except RuntimeError:
        current_loop = None

    if _async_redis is None or _async_redis_loop != current_loop:
        _async_redis = aioredis.from_url(
            REDIS_URL,
            decode_responses=True,
            socket_timeout=3.0,
            socket_connect_timeout=3.0,
        )
        _async_redis_loop = current_loop
    return _async_redis


# Khách sync tái sử dụng
_sync_redis = None


def get_sync_redis():
    global _sync_redis
    if _sync_redis is None:
        _sync_redis = redis.from_url(
            REDIS_URL,
            decode_responses=True,
            socket_timeout=3.0,
            socket_connect_timeout=3.0,
        )
    return _sync_redis


async def add_user_presence(company_id: int, user_id: int, channel_name: str) -> bool:
    """
    Ghi nhận một kết nối WebSocket mới của user.
    Trả về True nếu đây là tab đầu tiên của user (trước đó đang Offline).
    """
    if not company_id or not user_id:
        return False
    try:
        r = get_async_redis()
        user_channels_key = f"chat:user_channels:{user_id}"
        company_online_key = f"chat:company_online:{company_id}"

        # Đếm số tab trước khi thêm
        prev_count = await r.scard(user_channels_key)

        pipe = r.pipeline()
        pipe.sadd(user_channels_key, channel_name)
        pipe.expire(user_channels_key, 86400)
        pipe.sadd(company_online_key, str(user_id))
        pipe.expire(company_online_key, 86400)
        await pipe.execute()

        return prev_count == 0
    except Exception as e:
        logger.warning("Redis presence error in add_user_presence: %s", e)
        return True


async def remove_user_presence(company_id: int, user_id: int, channel_name: str) -> bool:
    """
    Xóa một kết nối WebSocket khi tab đóng.
    Trả về True nếu user đã đóng toàn bộ các tab (chuyển sang Offline).
    """
    if not company_id or not user_id:
        return False
    try:
        r = get_async_redis()
        user_channels_key = f"chat:user_channels:{user_id}"
        company_online_key = f"chat:company_online:{company_id}"

        await r.srem(user_channels_key, channel_name)
        remaining = await r.scard(user_channels_key)

        if remaining == 0:
            await r.srem(company_online_key, str(user_id))
            return True
        return False
    except Exception as e:
        logger.warning("Redis presence error in remove_user_presence: %s", e)
        return True


async def get_online_user_ids(company_id: int) -> set[int]:
    """
    Lấy danh sách ID các người dùng đang online trong công ty (Async).
    """
    if not company_id:
        return set()
    try:
        r = get_async_redis()
        company_online_key = f"chat:company_online:{company_id}"
        members = await r.smembers(company_online_key)
        return {int(uid) for uid in members if uid.isdigit()}
    except Exception as e:
        logger.warning("Redis presence error in get_online_user_ids: %s", e)
        return set()


def get_online_user_ids_sync(company_id: int) -> set[int]:
    """
    Lấy danh sách ID các người dùng đang online trong công ty (Sync cho Views).
    """
    if not company_id:
        return set()
    try:
        r = get_sync_redis()
        company_online_key = f"chat:company_online:{company_id}"
        members = r.smembers(company_online_key)
        return {int(uid) for uid in members if uid.isdigit()}
    except Exception as e:
        logger.warning("Redis presence error in get_online_user_ids_sync: %s", e)
        return set()
