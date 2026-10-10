import os
import aiohttp
import logging
import tempfile
from typing import Optional

logger = logging.getLogger(__name__)

class AssetFetcher:
    """
    Fetches visual/audio assets via HTTP and stores them in local cache.
    """
    def __init__(self, token: str):
        self.token = token
        self.cache_dir = os.path.join(os.getcwd(), "assets", "cache")
        os.makedirs(self.cache_dir, exist_ok=True)

    async def fetch(self, url: str, asset_type: str) -> Optional[str]:
        """
        Downloads asset to a local cache file.
        Returns the absolute path to the file, or None if failed.
        """
        if not url:
            return None
            
        if url.startswith('/'):
            # In a real setup, parse the base URL from ws_url or config
            # But for local dev:
            url = f"http://localhost:8000{url}"

        # Determine extension from URL or fallback
        ext = os.path.splitext(url.split('?')[0])[1]
        if not ext:
            if asset_type == 'audio': ext = '.mp3'
            elif asset_type == 'avatar': ext = '.mp4'
            else: ext = '.png'
            
        # Use filename from URL as cache key
        filename = url.split('/')[-1].split('?')[0]
        if not filename:
            filename = f"{asset_type}{ext}"
            
        cache_path = os.path.join(self.cache_dir, filename)
        
        # Avoid redownloading if exists
        if os.path.exists(cache_path):
            logger.info(f"Asset {asset_type} found in cache: {cache_path}")
            return cache_path

        logger.info(f"Downloading {asset_type} asset from {url}...")
        headers = {"Authorization": f"Device {self.token}"}
        
        retries = 2
        for attempt in range(retries):
            try:
                async with aiohttp.ClientSession() as session:
                    async with session.get(url, headers=headers, timeout=60) as response:
                        if response.status == 200:
                            content = await response.read()
                            if len(content) > 0:
                                with open(cache_path, "wb") as f:
                                    f.write(content)
                                logger.info(f"Successfully downloaded {asset_type} to {cache_path}")
                                return cache_path
                            else:
                                logger.error(f"{asset_type} download succeeded but file is empty.")
                        else:
                            logger.error(f"{asset_type} download failed. HTTP Status: {response.status}")
            except Exception as e:
                logger.error(f"Exception downloading {asset_type} on attempt {attempt+1}: {e}")
                
        return None
