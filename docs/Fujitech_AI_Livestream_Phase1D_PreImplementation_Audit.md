# Fujitech AI Livestream - Phase 1D Pre-Implementation Audit & Design

## 1. Existing Architecture Findings

Qua việc audit toàn bộ repository (`backend` và `frontend`), hiện trạng kiến trúc của hệ thống như sau:
*   **AI Core & RAG**: Đã có nền tảng vững chắc trong app `ai_agents`. Fujitech đang sử dụng `LiteLLM` để quản lý nhiều provider (OpenAI, Anthropic, Gemini). RAG được vận hành qua `pgvector` với `AiKnowledgeDocument` và `AiKnowledgeChunk`.
*   **Protocol**: Đã hoàn thiện và vượt qua test (`backend/live_sessions/protocol/`). Các Schema đã đầy đủ.
*   **WebSocket Data Plane**: Đã hoàn thiện tại `live_sessions/consumers.py`. Đã có Device Authentication (JWT/Query), Single Active Connection, và Session Sync Gating.
*   **LiveSession / LiveDevice / LiveContext**: Các model và service (Redis DB2) để quản lý Live Stream đã sẵn sàng.

## 2. TTS Audit

Sau khi tìm kiếm toàn bộ codebase, kết quả như sau:
*   **TTS Provider**: MISSING. (Chưa có bất kỳ thư viện, API hay provider nào như ElevenLabs, FPT.AI, Viettel AI được tích hợp).
*   **TTS Abstraction**: MISSING.
*   **Audio Format / Codec / Sample rate**: MISSING (chưa có quy định).
*   **Streaming TTS**: MISSING.
*   **TTS Caching**: MISSING.
*   **Celery task cho TTS**: MISSING.

**Đánh giá**: Phase 1D sẽ phải xây dựng toàn bộ TTS Engine Service mới hoàn toàn. Cần chọn một provider TTS (như ElevenLabs hoặc Azure TTS cho tiếng Việt) để bắt đầu MVP.

## 3. Audio Asset Audit

Kiểm tra `AudioAssetSerializer` trong Protocol hiện tại:
*   **Hiện có**: Đã định nghĩa abstraction cho `audio_asset` (nằm trong thư mục protocol).
*   **Thiếu (MISSING / GAP)**:
    *   Chưa có cơ chế Storage thực tế (S3, R2, hay Local).
    *   Chưa có Presigned URL generation.
    *   Chưa có giới hạn dung lượng hay cơ chế xoá (TTL) file audio tạm.
    *   Chưa có metadata rõ ràng quy định sample rate / channels cho audio playback engine.

## 4. speech.speak Audit

Schema `SpeechSpeakPayloadSerializer` hiện tại trong `commands.py`:
*   **Hiện có**: 
    *   `command_id` (UUID - phục vụ deduplication).
    *   `correlation_id` (UUID - phục vụ tracking ngược lại với AI response/user message).
    *   `text` (Nội dung raw text).
    *   `audio_asset` (Dữ liệu file audio sau khi sinh).
    *   `interruptible` (Boolean).
    *   `priority` (Choice: high/normal).
*   **Đánh giá**: Protocol schema hiện tại đã đủ chuẩn để làm MVP (có deduplication, có tính năng ngắt lời, và priority). Không ghi nhận GAP nào nghiêm trọng ở cấp độ Schema.

## 5. Live Studio Audit

Tìm kiếm frontend và backend codebase cho cụm từ "studio", "lip sync", "avatar", "execution client":
*   **Desktop App / Local Client**: NOT FOUND.
*   **Browser Source / OBS Integration**: NOT FOUND.
*   **Avatar Renderer / Lip-sync engine**: NOT FOUND.
*   **Audio Player Client**: NOT FOUND.

**Đánh giá**: Fujitech Live Studio chưa tồn tại. Việc thực thi (execution) tại Device hiện chưa có phần mềm client nào để hứng lệnh WebSocket và play âm thanh.

