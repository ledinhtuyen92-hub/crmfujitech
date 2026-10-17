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
from live_sessions.audio.tts import OpenAITTSProvider, DummyTTSProvider, GoogleTTSProvider, MicrosoftEdgeTTSProvider, generate_tts_with_failover
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
            "ai_agent_id": session.ai_agent_id if session.ai_agent else None,
            "session_prompt": session.session_prompt,
            "avatar_asset_url": session.avatar_asset.file.url if session.avatar_asset and session.avatar_asset.file else None,
            "avatar_speaking_asset_url": session.avatar_speaking_asset.file.url if session.avatar_speaking_asset and session.avatar_speaking_asset.file else None,
            "background_asset_url": session.background_asset.file.url if session.background_asset and session.background_asset.file else None,
            "overlay_asset_url": session.overlay_asset.file.url if session.overlay_asset and session.overlay_asset.file else None,
            "audio_asset_url": session.audio_asset.file.url if session.audio_asset and session.audio_asset.file else None,
            "bgm_volume": float(getattr(session, 'bgm_volume', 35) if getattr(session, 'bgm_volume', 35) is not None else 35) / 100.0,
            "ai_volume": float(getattr(session, 'ai_volume', 100) if getattr(session, 'ai_volume', 100) is not None else 100) / 100.0,
            "avatar_actions": [],
        }
        
        # Resolve avatar_actions with full accessible URLs
        if session.avatar_actions and isinstance(session.avatar_actions, list):
            from .models import LiveMediaAsset
            resolved_actions = []
            for act in session.avatar_actions:
                act_url = act.get('asset_url')
                asset_id = act.get('asset_id')
                if not act_url and asset_id:
                    try:
                        asset = LiveMediaAsset.objects.get(id=asset_id)
                        if asset.file:
                            act_url = asset.file.url
                    except Exception:
                        pass
                if act_url:
                    resolved_actions.append({
                        "id": str(act.get("id") or act.get("action_id") or uuid.uuid4())[:16],
                        "name": act.get("name", "Action"),
                        "url": act_url,
                        "keywords": act.get("keywords", "")
                    })
            payload["avatar_actions"] = resolved_actions
        
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

        # 6. Generate TTS via Multi-Tier Failover Engine (Inherits Speed & Gender)
        try:
            audio_result, used_provider, is_fallback, fallback_reason = generate_tts_with_failover(
                text=reply_text,
                agent=agent,
                company=session.company,
                session_id=session_id,
                correlation_id=correlation_id
            )
            logger.info(f"[Session: {session_id}][Corr: {correlation_id}] TTS completed via '{used_provider}' (fallback={is_fallback}): {len(audio_result.audio_bytes)} bytes.")
            LiveConsoleEventService.emit(session_id, "live.tts.completed", {
                "format": audio_result.format,
                "bytes": len(audio_result.audio_bytes),
                "provider": used_provider,
                "is_fallback": is_fallback,
                "fallback_reason": fallback_reason if is_fallback else None
            }, correlation_id)
            if is_fallback:
                LiveConsoleEventService.emit(session_id, "live.tts.fallback", {
                    "requested_provider": getattr(agent, 'tts_provider', 'microsoft'),
                    "fallback_provider": used_provider,
                    "reason": fallback_reason,
                    "speed": getattr(agent, 'tts_speed', 1.0)
                }, correlation_id)
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

        # Check action keywords in reply_text
        triggered_action = None
        if session.avatar_actions and isinstance(session.avatar_actions, list):
            lower_text = reply_text.lower()
            for act in session.avatar_actions:
                kw_str = act.get("keywords", "")
                if kw_str:
                    keywords = [k.strip().lower() for k in kw_str.split(",") if k.strip()]
                    if any(kw in lower_text for kw in keywords):
                        triggered_action = str(act.get("id") or act.get("action_id"))[:16]
                        logger.info(f"[Session: {session_id}] Matched action '{act.get('name')}' ({triggered_action}) in speech text")
                        break

        payload = {
            "command_id": command_id,
            "correlation_id": correlation_id,
            "text": reply_text,
            "audio_asset": audio_asset_dict,
            "interruptible": True,
            "priority": "normal",
            "action": triggered_action
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

    def generate_proactive_sales_pitch(self, product, session, context_data: dict) -> str:
        """
        Tự động tạo câu tư vấn sản phẩm bán hàng chuyên nghiệp khi livestream chưa có comment.
        Xoay vòng đa dạng: Lời chào mừng, nêu bật tính năng & độ bền, báo giá flash sale, ưu đãi vận chuyển, kêu gọi chốt đơn.
        """
        pitch_index = context_data.get("proactive_pitch_index", 0)
        prod_name = product.name if product else "sản phẩm nổi bật của bên em"
        
        price_val = None
        try:
            from live_sessions.models import LivePlatformProduct
            platform_product = LivePlatformProduct.objects.filter(
                company_id=session.company_id,
                product_id=product.id,
                platform=session.platform
            ).first() if product else None
            if platform_product and platform_product.live_price_override:
                price_val = f"{int(platform_product.live_price_override):,} đồng"
        except Exception:
            pass
            
        if not price_val and product and product.price:
            try:
                price_val = f"{int(product.price):,} đồng"
            except Exception:
                price_val = f"{product.price} đồng"
                
        price_str = f"chỉ với mức giá {price_val}" if price_val else "với mức giá cực kỳ ưu đãi"
        extra_note = f". Đặc biệt lưu ý: {session.session_prompt}" if getattr(session, 'session_prompt', None) else ""
        
        pitches = [
            f"Dạ em xin chào mừng toàn thể mọi người đang theo dõi phiên livestream hôm nay ạ! Sản phẩm bên em đang ghim trực tiếp là {prod_name}, hôm nay trợ giá đặc biệt {price_str} thôi cả nhà ơi! Các bác nhanh tay bấm vào giỏ hàng bên dưới để săn deal ngay nhé{extra_note}!",
            f"Dạ sản phẩm {prod_name} này bên em cam kết hàng chuẩn chính hãng một trăm phần trăm, độ bền vượt trội và bảo hành đầy đủ. Bác nào ưng ý thì bấm đặt ngay trong live để nhận mã miễn phí vận chuyển toàn quốc nha!",
            f"Số lượng suất flash sale dành cho {prod_name} {price_str} trong phiên live hôm nay chỉ còn rất ít thôi cả nhà ơi! Anh chị em mình nhanh tay chốt đơn kẻo hết mã giảm giá nhé!",
            f"Mọi người đang xem livestream nếu có bất kỳ thắc mắc nào về kích thước, chất liệu hay cách sử dụng của {prod_name} thì cứ thả bình luận xuống bên dưới, em sẽ tư vấn và giải đáp chi tiết cho từng người luôn ạ!",
            f"Dạ các bác nhanh tay bấm vào giỏ hàng màu cam để nhận ngay voucher độc quyền cho {prod_name} nha. Mức giá ưu đãi {price_str} chỉ áp dụng trực tiếp trong lúc phiên live đang phát thôi ạ!"
        ]
        
        chosen = pitches[pitch_index % len(pitches)]
        from live_sessions.services import LiveContextService
        LiveContextService.update_context(str(session.company_id), str(session.id), {
            "proactive_pitch_index": pitch_index + 1
        })
        return chosen

    def process_proactive_speech(self, session_id: str, correlation_id: Optional[str] = None) -> Dict[str, Any]:
        """
        Generates proactive speech when the session is idle (no comments) or starting up.
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
        product = session.product
        
        from live_sessions.services import LiveContextService
        context_data = LiveContextService.get_context(str(session.company_id), str(session.id))
        
        reply_text = ""
        # 1. Thử gọi LLM nếu có agent cấu hình
        if agent:
            product_truth = f"THÔNG TIN SẢN PHẨM ĐANG LIVE (BẮT BUỘC SỬ DỤNG LÀM CHUẨN):\n- Tên: {product.name if product else 'Sản phẩm hot'}\n"
            if product:
                product_truth += f"- Mã (SKU): {product.sku}\n- Giá tiêu chuẩn: {product.price}\n- Mô tả cơ bản: {product.description}\n"
            
            try:
                from live_sessions.models import LivePlatformProduct
                if product:
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
                {"role": "system", "content": "BẮT BUỘC: Không có ai bình luận trong thời gian qua. Hãy chủ động nói một câu ngắn gọn (1-2 câu) bằng tiếng Việt tự nhiên để chào người xem, giới thiệu sản phẩm đang ghim, nêu bật điểm mạnh hoặc kêu gọi chốt đơn trong giỏ hàng. Định dạng trả về JSON với 'intent'='PROACTIVE', 'action'='RESPOND', và 'reply' chứa câu nói của bạn."}
            ]
            
            recent_history = context_data.get("recent_history", [])
            if isinstance(recent_history, list):
                for msg in recent_history:
                    conversation_history.append(msg)
                    
            try:
                ai_result = generate_ai_reply(agent, conversation_history, "Khách hàng Livestream")
                candidate_reply = ai_result.get("reply", "").strip() if isinstance(ai_result, dict) else ""
                if candidate_reply and candidate_reply != "[STOP]" and not candidate_reply.startswith("Hệ thống AI chưa được cấu hình"):
                    reply_text = candidate_reply
            except Exception as e:
                logger.warning(f"[Session: {session_id}] AI error in proactive speech: {e}, falling back to sales pitch")

        # 2. Nếu LLM không khả dụng hoặc lỗi hoặc chưa có API key -> Dùng kịch bản tư vấn thông minh
        if not reply_text:
            reply_text = self.generate_proactive_sales_pitch(product, session, context_data)

        if not reply_text or reply_text == "[STOP]":
            return {"status": "suppressed", "reason": "empty_reply"}

        LiveContextService.add_to_history(str(session.company_id), str(session.id), "assistant", reply_text)
        import time
        LiveContextService.update_context(str(session.company_id), str(session.id), {"last_speech_time": time.time()})

        # 3. Generate Proactive TTS via Multi-Tier Failover Engine
        try:
            audio_result, used_provider, is_fallback, fallback_reason = generate_tts_with_failover(
                text=reply_text,
                agent=agent,
                company=session.company,
                session_id=session_id,
                correlation_id=correlation_id
            )
            logger.info(f"[Session: {session_id}][Corr: {correlation_id}] Proactive TTS completed via '{used_provider}' (fallback={is_fallback}): {len(audio_result.audio_bytes)} bytes")
            LiveConsoleEventService.emit(session_id, "live.tts.completed", {
                "format": audio_result.format,
                "bytes": len(audio_result.audio_bytes),
                "provider": used_provider,
                "is_fallback": is_fallback,
                "fallback_reason": fallback_reason if is_fallback else None
            }, correlation_id)
            if is_fallback:
                LiveConsoleEventService.emit(session_id, "live.tts.fallback", {
                    "requested_provider": getattr(agent, 'tts_provider', 'microsoft'),
                    "fallback_provider": used_provider,
                    "reason": fallback_reason,
                    "speed": getattr(agent, 'tts_speed', 1.0)
                }, correlation_id)
        except Exception as e:
            logger.error(f"[Session: {session_id}] TTS error: {e}")
            return {"status": "error", "reason": "tts_failure"}

        # 4. Lưu Audio Asset
        try:
            audio_asset_dict = self.audio_storage.store(audio_result, session.company_id, session.id)
        except Exception as e:
            logger.error(f"[Session: {session_id}] Storage error: {e}")
            return {"status": "error", "reason": "storage_failure"}

        # 5. Build speech.speak command
        command_id = str(uuid.uuid4())
        message_id = str(uuid.uuid4())

        triggered_action = None
        if session.avatar_actions and isinstance(session.avatar_actions, list):
            lower_text = reply_text.lower()
            for act in session.avatar_actions:
                kw_str = act.get("keywords", "")
                if kw_str:
                    keywords = [k.strip().lower() for k in kw_str.split(",") if k.strip()]
                    if any(kw in lower_text for kw in keywords):
                        triggered_action = str(act.get("id") or act.get("action_id"))[:16]
                        break

        payload = {
            "command_id": command_id,
            "correlation_id": correlation_id,
            "text": reply_text,
            "audio_asset": audio_asset_dict,
            "interruptible": True,
            "priority": "normal",
            "action": triggered_action
        }
        
        payload_serializer = SpeechSpeakPayloadSerializer(data=payload)
        if not payload_serializer.is_valid():
            logger.error(f"[Session: {session_id}] Invalid payload schema: {payload_serializer.errors}")
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
            logger.error(f"[Session: {session_id}] Invalid envelope schema: {envelope_serializer.errors}")
            return {"status": "error", "reason": "invalid_envelope_schema"}
            
        session_group_name = f"live_session_{session.id}_device"
        try:
            async_to_sync(self.channel_layer.group_send)(
                session_group_name,
                {"type": "send.command", "envelope": json.loads(json.dumps(envelope_serializer.data, default=str))}
            )
            logger.info(f"[Session: {session_id}] speech.speak sent successfully to {session_group_name}")
        except Exception as e:
            logger.error(f"[Session: {session_id}] Channel layer send error: {e}")
            return {"status": "error", "reason": "channel_layer_failure"}
            
        # Emit console event to studio UI
        try:
            LiveConsoleEventService.emit(session_id, "live.speech.started", {
                "text": reply_text,
                "audio_url": audio_asset_dict.get("signed_url"),
                "command_id": command_id,
                "type": "proactive"
            }, correlation_id)
        except Exception as e:
            logger.debug(f"Console event emit error: {e}")

        return {"status": "success", "command_id": command_id}
