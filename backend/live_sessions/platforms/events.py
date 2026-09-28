from dataclasses import dataclass, field
from datetime import datetime
from typing import Dict, Any, Optional

@dataclass
class LiveCommentEvent:
    event_id: str
    company_id: int
    session_id: str
    platform: str
    platform_comment_id: str
    user_id: str
    display_name: str
    text: str
    created_at: datetime
    metadata: Dict[str, Any] = field(default_factory=dict)
