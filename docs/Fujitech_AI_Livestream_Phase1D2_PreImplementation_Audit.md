# Fujitech AI Livestream - Phase 1D-2 Pre-Implementation Audit (Live Orchestrator)

## 1. Executive Summary
Phase 1D-2 tập trung vào việc thiết kế và xây dựng **Live Orchestrator** - bộ não điều phối luồng dữ liệu thời gian thực từ lúc nhận Event, phân tích AI, sinh giọng nói (TTS) cho đến khi ra lệnh phát ngôn (`speech.speak`) xuống thiết bị (Live Studio). Hiện trạng kiến trúc Cloud-to-Device đã vững vàng sau Phase 1C-B và TTS Layer đã sẵn sàng sau Phase 1D-1. Trọng tâm của phase này là nối ghép các thành phần thành luồng đồng bộ, tuân thủ nguyên tắc "Cloud giữ Business Logic, Device chỉ thực thi".

## 2. Existing AI Core Audit
Qua việc đọc code thực tế tại `ai_agents/services.py` và `rag_processor.py`:
- **AI Invocation**: Sử dụng hàm `generate_ai_reply(agent, conversation_history, lead_name)`. Nó tự động xoay vòng API keys và trả về JSON có cấu trúc (`thought`, `reply`, `sentiment`, `extracted_info`).
- **Product-Scoped RAG**: Hiện được gọi trong `tasks.py` thông qua `rag_processor.search_knowledge(query, agent, keys, provider, limit=3, product_id=product_id)`. RAG đã hoàn thiện khả năng lọc theo `product_id`.
- **Reuse**: Live Orchestrator CHẮC CHẮN phải tái sử dụng `search_knowledge` và `generate_ai_reply` bằng cách nối chúng lại với nhau (giống như cách `process_ai_reply_facebook` đang làm). KHÔNG cần xây dựng AI Agent hay RAG mới. 
- **Input**: User Message (text).
- **Output**: JSON dict (có field `reply` là text cần đem đi đọc TTS).

## 3. Existing TTS Audit
Dựa trên Phase 1D-1 (`live_sessions/audio/tts.py` & `storage.py`):
- **Provider**: Đã có `OpenAITTSProvider.generate(text, config) -> AudioResult`.
- **Storage**: Đã có `LocalAudioStorageBackend.store(audio, company_id, session_id) -> Dict` trả về `signed_url`.
- **Reuse**: Orchestrator chỉ việc gọi `provider.generate()` sau đó pass kết quả cho `storage.store()`. Mọi abstraction đã hoàn thiện, không cần sửa đổi thêm TTS core.

## 4. Existing Protocol Audit
Dựa trên `backend/live_sessions/protocol/`:
- **Command**: `speech.speak` (đã có schema `SpeechSpeakPayloadSerializer` chứa `command_id`, `correlation_id`, `text`, `audio_asset`).
- **Transport**: Đã có `DeviceAgentConsumer` và channel layer (`group_send`).
- **Reuse**: Orchestrator sẽ dùng `channel_layer.group_send(session_group_name, {"type": "send.command", ...})` kèm dictionary khớp đúng với `ProtocolEnvelopeSerializer`.

## 5. Live Session / Context Audit
Dựa trên `LiveSession` model và `LiveContextService`:
- Trạng thái Session: Cần kiểm tra `status == STATUS_RUNNING`. Nếu `status == STATUS_HUMAN_TAKEOVER`, Orchestrator phải DỪNG mọi xử lý tự động.
- Dữ liệu Product: Cần lấy `session.product_id` truyền vào hàm `search_knowledge` của RAG để AI chỉ tư vấn đúng sản phẩm đang livestream.

## 6. Speech Lifecycle
Luồng sống của một câu thoại:
1. **REQUEST**: Nhận Event comment (từ Shopee/TikTok/Mock) -> Đưa vào Celery Task `process_live_comment`.
2. **VALIDATE**: Check session status != HUMAN_TAKEOVER.
3. **AI GEN**: Gọi RAG + `generate_ai_reply`.
4. **TTS**: Bỏ field `reply` vào `TTSProvider`.
5. **STORE**: Lưu xuống `AudioStorage`, lấy `signed_url`.
6. **BUILD COMMAND**: Tạo `command_id` UUID, ráp Envelope `speech.speak`.
7. **SEND**: Push qua `group_send`.
8. **ACK RECEIVED / COMPLETED**: Nhận lại từ WebSocket Consumer, log lại cho mục đích tracing.

*Kết luận*: KHÔNG tạo DB Model cho Speech Queue ở Cloud. Lưu vết chỉ thông qua logs.

## 7. Orchestrator Architecture
- Tạo file `live_sessions/orchestrator.py` chứa class `LiveOrchestrator`.
- **Responsibility**: Nhận `session_id`, `user_message`. Load context từ Redis/DB. Gọi AI, gọi TTS, đóng gói Protocol, gửi WebSocket.
- Được gọi từ một Celery Task độc lập.

