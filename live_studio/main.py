import asyncio
import logging
from typing import Optional

from live_studio.core.ws_client import WebSocketClient
from live_studio.core.dispatcher import ProtocolDispatcher
from live_studio.core.state import DeviceRuntimeState
from live_studio.execution.sequence_validator import SequenceValidator
from live_studio.execution.dedup_registry import DedupRegistry
from live_studio.execution.queue_manager import SpeechQueueManager
from live_studio.execution.ack_manager import AckManager
from live_studio.execution.audio_fetcher import AudioFetcher
from live_studio.execution.audio_player import BaseAudioPlayer, DummyAudioPlayer
from live_studio.execution.device_sequence import DeviceSequenceCounter
from live_studio.execution.avatar_engine import BaseAvatarEngine
from live_studio.execution.frame_source import PygameFrameSource, FrameQueue
from live_studio.execution.stream_controller import StreamController
from live_studio.protocol.constants import (
    ACK_COMPLETED, ACK_FAILED, ACK_INTERRUPTED, STATE_SYNCHRONIZED
)

logger = logging.getLogger(__name__)

class LiveStudioApp:
    def __init__(self, ws_url: str, token: str, session_id: str, audio_player: BaseAudioPlayer, avatar_engine: BaseAvatarEngine = None):
        self.state = DeviceRuntimeState()
        self.sequence_validator = SequenceValidator()
        self.device_sequence_counter = DeviceSequenceCounter()
        self.dedup_registry = DedupRegistry()
        self.queue_manager = SpeechQueueManager()
        self.ack_manager = AckManager(session_id, self.device_sequence_counter)
        self.audio_fetcher = AudioFetcher(token)
        self.audio_player = audio_player
        self.avatar_engine = avatar_engine
        
        # Phase 1E-2: Frame Extraction Foundation
        self.frame_queue = FrameQueue(maxsize=30)
        self.frame_source = None
        if hasattr(self.avatar_engine, 'renderer'):
            self.frame_source = PygameFrameSource(self.avatar_engine.renderer)
            
        # Phase 1E-4/5: Stream Controller
        # Find if audio_player has stream_sink
        audio_sink = getattr(self.audio_player, 'stream_sink', None)
        self.stream_controller = StreamController(
            frame_queue=self.frame_queue,
            audio_sink=audio_sink,
            on_state_change=self._on_stream_state_change
        )
        
        self.ws_client = WebSocketClient(
            ws_url=ws_url,
            token=token,
            session_id=session_id,
            dispatcher_callback=self._on_message
        )
        
        self.dispatcher = ProtocolDispatcher(
            state=self.state,
            sequence_validator=self.sequence_validator,
            dedup_registry=self.dedup_registry,
            queue_manager=self.queue_manager,
            ack_manager=self.ack_manager,
            send_ack_callback=self.ws_client.send,
            stream_controller=self.stream_controller
        )

        self._worker_task: Optional[asyncio.Task] = None
        self._avatar_task: Optional[asyncio.Task] = None
        self._current_playing_command_id: Optional[str] = None
        self._current_playing_audio_path: Optional[str] = None
        self._current_playing_interrupted: bool = False

    async def _on_message(self, envelope: dict):
        if envelope.get("type") == "command" and envelope.get("name") == "session.sync":
            # Just set the state to synchronized if it's the cloud response
            logger.info("Session synced.")
            self.state.transition(STATE_SYNCHRONIZED)
            return

        # Let the dispatcher handle it
        await self.dispatcher.dispatch(envelope)

        msg_name = envelope.get("name")
        payload = envelope.get("payload", {})
        
        # Check if we need to interrupt current playback for high priority
        if msg_name == "speech.speak" and payload.get("priority") == "high":
            if self._current_playing_command_id:
                logger.info("High priority command arrived. Interrupting current playback.")
                self._current_playing_interrupted = True
                self.audio_player.stop()
                
        elif msg_name == "session.control" and payload.get("action") in ["pause", "stop"]:
            if self._current_playing_command_id:
                logger.info("Human Takeover control arrived. Interrupting current playback.")
                self._current_playing_interrupted = True
                self.audio_player.stop()

    async def _on_stream_state_change(self, state):
        import uuid
        import datetime
        logger.info(f"Stream state changed to {state.value}")
        payload = {
            "protocol_version": "1.0",
            "type": "event",
            "name": "stream.status",
            "message_id": str(uuid.uuid4()),
            "timestamp": datetime.datetime.now(datetime.timezone.utc).isoformat(),
            "sequence_number": self.device_sequence_counter.next(),
            "session_id": self.ws_client.session_id,
            "payload": {
                "state": state.value
            }
        }
        await self.ws_client.send(payload)

    async def start(self):
        if self.avatar_engine:
            self.avatar_engine.initialize()
            if self.frame_source:
                self.frame_source.initialize()
            self._avatar_task = asyncio.create_task(self._avatar_render_loop())
            
        self._worker_task = asyncio.create_task(self._queue_worker_loop())
        await self.ws_client.connect(
            sequence_getter=self.sequence_validator.get_current_sequence,
            device_sequence_counter=self.device_sequence_counter
        )

    async def stop(self):
        self.ws_client.stop()
        if self._worker_task:
            self._worker_task.cancel()
        if self._avatar_task:
            self._avatar_task.cancel()
        if self.avatar_engine:
            if self.frame_source:
                self.frame_source.shutdown()
            self.avatar_engine.shutdown()
        
        # Stop stream if running
        if self.stream_controller:
            from live_studio.protocol.envelopes import StreamStopPayload
            await self.stream_controller.handle_stop(StreamStopPayload(command_id="shutdown"))
            
    async def _avatar_render_loop(self):
        """Continuous render loop for the Avatar Engine (running at ~30 FPS)."""
        while True:
            try:
                # Update avatar state based on current audio clock
                pos = self.audio_player.get_position_ms()
                self.avatar_engine.update(pos)
                
                # Phase 1E-2: Extract frame directly after rendering
                if self.frame_source:
                    frame = self.frame_source.read_frame()
                    if frame:
                        self.frame_queue.put(frame)
                        
                await asyncio.sleep(1/30.0)
            except asyncio.CancelledError:
                break
            except Exception as e:
                logger.error(f"Avatar render loop error: {e}")
                await asyncio.sleep(1.0)
            
    async def _queue_worker_loop(self):
        while True:
            try:
                item = await self.queue_manager.get_next()
                cmd_id = item.payload.command_id
                
                # Check if we were paused while waiting
                if self.state.is_paused():
                    logger.info(f"Skipping {cmd_id} because state is PAUSED.")
                    self._mark_failed(item, "CANCELLED_BY_HUMAN")
                    continue
                
                # Audio download
                self.dedup_registry.update_status(cmd_id, "downloading")
                audio_asset = item.payload.audio_asset
                if not audio_asset or not audio_asset.get("signed_url"):
                    logger.error(f"No audio asset for {cmd_id}")
                    self._mark_failed(item, "AUDIO_DOWNLOAD_FAILED")
                    continue
                    
                audio_path = await self.audio_fetcher.fetch(audio_asset["signed_url"])
                if not audio_path:
                    logger.error(f"Audio download failed for {cmd_id}")
                    self._mark_failed(item, "AUDIO_DOWNLOAD_FAILED")
                    continue

                # Check pause again before playing
                if self.state.is_paused():
                    self.audio_fetcher.cleanup(audio_path)
                    self._mark_failed(item, "CANCELLED_BY_HUMAN")
                    continue

                # Playback
                self.dedup_registry.update_status(cmd_id, "playing")
                self._current_playing_command_id = cmd_id
                self._current_playing_audio_path = audio_path
                self._current_playing_interrupted = False
                
                logger.info(f"Starting playback for {cmd_id}")
                
                # Start Avatar Speech
                if self.avatar_engine:
                    # Provide empty text as we only have audio url here. text might be in avatar_action.
                    text = getattr(item.payload, 'text', "")
                    self.avatar_engine.start_speech(audio_path, text)
                    
                completed = await self.audio_player.play(audio_path)
                
                # Finish Avatar Speech
                if self.avatar_engine:
                    if completed:
                        self.avatar_engine.stop()
                    else:
                        self.avatar_engine.interrupt()
                
                self._current_playing_command_id = None
                self._current_playing_audio_path = None
                self.audio_fetcher.cleanup(audio_path)
                
                if completed:
                    self.dedup_registry.update_status(cmd_id, ACK_COMPLETED)
                    ack_msg = self.ack_manager.build_ack(cmd_id, ACK_COMPLETED, "")
                    await self.ws_client.send(ack_msg)
                else:
                    if self._current_playing_interrupted or self.state.is_paused():
                        # Interrupted intentionally (High Priority or Human Takeover)
                        self.dedup_registry.update_status(cmd_id, ACK_INTERRUPTED)
                        ack_msg = self.ack_manager.build_ack(cmd_id, ACK_INTERRUPTED, "")
                        await self.ws_client.send(ack_msg)
                    else:
                        # Technical error in playback
                        self.dedup_registry.update_status(cmd_id, ACK_FAILED)
                        ack_msg = self.ack_manager.build_ack(cmd_id, ACK_FAILED, "", "PLAYBACK_ERROR")
                        await self.ws_client.send(ack_msg)
                        
                self.queue_manager.mark_done(item)

            except asyncio.CancelledError:
                break
            except Exception as e:
                logger.error(f"Worker loop error: {e}")

    def _mark_failed(self, item, error_code):
        cmd_id = item.payload.command_id
        self.dedup_registry.update_status(cmd_id, ACK_FAILED)
        ack_msg = self.ack_manager.build_ack(cmd_id, ACK_FAILED, "", error_code)
        asyncio.create_task(self.ws_client.send(ack_msg))
        self.queue_manager.mark_done(item)

