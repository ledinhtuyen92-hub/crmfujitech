import logging
import uuid
import json
from typing import Dict, Any, Optional
from django.utils import timezone
from channels.layers import get_channel_layer
from asgiref.sync import async_to_sync
from django.conf import settings

from live_sessions.models import LiveSession
from ai_agents.services import generate_ai_reply
from ai_agents.rag_processor import search_knowledge
from live_sessions.audio.tts import OpenAITTSProvider, DummyTTSProvider
from live_sessions.audio.storage import LocalAudioStorageBackend
from live_sessions.protocol.commands import SpeechSpeakPayloadSerializer, StreamStartPayloadSerializer, StreamStopPayloadSerializer
from live_sessions.protocol.envelope import ProtocolEnvelopeSerializer
from live_sessions.sequence import LiveSequenceService, SequenceUnavailableException
from live_sessions.console_events import LiveConsoleEventService

logger = logging.getLogger(__name__)

class LiveOrchestrator:
    """
    LiveOrchestrator điều phối toàn bộ quá trình:
    Nhận tin nhắn -> RAG -> AI Core -> TTS -> Storage -> WebSocket.
    """
    def __init__(self):
        # TTS Provider is initialized dynamically per-session in process_comment
        # to ensure it uses the correct CompanyAiKey.
        self.audio_storage = LocalAudioStorageBackend()
        self.channel_layer = get_channel_layer()

    def dispatch_stream_start(self, session_id: str, test_mode: bool = False) -> Dict[str, Any]:
        logger.info(f"[Session: {session_id}] Dispatching stream.start (test_mode={test_mode})")
        try:
            session = LiveSession.objects.select_related('company', 'device').get(id=session_id)
        except LiveSession.DoesNotExist:
            return {"status": "error", "reason": "session_not_found"}

        if test_mode:
            stream_target = {
                "stream_url": "test_mode",
                "width": 720,
                "height": 1280,
                "fps": 30,
                "video_codec": "libx264",
                "bitrate": "2500k",
                "audio_sample_rate": 44100,
                "audio_channels": 2
            }
        else:
            from live_sessions.stream_providers import get_stream_provider
            from live_sessions.platforms.exceptions import PlatformAPIError, PlatformAuthError

            try:
                provider = get_stream_provider(session)
                stream_target = provider.get_stream_target(session)
            except (PlatformAPIError, PlatformAuthError) as e:
                logger.error(f"[Session: {session_id}] StreamProvider error: {e}")
                return {"status": "error", "reason": f"stream_provider_error: {e}"}
            except Exception as e:
                logger.error(f"[Session: {session_id}] Unexpected StreamProvider error: {e}")
                return {"status": "error", "reason": "stream_provider_error"}

        stream_url = stream_target.get("stream_url")
        if not stream_url:
            return {"status": "error", "reason": "missing_stream_url"}

        command_id = str(uuid.uuid4())
        message_id = str(uuid.uuid4())

        payload = {
            "command_id": command_id,
            "stream_url": stream_url,
            "width": stream_target.get("width", 800),
            "height": stream_target.get("height", 600),
            "fps": stream_target.get("fps", 30),
            "video_codec": stream_target.get("video_codec", "libx264"),
            "bitrate": stream_target.get("bitrate", "2500k"),
            "audio_sample_rate": stream_target.get("audio_sample_rate", 44100),
            "audio_channels": stream_target.get("audio_channels", 2),
        }
        
        payload_serializer = StreamStartPayloadSerializer(data=payload)
        if not payload_serializer.is_valid():
            logger.error(f"Invalid StreamStart payload schema: {payload_serializer.errors}")
            return {"status": "error", "reason": "invalid_payload_schema"}
            
        try:
            sequence_number = LiveSequenceService.get_next_sequence(
                company_id=str(session.company_id), 
                session_id=str(session.id)
            )
        except SequenceUnavailableException as e:
            return {"status": "failed", "reason": "SEQUENCE_UNAVAILABLE"}
            
        envelope = {
            "protocol_version": "1.0",
            "type": "command",
            "name": "stream.start",
            "message_id": message_id,
            "timestamp": timezone.now().isoformat(),
            "sequence_number": sequence_number,
            "session_id": str(session.id),
            "payload": payload_serializer.validated_data
        }
        
        envelope_serializer = ProtocolEnvelopeSerializer(data=envelope)
        if not envelope_serializer.is_valid():
            return {"status": "error", "reason": "invalid_envelope_schema"}
            
        session_group_name = f"live_session_{session.id}_device"
        try:
            async_to_sync(self.channel_layer.group_send)(
                session_group_name,
                {
                    "type": "send.command",
                    "envelope": json.loads(json.dumps(envelope_serializer.data, default=str))
                }
            )
            LiveConsoleEventService.emit(session_id, "live.stream_start.dispatched", {"command_id": command_id})
        except Exception as e:
            logger.error(f"Channel layer error: {e}")
            return {"status": "error", "reason": "channel_layer_failure"}
            
        return {"status": "success", "command_id": command_id, "message_id": message_id}

    def dispatch_session_control(self, session_id: str, action: str) -> Dict[str, Any]:
        logger.info(f"[Session: {session_id}] Dispatching session.control {action}")
        try:
            session = LiveSession.objects.get(id=session_id)
        except LiveSession.DoesNotExist:
            return {"status": "error", "reason": "session_not_found"}

        command_id = str(uuid.uuid4())
        message_id = str(uuid.uuid4())
        
        from live_sessions.protocol.commands import SessionControlPayloadSerializer
        payload = {
            "command_id": command_id,
            "action": action
        }
        
        payload_serializer = SessionControlPayloadSerializer(data=payload)
        if not payload_serializer.is_valid():
            return {"status": "error", "reason": "invalid_payload_schema"}
            
        try:
            sequence_number = LiveSequenceService.get_next_sequence(
                company_id=str(session.company_id), 
                session_id=str(session.id)
            )
        except SequenceUnavailableException:
            return {"status": "failed", "reason": "SEQUENCE_UNAVAILABLE"}
            
        envelope = {
            "protocol_version": "1.0",
            "type": "command",
            "name": "session.control",
            "message_id": message_id,
            "timestamp": timezone.now().isoformat(),
            "sequence_number": sequence_number,
            "session_id": str(session.id),
            "payload": payload_serializer.validated_data
        }
        
        envelope_serializer = ProtocolEnvelopeSerializer(data=envelope)
        if not envelope_serializer.is_valid():
            return {"status": "error", "reason": "invalid_envelope_schema"}
            
        session_group_name = f"live_session_{session.id}_device"
        try:
            async_to_sync(self.channel_layer.group_send)(
                session_group_name,
                {
                    "type": "send.command",
                    "envelope": json.loads(json.dumps(envelope_serializer.data, default=str))
                }
            )
            LiveConsoleEventService.emit(session_id, f"live.session_control.dispatched", {"command_id": command_id, "action": action})
        except Exception as e:
            return {"status": "error", "reason": "channel_layer_failure"}
            
        return {"status": "success", "command_id": command_id, "message_id": message_id}

    def dispatch_stream_stop(self, session_id: str, reason: str = "") -> Dict[str, Any]:
        logger.info(f"[Session: {session_id}] Dispatching stream.stop")
        try:
            session = LiveSession.objects.get(id=session_id)
        except LiveSession.DoesNotExist:
            return {"status": "error", "reason": "session_not_found"}

        command_id = str(uuid.uuid4())
        message_id = str(uuid.uuid4())
        
        payload = {
            "command_id": command_id,
            "reason": reason
        }
        
        payload_serializer = StreamStopPayloadSerializer(data=payload)
        if not payload_serializer.is_valid():
            return {"status": "error", "reason": "invalid_payload_schema"}
            
        try:
            sequence_number = LiveSequenceService.get_next_sequence(
                company_id=str(session.company_id), 
                session_id=str(session.id)
            )
        except SequenceUnavailableException:
            return {"status": "failed", "reason": "SEQUENCE_UNAVAILABLE"}
            
        envelope = {
            "protocol_version": "1.0",
            "type": "command",
            "name": "stream.stop",
            "message_id": message_id,
            "timestamp": timezone.now().isoformat(),
            "sequence_number": sequence_number,
            "session_id": str(session.id),
            "payload": payload_serializer.validated_data
        }
        
        envelope_serializer = ProtocolEnvelopeSerializer(data=envelope)
        if not envelope_serializer.is_valid():
            return {"status": "error", "reason": "invalid_envelope_schema"}
            
        session_group_name = f"live_session_{session.id}_device"
        try:
            async_to_sync(self.channel_layer.group_send)(
                session_group_name,
                {
                    "type": "send.command",
                    "envelope": json.loads(json.dumps(envelope_serializer.data, default=str))
                }
            )
            LiveConsoleEventService.emit(session_id, "live.stream_stop.dispatched", {"command_id": command_id})
        except Exception as e:
            return {"status": "error", "reason": "channel_layer_failure"}
            
        return {"status": "success", "command_id": command_id, "message_id": message_id}

    def process_comment(self, session_id: str, user_message: str, correlation_id: Optional[str] = None) -> Dict[str, Any]:
        """
        Nhận event comment, phân tích bằng AI, tạo âm thanh và push xuống thiết bị.
        """
        logger.info(f"[Session: {session_id}][Corr: {correlation_id}] Orchestration started. Message: '{user_message}'")

        if not correlation_id:
            correlation_id = str(uuid.uuid4())
            
        LiveConsoleEventService.emit(
            session_id=session_id,
            event_type="live.comment.received",
            payload={"text": user_message},
            correlation_id=correlation_id
        )

        # 1. Load LiveSession
        try:
            session = LiveSession.objects.select_related('device', 'company', 'product', 'ai_agent').get(id=session_id)
        except LiveSession.DoesNotExist:
            logger.error(f"[Session: {session_id}][Corr: {correlation_id}] Invalid session.")
            return {"status": "error", "reason": "session_not_found"}

        # 2. Validate status
        if session.status == LiveSession.STATUS_HUMAN_TAKEOVER:
            logger.info(f"[Session: {session_id}][Corr: {correlation_id}] Session is in HUMAN_TAKEOVER. Suppressed.")
            LiveConsoleEventService.emit(session_id, "live.ai.suppressed", {"reason": "human_takeover"}, correlation_id)
            return {"status": "suppressed", "reason": "human_takeover"}

        if session.status != LiveSession.STATUS_RUNNING:
            logger.info(f"[Session: {session_id}][Corr: {correlation_id}] Session is not RUNNING (current: {session.status}). Suppressed.")
            LiveConsoleEventService.emit(session_id, "live.ai.suppressed", {"reason": f"not_running ({session.status})"}, correlation_id)
            return {"status": "suppressed", "reason": "not_running"}

        # 3. Load Agent
        agent = session.ai_agent
        if not agent:
            logger.error(f"[Session: {session_id}][Corr: {correlation_id}] No AI Agent assigned to session.")
            return {"status": "error", "reason": "missing_agent"}

        # 4. Search Product-scoped RAG
        context_text = ""
        try:
            context_text = search_knowledge(agent, user_message, limit=3, product_id=session.product_id)
            logger.info(f"[Session: {session_id}][Corr: {correlation_id}] RAG completed.")
            LiveConsoleEventService.emit(session_id, "live.rag.completed", {"context_found": bool(context_text)}, correlation_id)
        except Exception as e:
            logger.error(f"[Session: {session_id}][Corr: {correlation_id}] RAG error: {e}")
            LiveConsoleEventService.emit(session_id, "live.rag.error", {"error": str(e)}, correlation_id)
            # Continue even if RAG fails

        # 4.5 Fetch Product Truth
        product = session.product
        product_truth = f"THÔNG TIN SẢN PHẨM ĐANG LIVE (BẮT BUỘC SỬ DỤNG LÀM CHUẨN):\n- Tên: {product.name}\n- Mã (SKU): {product.sku}\n- Giá tiêu chuẩn: {product.price}\n- Mô tả cơ bản: {product.description}\n"
        
        try:
            from live_sessions.models import LivePlatformProduct
            platform_product = LivePlatformProduct.objects.filter(
                company_id=session.company_id,
                product_id=product.id,
                platform=session.platform
            ).first()
            
            if platform_product and platform_product.live_price_override:
                product_truth += f"- GIÁ ĐANG CHẠY FLASH SALE TRÊN LIVE: {platform_product.live_price_override} (Ưu tiên báo giá này cho khách livestream)\n"
                
            LiveConsoleEventService.emit(session_id, "live.product_truth.loaded", {"product_name": product.name, "sku": product.sku, "has_live_price": bool(platform_product and platform_product.live_price_override)}, correlation_id)
        except Exception as e:
            logger.error(f"[Session: {session_id}][Corr: {correlation_id}] Failed to load platform product truth: {e}")

        # 5. Build conversation history & Call AI
        conversation_history = []
        
        # Inject Product Truth
        conversation_history.append({
            "role": "system",
            "content": product_truth
        })
        
        # Inject Intent/Action Schema Override
        conversation_history.append({
            "role": "system",
            "content": "BẮT BUỘC: Bạn đang ở chế độ Livestream. Bạn phải phân tích bình luận của người dùng và trả về JSON có thêm 2 trường:\n1. 'intent': Phân loại ý định (ví dụ: SPAM, PRICE_INQUIRY, PRODUCT_QUESTION, GREETING, OFF_TOPIC).\n2. 'action': BẮT BUỘC là 'RESPOND' (nếu cần trả lời) hoặc 'IGNORE' (nếu là spam, chửi thề, hoặc bình luận không có ý nghĩa).\nNếu action là IGNORE, bạn có thể để 'reply' trống."
        })
        
        from live_sessions.services import LiveContextService
        context_data = LiveContextService.get_context(str(session.company_id), str(session.id))
        recent_history = context_data.get("recent_history", [])
        if isinstance(recent_history, list):
            for msg in recent_history:
                conversation_history.append(msg)
                
        if context_text:
            conversation_history.append({
                "role": "system",
                "content": f"[TRÍCH XUẤT KIẾN THỨC NỘI BỘ (Chỉ dùng nếu Product Truth chưa có đủ)]\n{context_text}"
            })
        
        conversation_history.append({
            "role": "user",
            "content": user_message
        })

        try:
            # generate_ai_reply expects lead_name as context
            lead_name = "Khách hàng Livestream"
            ai_result = generate_ai_reply(agent, conversation_history, lead_name)
            logger.info(f"[Session: {session_id}][Corr: {correlation_id}] AI completed.")
        except Exception as e:
            logger.error(f"[Session: {session_id}][Corr: {correlation_id}] AI error: {e}")
            LiveConsoleEventService.emit(session_id, "live.ai.error", {"error": str(e)}, correlation_id)
            return {"status": "error", "reason": "ai_failure"}

        intent = ai_result.get("intent", "UNKNOWN")
        action = ai_result.get("action", "RESPOND")
        logger.info(f"[Session: {session_id}][Corr: {correlation_id}] AI Intent: {intent}, Action: {action}")

        reply_text = ai_result.get("reply", "").strip()
        
        LiveConsoleEventService.emit(session_id, "live.ai.completed", {
            "intent": intent,
            "action": action,
            "reply_length": len(reply_text),
            "reply_text": reply_text
        }, correlation_id)
        
        # Save to context
        if action != "IGNORE":
            LiveContextService.add_to_history(str(session.company_id), str(session.id), "user", user_message)
            if reply_text and reply_text != "[STOP]":
                LiveContextService.add_to_history(str(session.company_id), str(session.id), "assistant", reply_text)
                import time
                LiveContextService.update_context(str(session.company_id), str(session.id), {"last_speech_time": time.time()})

        if action == "IGNORE":
            logger.info(f"[Session: {session_id}][Corr: {correlation_id}] AI ignored comment.")
            return {"status": "suppressed", "reason": "ignored_by_ai"}

        if not reply_text or reply_text == "[STOP]":
            logger.info(f"[Session: {session_id}][Corr: {correlation_id}] AI replied with empty or [STOP]. No TTS.")
            return {"status": "suppressed", "reason": "empty_reply"}

        # 6. Generate TTS
        try:
            # Configure voice: map from agent
            voice_config = {
                "voice": getattr(agent, 'tts_voice', 'alloy'), 
                "speed": getattr(agent, 'tts_speed', 1.0)
            }
            
            # Resolve AI credential via existing AI Core resolver
            from ai_agents.services import get_api_keys
            tts_keys = get_api_keys(session.company, 'openai')
            resolved_key = tts_keys[0] if tts_keys else None
            
            if getattr(settings, 'DEBUG', False) and resolved_key == 'dummy':
                self.tts_provider = DummyTTSProvider()
            else:
                self.tts_provider = OpenAITTSProvider(api_key=resolved_key)
            audio_result = self.tts_provider.generate(reply_text, voice_config)
            
            logger.info(f"[Session: {session_id}][Corr: {correlation_id}] TTS completed.")
            LiveConsoleEventService.emit(session_id, "live.tts.completed", {"format": audio_result.format, "bytes": len(audio_result.audio_bytes)}, correlation_id)
        except Exception as e:
            logger.error(f"[Session: {session_id}][Corr: {correlation_id}] TTS error: {e}")
            LiveConsoleEventService.emit(session_id, "live.tts.error", {"error": str(e)}, correlation_id)
            return {"status": "error", "reason": "tts_failure"}

        # 7. Store Audio
        try:
            audio_asset_dict = self.audio_storage.store(audio_result, session.company_id, session.id)
            logger.info(f"[Session: {session_id}][Corr: {correlation_id}] Audio stored.")
        except Exception as e:
            logger.error(f"[Session: {session_id}][Corr: {correlation_id}] Storage error: {e}")
            return {"status": "error", "reason": "storage_failure"}

        # 8. Build speech.speak command
        command_id = str(uuid.uuid4())
        message_id = str(uuid.uuid4())

        payload = {
            "command_id": command_id,
            "correlation_id": correlation_id,
            "text": reply_text,
            "audio_asset": audio_asset_dict,
            "interruptible": True,
            "priority": "normal"
        }
        
        payload_serializer = SpeechSpeakPayloadSerializer(data=payload)
        if not payload_serializer.is_valid():
            logger.error(f"[Session: {session_id}][Corr: {correlation_id}] Invalid payload schema: {payload_serializer.errors}")
            return {"status": "error", "reason": "invalid_payload_schema"}

        try:
            sequence_number = LiveSequenceService.get_next_sequence(
                company_id=str(session.company_id), 
                session_id=str(session.id)
            )
        except SequenceUnavailableException as e:
            logger.error(f"[Session: {session_id}][Corr: {correlation_id}] Sequence unavailable: {e}")
            return {"status": "failed", "reason": "SEQUENCE_UNAVAILABLE"}

        envelope = {
            "protocol_version": "1.0",
            "type": "command",
            "name": "speech.speak",
            "message_id": message_id,
            "timestamp": timezone.now().isoformat(),
            "sequence_number": sequence_number,
            "session_id": str(session.id),
            "payload": payload_serializer.validated_data
        }

        envelope_serializer = ProtocolEnvelopeSerializer(data=envelope)
        if not envelope_serializer.is_valid():
            logger.error(f"[Session: {session_id}][Corr: {correlation_id}] Invalid envelope schema: {envelope_serializer.errors}")
            return {"status": "error", "reason": "invalid_envelope_schema"}

        # 9. Send to Channel Layer
        session_group_name = f"live_session_{session.id}_device"
        try:
            async_to_sync(self.channel_layer.group_send)(
                session_group_name,
                {
                    "type": "send.command",
                    "envelope": json.loads(json.dumps(envelope_serializer.data, default=str))
                }
            )
            logger.info(f"[Session: {session_id}][Corr: {correlation_id}][Cmd: {command_id}][Msg: {message_id}] Command built and sent.")
            LiveConsoleEventService.emit(session_id, "live.speech.dispatched", {"command_id": command_id, "message_id": message_id}, correlation_id)
        except Exception as e:
            logger.error(f"[Session: {session_id}][Corr: {correlation_id}] Channel layer error: {e}")
            LiveConsoleEventService.emit(session_id, "live.speech.error", {"error": str(e)}, correlation_id)
            return {"status": "error", "reason": "channel_layer_failure"}

        return {
            "status": "success",
            "command_id": command_id,
            "message_id": message_id,
            "audio_url": audio_asset_dict.get("signed_url")
        }

    def process_proactive_speech(self, session_id: str, correlation_id: Optional[str] = None) -> Dict[str, Any]:
        """
        Generates proactive speech when the session is idle (no comments).
        """
        logger.info(f"[Session: {session_id}][Corr: {correlation_id}] Proactive speech started.")

        if not correlation_id:
            correlation_id = str(uuid.uuid4())
            
        try:
            session = LiveSession.objects.select_related('device', 'company', 'product', 'ai_agent').get(id=session_id)
        except LiveSession.DoesNotExist:
            return {"status": "error", "reason": "session_not_found"}

        if session.status != LiveSession.STATUS_RUNNING:
            return {"status": "suppressed", "reason": "not_running"}

        agent = session.ai_agent
        if not agent:
            return {"status": "error", "reason": "missing_agent"}

        # Use same product truth
        product = session.product
        product_truth = f"THÔNG TIN SẢN PHẨM ĐANG LIVE (BẮT BUỘC SỬ DỤNG LÀM CHUẨN):\n- Tên: {product.name}\n- Mã (SKU): {product.sku}\n- Giá tiêu chuẩn: {product.price}\n- Mô tả cơ bản: {product.description}\n"
        
        try:
            from live_sessions.models import LivePlatformProduct
            platform_product = LivePlatformProduct.objects.filter(
                company_id=session.company_id,
                product_id=product.id,
                platform=session.platform
            ).first()
            if platform_product and platform_product.live_price_override:
                product_truth += f"- GIÁ ĐANG CHẠY FLASH SALE TRÊN LIVE: {platform_product.live_price_override} (Ưu tiên báo giá này cho khách livestream)\n"
        except Exception:
            pass

        conversation_history = [
            {"role": "system", "content": product_truth},
            {"role": "system", "content": "BẮT BUỘC: Không có ai bình luận trong thời gian qua. Hãy chủ động nói một câu ngắn gọn (1-2 câu) để giới thiệu sản phẩm đang ghim, nêu bật điểm mạnh hoặc kêu gọi người xem chốt đơn. Định dạng trả về JSON với 'intent'='PROACTIVE', 'action'='RESPOND', và 'reply' chứa câu nói của bạn."}
        ]
        
        from live_sessions.services import LiveContextService
        context_data = LiveContextService.get_context(str(session.company_id), str(session.id))
        recent_history = context_data.get("recent_history", [])
        if isinstance(recent_history, list):
            for msg in recent_history:
                conversation_history.append(msg)
                
        try:
            ai_result = generate_ai_reply(agent, conversation_history, "Khách hàng Livestream")
        except Exception as e:
            logger.error(f"[Session: {session_id}] AI error in proactive speech: {e}")
            return {"status": "error", "reason": "ai_failure"}

        reply_text = ai_result.get("reply", "").strip()
        if not reply_text or reply_text == "[STOP]":
            return {"status": "suppressed", "reason": "empty_reply"}

        LiveContextService.add_to_history(str(session.company_id), str(session.id), "assistant", reply_text)
        import time
        LiveContextService.update_context(str(session.company_id), str(session.id), {"last_speech_time": time.time()})

        # Generate TTS
        try:
            voice_config = {"voice": getattr(agent, 'tts_voice', 'alloy'), "speed": getattr(agent, 'tts_speed', 1.0)}
            from ai_agents.services import get_api_keys
            tts_keys = get_api_keys(session.company, 'openai')
            resolved_key = tts_keys[0] if tts_keys else None
            if getattr(settings, 'DEBUG', False) and resolved_key == 'dummy':
                self.tts_provider = DummyTTSProvider()
            else:
                self.tts_provider = OpenAITTSProvider(api_key=resolved_key)
            audio_result = self.tts_provider.generate(reply_text, voice_config)
        except Exception as e:
            logger.error(f"[Session: {session_id}] TTS error: {e}")
            return {"status": "error", "reason": "tts_failure"}

        try:
            audio_asset_dict = self.audio_storage.store(audio_result, session.company_id, session.id)
        except Exception as e:
            logger.error(f"[Session: {session_id}] Storage error: {e}")
            return {"status": "error", "reason": "storage_failure"}

        command_id = str(uuid.uuid4())
        message_id = str(uuid.uuid4())
        payload = {
            "command_id": command_id,
            "text": reply_text,
            "audio_url": audio_asset_dict["url"],
            "signature": audio_asset_dict["signature"],
            "expires_at": audio_asset_dict["expires_at"]
        }
        
        payload_serializer = SpeechSpeakPayloadSerializer(data=payload)
        if not payload_serializer.is_valid():
            return {"status": "error", "reason": "invalid_payload_schema"}
            
        try:
            sequence_number = LiveSequenceService.get_next_sequence(str(session.company_id), str(session.id))
        except SequenceUnavailableException:
            return {"status": "failed", "reason": "SEQUENCE_UNAVAILABLE"}
            
        envelope = {
            "protocol_version": "1.0",
            "type": "command",
            "name": "speech.speak",
            "message_id": message_id,
            "timestamp": timezone.now().isoformat(),
            "sequence_number": sequence_number,
            "session_id": str(session.id),
            "payload": payload_serializer.validated_data
        }
        
        envelope_serializer = ProtocolEnvelopeSerializer(data=envelope)
        if not envelope_serializer.is_valid():
            return {"status": "error", "reason": "invalid_envelope_schema"}
            
        session_group_name = f"live_session_{session.id}_device"
        try:
            async_to_sync(self.channel_layer.group_send)(
                session_group_name,
                {"type": "send.command", "envelope": json.loads(json.dumps(envelope_serializer.data, default=str))}
            )
        except Exception as e:
            return {"status": "error", "reason": "channel_layer_failure"}
            
        return {"status": "success", "command_id": command_id}
