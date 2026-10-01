from typing import List, Dict, Any, Optional
import logging

from .base import BasePlatformAdapter
from .capabilities import Capability
from .events import LiveCommentEvent

logger = logging.getLogger(__name__)

class TikTokAdapter(BasePlatformAdapter):
    """
    TikTok Platform Adapter.
    TikTok's official API currently restricts automatic LIVE creation (RTMP provision)
    for most developers. Therefore, LIVE_START capability is explicitly OMITTED 
    for the standard integration, enforcing the use of Manual RTMP or external 
    camera workflow.
    """
    
    def get_capabilities(self) -> List[Capability]:
        return [
            Capability.AUTH,
            Capability.LIVE_STATUS,
            Capability.LIVE_COMMENTS,
            # Capability.LIVE_START, # Intentionally excluded: API RTMP creation restricted
            # Capability.LIVE_STOP,  # Intentionally excluded
            # Capability.PRODUCT_ATTACH,
            # Capability.STREAM_PUBLISH
        ]

    def authenticate(self) -> bool:
        self._check_capability(Capability.AUTH)
        # Mock auth process for TikTok
        logger.info(f"Authenticating with TikTok for company {self.company_id}")
        return True
        
    def refresh_token(self) -> bool:
        self._check_capability(Capability.AUTH)
        return True

    def get_account(self) -> Dict[str, Any]:
        self._check_capability(Capability.AUTH)
        return {
            "platform": "tiktok",
            "username": "tiktok_user",
            "status": "connected"
        }

    def get_live_status(self, session_id: str) -> str:
        self._check_capability(Capability.LIVE_STATUS)
        # Mock check
        return "UNKNOWN"

    def get_comments(self, session_id: str) -> List[LiveCommentEvent]:
        self._check_capability(Capability.LIVE_COMMENTS)
        # In reality, this would connect to TikTok's Webcast API
        return []

