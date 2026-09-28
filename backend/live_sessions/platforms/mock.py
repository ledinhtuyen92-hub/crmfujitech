import uuid
from typing import List, Dict, Any, Optional
from datetime import datetime
from .base import BasePlatformAdapter
from .capabilities import Capability
from .events import LiveCommentEvent

class MockPlatformAdapter(BasePlatformAdapter):
    def get_capabilities(self) -> List[Capability]:
        return list(Capability)

    def authenticate(self) -> bool:
        self._check_capability(Capability.AUTH)
        return True
        
    def refresh_token(self) -> bool:
        self._check_capability(Capability.AUTH)
        return True

    def get_account(self) -> Dict[str, Any]:
        self._check_capability(Capability.AUTH)
        return {
            "account_id": "mock_account_123",
            "display_name": "Mock Shop",
            "status": "active"
        }

    def get_live_status(self, session_id: str) -> str:
        self._check_capability(Capability.LIVE_STATUS)
        return "running"

    def start_live(self, session_id: str) -> Dict[str, Any]:
        self._check_capability(Capability.LIVE_START)
        return {
            "stream_key": "rtmp://mock.url/live/12345",
            "live_id": "mock_live_123"
        }

    def stop_live(self, session_id: str) -> bool:
        self._check_capability(Capability.LIVE_STOP)
        return True

    def get_comments(self, session_id: str) -> List[LiveCommentEvent]:
        self._check_capability(Capability.LIVE_COMMENTS)
        return []

    def send_comment_reply(self, session_id: str, text: str) -> bool:
        self._check_capability(Capability.LIVE_COMMENT_REPLY)
        return True

    def get_products(self) -> List[Dict[str, Any]]:
        self._check_capability(Capability.PRODUCT_READ)
        return [{"id": "mock_prod_1", "name": "Mock Product"}]

    def map_product(self, product_id: str) -> str:
        self._check_capability(Capability.PRODUCT_MAPPING)
        return "mock_mapped_" + product_id

    def attach_product_to_live(self, session_id: str, platform_product_id: str) -> bool:
        self._check_capability(Capability.PRODUCT_ATTACH)
        return True

    def get_order_events(self) -> List[Dict[str, Any]]:
        self._check_capability(Capability.ORDER_EVENTS)
        return []

    def publish_stream(self, session_id: str) -> bool:
        self._check_capability(Capability.STREAM_PUBLISH)
        return True

    def inject_mock_comment(self, session_id: str, user_id: str, display_name: str, text: str) -> LiveCommentEvent:
        """Helper method purely for testing/mocking to create a comment event."""
        return LiveCommentEvent(
            event_id=str(uuid.uuid4()),
            company_id=self.company_id,
            session_id=session_id,
            platform="mock",
            platform_comment_id=str(uuid.uuid4()),
            user_id=user_id,
            display_name=display_name,
            text=text,
            created_at=datetime.now(),
        )
