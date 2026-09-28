import os
import aiohttp
import logging
import tempfile
from typing import Optional

logger = logging.getLogger(__name__)

class AudioFetcher:
    """
    Fetches audio files via HTTP and stores them in temporary bounded local cache.
    """
    def __init__(self, token: str):
        self.token = token
        self.temp_dir = tempfile.mkdtemp(prefix="livestudio_audio_")

    async def fetch(self, signed_url: str) -> Optional[str]:
        """
        Downloads audio to a local temporary file.
        Returns the absolute path to the file, or None if failed.
        """
        # Prefix local URLs with http://localhost:8000 for local dev if needed
        # Assuming the url is fully qualified or at least handles its own domain
        if signed_url.startswith('/'):
            signed_url = f"http://localhost:8000{signed_url}"

        headers = {"Authorization": f"Device {self.token}"}
        
        retries = 2
        for attempt in range(retries):
            try:
                async with aiohttp.ClientSession() as session:
                    async with session.get(signed_url, headers=headers, timeout=10) as response:
                        if response.status == 200:
                            content = await response.read()
                            if len(content) > 0:
                                # Save to temp file
                                temp_path = os.path.join(self.temp_dir, f"audio_{os.urandom(4).hex()}.mp3")
                                with open(temp_path, "wb") as f:
                                    f.write(content)
                                return temp_path
                            else:
                                logger.error("Audio download succeeded but file is empty.")
                        else:
                            logger.error(f"Audio download failed. HTTP Status: {response.status}")
            except Exception as e:
                logger.error(f"Exception downloading audio on attempt {attempt+1}: {e}")
                
        return None

    def cleanup(self, filepath: str):
        """
        Removes the temporary audio file after playback.
        """
        try:
            if filepath and os.path.exists(filepath):
                os.remove(filepath)
        except Exception as e:
            logger.error(f"Error cleaning up audio file {filepath}: {e}")
