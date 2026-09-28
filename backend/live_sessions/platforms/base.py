from typing import List, Dict, Any, Optional
from .capabilities import Capability
from .exceptions import CapabilityNotSupportedError
from .events import LiveCommentEvent

class BasePlatformAdapter:
    def __init__(self, company_id: int):
        self.company_id = company_id

    def get_capabilities(self) -> List[Capability]:
        """Return a list of supported capabilities by this platform adapter."""
        return []

    def _check_capability(self, capability: Capability):
        if capability not in self.get_capabilities():
            raise CapabilityNotSupportedError(f"Capability {capability.value} is not supported by this platform.")

    def authenticate(self) -> bool:
        self._check_capability(Capability.AUTH)
        raise NotImplementedError()
        
    def refresh_token(self) -> bool:
        self._check_capability(Capability.AUTH)
        raise NotImplementedError()

    def get_account(self) -> Dict[str, Any]:
        self._check_capability(Capability.AUTH)
        raise NotImplementedError()

    def get_live_status(self, session_id: str) -> str:
        self._check_capability(Capability.LIVE_STATUS)
        raise NotImplementedError()

    def start_live(self, session_id: str) -> Dict[str, Any]:
        self._check_capability(Capability.LIVE_START)
        raise NotImplementedError()

    def stop_live(self, session_id: str) -> bool:
        self._check_capability(Capability.LIVE_STOP)
        raise NotImplementedError()

    def get_comments(self, session_id: str) -> List[LiveCommentEvent]:
        self._check_capability(Capability.LIVE_COMMENTS)
        raise NotImplementedError()

    def send_comment_reply(self, session_id: str, text: str) -> bool:
        self._check_capability(Capability.LIVE_COMMENT_REPLY)
        raise NotImplementedError()

    def get_products(self) -> List[Dict[str, Any]]:
        self._check_capability(Capability.PRODUCT_READ)
        raise NotImplementedError()

    def map_product(self, product_id: str) -> str:
        self._check_capability(Capability.PRODUCT_MAPPING)
        raise NotImplementedError()

    def attach_product_to_live(self, session_id: str, platform_product_id: str) -> bool:
        self._check_capability(Capability.PRODUCT_ATTACH)
        raise NotImplementedError()

    def get_order_events(self) -> List[Dict[str, Any]]:
        self._check_capability(Capability.ORDER_EVENTS)
        raise NotImplementedError()

    def publish_stream(self, session_id: str) -> bool:
        self._check_capability(Capability.STREAM_PUBLISH)
        raise NotImplementedError()
