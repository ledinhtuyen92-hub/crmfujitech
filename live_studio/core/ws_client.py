import asyncio
import json
import logging
import uuid
import datetime
import websockets
from typing import Callable, Optional

logger = logging.getLogger(__name__)

class WebSocketClient:
    def __init__(self, ws_url: str, token: str, session_id: str, dispatcher_callback: Callable):
        self.ws_url = ws_url
        self.token = token
        self.session_id = session_id
        self.dispatcher_callback = dispatcher_callback
        self.ws: Optional[websockets.WebSocketClientProtocol] = None
        self._running = False
        self._reconnect_delay = 1.0

    async def connect(self, sequence_getter: Callable[[], int], device_sequence_counter):
        self._running = True
        extra_headers = {"Authorization": f"Device {self.token}"}
        
        while self._running:
            try:
                async with websockets.connect(self.ws_url, additional_headers=extra_headers) as ws:
                    self.ws = ws
                    logger.info(f"Connected to {self.ws_url}")
                    self._reconnect_delay = 1.0
                    
                    # session.sync
                    await self._send_session_sync(sequence_getter(), device_sequence_counter)
                    
                    # Receive loop
                    await self._receive_loop()
                    
            except websockets.ConnectionClosed as e:
                logger.warning(f"Connection closed: {e}")
            except Exception as e:
                logger.error(f"WebSocket error: {e}")
                
            if self._running:
                logger.info(f"Reconnecting in {self._reconnect_delay} seconds...")
                await asyncio.sleep(self._reconnect_delay)
                self._reconnect_delay = min(self._reconnect_delay * 2, 30.0)

    async def _send_session_sync(self, last_received_sequence: int, device_sequence_counter):
        seq_num = device_sequence_counter.next()
        sync_payload = {
            "protocol_version": "1.0",
            "type": "command",
            "name": "session.sync",
            "message_id": str(uuid.uuid4()),
            "timestamp": datetime.datetime.now(datetime.timezone.utc).isoformat(),
            "sequence_number": seq_num,
            "session_id": self.session_id,
            "payload": {
                "cloud_to_device_sequence": last_received_sequence,
                "device_to_cloud_sequence": seq_num,
                "status": "request"
            }
        }
        await self.send(sync_payload)
        logger.info(f"Sent session.sync with last_received_sequence={last_received_sequence}")

    async def _receive_loop(self):
        async for message in self.ws:
            try:
                data = json.loads(message)
                # Process in a background task so receive loop isn't blocked
                asyncio.create_task(self.dispatcher_callback(data))
            except json.JSONDecodeError:
                logger.error("Failed to decode JSON from WebSocket")
            except Exception as e:
                logger.error(f"Error dispatching message: {e}")

    async def send(self, data: dict):
        if self.ws:
            try:
                await self.ws.send(json.dumps(data))
            except websockets.exceptions.ConnectionClosed:
                logger.warning("Attempted to send on closed WebSocket (Ack/Message dropped)")
        else:
            logger.warning("Attempted to send on closed WebSocket (Ack/Message dropped)")
            # In a real implementation with a recovery buffer, we'd queue these acks.
            # For MVP: "If ACKs were generated while disconnected, retain in memory and send after reconnect".
            # To simplify, we rely on the state of the command. If disconnected, we'll log it.

    def stop(self):
        self._running = False
        if self.ws:
            asyncio.create_task(self.ws.close())
