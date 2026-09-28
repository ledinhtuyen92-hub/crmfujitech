# Phase 1D-3A Pre-Implementation Audit
## Fujitech Live Studio - Execution Core
**STATUS: PHASE 1D-3A ARCHITECTURE LOCKED**

### 1. Executive Summary
Mục tiêu của Phase 1D-3A là xây dựng **Execution Core** cho hệ thống Live Studio chạy trên môi trường Windows Desktop. Khối Execution Core chịu trách nhiệm vòng đời phía Device: giữ kết nối WebSocket, xử lý commands (`speech.speak`, `session.control`), duy trì hàng đợi Audio (Speech Queue) và tương tác Audio Player, trả kết quả ACK. Không xử lý Business Logic, AI, RAG hay TTS.

### 2. Existing Device Protocol Audit
- **Protocol Envelope:** Mọi message đều bọc trong envelope chuẩn có `type`, `name`, `message_id`, `timestamp`, `sequence_number`, `session_id`, `payload`.
- **speech.speak:** Payload chứa `command_id`, `correlation_id`, `text`, `interruptible`, `priority` (high/normal), và `audio_asset`.
- **session.control:** (Đã verified code) Payload chứa `command_id` và `action` thuộc `['pause', 'resume', 'stop']`.
- **session.sync:** Payload bao gồm `cloud_to_device_sequence` và `device_to_cloud_sequence` cùng state `request`/`acknowledged`.
- **command.ack (type=ack):** Chứa `command_id` của lệnh được ACK, `status` (`received`, `completed`, `failed`, `interrupted`) và mã lỗi `error_code` nếu có.

### 3. Existing Mock Device Audit
- Tệp `backend/live_sessions/device_client_mock.py` cung cấp WS Loop và Audio Download block-synchronous.
- Execution Core sẽ loại bỏ cách tiếp cận chặn luồng (blocking) này, thay bằng Queue-based Async flow. Giữ lại cách lấy Token, URL extraction và parse cơ bản.

### 4. Execution Core Architecture
- **Websocket Client Layer:** Xử lý kết nối, auto-reconnect, parse protocol envelope.
- **Protocol Dispatcher:** Nhận Envelope, gọi Sequence Validator và Dedup Registry. Dispatch event.
- **Sequence Validator:** Chặn Sequence cũ/Duplicate, log Sequence Gap.
- **Dedup Registry:** LRU/TTL Cache lưu thông tin state các command đã xử lý.
- **Speech Queue Controller:** Hàng đợi có priority (high/normal).
- **Audio Worker:** Fetch HTTP audio file, ghi ra disk (temp), check HTTP code.
- **Audio Player:** Layer phát audio OS-level. (Sẽ dùng DummyAudioPlayer cho Test trước).
- **ACK Manager:** Trả state về Cloud.

### 5. Final Execution Core States
**Device Runtime States:**
- `DISCONNECTED`
- `CONNECTING`
- `SYNCING`
- `READY`
- `PAUSED`
- `ERROR`

**Speech Lifecycle States:**
- `QUEUED`
- `DOWNLOADING`
- `READY`
- `PLAYING`
- `COMPLETED`
- `FAILED`
- `INTERRUPTED`

### 6. Final Dedup Policy
Dedup Registry KHÔNG chỉ lưu `command_id -> seen`.
Cấu trúc lưu (Bounded LRU/TTL Cache): `command_id`, `status`, `sequence_number`, `updated_at`.
**Xử lý lặp (Duplicate `command_id`):**
- Đã `COMPLETED`: Không phát lại -> Bắn `ACK completed`.
- Đang `RECEIVED` / `QUEUED` / `DOWNLOADING` / `PLAYING`: Không phát lại -> Bắn ACK với status tương ứng hiện tại.
- Đã `FAILED`: Không tự phát lại -> Bắn `ACK failed` với mã lỗi cũ.
- Đã `INTERRUPTED`: Không tự phát lại -> Bắn `ACK interrupted`.
- Chưa tồn tại: Register -> Bắn `ACK received` -> Push to Queue.

### 7. Final Sequence Policy
Hướng check: **Cloud -> Device**.
- **Expected Sequence (N+1):** Chấp nhận, execute.
- **Old / Duplicate (<= N):** Drop payload, không execute.
- **Sequence Gap (> N+1):**
  - **Policy:** Ghi nhận "SEQUENCE_GAP_DETECTED" = Mất tin nhắn trên đường truyền. Không coi Gap là contiguous. 
  - **Action:** Chấp nhận command mới nhất theo MVP (không block). Cập nhật pointer lên cao nhất. Không tự phát minh Recovery buffer trong phase này.

