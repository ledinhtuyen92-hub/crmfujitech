import re
from dataclasses import dataclass
from typing import Optional

@dataclass
class RtmpStreamTarget:
    url: str

    def __post_init__(self):
        if not self.url:
            raise ValueError("RTMP URL cannot be empty")
        
        # Simple validation for rtmp/rtmps
        if not re.match(r"^rtmps?://.+$", self.url):
            raise ValueError(f"Invalid RTMP URL format")

    @property
    def host(self) -> str:
        # Extract host
        match = re.match(r"^(rtmps?://)([^/:]+)", self.url)
        if match:
            return match.group(2)
        return "unknown"

    def get_safe_log_metadata(self) -> dict:
        """Returns safe metadata without exposing the full URL or stream key."""
        return {
            "platform": "rtmp",
            "host": self.host,
        }

    def get_full_url(self) -> str:
        """Returns the full URL for the StreamEncoder. NEVER log this."""
        return self.url
