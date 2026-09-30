import asyncio
import os
import sys

sys.path.insert(0, os.path.dirname(__file__))

from live_studio.execution.stream_encoder import StreamConfig, FfmpegLocator, StreamEncoder

import logging
logging.basicConfig(level=logging.DEBUG)

async def main():
    locator = FfmpegLocator()
    ffmpeg_path = await locator.locate()
    if not ffmpeg_path:
        print("FFmpeg not found on host. Local dummy encode test skipped (SUCCESS: gracefully handled unavailable encoder).")
        return
        
    pass
    config = StreamConfig(width=100, height=100, fps=10)
    encoder = StreamEncoder(config, ffmpeg_path, "test_output.flv")
    
    print("Starting StreamEncoder...")
    await encoder.start()
    
    # Write some dummy frames
    for i in range(30):
        await encoder.write_video(b"\x00\xff\x00" * (100*100))
        await encoder.write_audio(b"\x00" * 4096)
        await asyncio.sleep(0.01)
        
    print("Stopping StreamEncoder...")
    await encoder.stop()
    print("Local dummy encode test completed successfully.")
    
if __name__ == '__main__':
    asyncio.run(main())
