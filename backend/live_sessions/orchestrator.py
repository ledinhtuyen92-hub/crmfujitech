import logging
import uuid
from typing import Dict, Any, Optional
from django.utils import timezone
from channels.layers import get_channel_layer
from asgiref.sync import async_to_sync

from live_sessions.models import LiveSession
from ai_agents.services import generate_ai_reply
from ai_agents.rag_processor import search_knowledge
from live_sessions.audio.tts import OpenAITTSProvider
from live_sessions.audio.storage import LocalAudioStorageBackend
from live_sessions.protocol.commands import SpeechSpeakPayloadSerializer
from live_sessions.protocol.envelope import ProtocolEnvelopeSerializer
from live_sessions.sequence import LiveSequenceService, SequenceUnavailableException

logger = logging.getLogger(__name__)

class LiveOrchestrator:
    """
    LiveOrchestrator điều phối toàn bộ quá trình:
    Nhận tin nhắn -> RAG -> AI Core -> TTS -> Storage -> WebSocket.
    """
    def __init__(self):
        self.tts_provider = OpenAITTSProvider()
        self.audio_storage = LocalAudioStorageBackend()
        self.channel_layer = get_channel_layer()

    def process_comment(self, session_id: str, user_message: str, correlation_id: Optional[str] = None) -> Dict[str, Any]:
        """
        Nhận event comment, phân tích bằng AI, tạo âm thanh và push xuống thiết bị.
        """
        logger.info(f"[Session: {session_id}][Corr: {correlation_id}] Orchestration started. Message: '{user_message}'")

        if not correlation_id:
            correlation_id = str(uuid.uuid4())

        # 1. Load LiveSession
        try:
            session = LiveSession.objects.select_related('device', 'company', 'product', 'ai_agent').get(id=session_id)
        except LiveSession.DoesNotExist:
            logger.error(f"[Session: {session_id}][Corr: {correlation_id}] Invalid session.")
            return {"status": "error", "reason": "session_not_found"}

        # 2. Validate status
        if session.status == LiveSession.STATUS_HUMAN_TAKEOVER:
            logger.info(f"[Session: {session_id}][Corr: {correlation_id}] Session is in HUMAN_TAKEOVER. Suppressed.")
            return {"status": "suppressed", "reason": "human_takeover"}

        if session.status != LiveSession.STATUS_RUNNING:
            logger.info(f"[Session: {session_id}][Corr: {correlation_id}] Session is not RUNNING (current: {session.status}). Suppressed.")
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
        except Exception as e:
            logger.error(f"[Session: {session_id}][Corr: {correlation_id}] RAG error: {e}")
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
            return {"status": "error", "reason": "ai_failure"}

        intent = ai_result.get("intent", "UNKNOWN")
        action = ai_result.get("action", "RESPOND")
        logger.info(f"[Session: {session_id}][Corr: {correlation_id}] AI Intent: {intent}, Action: {action}")

        reply_text = ai_result.get("reply", "").strip()
        
        # Save to context
        if action != "IGNORE":
            LiveContextService.add_to_history(str(session.company_id), str(session.id), "user", user_message)
            if reply_text and reply_text != "[STOP]":
                LiveContextService.add_to_history(str(session.company_id), str(session.id), "assistant", reply_text)

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
            audio_result = self.tts_provider.generate(reply_text, voice_config)
            logger.info(f"[Session: {session_id}][Corr: {correlation_id}] TTS completed.")
        except Exception as e:
            logger.error(f"[Session: {session_id}][Corr: {correlation_id}] TTS error: {e}")
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
        session_group_name = f"live_session_{session.id.hex}"
        try:
            async_to_sync(self.channel_layer.group_send)(
                session_group_name,
                {
                    "type": "send.command",
                    "envelope": envelope_serializer.validated_data
                }
            )
            logger.info(f"[Session: {session_id}][Corr: {correlation_id}][Cmd: {command_id}][Msg: {message_id}] Command built and sent.")
        except Exception as e:
            logger.error(f"[Session: {session_id}][Corr: {correlation_id}] Channel layer error: {e}")
            return {"status": "error", "reason": "channel_layer_failure"}

        return {
            "status": "success",
            "command_id": command_id,
            "message_id": message_id,
            "audio_url": audio_asset_dict.get("signed_url")
        }