## 6. Execution Boundary

Căn cứ vào kiến trúc `Cloud -> Device`, trách nhiệm (Responsibility) được phân chia rõ rệt:

**CLOUD (AI Orchestrator):**
*   Lắng nghe Event (từ Shopee/TikTok/Facebook) và quyết định trả lời.
*   Sử dụng RAG / LLM sinh nội dung text.
*   Gọi TTS Provider để sinh Audio Asset.
*   Đóng gói lệnh `speech.speak` và gửi qua WebSocket Data Plane.
*   KHÔNG quản lý trạng thái playback chi tiết của Device (chỉ lưu state tổng quan qua ACK).

**LIVE STUDIO (DEVICE):**
*   Duy trì WebSocket connection (thực hiện `session.sync`).
*   Nhận `speech.speak` và deduplicate bằng `command_id`.
*   Download Audio Asset từ Cloud.
*   Thực thi playback (phát âm thanh).
*   Render Avatar và Lip-sync đồng bộ với audio.
*   Báo cáo `ACK` (success / failed) ngược lại Cloud qua WebSocket.

## 7. Speech Lifecycle

Vòng đời của một mệnh lệnh phát ngôn:
1.  **AI Response**: LLM sinh ra nội dung (text).
2.  **TTS Generation**: Cloud Orchestrator chuyển text thành audio (có thể qua Celery).
3.  **Command Push**: Gửi lệnh `speech.speak` kèm `audio_asset` URL xuống Device.
4.  **Received ACK**: Device nhận được lệnh $\rightarrow$ báo `ACK(status=received)`.
5.  **Audio Download**: Device tải audio URL và cache local.
    *   *Failure Path*: Tải lỗi $\rightarrow$ báo `ACK(status=failed, error=DOWNLOAD_ERROR)`.
6.  **Playback & Avatar**: Device phát audio và chạy lip-sync.
    *   *Failure Path*: Lỗi soundcard/player $\rightarrow$ báo `ACK(status=failed, error=PLAYBACK_ERROR)`.
7.  **Completed ACK**: Device phát xong $\rightarrow$ báo `ACK(status=completed)`.

## 8. Speech Queue / Concurrency

**Gating & Queue Boundary:**
*   **Cloud (WebSocket Data Plane)**: KHÔNG đóng vai trò làm Queue. Nhiệm vụ chỉ là vận chuyển lệnh theo thời gian thực (đã có gating qua `session.sync`).
*   **Live Studio (Device)**: LÀ NƠI duy trì **Speech Queue**.
    *   **Sequential Playback**: Device duy trì một FIFO Queue (First In, First Out). Khi đang phát `speech A`, nhận được `speech B` thì đưa B vào Queue chờ.
    *   **Barge-in / Interrupt**: Nếu nhận `speech C` có `priority=high` và lệnh trước đó `interruptible=True`, Device ngừng phát ngay lập tức $\rightarrow$ clear queue $\rightarrow$ phát C $\rightarrow$ báo failed ACK (hoặc interrupted ACK) cho các lệnh bị huỷ.

## 9. Human Takeover

*   **Boundary**: Quản lý ở tầng Live Context (Cloud).
*   **Behavior**: Khi Admin kích hoạt Human Takeover:
    *   Tất cả Event AI trigger (tự động trả lời) bị vô hiệu hoá tại AI Orchestrator.
    *   Cloud gửi lệnh `session.control (action=pause)` xuống Device.
    *   Device huỷ (cancel) toàn bộ Pending Speech Queue, ngừng phát Audio hiện tại và gửi ACK failed/interrupted.
*   **Resume**: Khi Admin tắt Human Takeover, gửi `session.control (action=resume)`. AI Orchestrator bắt đầu xử lý lại các event mới.

## 10. Reconnect / Recovery

