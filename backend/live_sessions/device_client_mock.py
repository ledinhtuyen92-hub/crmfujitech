import asyncio
import websockets
import json
import uuid
import argparse
import logging
import datetime
import requests

logging.basicConfig(level=logging.INFO, format='%(asctime)s - %(levelname)s - %(message)s')

async def device_emulator(ws_url, token, session_id, fail_audio=False):
    extra_headers = {
        "Authorization": f"Device {token}"
    }

    try:
        async with websockets.connect(ws_url, additional_headers=extra_headers) as websocket:
            logging.info(f"Connected to {ws_url}")
            
            # Send session.sync
            sync_msg_id = str(uuid.uuid4())
            sync_payload = {
                "protocol_version": "1.0",
                "type": "command",
                "name": "session.sync",
                "message_id": sync_msg_id,
                "timestamp": datetime.datetime.now(datetime.timezone.utc).isoformat(),
                "sequence_number": 1,
                "session_id": session_id,
                "payload": {
                    "last_received_sequence": 0
                }
            }
            await websocket.send(json.dumps(sync_payload))
            logging.info("Sent session.sync")

            # Mock a comment event to trigger the pipeline
            comment_msg_id = str(uuid.uuid4())
            comment_payload = {
                "protocol_version": "1.0",
                "type": "event",
                "name": "event.comment",
                "message_id": comment_msg_id,
                "timestamp": datetime.datetime.now(datetime.timezone.utc).isoformat(),
                "sequence_number": 2,
                "session_id": session_id,
                "payload": {
                    "comment_id": str(uuid.uuid4()),
                    "platform": "emulator",
                    "user_id": "user123",
                    "username": "TestUser",
                    "text": "Cho mình xem mẫu giày thể thao nam nhé!",
                    "timestamp": datetime.datetime.now(datetime.timezone.utc).isoformat()
                }
            }
            # We don't send the comment immediately, wait a bit
            await asyncio.sleep(1)
            await websocket.send(json.dumps(comment_payload))
            logging.info("Sent mock event.comment")

            while True:
                response = await websocket.recv()
                data = json.loads(response)
                msg_type = data.get("type")
                msg_name = data.get("name")
                
                if msg_type == "command" and msg_name == "speech.speak":
                    logging.info(f"Received speech.speak command: {data['message_id']}")
                    payload = data.get("payload", {})
                    command_id = payload.get("command_id")
                    
                    # 1. Send ACK received
                    ack_received = {
                        "protocol_version": "1.0",
                        "type": "ack",
                        "name": "ack",
                        "message_id": str(uuid.uuid4()),
                        "timestamp": datetime.datetime.now(datetime.timezone.utc).isoformat(),
                        "sequence_number": 3,
                        "session_id": session_id,
                        "reference_message_id": data["message_id"],
                        "payload": {
                            "command_id": command_id,
                            "status": "received"
                        }
                    }
                    await websocket.send(json.dumps(ack_received))
                    logging.info(f"Sent ACK received for {command_id}")
                    
                    if fail_audio:
                        logging.info("Simulating audio failure...")
                        status = "failed"
                        error_code = "AUDIO_DOWNLOAD_FAILED"
                    else:
                        # 2. Download audio
                        audio_asset = payload.get("audio_asset", {})
                        audio_url = audio_asset.get("signed_url")
                        
                        if audio_url:
                            logging.info(f"Downloading audio from {audio_url}")
                            # The URL might be relative or missing domain depending on how SITE_URL is configured
                            # For local testing, we assume it's fully qualified or we can prepend localhost:8000
                            if audio_url.startswith('/'):
                                audio_url = f"http://localhost:8000{audio_url}"
                                
                            headers = {"Authorization": f"Device {token}"}
                            r = requests.get(audio_url, headers=headers)
                            if r.status_code == 200 and len(r.content) > 0:
                                logging.info(f"Downloaded audio successfully! Size: {len(r.content)} bytes")
                                status = "completed"
                                error_code = None
                            else:
                                logging.error(f"Failed to download audio. Status: {r.status_code}")
                                status = "failed"
                                error_code = "AUDIO_DOWNLOAD_FAILED"
                        else:
                            logging.error("No signed_url in audio_asset")
                            status = "failed"
                            error_code = "MISSING_URL"
                    
                    # Simulate execution delay
                    await asyncio.sleep(2)
                    
                    # 3. Send ACK completed/failed
                    ack_final_payload = {
                        "command_id": command_id,
                        "status": status
                    }
                    if error_code:
                        ack_final_payload["error_code"] = error_code
                        
                    ack_final = {
                        "protocol_version": "1.0",
                        "type": "ack",
                        "name": "ack",
                        "message_id": str(uuid.uuid4()),
                        "timestamp": datetime.datetime.now(datetime.timezone.utc).isoformat(),
                        "sequence_number": 4,
                        "session_id": session_id,
                        "reference_message_id": data["message_id"],
                        "payload": ack_final_payload
                    }
                    await websocket.send(json.dumps(ack_final))
                    logging.info(f"Sent ACK {status} for {command_id}")
                    break
                else:
                    logging.info(f"Received other message: {msg_type}/{msg_name}")

    except Exception as e:
        logging.error(f"Connection error: {e}")

if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="Fujitech AI Livestream Device Emulator")
    parser.add_argument("--url", default="ws://localhost:8000/ws/live/", help="WebSocket base URL")
    parser.add_argument("--token", required=True, help="Device Auth Token")
    parser.add_argument("--session", required=True, help="Live Session ID")
    parser.add_argument("--fail-audio", action="store_true", help="Simulate audio failure")
    
    args = parser.parse_args()
    
    ws_url = f"{args.url.rstrip('/')}/{args.session}/"
    asyncio.run(device_emulator(ws_url, args.token, args.session, args.fail_audio))
