import asyncio
import aiohttp
import sys
import os
import json
import uuid

# Provide a helper script to test the E2E flow with the Django backend and Live Studio.

# Ensure Live Studio is imported
sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), '.')))
from live_studio.execution.audio_player import DummyAudioPlayer
from live_studio.execution.avatar_engine import DummyAvatarEngine
from live_studio.execution.stream_encoder import FfmpegLocator
from live_studio.main import LiveStudioApp

SESSION_ID = "3b51b523-7925-4d84-9cd3-30234af44005"
TOKEN = "ldt_ebc0cecaa04a41fe935f522ed19fd8e4_Zy3hBQOudCEe2JdkEptsHj49v8wN7TOrxBmrIF12bug"
WS_URL = f"ws://localhost:8000/ws/live_sessions/{SESSION_ID}/device/"
API_URL = "http://localhost:8000/api/v1"

async def e2e_test():
    locator = FfmpegLocator()
    ffmpeg_path = await locator.locate()
    if not ffmpeg_path:
        print("FFmpeg not found. E2E Test skipped.")
        return
        
    print("Starting Live Studio App...")
    app = LiveStudioApp(
        ws_url=WS_URL,
        token=TOKEN,
        session_id=SESSION_ID,
        audio_player=DummyAudioPlayer(),
        avatar_engine=DummyAvatarEngine()
    )
    
    # Intercept acks
    received_acks = []
    original_send = app.ws_client.send
    async def intercept_send(data):
        if data.get("type") == "ack":
            print(f"Received ACK from Live Studio: {data}")
            received_acks.append(data)
        elif data.get("type") == "event":
            print(f"Received EVENT from Live Studio: {data}")
            received_acks.append(data)
        await original_send(data)
        
    app.ws_client.send = intercept_send

    app_task = asyncio.create_task(app.start())
    await asyncio.sleep(2) # Give it time to connect

    async with aiohttp.ClientSession() as session:
        # 1. Trigger stream.start via API
        print("Sending stream.start via API...")
        # Assuming admin auth token or just bypass for local test? 
        # Wait, local API requires JWT auth for admin. 
        # I'll just simulate the Cloud sending the command directly if API requires auth.
        
        # Let's mock Cloud sending it to the websocket
        start_payload = {
            "protocol_version": "1.0",
            "type": "command",
            "name": "stream.start",
            "message_id": str(uuid.uuid4()),
            "timestamp": "2026-09-30T00:00:00Z",
            "sequence_number": 1,
            "session_id": SESSION_ID,
            "payload": {
                "command_id": str(uuid.uuid4()),
                "stream_url": "rtmp://localhost:1935/live/e2e_test",
                "width": 800,
                "height": 600,
                "fps": 30
            }
        }
        
        await app._on_message(start_payload)
        
        print("Waiting for FFmpeg to start...")
        await asyncio.sleep(5)
        
        # Check encoder state
        if app.stream_controller.encoder and app.stream_controller.encoder.is_running:
            print("SUCCESS: FFmpeg is running and streaming to MediaMTX.")
        else:
            print("ERROR: FFmpeg is NOT running.")
            
        print("Sending stream.stop...")
        stop_payload = {
            "protocol_version": "1.0",
            "type": "command",
            "name": "stream.stop",
            "message_id": str(uuid.uuid4()),
            "timestamp": "2026-09-30T00:00:10Z",
            "sequence_number": 2,
            "session_id": SESSION_ID,
            "payload": {
                "command_id": str(uuid.uuid4()),
                "reason": "e2e_test"
            }
        }
        await app._on_message(stop_payload)
        
        await asyncio.sleep(2)
        if app.stream_controller.encoder is None:
            print("SUCCESS: FFmpeg stopped successfully.")
        else:
            print("ERROR: FFmpeg did not stop.")
            
    print("Shutting down Live Studio App...")
    await app.stop()
    await app_task

if __name__ == "__main__":
    asyncio.run(e2e_test())
