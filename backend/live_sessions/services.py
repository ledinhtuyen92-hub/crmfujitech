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


import re
from typing import Optional

class LiveProductMatchingService:
    """
    Phân tích câu bình luận của người xem và so khớp với danh sách sản phẩm trong giỏ hàng Live.
    Hỗ trợ phát hiện mã gọi (mã 1, mã 02, sp 3, mẫu 4), SKU, hoặc từ khóa tên sản phẩm.
    """
    INDEX_PATTERNS = [
        re.compile(r'(?i)\b(?:mã|sp|sản phẩm|mẫu|số|ms|cái|item)\s*(?:số)?\s*#?([0-9]{1,3})\b'),
        re.compile(r'(?i)#([0-9]{1,3})\b'),
        re.compile(r'(?i)\b(?:m|sp)([0-9]{1,3})\b'),
    ]

    @classmethod
    def match_product(cls, session, text: str):
        if not text:
            return None

        clean_text = text.strip()
        lower_text = clean_text.lower()

        # 1. So khớp mã số thứ tự gọi trong live (item_index)
        for pattern in cls.INDEX_PATTERNS:
            match = pattern.search(clean_text)
            if match:
                for grp in match.groups():
                    if grp and grp.isdigit():
                        idx = int(grp)
                        matched = session.session_products.filter(item_index=idx).first()
                        if matched:
                            return matched

        # 2. So khớp theo SKU sản phẩm
        products = list(session.session_products.all())
        for prod in products:
            if prod.sku and len(prod.sku) >= 2 and prod.sku.lower() in lower_text:
                return prod

        # 3. So khớp theo Tên sản phẩm
        for prod in products:
            if prod.name:
                p_name_lower = prod.name.lower()
                if len(p_name_lower) >= 4 and p_name_lower in lower_text:
                    return prod
                # Thử so khớp chuỗi từ khóa chính
                keywords = [w for w in p_name_lower.split() if len(w) >= 3 and w not in ('màu', 'size', 'loại', 'hàng', 'của', 'cho', 'này', 'bên')]
                if len(keywords) >= 2:
                    phrase = " ".join(keywords[:3])
                    if phrase in lower_text:
                        return prod

        return None

    @classmethod
    def execute_instant_pin(cls, product) -> bool:
        """
        Kích hoạt ghim tức thời sản phẩm khi có comment hoặc trigger xoay vòng,
        đồng thời đồng bộ Shopee API và gửi lệnh WebSocket cập nhật Live Studio Overlay.
        """
        session = product.session
        product.pin()

        from .models import LiveSession, LivePlatformProduct

        # Đồng bộ Shopee API nếu phiên đang chạy ở chế độ API
        if (
            session.status == LiveSession.STATUS_RUNNING
            and session.platform == LivePlatformProduct.PLATFORM_SHOPEE
            and getattr(session, 'shopee_connection_mode', None) == LiveSession.SHOPEE_CONNECTION_API
            and product.platform_item_id
        ):
            try:
                from .platforms.shopee import ShopeeAdapter
                adapter = ShopeeAdapter(company_id=session.company_id)
                adapter.set_highlighted_product(str(session.id), product.platform_item_id)
            except Exception as e:
                logger.warning(f"Shopee API instant pin failed for product {product.id}: {e}")

        # Phát event Console tới Studio Web
        try:
            from .console_events import LiveConsoleEventService
            LiveConsoleEventService.emit(
                session_id=str(session.id),
                event_type="live.product.pinned",
                payload={
                    "product_id": str(product.id),
                    "item_index": product.item_index,
                    "name": product.name,
                    "live_price": str(product.live_price) if product.live_price is not None else None,
                    "original_price": str(product.original_price) if product.original_price is not None else None,
                    "image_url": product.effective_image_url,
                }
            )
        except Exception:
            pass

        # Gửi WebSocket event tới Live Studio Desktop để cập nhật overlay thẻ sản phẩm
        try:
            from channels.layers import get_channel_layer
            from asgiref.sync import async_to_sync
            channel_layer = get_channel_layer()
            session_group_name = f"live_session_{session.id}_device"
            async_to_sync(channel_layer.group_send)(
                session_group_name,
                {
                    "type": "send.command",
                    "envelope": {
                        "protocol_version": "1.0",
                        "type": "event",
                        "name": "overlay.product_pinned",
                        "session_id": str(session.id),
                        "payload": {
                            "product_id": str(product.id),
                            "item_index": product.item_index,
                            "name": product.name,
                            "original_price": str(product.original_price) if product.original_price is not None else None,
                            "live_price": str(product.live_price) if product.live_price is not None else None,
                            "image_url": product.effective_image_url,
                            "selling_points": product.selling_points or "",
                        }
                    }
                }
            )
        except Exception:
            pass

        return True


class LiveVoucherMatchingService:
    """
    Phát hiện câu hỏi về voucher/mã giảm giá/freeship và kích hoạt ghim voucher.
    """
    VOUCHER_KEYWORDS = [
        "voucher", "mã giảm giá", "mã giảm", "mã ưu đãi", "mã khuyến mãi",
        "freeship", "miễn phí vận chuyển", "mã freeship", "mã ship", "mã hoàn xu", "xu"
    ]

    @classmethod
    def match_and_pin_voucher(cls, session, text: str):
        if not text:
            return None

        lower = text.lower()
        if not any(kw in lower for kw in cls.VOUCHER_KEYWORDS):
            return None

        voucher = session.session_vouchers.filter(is_active=True).first()
        if not voucher:
            return None

        voucher.pin()

        try:
            from .console_events import LiveConsoleEventService
            LiveConsoleEventService.emit(
                session_id=str(session.id),
                event_type="live.voucher.pinned",
                payload={
                    "voucher_id": str(voucher.id),
                    "voucher_code": voucher.voucher_code,
                    "discount_text": voucher.discount_text,
                    "min_order_value": str(voucher.min_order_value) if voucher.min_order_value is not None else None,
                }
            )
        except Exception:
            pass

        return voucher