import sys
import json
import os

async def run_app():
    ws_url = None
    token = None
    session_id = None
    
    if len(sys.argv) >= 4:
        ws_url = sys.argv[1]
        token = sys.argv[2]
        session_id = sys.argv[3]
    elif os.path.exists("config.json"):
        with open("config.json", "r") as f:
            cfg = json.load(f)
            ws_url = cfg.get("ws_url")
            token = cfg.get("token")
            session_id = cfg.get("session_id")
            
    if not ws_url or not token or not session_id:
        print("Usage: python main.py <ws_url> <token> <session_id> OR provide config.json with these keys")
        sys.exit(1)
        
    from live_studio.execution.audio_player import PygameAudioPlayer
    from live_studio.execution.media_pipeline import MediaClock, AudioStreamSink
    
    clock = MediaClock()
    sink = AudioStreamSink(clock)
    
    app = LiveStudioApp(
        ws_url=ws_url,
        token=token,
        session_id=session_id,
        audio_player=PygameAudioPlayer(stream_sink=sink)
    )
    
    print(f"CONNECTING: {ws_url}")
    try:
        await app.start()
        # Keep running
        while True:
            await asyncio.sleep(1)
    except KeyboardInterrupt:
        pass
    finally:
        await app.stop()

if __name__ == '__main__':
    logging.basicConfig(level=logging.INFO, format='%(asctime)s [%(levelname)s] %(name)s: %(message)s')
    asyncio.run(run_app())

