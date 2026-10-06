import logging
from typing import Dict, Any, Callable
from live_studio.protocol.envelopes import SpeechSpeakPayload, SessionControlPayload
from live_studio.execution.sequence_validator import SequenceValidator
from live_studio.execution.dedup_registry import DedupRegistry
from live_studio.execution.queue_manager import SpeechQueueManager
from live_studio.execution.ack_manager import AckManager
from live_studio.protocol.constants import (
    ACK_RECEIVED, ACK_INTERRUPTED, ACK_FAILED, ACK_COMPLETED, SPEECH_QUEUED, PRIORITY_HIGH
)
from live_studio.core.state import DeviceRuntimeState

logger = logging.getLogger(__name__)

class ProtocolDispatcher:
    def __init__(self, 
                 state: DeviceRuntimeState,
                 sequence_validator: SequenceValidator,
                 dedup_registry: DedupRegistry,
                 queue_manager: SpeechQueueManager,
                 ack_manager: AckManager,
                 send_ack_callback: Callable,
                 stream_controller=None):
        self.state = state
        self.sequence_validator = sequence_validator
        self.dedup_registry = dedup_registry
        self.queue_manager = queue_manager
        self.ack_manager = ack_manager
        self.send_ack = send_ack_callback
        self.stream_controller = stream_controller

    async def dispatch(self, envelope: Dict[str, Any]):
        msg_type = envelope.get("type")
        msg_name = envelope.get("name")
        seq_num = envelope.get("sequence_number", 0)
        
        # Sequence validation (for Cloud -> Device commands)
        if msg_type == "command" and msg_name not in ["session.sync"]:
            action = self.sequence_validator.validate_and_update(seq_num)
            if action == "drop":
                return

        if msg_type == "command" and msg_name == "speech.speak":
            await self._handle_speech_speak(envelope)
        elif msg_type == "command" and msg_name == "session.control":
            await self._handle_session_control(envelope)
        elif msg_type == "command" and msg_name == "stream.start":
            if self.stream_controller:
                await self._handle_stream_start(envelope)
            else:
                logger.error("stream.start received but stream_controller is not configured.")
        elif msg_type == "command" and msg_name == "stream.stop":
            if self.stream_controller:
                await self._handle_stream_stop(envelope)
            else:
                logger.error("stream.stop received but stream_controller is not configured.")
        elif msg_type == "command" and msg_name == "avatar.action":
            # Protocol-valid handling only. No avatar implementation yet.
            logger.info("Received avatar.action, ignoring execution.")
        else:
            logger.debug(f"Unknown or unhandled command: {msg_type}/{msg_name}")

    async def _handle_speech_speak(self, envelope: Dict[str, Any]):
        if not self.state.is_accepting_speech():
            logger.warning("Dropped speech.speak: device is not in a state to accept speech.")
            return

        payload_data = envelope.get("payload", {})
        cmd_id = payload_data.get("command_id")
        seq_num = envelope.get("sequence_number")
        msg_id = envelope.get("message_id")
        
        if not cmd_id:
            logger.error("speech.speak payload missing command_id")
            return

        # Deduplication
        dedup_state = self.dedup_registry.register_or_get(cmd_id, ACK_RECEIVED, seq_num)
        if dedup_state:
            # Duplicate command
            logger.info(f"Duplicate command {cmd_id}, returning current state: {dedup_state['status']}")
            ack_msg = self.ack_manager.build_ack(
                command_id=cmd_id,
                status=dedup_state["status"],
                reference_message_id=msg_id
            )
            await self.send_ack(ack_msg)
            return

        # Not duplicate, accept it
        payload = SpeechSpeakPayload(
            command_id=cmd_id,
            text=payload_data.get("text", ""),
            correlation_id=payload_data.get("correlation_id"),
            audio_asset=payload_data.get("audio_asset"),
            interruptible=payload_data.get("interruptible", True),
            priority=payload_data.get("priority", "normal")
        )
        
        # Enqueue
        self.queue_manager.enqueue(payload, seq_num)
        
        # Send ACK received
        ack_msg = self.ack_manager.build_ack(
            command_id=cmd_id,
            status=ACK_RECEIVED,
            reference_message_id=msg_id
        )
        await self.send_ack(ack_msg)

    async def _handle_session_control(self, envelope: Dict[str, Any]):
        payload_data = envelope.get("payload", {})
        action = payload_data.get("action")
        cmd_id = payload_data.get("command_id")
        msg_id = envelope.get("message_id")

        if action == "pause":
            from live_studio.protocol.constants import STATE_PAUSED
            self.state.transition(STATE_PAUSED)
            
            # Flush queue
            flushed_items = self.queue_manager.flush()
            for item in flushed_items:
                # Mark flushed commands failed
                self.dedup_registry.update_status(item.payload.command_id, ACK_FAILED)
                ack_msg = self.ack_manager.build_ack(
                    command_id=item.payload.command_id,
                    status=ACK_FAILED,
                    reference_message_id=msg_id,  # Typically use the control message's ID or the original?
                    # Actually, if we're flushing, we might not have the original message_id. We'll use the control's msg_id or generate one.
                    # Or omit reference_message_id for flushed ones if protocol allows.
                    # We will use the control's message_id as reference for the control ack, and for flushed we use original if available.
                    # We didn't store original message_id in SpeechItem. Let's just use control's msg_id as reference.
                    error_code="CANCELLED_BY_HUMAN"
                )
                await self.send_ack(ack_msg)

            # Interrupting PLAYING is handled by the AudioWorker monitoring state.is_paused()
            
            # ACK the pause command itself (optional, if Cloud expects an ACK for control commands)
            # The prompt says: "session.control pause -> Device internal state PAUSED -> stop current speech -> ACK interrupted for command PLAYING -> flush -> ACK failed / CANCELLED_BY_HUMAN"
            # It also says: "ACK the pause command itself (optional)". We will ACK the control command.
            if cmd_id:
                ack_ctrl = self.ack_manager.build_ack(cmd_id, ACK_COMPLETED, msg_id)
                await self.send_ack(ack_ctrl)

        elif action == "resume":
            from live_studio.protocol.constants import STATE_RUNNING
            self.state.transition(STATE_RUNNING)
            if cmd_id:
                ack_ctrl = self.ack_manager.build_ack(cmd_id, ACK_COMPLETED, msg_id)
                await self.send_ack(ack_ctrl)

        elif action == "stop":
            from live_studio.protocol.constants import STATE_STOPPED
            self.state.transition(STATE_STOPPED)
            self.queue_manager.flush()
            if cmd_id:
                ack_ctrl = self.ack_manager.build_ack(cmd_id, ACK_COMPLETED, msg_id)
                await self.send_ack(ack_ctrl)

    async def _handle_stream_start(self, envelope: Dict[str, Any]):
        payload_data = envelope.get("payload", {})
        cmd_id = payload_data.get("command_id")
        seq_num = envelope.get("sequence_number")
        msg_id = envelope.get("message_id")
        
        if not cmd_id:
            return
            
        dedup_state = self.dedup_registry.register_or_get(cmd_id, ACK_RECEIVED, seq_num)
        if dedup_state:
            ack_msg = self.ack_manager.build_ack(cmd_id, dedup_state["status"], msg_id)
            await self.send_ack(ack_msg)
            return

        ack_msg = self.ack_manager.build_ack(cmd_id, ACK_RECEIVED, msg_id)
        await self.send_ack(ack_msg)
        
        from live_studio.protocol.envelopes import StreamStartPayload
        payload = StreamStartPayload(
            command_id=cmd_id,
            stream_url=payload_data.get("stream_url"),
            correlation_id=payload_data.get("correlation_id"),
            width=payload_data.get("width", 800),
            height=payload_data.get("height", 600),
            fps=payload_data.get("fps", 30),
            video_codec=payload_data.get("video_codec", "h264"),
            bitrate=payload_data.get("bitrate", "2500k"),
            audio_sample_rate=payload_data.get("audio_sample_rate", 44100),
            audio_channels=payload_data.get("audio_channels", 2)
        )
        
        success = await self.stream_controller.handle_start(payload)
        
        if success:
            self.dedup_registry.update_status(cmd_id, ACK_COMPLETED)
            ack_comp = self.ack_manager.build_ack(cmd_id, ACK_COMPLETED, msg_id)
            await self.send_ack(ack_comp)
        else:
            self.dedup_registry.update_status(cmd_id, ACK_FAILED)
            ack_fail = self.ack_manager.build_ack(cmd_id, ACK_FAILED, msg_id, "STARTUP_FAILED")
            await self.send_ack(ack_fail)

    async def _handle_stream_stop(self, envelope: Dict[str, Any]):
        payload_data = envelope.get("payload", {})
        cmd_id = payload_data.get("command_id")
        seq_num = envelope.get("sequence_number")
        msg_id = envelope.get("message_id")
        
        if not cmd_id:
            return
            
        dedup_state = self.dedup_registry.register_or_get(cmd_id, ACK_RECEIVED, seq_num)
        if dedup_state:
            ack_msg = self.ack_manager.build_ack(cmd_id, dedup_state["status"], msg_id)
            await self.send_ack(ack_msg)
            return

        ack_msg = self.ack_manager.build_ack(cmd_id, ACK_RECEIVED, msg_id)
        await self.send_ack(ack_msg)
        
        from live_studio.protocol.envelopes import StreamStopPayload
        payload = StreamStopPayload(
            command_id=cmd_id,
            correlation_id=payload_data.get("correlation_id"),
            reason=payload_data.get("reason")
        )
        
        success = await self.stream_controller.handle_stop(payload)
        
        if success:
            self.dedup_registry.update_status(cmd_id, ACK_COMPLETED)
            ack_comp = self.ack_manager.build_ack(cmd_id, ACK_COMPLETED, msg_id)
            await self.send_ack(ack_comp)
        else:
            self.dedup_registry.update_status(cmd_id, ACK_FAILED)
            ack_fail = self.ack_manager.build_ack(cmd_id, ACK_FAILED, msg_id, "SHUTDOWN_FAILED")
            await self.send_ack(ack_fail)
