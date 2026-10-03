import logging
import asyncio
from enum import Enum
from typing import Optional, Any
from live_studio.execution.stream_encoder import StreamEncoder, StreamConfig, FfmpegLocator
from live_studio.protocol.envelopes import StreamStartPayload, StreamStopPayload
from live_studio.execution.rtmp_target import RtmpStreamTarget

logger = logging.getLogger(__name__)

class StreamState(Enum):
    IDLE = "IDLE"
    STARTING = "STARTING"
    LIVE = "LIVE"
    STOPPING = "STOPPING"
    STOPPED = "STOPPED"
    ERROR = "ERROR"
    RECONNECTING = "RECONNECTING"

class StreamController:
    def __init__(self, frame_queue=None, audio_sink=None, on_state_change=None):
        self._state = StreamState.IDLE
        self.encoder: Optional[StreamEncoder] = None
        self.locator = FfmpegLocator()
        
        self.frame_queue = frame_queue
        self.audio_sink = audio_sink
        self.on_state_change = on_state_change
        
        self._frame_pump_task = None
        self._monitor_task = None
        
        self.max_retries = 3
        self.retry_count = 0
        self._current_payload = None
        self._current_target = None
        
        if self.audio_sink:
            self.audio_sink.write_callback = self._on_audio_data

    @property
    def state(self):
        return self._state

    @state.setter
    def state(self, value):
        if self._state != value:
            self._state = value
            if self.on_state_change:
                asyncio.create_task(self.on_state_change(value))

    async def _on_audio_data(self, data: bytes):
        if self.state == StreamState.LIVE and self.encoder:
            try:
                await self.encoder.write_audio(data)
            except Exception as e:
                logger.error(f"Failed to write audio to encoder.")
                
    async def _frame_pump(self):
        try:
            while self.state == StreamState.LIVE:
                if self.frame_queue:
                    frame = self.frame_queue.get()
                    if frame:
                        try:
                            if self.encoder:
                                await self.encoder.write_video(frame.data)
                        except Exception as e:
                            logger.error(f"Failed to write video frame to encoder.")
                        continue
                await asyncio.sleep(1/60.0) 
        except asyncio.CancelledError:
            pass
        except Exception as e:
            logger.error(f"Frame pump crashed: {e}")

    async def handle_start(self, payload: StreamStartPayload) -> bool:
        if self.state in [StreamState.STARTING, StreamState.LIVE, StreamState.RECONNECTING]:
            logger.info(f"Stream is already {self.state.value}. Rejecting duplicate start.")
            return False
            
        try:
            target = RtmpStreamTarget(payload.stream_url)
        except ValueError as e:
            logger.error(f"Invalid RTMP URL: {e}")
            self.state = StreamState.ERROR
            return False
            
        self._current_payload = payload
        self._current_target = target
        self.retry_count = 0
        
        logger.info(f"stream_start requested. target={target.get_safe_log_metadata()} resolution={payload.width}x{payload.height} fps={payload.fps}")
        
        return await self._start_internal()

    async def _start_internal(self) -> bool:
        self.state = StreamState.STARTING
        
        ffmpeg_path = await self.locator.locate()
        if not ffmpeg_path:
            logger.error("FFmpeg not found. Cannot start stream.")
            self.state = StreamState.ERROR
            return False
            
        config = StreamConfig(
            width=self._current_payload.width,
            height=self._current_payload.height,
            fps=self._current_payload.fps,
            video_codec=self._current_payload.video_codec,
            bitrate=self._current_payload.bitrate,
            audio_sample_rate=self._current_payload.audio_sample_rate,
            audio_channels=self._current_payload.audio_channels
        )
        
        # Always push to local MediaMTX first.
        # MediaMTX handles HLS preview and re-pushes to external (Shopee/TikTok).
        try:
            from live_studio.execution.mediamtx_manager import MEDIAMTX_LOCAL_RTMP_URL
            output_url = MEDIAMTX_LOCAL_RTMP_URL
        except ImportError:
            output_url = self._current_target.get_full_url()
        
        self.encoder = StreamEncoder(config, ffmpeg_path, output_url)
        try:
            await self.encoder.start()
            self.state = StreamState.LIVE
            logger.info("Stream encoder started successfully.")
            
            if self.audio_sink:
                self.audio_sink.start()
            
            if self.frame_queue:
                self._frame_pump_task = asyncio.create_task(self._frame_pump())
                
            self._monitor_task = asyncio.create_task(self._health_monitor())
                
            return True
        except Exception as e:
            logger.error(f"Failed to start stream encoder: {e}") 
            self.encoder = None
            self.state = StreamState.ERROR
            return False

    async def _health_monitor(self):
        try:
            while self.state == StreamState.LIVE and self.encoder:
                if not self.encoder.is_running:
                    logger.error("Health Monitor: FFmpeg process died unexpectedly.")
                    await self._handle_failure()
                    break
                await asyncio.sleep(1.0)
        except asyncio.CancelledError:
            pass

    async def _handle_failure(self):
        if self.state in [StreamState.STOPPING, StreamState.STOPPED, StreamState.IDLE]:
            return
            
        logger.error("Handling stream failure...")
        self.state = StreamState.ERROR
        
        await self._cleanup_resources()
            
        if self.retry_count < self.max_retries:
            self.retry_count += 1
            self.state = StreamState.RECONNECTING
            backoff = min(2 ** self.retry_count, 10)
            logger.info(f"Reconnecting in {backoff}s... (Attempt {self.retry_count}/{self.max_retries})")
            
            await asyncio.sleep(backoff)
            
            if self.state == StreamState.RECONNECTING:
                await self._start_internal()
        else:
            logger.error("Max retries reached. Stream permanently failed.")
            self.state = StreamState.ERROR
            
    async def handle_stop(self, payload: StreamStopPayload) -> bool:
        if self.state in [StreamState.IDLE, StreamState.STOPPED]:
            logger.info(f"Stream is {self.state.value}. Stop ignored.")
            return True 
            
        self.state = StreamState.STOPPING
        reason = payload.reason or "no reason"
        logger.info(f"stream_stop requested. reason={reason}")
        
        await self._cleanup_resources()
            
        self.state = StreamState.STOPPED
        return True

    async def _cleanup_resources(self):
        if self.audio_sink:
            self.audio_sink.stop()
            
        if self._frame_pump_task:
            self._frame_pump_task.cancel()
            try:
                await self._frame_pump_task
            except asyncio.CancelledError:
                pass
            self._frame_pump_task = None
            
        if self._monitor_task:
            self._monitor_task.cancel()
            try:
                await self._monitor_task
            except asyncio.CancelledError:
                pass
            self._monitor_task = None
            
        if self.encoder:
            try:
                await self.encoder.stop()
            except Exception as e:
                logger.error(f"Error during stream encoder stop: {e}")
            self.encoder = None