**Kịch bản Reconnect:**
1.  Device rớt mạng. Audio local có thể vẫn đang chạy.
2.  Device reconnect WebSocket, gửi `session.sync (device_to_cloud_sequence=15)`.
3.  Cloud Consumer đối chiếu sequence. Nếu Cloud đã gửi đến sequence 20:
    *   Cloud tự động gửi lại các commands từ 16 đến 20 (chức năng Message Recovery, yêu cầu Cloud phải có bộ đệm lưu recent messages).
    *   Nếu không có bộ đệm, Cloud coi như bỏ qua và phụ thuộc vào Device State Event.
4.  Device nhận lại các commands cũ. Dựa vào `command_id` để kiểm tra Deduplication (những command đã xử lý rồi thì bỏ qua).
5.  Device tiếp tục execution bình thường.

## 11. Celery Boundary

**Synchronous (Nằm trong Consumer/ASGI):**
*   WebSocket Authentication & Gating.
*   Validation Protocol Envelope.
*   Routing Event / ACK vào Message Bus.

**Asynchronous (Nằm trong Celery):**
*   AI Generation (RAG + LLM).
*   TTS Synthesis (Gọi API bên thứ 3 rất chậm, bắt buộc dùng Celery).
*   Audio File Upload (Ghi vào S3 / Local Storage).
*   Phát lệnh `speech.speak` (thông qua `channel_layer.group_send`).

## 12. Redis Boundary

*   **DB0 (Channels)**: Dành riêng cho Django Channels (group_send, Pub/Sub). Tuyệt đối không lưu dữ liệu.
*   **DB1 (Celery)**: Broker và Result Backend cho Celery.
*   **DB2 (LiveContext)**: Dùng để lưu trạng thái runtime của Session (Active Channel Name, Uptime, Orchestrator State). KHÔNG dùng làm Speech Queue hay Command Queue.

## 13. Failure / Recovery Matrix

| Scenario | Detection | Cloud Behavior | Device Behavior | ACK | Recovery |
| :--- | :--- | :--- | :--- | :--- | :--- |
| TTS Provider Timeout | Celery Task Fails | Ghi Log lỗi, thử Fallback Provider. Nếu fail hết, bỏ qua câu trả lời. | Không biết, không nhận được lệnh. | N/A | Bỏ qua hoặc báo lỗi lên UI Admin. |
| Audio URL Expired / 404 | Device HTTP GET 404 | N/A | Dừng xử lý lệnh. | Gửi `ACK (status=failed)` | Device tiếp tục lệnh tiếp theo trong queue. |
| Playback Failure | Device Audio API Lỗi | N/A | Dừng phát, xoá khỏi queue. | Gửi `ACK (status=failed)` | Device tiếp tục lệnh tiếp theo. |
| WebSocket Disconnect | Consumer `disconnect` | Xoá Active Connection. | Cố gắng Reconnect (Exponential Backoff) | Đợi sau khi reconnect. | Dùng `session.sync` để đồng bộ lại Sequence. |
| Stale/Duplicate Command | Device kiểm tra `command_id` | N/A | Drop lệnh (bỏ qua). | (Tuỳ chọn: Gửi lại ACK của lệnh đó) | Không gián đoạn luồng hiện hành. |

## 14. Security

*   **Audio Assets**: Phải dùng **Signed URLs** để truy cập (có expires_at). Tránh bị lấy cắp file audio.
*   **Tenant Isolation**: Live Session của Company nào chỉ được truy xuất Audio của Company đó.
*   **Token Leakage**: Device Token chỉ truyền qua Header (Authorization) hoặc Fallback URI, tuyệt đối không log ra file. (Đã enforce tại Phase 1C-B).

## 15. Observability

Để tracing thông suốt vòng đời của 1 hội thoại livestream:
*   Mọi Celery Task sinh Audio phải đính kèm `session_id`, `correlation_id` (trỏ về ID của tin nhắn Comment/Chat).
*   Lệnh `speech.speak` khi xuống Device phải giữ nguyên `command_id` (được sinh ra tại Cloud Orchestrator).
*   Khi nhận ACK, hệ thống ghi log: `ACK received cho command_id X: Trạng thái Y`.