## 8. Celery Boundary
- **SYNC (Realtime WebSocket)**: Nhận `session.sync`, ACK, Events, Authentication. Routing event thô vào Message Broker (Celery).
- **ASYNC (Celery)**: `LiveOrchestrator` nằm HOÀN TOÀN trong Celery task. Tránh việc gọi API OpenAI và TTS làm chặn luồng ASGI của Django Channels.

## 9. Device Emulator Design
Chưa có Client/Emulator thực tế. Cần tạo 1 script Python giả lập: `live_sessions/device_client_mock.py`.
- **Tính năng**: Connect WSS, pass Auth header, gửi `session.sync`, lắng nghe `speech.speak`. Tự động gọi thư viện `requests` download `audio_asset.signed_url` và print log. Gửi ngược lại `ACK (received)` rồi `ACK (completed)`.
- *Không* tích hợp Playback hay UI, chỉ chạy CLI.

## 10. Speech Queue Responsibility
- **Cloud**: KHÔNG làm Queue câu nói.
- **Device (Emulator)**: Sẽ phải mô phỏng giữ 1 biến trạng thái đang phát (FIFO). Nếu nhận `priority=high`, ngắt câu hiện tại. Toàn bộ responsibility này thuộc về Device. Phase 1D-2 sẽ implement queue logic nháp này trong Mock Client.

## 11. Failure Matrix
- **TTS Failure**: Orchestrator ghi log, dừng pipeline, KHÔNG gửi lệnh xuống device.
- **Storage Failure**: Giống TTS Failure.
- **Device Offline**: Orchestrator vẫn gửi (Pub/Sub message sẽ rớt mất). Khi device online, nó dùng `session.sync` khôi phục sequence (nếu có buffer) - MVP chấp nhận rớt tin nếu Offline.
- **Human Takeover**: Orchestrator drop lệnh ngay từ đầu, không tốn tiền gọi AI.
- **Audio URL Expired**: Device trả `ACK (failed)` với mã lỗi, Cloud chỉ ghi nhận.

## 12. Security / Tenant Isolation
- Orchestrator load AI Agent và Company key dựa theo `session.company_id`. Không dùng nhầm key của công ty khác.
- Audio Asset tạo ra được gắn chặt với `company_id` và `session_id` để được bảo vệ bởi endpoint ở Phase 1D-1.

## 13. Observability
Sử dụng `logging` mặc định của Django. Bắt buộc có các tags:
`[Session: X][Msg: Y][Cmd: Z]` trên mọi log.
Log tại các chốt: RAG xong, AI reply xong, TTS xong, Command sent.

## 14. File Impact Analysis
- **FILES TO CREATE**:
  - `backend/live_sessions/orchestrator.py`: Core logic gọi AI & TTS.
  - `backend/live_sessions/tasks.py`: Chứa task Celery `handle_live_message`.
  - `backend/live_sessions/device_client_mock.py`: CLI python giả lập kết nối WSS.
- **FILES TO MODIFY**:
  - `backend/live_sessions/consumers.py`: Chỉ thêm đoạn route log Event/ACK xuống logger (nếu cần).
- **FILES TO DELETE**: NONE.

## 15. Test Strategy
- **Unit Tests**: Mock LLM & TTS provider. Đảm bảo Orchestrator sinh đúng payload Envelope.
- **Integration Tests**: Gọi Orchestrator, kiểm tra Celery gửi message vào channel layer đúng định dạng.
- **E2E/Mock Test**: Chạy server và khởi động `device_client_mock.py` bằng terminal, dùng script HTTP post comment, quan sát Emulator nhận âm thanh thành công.

## 16. Regression Risk
- Việc tạo thư mục và orchestrator hoàn toàn tách biệt.
- KHÔNG chỉnh sửa logic ASGI, WebSocket routing, hay AI Core (chỉ import dùng). Nguy cơ regression (Phase 1A -> 1D-1) cực thấp.
- *Lưu ý*: Vấn đề với `test_crm_db` do `zalo_integration` gây ra đang chặn full regression test, tuy nhiên nó không liên quan đến logic sẽ code ở 1D-2.

## 17. Open Questions
- Không có GAP nào ngăn cản implementation. Các abstraction hiện hữu ở AI Core và TTS đều khớp hoàn hảo cho orchestration.

## 18. Phase 1D-2 Implementation Plan
1. Viết `orchestrator.py` kết nối RAG -> AI Core -> TTS -> Channel Layer.
2. Viết Celery task trong `tasks.py` bọc Orchestrator.
3. Chỉnh sửa Consumer (nếu có event nhắn lên) để gọi Celery task.
4. Viết Mock Device Client bằng `websockets` + `asyncio`.
5. Viết tests.

## 19. Definition of Done
1. Có thể gửi 1 event chat lên Cloud, Cloud sinh âm thanh rồi đẩy JSON Envelope xuống WSS thành công.
2. Mock Device kết nối vào, nhận được JSON, tải được Audio từ URL.
3. Auth Token của Device khớp chặt chẽ, không sinh rò rỉ tenant.
4. Tests của orchestrator được viết đầy đủ.

---
**PHASE 1D-2 PRE-IMPLEMENTATION AUDIT READY**
