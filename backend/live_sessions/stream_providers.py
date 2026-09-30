"""
Phase 1E-8: Stream Provider Abstraction

Normalizes both Shopee API and Manual RTMP modes into a unified StreamTarget dict
that is consumed by LiveOrchestrator.dispatch_stream_start().

Architecture:
    ShopeeApiStreamProvider     -> StreamTarget dict
    ShopeeManualRtmpProvider    -> StreamTarget dict
    (Future: TikTokStreamProvider, YouTubeStreamProvider, ...)
                                        |
                                LiveOrchestrator
                                        |
                               stream.start envelope
                                        |
                               Live Studio / FFmpeg
"""
import logging
from typing import Dict, Any, Optional

logger = logging.getLogger(__name__)

# ─────────────────────────────────────────────────────────────────────────────
# Platform stream config profiles
# ─────────────────────────────────────────────────────────────────────────────

STREAM_PROFILE_GENERIC = {
    "width": 800,
    "height": 600,
    "fps": 30,
    "video_codec": "libx264",
    "bitrate": "2500k",
    "audio_sample_rate": 44100,
    "audio_channels": 2,
}

# Shopee Live recommends 9:16 vertical at 720x1280
# Source: Shopee VN OBS guide, Shopee Vietnam Live Capability Audit 2026
STREAM_PROFILE_SHOPEE = {
    "width": 720,
    "height": 1280,
    "fps": 30,
    "video_codec": "libx264",
    "bitrate": "2500k",
    "audio_sample_rate": 44100,
    "audio_channels": 2,
}

PLATFORM_PROFILES = {
    "shopee": STREAM_PROFILE_SHOPEE,
    "tiktok": STREAM_PROFILE_SHOPEE,   # Also vertical; refine when TikTok is implemented
    "custom": STREAM_PROFILE_GENERIC,
}


def get_stream_profile(platform: str) -> Dict[str, Any]:
    """Return the appropriate StreamConfig profile for a given platform."""
    return dict(PLATFORM_PROFILES.get(platform, STREAM_PROFILE_GENERIC))


# ─────────────────────────────────────────────────────────────────────────────
# Base provider
# ─────────────────────────────────────────────────────────────────────────────

class BaseStreamProvider:
    """
    Abstract base for all stream providers.
    
    Subclasses must implement get_stream_target() which returns a dict
    containing at minimum 'stream_url' plus optional video/audio config.
    The result is consumed directly by LiveOrchestrator.dispatch_stream_start().
    """

    def get_stream_target(self, session) -> Dict[str, Any]:
        """
        Returns a StreamTarget dict:
        {
            "stream_url": "rtmp://...",
            "width": 720,
            "height": 1280,
            "fps": 30,
            "video_codec": "libx264",
            "bitrate": "2500k",
            "audio_sample_rate": 44100,
            "audio_channels": 2
        }
        Raises PlatformAPIError / ValueError on failure.
        """
        raise NotImplementedError


# ─────────────────────────────────────────────────────────────────────────────
# Shopee Manual RTMP Provider
# ─────────────────────────────────────────────────────────────────────────────

class ShopeeManualRtmpProvider(BaseStreamProvider):
    """
    Manual RTMP mode: stream_url already stored in LiveSession.stream_url.
    The user entered Server URL + Stream Key manually via the Admin UI.
    These were combined and stored as stream_url during setup.
    
    This provider simply reads and validates the stored URL.
    No Shopee API call is made.
    """

    def get_stream_target(self, session) -> Dict[str, Any]:
        from live_sessions.platforms.exceptions import PlatformAPIError

        stream_url = session.stream_url
        if not stream_url:
            raise PlatformAPIError(
                "Manual RTMP mode: stream_url is missing. "
                "Please enter Server URL and Stream Key in the session settings."
            )

        import re
        if not re.match(r"^rtmps?://.+", stream_url):
            raise PlatformAPIError(
                f"Manual RTMP mode: stream_url '{stream_url[:30]}...' is not a valid RTMP URL."
            )

        profile = get_stream_profile(session.platform)
        return {
            "stream_url": stream_url,
            **profile,
        }


# ─────────────────────────────────────────────────────────────────────────────
# Shopee API Provider
# ─────────────────────────────────────────────────────────────────────────────

class ShopeeApiStreamProvider(BaseStreamProvider):
    """
    API mode: calls Shopee Open Platform to create a new session and obtain
    the RTMP push_url dynamically.

    Flow (per Shopee VN Capability Audit 2026):
        1. create_session → receives push_url + external_session_id
        2. start_session  → officially starts the broadcast
        3. Returns push_url as the stream_url

    Requirements:
        - PlatformAccount with user_id (Shopee Livestream API requires user_id, not shop_id)
        - Valid access_token (auto-refreshed if near-expiry)
        - "Livestream Management" app approved by Shopee

    NOTE: This provider's API calls are MOCKED in tests.
    Production use requires real Shopee developer app approval.
    """

    def get_stream_target(self, session) -> Dict[str, Any]:
        from live_sessions.platforms.shopee import ShopeeAdapter
        from live_sessions.platforms.exceptions import PlatformAPIError

        adapter = ShopeeAdapter(company_id=session.company_id)

        # Step 1: create_session → get push_url
        logger.info(f"[ShopeeApiStreamProvider] Creating Shopee session for LiveSession {session.id}")
        create_result = adapter.create_live_session(str(session.id))

        push_url = create_result.get("push_url") or create_result.get("stream_url")
        external_session_id = create_result.get("external_session_id")

        if not push_url:
            raise PlatformAPIError(
                "Shopee create_session did not return a push_url. "
                "Ensure the Shopee app is approved for Livestream Management."
            )

        # Step 2: start_session (officially starts broadcast on Shopee)
        logger.info(f"[ShopeeApiStreamProvider] Starting Shopee session {external_session_id}")
        adapter.start_live_session(str(session.id))

        # Persist external_session_id and stream_url for later stop/status calls
        session.stream_url = push_url
        if external_session_id:
            session.external_session_id = str(external_session_id)
        session.save(update_fields=["stream_url", "external_session_id"])

        profile = get_stream_profile(session.platform)
        return {
            "stream_url": push_url,
            **profile,
        }


# ─────────────────────────────────────────────────────────────────────────────
# Provider Factory
# ─────────────────────────────────────────────────────────────────────────────

def get_stream_provider(session) -> BaseStreamProvider:
    """
    Factory: returns the appropriate stream provider for a LiveSession.

    Decision logic:
    - If session.platform == 'shopee' AND shopee_connection_mode == 'api' → ShopeeApiStreamProvider
    - If session.platform == 'shopee' AND shopee_connection_mode == 'manual_rtmp' → ShopeeManualRtmpProvider
    - Otherwise (custom, or no mode set) → ShopeeManualRtmpProvider (reads session.stream_url)
    """
    from live_sessions.models import LiveSession

    platform = session.platform
    mode = getattr(session, "shopee_connection_mode", None)

    if platform == "shopee" and mode == LiveSession.SHOPEE_CONNECTION_API:
        return ShopeeApiStreamProvider()

    # Manual RTMP is the default / fallback — reads pre-stored stream_url
    return ShopeeManualRtmpProvider()