## 16. Phase 1D Scope

Để xây dựng MVP nhanh chóng và thực tế:

**MUST HAVE:**
*   Live Orchestrator (Celery Task) nối LLM và TTS.
*   TTS Engine Adapter cơ bản (Ví dụ: ElevenLabs API).
*   Cloud Storage (S3 hoặc Local Nginx tĩnh) cho Audio Asset có Signed URL.
*   Device Client giả lập (Python script hoặc Node.js đơn giản) để nghe WebSocket, tải file và play âm thanh.

**FUTURE (Không làm trong Phase 1D):**
*   Avatar Animation (V-Tuber 3D/2D).
*   Lip Sync Engine.
*   OBS/FFmpeg Integration.
*   Tích hợp TikTok/Shopee (Vẫn dùng API giả lập).
*   Advanced Caching & TTS Provider Fallback.

## 17. Implementation Plan

Dựa vào codebase hiện tại, Phase 1D nên triển khai theo thứ tự sau:

1.  **Phase 1D-1: TTS & Audio Asset Layer**
    *   Tạo abstraction `services/tts.py`.
    *   Tạo storage lưu Audio.
2.  **Phase 1D-2: Live Orchestrator**
    *   Tạo Celery task nhận nội dung text, gọi TTS, sau đó đóng gói lệnh gọi `channel_layer.group_send("speech.speak")`.
3.  **Phase 1D-3: Device Execution Emulator**
    *   Tạo một Script Python độc lập đóng vai trò "Live Studio Client" để Connect WSS, Handle `session.sync`, và download/play audio.
4.  **Phase 1D-4: ACK Handlers**
    *   Sửa `consumers.py` để xử lý các `ACK` trả về từ Device, cập nhật trạng thái session (tuỳ chọn).

## 18. File Impact Analysis

*   **FILES TO REUSE / EXTEND:**
    *   `ai_agents/services.py` (LLM Generation).
    *   `live_sessions/consumers.py` (Nhận/Log ACK).
    *   `live_sessions/protocol/commands.py` (Giữ nguyên).
*   **FILES TO CREATE:**
    *   `live_sessions/tts.py` (Chứa TTS Provider Abstraction).
    *   `live_sessions/orchestrator.py` (Chứa logic ráp LLM $\rightarrow$ TTS $\rightarrow$ Channel Layer).
    *   `live_sessions/tasks.py` (Celery Tasks cho Orchestrator).
    *   Thư mục `device_client_mock/` (Client giả lập).
*   **FILES THAT MUST NOT BE TOUCHED:**
    *   `live_sessions/middleware.py` (Đã hoàn thiện Auth).
    *   `core/asgi.py`.

## 19. Risks

*   **KNOWN**: 
    *   **Latency**: Quá trình (LLM Gen $\rightarrow$ TTS $\rightarrow$ Audio Download) sẽ có độ trễ lớn. Cần streaming nếu độ trễ vượt 3s. Trong MVP, chấp nhận độ trễ file-based.
*   **INFERRED**:
    *   **Cost**: TTS (nhất là ElevenLabs) rất đắt. Cần có cơ chế Cache nội dung giống nhau trong tương lai.
*   **UNKNOWN**:
    *   **Device Playback Synchronization**: Liệu khi kết hợp với Livestream/OBS, âm thanh có bị lệch (desync) so với hình ảnh Avatar (nếu làm Avatar sau này)?

## 20. Open Architectural Decisions

Chưa có quyết định kiến trúc nào đang bị Block. Hệ thống sẵn sàng cho bước Implementation MVP. Mọi dependency (như TTS Provider) sẽ được chọn cứng (ví dụ OpenAI TTS hoặc ElevenLabs) cho mục đích MVP ở bước tiếp theo.

---
**PHASE 1D PRE-IMPLEMENTATION AUDIT COMPLETE**