### 8. Final session.control Policy
Dựa trên code thực tế đã có trong backend protocol:
- **`session.control pause`**:
  - Device chuyển internal state -> `PAUSED`.
  - Dừng current speech đang `PLAYING` -> Bắn `ACK interrupted`.
  - Flush (dọn sạch) queue (`QUEUED`, `DOWNLOADING`, `READY`).
  - Bắn `ACK failed` kèm code `CANCELLED_BY_HUMAN` cho các lệnh bị flush.
  - Từ chối enqueue speech mới chừng nào còn `PAUSED`.
- **`session.control resume`**:
  - Device chuyển internal state -> `READY`.
  - Có thể nhận speech mới.
- **`session.control stop`**:
  - Dọn sạch toàn bộ, stop player, chuyển state `DISCONNECTED` hoặc `READY` chờ terminate (tuỳ policy session lifecycle).

### 9. Audio Player Decision
**Phân tích thư viện cho Windows (Python 3.11+):**
- *Option A: `pygame` (pygame.mixer)*
  - Ưu: Cài đặt dễ qua PIP (chứa sẵn prebuilt binaries/DLLs), hỗ trợ MP3 không cần tải ffmpeg, không bắt người dùng cài compiler, event-based dễ trigger callback khi phát xong.
  - Nhược: Overhead nguyên bộ lib game 2D (nhưng thực ra module mixer rất gọn nhẹ).
- *Option B: `pyaudio`*
  - Ưu: Low latency.
  - Nhược: Cực kì khó cài trên Windows nếu thiếu C++ Build Tools. Phải tự decode MP3 (thường phải kèm `pydub` và `ffmpeg.exe`), dependency cồng kềnh cho end-user.
- *Option C: `vlc-python`*
  - Ưu: Đọc mọi format.
  - Nhược: Đòi hỏi end-user phải install sẵn phần mềm VLC Player vào Windows System.

**Recommendation (FINAL DECISION):**
- Chọn **Option A (`pygame`)**. 
- Thư viện này độc lập, tương thích tuyệt đối môi trường Windows Desktop ảo không có sẵn Compiler, xử lý native MP3 (được Cloud trả về).
- Tuy nhiên trong Phase 1D-3A implementation, 100% tests chạy trên **DummyAudioPlayer**.

### 10. File Architecture (Locked)
```text
live_studio/
├── core/
│   ├── config.py
│   ├── ws_client.py       # Async websocket connection, auto-reconnect
│   ├── dispatcher.py      # Route messages, Dedup, Sequence validation
│   └── state.py           # Device runtime state
├── execution/
│   ├── queue_manager.py   # State machine, Priority & FIFO Queue
│   ├── audio_fetcher.py   # Thread pool/async fetcher for HTTP audio
│   └── audio_player.py    # DummyAudioPlayer & PyGameAudioPlayer
├── protocol/
│   ├── envelopes.py       # Pydantic schemas shared compatibility with Cloud
│   └── constants.py       # Error codes, Enums
├── main.py                # Entrypoint
└── tests/                 # Mocks & Test Matrix
```

### 11. Test Matrix Requirement
Tests chạy độc lập hoàn toàn (không soundcard, không call API thật):
- A. Envelope parsing
- B. speech.speak validation
- C. session.sync
- D. sequence normal
- E. sequence old
- F. sequence gap
- G. dedup received
- H. dedup completed
- I. dedup failed
- J. queue FIFO
- K. priority high
- L. interruptible
- M. ACK received
- N. ACK completed
- O. ACK failed
- P. ACK interrupted
- Q. audio download success
- R. audio download failure
- S. expired signed URL
- T. reconnect
- U. session.control pause
- V. command timeout

### 12. Security & Limits
- Token lưu config local, không expose vào log.
- Signed URL log ẩn danh 1 phần signature.
- Không giữ file audio vô thời hạn -> Player play xong (hoặc lỗi) phải xóa `temp_file.mp3`.

### 13. Definition of Done (Phase 1D-3A Audit)
- Đã khóa 3 điểm Architecture: Dedup State, Sequence Gap, Session.Control.
- Chốt kĩ thuật Backend Audio Player (Pygame + Dummy Player).
- Khóa cấu trúc File và Test Matrix.
- Tài liệu sẵn sàng cho Implementation (Phase 1D-3B).

**PHASE 1D-3A ARCHITECTURE LOCKED**
