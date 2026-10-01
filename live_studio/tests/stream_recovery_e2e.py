import asyncio
import logging
from unittest.mock import MagicMock

from live_studio.execution.stream_controller import StreamController
from live_studio.protocol.envelopes import StreamStartPayload, StreamStopPayload

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

async def run_recovery_test():
    # Setup
    mock_emit = MagicMock()
    controller = StreamController()
    
    # We will test using a fake url so ffmpeg starts
    payload = StreamStartPayload(
        command_id="cmd-1",
        stream_url="rtmp://localhost/live/test",
        width=720,
        height=1280,
        fps=30
    )
    await controller.handle_start(payload)
    
    # Give it a moment to start
    await asyncio.sleep(2)
    
    # Confirm LIVE
    print(f"Status after start: {controller.state.name}")
    
    # Find the ffmpeg process and kill it
    ffmpeg_process = controller.encoder.process
    if ffmpeg_process:
        print(f"Killing FFmpeg (PID {ffmpeg_process.pid})")
        ffmpeg_process.terminate()
        
    # Wait for detection
    await asyncio.sleep(3)
    print(f"Status after kill: {controller.state.name}")
    
    # Wait for reconnect attempts
    for i in range(5):
        await asyncio.sleep(3)
        print(f"Status during recovery loop: {controller.state.name}")
        
    stop_payload = StreamStopPayload(reason="end of test")
    await controller.handle_stop(stop_payload)

if __name__ == "__main__":
    asyncio.run(run_recovery_test())
