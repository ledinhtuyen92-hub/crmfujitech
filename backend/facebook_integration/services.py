"""
facebook_integration/services.py
Business logic layer cho module Facebook Multi-Page Inbox.
Tái sử dụng thuật toán smart_extract_vn_phone từ zalo_integration.
"""

import logging
import re
import json

import requests
from django.db import transaction
from django.utils import timezone

logger = logging.getLogger(__name__)

FB_GRAPH_API_BASE = "https://graph.facebook.com/v25.0"


# ── Facebook Handover Protocol ───────────────────────────────────────────────

def take_thread_control(page_access_token: str, recipient_psid: str, metadata: str = "") -> bool:
    """
    Lấy lại quyền kiểm soát thread từ ứng dụng khác (Meta AI Business, chatbot v.v.).
    Chỉ hoạt động khi app là Primary Receiver trong Handover Protocol.
    Trả về True nếu thành công, False nếu thất bại.
    """
    url = f"{FB_GRAPH_API_BASE}/me/take_thread_control"
    payload = {
        "recipient": {"id": recipient_psid},
        "metadata": metadata or "CRM agent taking control",
    }
    params = {"access_token": page_access_token}
    try:
        resp = requests.post(url, params=params, json=payload, timeout=10)
        data = resp.json()
        if "error" in data:
            logger.warning(f"[Facebook] take_thread_control lỗi: {data['error']}")
            return False
        logger.info(f"[Facebook] take_thread_control thành công cho PSID {recipient_psid}")
        return True
    except Exception as e:
        logger.error(f"[Facebook] Exception khi take_thread_control: {e}")
        return False


def pass_thread_control_to_inbox(page_access_token: str, recipient_psid: str) -> bool:
    """
    Chuyển quyền kiểm soát thread về Page Inbox (app_id=263902037430900).
    Hoạt động ngay cả khi app không phải Primary Receiver.
    Đây là fallback khi take_thread_control thất bại.
    Trả về True nếu thành công, False nếu thất bại.
    """
    # App ID cố định của Facebook Page Inbox (secondary receiver mặc định)
    PAGE_INBOX_APP_ID = "263902037430900"
    url = f"{FB_GRAPH_API_BASE}/me/pass_thread_control"
    payload = {
        "recipient": {"id": recipient_psid},
        "target_app_id": PAGE_INBOX_APP_ID,
        "metadata": "Returning control to Page Inbox",
    }
    params = {"access_token": page_access_token}
    try:
        resp = requests.post(url, params=params, json=payload, timeout=10)
        data = resp.json()
        if "error" in data:
            logger.warning(f"[Facebook] pass_thread_control_to_inbox lỗi: {data['error']}")
            return False
        logger.info(f"[Facebook] pass_thread_control_to_inbox thành công cho PSID {recipient_psid}")
        return True
    except Exception as e:
        logger.error(f"[Facebook] Exception khi pass_thread_control_to_inbox: {e}")
        return False


def send_via_conversation_api(
    page_access_token: str,
    page_id: str,
    recipient_psid: str,
    message_text: str,
) -> dict:
    """
    Gửi tin nhắn qua Conversations API thay vì Send API.
    Endpoint này dùng quyền của Page Admin để gửi trực tiếp vào conversation,
    có thể bỏ qua thread control khi app có đủ quyền hạn trên Page.
    Đây là tiers 3 - fallback cuối cùng khi cả take và pass đều thất bại.
    """
    if not page_id:
        return {"success": False, "error": "Thiếu page_id cho Conversations API."}

    # Bước 1: Tìm conversation_id
    conv_url = f"{FB_GRAPH_API_BASE}/{page_id}/conversations"
    conv_params = {
        "user_id": recipient_psid,
        "fields": "id",
        "access_token": page_access_token,
        "limit": 1,
    }
    conv_id = None
    try:
        r = requests.get(conv_url, params=conv_params, timeout=10)
        data = r.json()
        convs = data.get("data", [])
        if convs:
            conv_id = convs[0].get("id")
    except Exception as e:
        logger.error(f"[Facebook] send_via_conversation_api: lỗi tìm conv_id: {e}")
        return {"success": False, "error": f"Không tìm được hội thoại: {e}"}

    if not conv_id:
        return {"success": False, "error": "Không tìm thấy hội thoại trên Facebook."}

    # Bước 2: Gửi tin nhắn qua /{conv_id}/messages
    msg_url = f"{FB_GRAPH_API_BASE}/{conv_id}/messages"
    msg_params = {"access_token": page_access_token}
    msg_payload = {"message": message_text}
    try:
        r2 = requests.post(msg_url, params=msg_params, json=msg_payload, timeout=10)
        resp_data = r2.json()
        if "error" in resp_data:
            err = resp_data["error"]
            logger.error(f"[Facebook] send_via_conversation_api lỗi: {err}")
            return {"success": False, "error": err.get("message", "Lỗi gửi qua Conversations API")}
        msg_id = resp_data.get("id") or resp_data.get("message_id")
        logger.info(f"[Facebook] send_via_conversation_api thành công: {msg_id}")
        return {"success": True, "message_id": msg_id}
    except Exception as e:
        logger.error(f"[Facebook] Exception khi send_via_conversation_api: {e}")
        return {"success": False, "error": str(e)}


# ── Tái sử dụng thuật toán quét SĐT thông minh ───────────────────────────────

def normalize_phone(phone: str) -> str:
    phone = phone.strip().replace(" ", "").replace("-", "").replace(".", "")
    if phone.startswith("+84"):
        phone = "0" + phone[3:]
    elif phone.startswith("84") and len(phone) == 11:
        phone = "0" + phone[2:]
    return phone


def smart_extract_vn_phone(text: str):
    """
    Thuật toán phát hiện và chuẩn hoá SĐT Việt Nam thông minh.
    Tái sử dụng từ zalo_integration.services.
    """
    if not text:
        return None

    pattern_explicit = re.compile(
        r'(?:(?:\+|00)?84[\s\.\-]?|0)[\s\.\-]?([35789](?:[\s\.\-]?\d){8})\b'
    )
    for m in pattern_explicit.finditer(text):
        digits = re.sub(r'\D', '', m.group(1))
        if len(digits) == 9:
            tail_idx = m.end()
            tail_str = text[tail_idx:tail_idx+15].lower()
            if not any(curr in tail_str for curr in ['đ', 'vnd', 'k', 'tr', 'triệu', 'ty', 'tỷ']):
                return '0' + digits

    pattern_implicit = re.compile(r'\b([35789](?:[\s\.\-]?\d){8})\b')
    phone_keywords = ['sdt', 'sđt', 'so', 'số', 'phone', 'zalo', 'fb', 'facebook', 'lh', 'liên hệ', 'gọi', 'alo']
    text_lower = text.lower()
    has_keyword = any(kw in text_lower for kw in phone_keywords)

    for m in pattern_implicit.finditer(text):
        raw = m.group(1)
        digits = re.sub(r'\D', '', raw)
        if len(digits) == 9:
            has_separator = any(sep in raw for sep in [' ', '.', '-'])
            tail_idx = m.end()
            tail_str = text[tail_idx:tail_idx+15].lower()
            is_currency = any(curr in tail_str for curr in ['đ', 'vnd', 'k', 'tr', 'triệu', 'ty', 'tỷ', '000'])
            if not is_currency and (has_keyword or has_separator):
                return '0' + digits

    return None


def smart_extract_email(text: str):
    """
    Phát hiện và chuẩn hoá địa chỉ email trong tin nhắn.
    """
    if not text:
        return None
    email_pattern = re.compile(r'\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Z|a-z]{2,7}\b')
    match = email_pattern.search(text)
    if match:
        email = match.group(0).lower().strip()
        if not any(e in email for e in ['@example.', 'noreply@', 'test@']):
            return email
    return None


def smart_extract_address(text: str):
    """
    Nhận diện và trích xuất TRUNG THỰC đoạn địa chỉ giao hàng/nhà riêng trong tin nhắn.
    Cắt bỏ các câu hội thoại giao tiếp không liên quan (chào hỏi, hỏi giá, hỏi địa chỉ shop...).
    """
    if not text:
        return None

    # Loại bỏ các câu hỏi/thoại chung chung về địa chỉ
    ignore_patterns = [
        r'địa\s*chỉ\s*(?:email|shop|bên\s*mình|ở\s*đâu|cty|công\s*ty|nào|để|của|chi\s*tiết|\?)',
        r'(?:xin|hỏi|cho|tìm|qua|biết|gửi|lấy)\s*(?:xin\s*)?địa\s*chỉ',
        r'catalogue.*email|email.*catalogue'
    ]
    
    # 1. Tách văn bản thành các dòng (theo \n)
    raw_lines = [line.strip() for line in text.split('\n') if line.strip()]
    
    # Bộ từ khóa chỉ đơn vị hành chính/địa điểm VN rõ ràng
    admin_keywords = [
        'số nhà', 'ngõ ', 'ngách ', 'hẻm ', 'đường ', 'phố ',
        'phường', 'p.', 'quận', 'q.', 'huyện', 'h.', 'xã ', 'tỉnh ',
        'thành phố', 'tp.', 'tx.', 'tt.', 'kđt', 'khu đô thị',
        'chung cư', 'toà ', 'tòa ', 'sảnh ', 'bld ', 'block ',
        'hà nội', 'tphcm', 'tp hcm', 'hồ chí minh', 'sài gòn',
        'đà nẵng', 'cần thơ', 'hải phòng', 'bình dương', 'đồng nai',
        'thôn ', 'xóm ', 'ấp '
    ]
    
    prefix_regex = re.compile(r'^(?:.*?\b(?:địa\s*chỉ|đ\/c|d\/c|đc|dc|ship\s*(?:đến|tới|về)?|giao\s*(?:đến|tới|về)?|ở\s*(?:tại)?|nhà\s*số|add|address)\s*[:\-\.]?\s*)', re.IGNORECASE)

    extracted_segments = []

    for line in raw_lines:
        line_low = line.lower()
        if any(re.search(pat, line_low) for pat in ignore_patterns):
            continue

        # Tách dòng dài thành các câu nhỏ hơn nếu có dấu chấm, chấm phẩy hoặc nhiều khoảng trắng
        sub_sentences = [s.strip() for s in re.split(r'[\.\!\?]\s+|\s{2,}', line) if s.strip()]
        
        for sent in sub_sentences:
            sent_low = sent.lower()
            if any(re.search(pat, sent_low) for pat in ignore_patterns):
                continue
            
            # Kiểm tra xem câu có tiền tố địa chỉ rõ ràng không (VD: "Đc: Số 12 Lê Lợi...")
            has_prefix = bool(re.search(r'\b(?:địa\s*chỉ|đ\/c|d\/c|đc|dc|ship\s*(?:đến|tới|về)?|giao\s*(?:đến|tới|về)?|nhà\s*số)\s*[:\-\.]', sent_low))
            
            if has_prefix:
                clean_addr = prefix_regex.sub('', sent).strip()
                # Loại bỏ SĐT nếu dính trong câu địa chỉ
                clean_addr = re.sub(r'\b(?:0|\+84)[35789]\d{8}\b', '', clean_addr).strip(' .,:-')
                if len(clean_addr) >= 6 and any(c.isalpha() for c in clean_addr):
                    extracted_segments.append(clean_addr)
            else:
                matching_kws = [kw for kw in admin_keywords if kw in sent_low]
                # Từ khóa mạnh (thêm thành phố lớn, ngõ, ngách, đường, thôn...)
                strong_kws = [
                    'số nhà', 'chung cư', 'khu đô thị', 'kđt', 'phường', 'quận', 'huyện',
                    'thành phố', 'tp.', 'tỉnh', 'hà nội', 'tphcm', 'tp hcm', 'hồ chí minh',
                    'sài gòn', 'đà nẵng', 'cần thơ', 'hải phòng', 'hn', 'hcm',
                    'thôn ', 'xóm ', 'ấp ', 'ngõ ', 'ngách ', 'hẻm ', 'đường ', 'phố '
                ]
                has_strong = any(skw in sent_low for skw in strong_kws)
                
                # Kiểm tra cấu trúc số nhà đứng đầu (VD: "220 định công, hà nội")
                starts_with_house_number = bool(re.match(r'^\d{1,4}(?:[\/-]\d{1,4})*\s+[A-Za-zĐđÂâĂăÊêÔôƠơƯưÁáÀàẠạẢảÃã]', sent.strip()))
                has_comma_or_admin = (',' in sent) or (len(matching_kws) >= 1)
                
                if len(matching_kws) >= 2 or (has_strong and len(matching_kws) >= 1 and len(sent) >= 8) or (starts_with_house_number and has_comma_or_admin and len(sent) >= 8):
                    clean_addr = re.sub(r'\b(?:0|\+84)[35789]\d{8}\b', '', sent).strip(' .,:-')
                    if len(clean_addr) >= 6 and any(c.isalpha() for c in clean_addr):
                        CHAT_EXCLUSIONS = [
                            'ko ak', 'được ko', 'khi nào', 'hay sao vậy', 'muốn mua', 'hết hàng',
                            'giá bao nhiêu', 'bán cho', 'lít mật ong', 'kg ', 'gram ',
                            # Câu vận chuyển / hỏi ship
                            'ship đi', 'ship tới', 'giao đi', 'giao tới', 'giao tỉnh', 'ship tỉnh',
                            'bao nhiêu tiền', 'giá bộ', 'giá sản phẩm', 'giá sp',
                            'có giao không', 'có ship không', 'freeship', 'free ship',
                            'bao tiền', 'giá bao', 'tư vấn', 'hỏi thăm', 'cần tư vấn',
                            # Câu cảm ơn / hội thoại xã giao (AI/page hay gửi, match nhầm 'ấp ')
                            'cảm ơn', 'xin chào', 'chào anh', 'chào chị', 'chào bạn',
                            'đã cung cấp', 'đã nhận', 'đã tiếp nhận', 'đã ghi nhận',
                            'sẽ liên hệ', 'sẽ tư vấn', 'sẽ hỗ trợ',
                            'chuyển cho bộ phận', 'bộ phận kinh doanh', 'nhân viên',
                            'vui lòng', 'anh ơi', 'chị ơi', 'bạn ơi',
                            'thông tin', 'nhanh nhất',
                        ]
                        if not any(w in sent_low for w in CHAT_EXCLUSIONS):
                            extracted_segments.append(clean_addr)

    if extracted_segments:
        unique_segments = []
        for seg in extracted_segments:
            if not any(seg.lower() in u.lower() for u in unique_segments):
                unique_segments.append(seg)
        result = ". ".join(unique_segments)
        return result[:300] if len(result) >= 6 else None
    return None


# ── Gửi tin nhắn qua Facebook Graph API ──────────────────────────────────────

def send_facebook_message(
    page_access_token: str,
    recipient_psid: str,
    message_text: str = "",
    attachment_url: str = None,
    file_obj = None,
    attachment_type: str = "image",
    quick_replies: list = None,
    page_id: str = None,
) -> dict:
    """
    Gửi tin nhắn văn bản (hoặc ảnh/file đính kèm, quick replies) từ Trang Facebook tới khách hàng.
    Hỗ trợ gửi trực tiếp file binary qua multipart/form-data.
    Có 3 tầng fallback khi gặp lỗi #10 (Meta AI đang kiểm soát thread):
      Tier 1: take_thread_control (cần là Primary Receiver)
      Tier 2: pass_thread_control_to_inbox (chuyển quyền về Page Inbox)
      Tier 3: send_via_conversation_api (gửi qua Conversations API - cần page_id)
    """
    if not page_access_token or not recipient_psid:
        return {"success": False, "error": "Thiếu token hoặc recipient_id."}

    url = f"{FB_GRAPH_API_BASE}/me/messages"
    params = {"access_token": page_access_token}
    
    # 0. Đánh dấu đã đọc trên Facebook (mark_seen)
    try:
        mark_seen_payload = {
            "recipient": {"id": recipient_psid},
            "sender_action": "mark_seen"
        }
        requests.post(url, params=params, json=mark_seen_payload, timeout=5)
    except Exception as e:
        logger.warning(f"[Facebook] Không thể mark_seen: {e}")

    last_message_id = None

    # 1. Gửi đính kèm (nếu có file binary hoặc URL)
    if file_obj:
        data = {
            "recipient": json.dumps({"id": recipient_psid}),
            "message": json.dumps({
                "attachment": {
                    "type": attachment_type if attachment_type in ["image", "file", "audio", "video"] else "file",
                    "payload": {"is_reusable": True}
                }
            })
        }
        try:
            if hasattr(file_obj, "seek"):
                file_obj.seek(0)
            file_content = file_obj.read() if hasattr(file_obj, "read") else file_obj
            file_name = getattr(file_obj, "name", "attachment.png")
            content_type = getattr(file_obj, "content_type", "application/octet-stream")
            files = {"filedata": (file_name, file_content, content_type)}
            resp = requests.post(url, params=params, data=data, files=files, timeout=30)
            resp_data = resp.json()
            if "error" in resp_data:
                err = resp_data["error"]
                err_code = err.get("code")
                logger.error(f"[Facebook] Lỗi gửi file binary: {err}")
                if err_code == 10:
                    logger.info("[Facebook] Thread bị kiểm soát (lỗi #10) khi gửi file. Đang take_thread_control...")
                    if take_thread_control(page_access_token, recipient_psid):
                        # Seek lại file và retry
                        if hasattr(file_obj, "seek"):
                            file_obj.seek(0)
                        file_content2 = file_obj.read() if hasattr(file_obj, "read") else file_obj
                        files2 = {"filedata": (file_name, file_content2, content_type)}
                        resp2 = requests.post(url, params=params, data=data, files=files2, timeout=30)
                        resp_data2 = resp2.json()
                        if "error" in resp_data2:
                            return {"success": False, "error": resp_data2["error"].get("message", "Lỗi gửi file sau khi lấy lại quyền thread")}
                        last_message_id = resp_data2.get("message_id")
                    else:
                        return {"success": False, "error": "Hội thoại đang bị kiểm soát bởi Meta AI. Không thể gửi file."}
                else:
                    return {"success": False, "error": err.get("message", "Lỗi gửi file lên Meta")}
            else:
                last_message_id = resp_data.get("message_id")
        except Exception as e:
            logger.error(f"[Facebook] Exception khi gửi file binary: {e}")
            return {"success": False, "error": str(e)}

    elif attachment_url:
        payload = {
            "recipient": {"id": recipient_psid},
            "message": {
                "attachment": {
                    "type": attachment_type if attachment_type in ["image", "file", "audio", "video"] else "image",
                    "payload": {"url": attachment_url, "is_reusable": True}
                }
            }
        }
        try:
            resp = requests.post(url, params=params, json=payload, timeout=15)
            resp_data = resp.json()
            if "error" in resp_data:
                err = resp_data["error"]
                err_code = err.get("code")
                logger.error(f"[Facebook] Lỗi gửi attachment URL: {err}")
                if err_code == 10:
                    logger.info("[Facebook] Thread bị kiểm soát (lỗi #10) khi gửi attachment URL. Đang take_thread_control...")
                    if take_thread_control(page_access_token, recipient_psid):
                        resp2 = requests.post(url, params=params, json=payload, timeout=15)
                        resp_data2 = resp2.json()
                        if "error" in resp_data2:
                            return {"success": False, "error": resp_data2["error"].get("message", "Lỗi gửi attachment URL sau khi lấy lại quyền thread")}
                        last_message_id = resp_data2.get("message_id")
                    else:
                        return {"success": False, "error": "Hội thoại đang bị kiểm soát bởi Meta AI. Không thể gửi file đính kèm."}
                else:
                    return {"success": False, "error": err.get("message", "Lỗi gửi attachment URL")}
            else:
                last_message_id = resp_data.get("message_id")
        except Exception as e:
            logger.error(f"[Facebook] Exception khi gửi attachment URL: {e}")
            return {"success": False, "error": str(e)}

    # 2. Gửi tin nhắn text (nếu có text hoặc quick_replies)
    if (message_text and message_text.strip()) or quick_replies:
        payload = {
            "recipient": {"id": recipient_psid},
            "message": {"text": (message_text or "").strip() or "Xin chào"}
        }
        if quick_replies:
            payload["message"]["quick_replies"] = quick_replies

        try:
            resp = requests.post(url, params=params, json=payload, timeout=10)
            resp_data = resp.json()
            if "error" in resp_data:
                err = resp_data["error"]
                err_code = err.get("code")
                logger.error(f"[Facebook] Lỗi gửi text/quick_replies: {err}")
                # Lỗi #10: Thread đang bị kiểm soát bởi ứng dụng khác (Meta AI Business v.v.)
                # → Tự động lấy lại quyền kiểm soát và gửi lại
                if err_code == 10:
                    logger.info(f"[Facebook] Thread bị kiểm soát bởi ứng dụng khác (lỗi #10). Thử 3 tầng fallback...")

                    # ── Tier 1: take_thread_control (cần là Primary Receiver) ──
                    if take_thread_control(page_access_token, recipient_psid):
                        try:
                            resp2 = requests.post(url, params=params, json=payload, timeout=10)
                            resp_data2 = resp2.json()
                            if "error" in resp_data2:
                                logger.error(f"[Facebook] Vẫn lỗi sau take_thread_control: {resp_data2['error']}")
                                if not last_message_id:
                                    return {"success": False, "error": resp_data2["error"].get("message", "Lỗi gửi sau khi lấy lại quyền thread")}
                            else:
                                last_message_id = resp_data2.get("message_id") or last_message_id
                        except Exception as e2:
                            if not last_message_id:
                                return {"success": False, "error": str(e2)}

                    # ── Tier 2: pass_thread_control_to_inbox ──────────────────
                    elif pass_thread_control_to_inbox(page_access_token, recipient_psid):
                        logger.info("[Facebook] pass_thread_control_to_inbox OK, đang gửi lại...")
                        try:
                            resp2 = requests.post(url, params=params, json=payload, timeout=10)
                            resp_data2 = resp2.json()
                            if "error" in resp_data2:
                                logger.error(f"[Facebook] Vẫn lỗi sau pass_thread_control: {resp_data2['error']}")
                                if not last_message_id:
                                    # Tier 3: Conversations API
                                    if page_id and message_text:
                                        logger.info("[Facebook] Thử Tier 3: Conversations API...")
                                        r3 = send_via_conversation_api(page_access_token, page_id, recipient_psid, message_text)
                                        if r3.get("success"):
                                            last_message_id = r3.get("message_id")
                                        else:
                                            return {"success": False, "error": r3.get("error", "Lỗi gửi tin nhắn sau mọi fallback")}
                                    else:
                                        return {"success": False, "error": resp_data2["error"].get("message", "Lỗi gửi sau pass thread control")}
                            else:
                                last_message_id = resp_data2.get("message_id") or last_message_id
                        except Exception as e2:
                            if not last_message_id:
                                return {"success": False, "error": str(e2)}

                    # ── Tier 3: Conversations API (fallback cuối) ────────────
                    elif page_id and message_text:
                        logger.info("[Facebook] Tier 1 và Tier 2 thất bại, thử Tier 3: Conversations API...")
                        r3 = send_via_conversation_api(page_access_token, page_id, recipient_psid, message_text)
                        if r3.get("success"):
                            last_message_id = r3.get("message_id")
                        else:
                            if not last_message_id:
                                return {
                                    "success": False,
                                    "error": "Hội thoại này đang bị Meta AI kiểm soát. Đã thử 3 phương pháp nhưng không thành công. Vui lòng vào Meta Business Suite, tắt AI cho hội thoại này rồi thử lại.",
                                }

                    # — Không có page_id — Không thể dùng Tier 3 ─────────
                    else:
                        if not last_message_id:
                            return {
                                "success": False,
                                "error": "Hội thoại này đang được kiểm soát bởi Meta AI hoặc ứng dụng khác. Không thể lấy lại quyền gửi tin nhắn. Vui lòng tắt ứng dụng đó trên Meta Business Suite và thử lại.",
                            }
                else:
                    if not last_message_id:
                        return {"success": False, "error": err.get("message", "Lỗi gửi tin nhắn")}
            else:
                last_message_id = resp_data.get("message_id") or last_message_id
        except Exception as e:
            logger.error(f"[Facebook] Exception khi gửi text/quick_replies: {e}")
            if not last_message_id:
                return {"success": False, "error": str(e)}

    if not last_message_id:
        return {"success": False, "error": "Không có nội dung hoặc đính kèm nào được gửi đi."}

    return {"success": True, "message_id": last_message_id}


# ── Lấy thông tin Profile Facebook User ──────────────────────────────────────

def get_fb_user_profile(page_access_token: str, psid: str) -> dict:
    """
    Lấy tên và avatar của người dùng Facebook từ PSID.
    Thử lại 1 lần nếu không lấy được tên (Facebook API đôi khi không trả).
    """
    url = f"{FB_GRAPH_API_BASE}/{psid}"
    params = {
        "fields": "name,profile_pic",
        "access_token": page_access_token
    }
    max_retries = 2
    for attempt in range(max_retries):
        try:
            resp = requests.get(url, params=params, timeout=8)
            data = resp.json()
            if "error" not in data:
                name = data.get("name", "")
                avatar = data.get("profile_pic", "")
                if name or attempt == max_retries - 1:
                    return {"name": name, "avatar": avatar}
                # Tên rỗng, thử lại sau 1 giây
                import time
                time.sleep(1)
                continue
            else:
                logger.error(f"[Facebook] Graph API Error getting profile for {psid}: {data.get('error')}")
                break
        except Exception as e:
            logger.error(f"[Facebook] Error getting user profile for {psid} (attempt {attempt+1}): {e}")
            if attempt < max_retries - 1:
                import time
                time.sleep(1)
    return {"name": "", "avatar": ""}


# ── Facebook OAuth Flow ───────────────────────────────────────────────────────

def exchange_oauth_code_for_token(app_id: str, app_secret: str, code: str, redirect_uri: str) -> dict:
    """
    Đổi Authorization Code → User Access Token (thường là long-lived nếu app là web app).
    """
    url = f"{FB_GRAPH_API_BASE}/oauth/access_token"
    params = {
        "client_id": app_id,
        "client_secret": app_secret,
        "redirect_uri": redirect_uri,
        "code": code,
    }
    try:
        resp = requests.get(url, params=params, timeout=10)
        data = resp.json()
        if "error" in data:
            logger.error(f"[Facebook OAuth] exchange short token error: {data['error']}")
            return {"success": False, "error": data["error"].get("message", "Token exchange failed.")}
        return {
            "success": True,
            "access_token": data.get("access_token"),
            "token_type": data.get("token_type"),
            "expires_in": data.get("expires_in"),  # seconds
        }
    except Exception as e:
        logger.error(f"[Facebook OAuth] exchange token exception: {e}")
        return {"success": False, "error": str(e)}


def get_managed_pages(long_lived_user_token: str) -> list:
    """
    Lấy danh sách các Trang Facebook mà user này quản lý (admin/editor).
    Trả về list các dict: {id, name, access_token, category, fan_count}
    Page Access Token lấy từ đây là LONG-LIVED và KHÔNG BAO GIỜ HẾT HẠN.
    """
    url = f"{FB_GRAPH_API_BASE}/me/accounts"
    params = {
        "access_token": long_lived_user_token,
        "fields": "id,name,access_token,category,fan_count,picture",
    }
    try:
        resp = requests.get(url, params=params, timeout=10)
        data = resp.json()
        if "error" in data:
            logger.error(f"[Facebook OAuth] get_managed_pages error: {data['error']}")
            return []
        return data.get("data", [])
    except Exception as e:
        logger.error(f"[Facebook OAuth] get_managed_pages exception: {e}")
        return []


def debug_facebook_token(app_id: str, app_secret: str, input_token: str) -> dict:
    """
    Dùng Graph API /debug_token để kiểm tra thông tin token:
    - is_valid: Token có còn hợp lệ không
    - expires_at: Unix timestamp hết hạn (0 = không hết hạn)
    - type: PAGE, USER, APP...
    - scopes: danh sách quyền được cấp
    """
    url = f"{FB_GRAPH_API_BASE}/debug_token"
    access_token = f"{app_id}|{app_secret}"  # App Token
    params = {
        "input_token": input_token,
        "access_token": access_token,
    }
    try:
        resp = requests.get(url, params=params, timeout=10)
        data = resp.json()
        if "error" in data:
            logger.error(f"[Facebook] debug_token error: {data['error']}")
            return {"success": False, "error": data["error"].get("message", "Lỗi kết nối Meta API.")}
        token_data = data.get("data", {})
        return {
            "success": True,
            "is_valid": token_data.get("is_valid", False),
            "expires_at": token_data.get("expires_at", 0),  # Unix timestamp; 0 = never
            "type": token_data.get("type", ""),
            "app_id": token_data.get("app_id", ""),
            "scopes": token_data.get("scopes", []),
        }
    except Exception as e:
        logger.error(f"[Facebook] debug_token exception: {e}")
        return {"success": False, "error": str(e)}


def subscribe_app_to_page(page_id: str, page_access_token: str) -> dict:
    """
    Đăng ký (Subscribe) App hiện tại vào Page để nhận Webhook.
    Phải có bước này thì Meta mới bắt đầu bắn tin nhắn của Page này về Webhook của App.
    """
    url = f"{FB_GRAPH_API_BASE}/{page_id}/subscribed_apps"
    params = {
        "access_token": page_access_token,
        "subscribed_fields": "messages,messaging_postbacks,message_echoes",
    }
    try:
        resp = requests.post(url, params=params, timeout=10)
        data = resp.json()
        if "error" in data:
            logger.error(f"[Facebook] subscribe_app_to_page error for page {page_id}: {data['error']}")
            return {"success": False, "error": data["error"].get("message", "Lỗi khi đăng ký Webhook với Meta.")}
        return {"success": data.get("success", False)}
    except Exception as e:
        logger.error(f"[Facebook] subscribe_app_to_page exception: {e}")
        return {"success": False, "error": str(e)}


# ── Xử lý Webhook Message từ Meta ────────────────────────────────────────────

import hmac
import hashlib

def verify_facebook_webhook_signature(request_body: bytes, received_signature: str, app_secret: str) -> bool:
    """
    Xác thực chữ ký từ Meta Webhook.
    Meta gửi header X-Hub-Signature-256 dưới dạng 'sha256=mac'
    """
    if not received_signature or not app_secret:
        return False
    
    try:
        expected_mac = hmac.new(app_secret.encode('utf-8'), request_body, hashlib.sha256).hexdigest()
        expected_signature = f"sha256={expected_mac}"
        return hmac.compare_digest(expected_signature, received_signature)
    except Exception as e:
        import logging
        logging.getLogger(__name__).error(f"Error verifying FB signature: {e}")
        return False

def process_fb_webhook_message(entry: dict):
    """
    Xử lý một entry từ Webhook payload của Facebook Messenger.
    Tạo/cập nhật FacebookLead và FacebookMessage, quét SĐT nếu có.
    """
    from facebook_integration.models import FacebookPageConfig, FacebookLead, FacebookMessage

    page_id = entry.get("id")
    messaging_list = entry.get("messaging", [])

    page_config = FacebookPageConfig.objects.filter(page_id=page_id, is_active=True).first()
    if not page_config:
        logger.warning(f"[Facebook] Không tìm thấy config cho page_id={page_id}")
        return

    company = page_config.company
    active_modules = company.settings.active_modules if hasattr(company, "settings") else []
    if not active_modules or "facebook" not in active_modules:
        logger.warning(f"[Facebook] Module facebook bị tắt/thu hồi cho công ty {company.id}")
        return

    for messaging in messaging_list:
        sender_psid = messaging.get("sender", {}).get("id")
        recipient_psid = messaging.get("recipient", {}).get("id")
        message_data = messaging.get("message")
        postback_data = messaging.get("postback")
        
        if not sender_psid or (not message_data and not postback_data):
            continue

        is_echo = message_data.get("is_echo", False) if message_data else False
        
        if is_echo or str(sender_psid) == str(page_id):
            # Nếu là echo (Trang gửi tin nhắn qua Meta Business Suite)
            customer_psid = recipient_psid
            sender_type = "page"
        else:
            # Khách hàng gửi tin nhắn cho Trang
            customer_psid = sender_psid
            sender_type = "customer"

        if not customer_psid or str(customer_psid) == str(page_id):
            continue

        msg_id = ""
        msg_text = ""
        
        if message_data:
            msg_id = message_data.get("mid", "")
            msg_text = message_data.get("text", "")
            # Xử lý nút Like / Sticker của Facebook để AI có thể hiểu dưới dạng text
            if message_data.get("sticker_id") and not msg_text:
                msg_text = "[Khách gửi icon / thả Like 👍]"
        elif postback_data:
            msg_id = f"pb_{messaging.get('timestamp', '')}"
            payload = postback_data.get("payload", "")
            title = postback_data.get("title", "")
            
            if payload.startswith("CARE_DOC-"):
                doc_id = payload.replace("CARE_DOC-", "")
                try:
                    from ai_agents.models import AiKnowledgeDocument
                    doc = AiKnowledgeDocument.objects.get(id=doc_id)
                    msg_text = f"Tôi muốn nhận tư vấn cho mẫu: {doc.title}"
                except:
                    msg_text = f"Tôi muốn nhận tư vấn cho mẫu này"
            elif payload.startswith("CARE_"):
                sku = payload.replace("CARE_", "")
                msg_text = f"Tôi muốn nhận tư vấn cho mã sản phẩm: {sku}"
            else:
                msg_text = title

        # Lấy thông tin profile khách
        profile = get_fb_user_profile(page_config.page_access_token, customer_psid)

        # Tạo hoặc cập nhật FacebookLead
        lead, created = FacebookLead.objects.get_or_create(
            page_config=page_config,
            fb_user_id=customer_psid,
            defaults={
                "company": page_config.company,
                "fb_user_name": profile.get("name", "") or f"FB {customer_psid[-6:]}",
                "fb_user_avatar": profile.get("avatar", ""),
                "assigned_to": page_config.assigned_to,
            }
        )
        if not created:
            if profile.get("name") and (not lead.fb_user_name or lead.fb_user_name.startswith("FB ")):
                lead.fb_user_name = profile["name"]
            if profile.get("avatar") and not lead.fb_user_avatar:
                lead.fb_user_avatar = profile["avatar"]

        # ── Tự động kế thừa assigned_to từ Customer đã có ──────────────────
        # Nếu lead vừa tạo mới (hoặc chưa được phân công), tìm customer đã liên kết
        # với fb_user_id này (qua các lead khác) để kế thừa người phụ trách.
        if not lead.assigned_to:
            try:
                from crm.models import Customer
                # Tìm customer qua các lead cũ có cùng fb_user_id (có thể từ page khác)
                existing_lead_with_customer = FacebookLead.objects.filter(
                    company=page_config.company,
                    fb_user_id=customer_psid,
                    customer__isnull=False,
                    customer__assigned_to__isnull=False,
                ).exclude(id=lead.id).select_related('customer').first()
                if existing_lead_with_customer:
                    assigned = existing_lead_with_customer.customer.assigned_to
                    lead.assigned_to = assigned
                    lead.customer = existing_lead_with_customer.customer
                    lead.is_customer_converted = True
                    lead.save(update_fields=["assigned_to", "customer", "is_customer_converted"])
                    logger.info(f"[FB Webhook] Inherited assigned_to={assigned} for new lead from existing customer")
            except Exception as e:
                logger.error(f"[FB Webhook] Failed to inherit assigned_to: {e}")
        # ────────────────────────────────────────────────────────────────────

        # Cập nhật trạng thái is_customer_converted nếu cần
        if lead.customer:
            from crm.models import Customer
            if not Customer.objects.filter(id=lead.customer_id).exists():
                lead.is_customer_converted = False
                lead.customer = None

        lead.last_message_at = timezone.now()
        lead.last_message_preview = (msg_text or "[Đính kèm]")[:255]
        if sender_type == "customer":
            lead.has_unread_message = True
            lead.unread_count = (lead.unread_count or 0) + 1
            lead.has_ai_followed_up = False
        else:
            lead.has_unread_message = False
            lead.unread_count = 0
        lead.save(update_fields=["last_message_at", "last_message_preview", "has_unread_message", "unread_count", "has_ai_followed_up"])

        # Lưu tin nhắn
        attachments = message_data.get("attachments", []) if message_data else []
        att_url = None
        att_type = ""
        if attachments:
            att = attachments[0]
            att_type = att.get("type", "")
            att_url = att.get("payload", {}).get("url", "")

        msg_created = False
        # Xác định sender_role thông minh: nếu lead đang bật AI → tin nhắn outbound từ page
        # rất có thể là do AI gửi, không phải nhân viên trực tiếp trên Fanpage.
        if sender_type == "page":
            page_ai_on = (
                lead.page_config is not None
                and lead.page_config.is_ai_active
                and lead.page_config.ai_agent_id
                and lead.is_ai_active
            )
            default_role = "ai" if page_ai_on else "system"
            default_name = "Trợ lý AI" if page_ai_on else "Hệ thống Fanpage"
        else:
            default_role = None
            default_name = None

        if msg_id:
            # Dùng get_or_create: nếu AI task đã tạo bản ghi với fb_message_id này trước
            # (sender_role=ai), thì get_or_create sẽ tìm thấy và KHÔNG ghi đè.
            existing = FacebookMessage.objects.filter(fb_message_id=msg_id).first()
            if existing:
                # Bản ghi đã có (do AI task hoặc Sale tạo trước) → không ghi đè sender_role
                msg_created = False
                new_msg = existing
            else:
                new_msg = FacebookMessage.objects.create(
                    lead=lead,
                    fb_message_id=msg_id,
                    sender_type=sender_type,
                    text=msg_text,
                    attachment_url=att_url,
                    attachment_type=att_type,
                    sender_role=default_role,
                    sender_name=default_name,
                )
                msg_created = True
        else:
            new_msg = FacebookMessage.objects.create(
                lead=lead,
                sender_type=sender_type,
                text=msg_text,
                attachment_url=att_url,
                attachment_type=att_type,
                sender_role=default_role,
                sender_name=default_name,
            )
            msg_created = True

        # Phát hiện SĐT trong tin nhắn của khách (luồng Hybrid 2 bước)
        if msg_text and sender_type == "customer":
            # Bước 1: Regex phát hiện số điện thoại ngay lập tức → lưu vào DB để UI hiển thị liền
            norm_phone = smart_extract_vn_phone(msg_text)
            if norm_phone and not lead.detected_phone:
                lead.detected_phone = norm_phone
                lead.save(update_fields=['detected_phone', 'updated_at'])

            # Bước 2: Quyết định luồng xử lý tạo KH CRM
            # - Chỉ gọi AI Hybrid task (bất đồng bộ) khi CẢ HAI cờ đều BẬT:
            #   + page_config.is_ai_active = True (AI toàn page bật)
            #   + lead.is_ai_active = True (AI hội thoại chưa bị Sale tắt)
            # - Mọi trường hợp còn lại → dùng RegEx đồng bộ để đảm bảo tạo KH CRM
            #   ngay lập tức, không phụ thuộc vào Celery worker.
            #
            # QUAN TRỌNG: Dùng lead.is_ai_active từ DB (đã refresh), không từ memory.
            lead.refresh_from_db(fields=['is_ai_active'])
            conversation_ai_active = lead.is_ai_active
            page_ai_active = (
                lead.page_config is not None
                and lead.page_config.is_ai_active
                and lead.page_config.ai_agent_id
            )
            if page_ai_active and conversation_ai_active:
                # Cả AI page lẫn AI hội thoại đều BẬT → gọi AI Hybrid (AI trả lời + extract thông tin)
                from ai_agents.tasks import async_extract_contact_info_hybrid
                async_extract_contact_info_hybrid.delay(lead.id, msg_text, 'facebook', company.id)
            else:
                # AI tắt (toàn page hoặc hội thoại cụ thể) → dùng RegEx đồng bộ
                # để đảm bảo tự động tạo KH CRM ngay lập tức
                extract_and_process_phone_fb_regex(lead, msg_text)

        # Trigger AI chỉ khi page_config bật AI VÀ hội thoại này chưa bị Sale tiếp quản.
        # Đồng thời chỉ trigger khi msg_created = True để tránh gửi 2 lần khi webhook retry.
        if msg_created and sender_type == "customer" and lead.page_config and lead.page_config.is_ai_active and lead.page_config.ai_agent_id:
            if msg_text is None:
                lead.refresh_from_db(fields=['is_ai_active'])
            if lead.is_ai_active:
                from ai_agents.tasks import trigger_facebook_ai
                trigger_facebook_ai(lead.id, trigger_msg_id=new_msg.id if new_msg else None)


# ── Trích xuất và xử lý SĐT từ hội thoại Facebook ───────────────────────────

def extract_and_process_phone_fb_regex(lead, text: str):
    """
    Quét SĐT, Email và Địa chỉ trong tin nhắn Facebook với thuật toán thông minh (RegEx).
    Tự động tạo KH hoặc đánh dấu trạng thái tuỳ theo cấu hình.
    Được gọi như một Fallback nếu AI tắt hoặc bị lỗi.
    """
    if not text:
        return None

    updated = False
    norm_phone = smart_extract_vn_phone(text)
    detected_email = smart_extract_email(text)
    detected_address = smart_extract_address(text)

    if detected_email and (not lead.detected_email or detected_email != lead.detected_email):
        lead.detected_email = detected_email
        updated = True

    if lead.detected_address != detected_address:
        lead.detected_address = detected_address
        updated = True

    if norm_phone:
        try:
            lead.refresh_from_db()
        except:
            pass

        # Đã tạo KH CRM rồi thì không làm gì thêm với số điện thoại này
        already_converted = lead.is_customer_converted or bool(lead.customer_id)
        phone_changed = lead.detected_phone and lead.detected_phone != norm_phone

        if not already_converted:
            # Luôn lưu detected_phone vào DB để UI hiển thị
            if lead.detected_phone != norm_phone:
                lead.detected_phone = norm_phone
                updated = True

            from crm.models import Customer
            company = lead.company
            auto_create = lead.page_config.auto_create_customer_from_phone if lead.page_config else False

            # Kiểm tra KH đã tồn tại theo SĐT chưa
            existing_customer = Customer.objects.filter(company=company, phone=norm_phone).first()

            if existing_customer:
                # Liên kết KH có sẵn với hội thoại này
                lead.customer = existing_customer
                lead.is_customer_converted = True
                updated = True
                logger.info(f"[FacebookAutoScan] Liên kết KH #{existing_customer.id} (SĐT {norm_phone}) với Lead #{lead.id}")
            elif auto_create:
                # Tạo KH CRM mới — convert_facebook_lead tự lưu lead và customer
                try:
                    convert_facebook_lead(lead, norm_phone)
                    logger.info(f"[FacebookAutoScan] Tự động tạo KH từ SĐT {norm_phone} cho Lead #{lead.id}")
                    try:
                        lead.refresh_from_db()
                    except:
                        pass
                except Exception as e:
                    logger.error(f"[FacebookAutoScan] Lỗi tạo KH từ SĐT {norm_phone} - Lead #{lead.id}: {e}")
            # Nếu auto_create tắt: detected_phone đã lưu ở trên, chỉ hiển thị trong UI

        elif already_converted and phone_changed and lead.customer_id:
            from crm.models import CustomerInteraction
            from users.models import User
            
            creator = lead.assigned_to
            if not creator:
                creator = User.objects.filter(company=lead.company, is_company_admin=True).first() or User.objects.filter(company=lead.company).first()

            note_content = f"Khách hàng cung cấp thêm số điện thoại phụ: {norm_phone}"
            exists = CustomerInteraction.objects.filter(
                customer_id=lead.customer_id, 
                content__contains=norm_phone
            ).exists()
            if not exists and creator:
                CustomerInteraction.objects.create(
                    customer_id=lead.customer_id,
                    type="system",
                    content=note_content,
                    created_by=creator
                )

    # Đồng bộ sang Customer nếu đã có Customer liên kết nhưng Customer đang thiếu email/address
    if lead.customer:
        customer = lead.customer
        cust_updated = False
        if lead.detected_email and not customer.email:
            customer.email = lead.detected_email
            cust_updated = True
        if lead.detected_address and not customer.address:
            customer.address = lead.detected_address
            cust_updated = True
        if cust_updated:
            customer.save(update_fields=["email", "address", "updated_at"])

    # Đảm bảo lưu detected_phone vào DB nếu phát hiện được (dù auto_create bật hay tắt)
    if norm_phone and not updated:
        if lead.detected_phone != norm_phone:
            lead.detected_phone = norm_phone
            updated = True
        elif not lead.detected_phone:
            lead.detected_phone = norm_phone
            updated = True

    if updated:
        update_f = ["detected_email", "detected_address", "updated_at"]
        if lead.detected_phone:
            update_f.append("detected_phone")
        if lead.is_customer_converted:
            update_f.append("is_customer_converted")
        if lead.customer_id:
            update_f.append("customer")
        lead.save(update_fields=list(set(update_f)))

    return norm_phone or lead.detected_phone


# ── Chuyển đổi FacebookLead → Customer ───────────────────────────────────────

@transaction.atomic
def convert_facebook_lead(lead, phone_number: str, assigned_user=None, customer_name: str = None, email: str = None, address: str = None, action_user=None):
    """
    Tạo mới hoặc liên kết Customer từ FacebookLead.
    """
    from crm.models import Customer, CustomerInteraction

    final_email = (email or lead.detected_email or "").strip()
    final_address = (address or lead.detected_address or "").strip()

    # Lock the lead row to prevent race conditions
    from facebook_integration.models import FacebookLead
    try:
        lead = FacebookLead.objects.select_for_update().get(id=lead.id)
    except FacebookLead.DoesNotExist:
        return None

    # Bảo vệ: Nếu Lead đã gắn với Khách hàng CRM rồi thì trả về Khách hàng cũ, không tạo trùng
    if lead.customer_id or lead.is_customer_converted:
        if lead.customer and not lead.is_customer_converted:
            if getattr(lead, 'ai_summary', None):
                creator = action_user or assigned_user or lead.assigned_to
                if not creator:
                    from users.models import User
                    creator = User.objects.filter(company=lead.company).first()
                if creator:
                    CustomerInteraction.objects.create(
                        customer=lead.customer,
                        type="system",
                        content=f"[AI Tóm tắt Hội thoại Facebook]\n{lead.ai_summary}",
                        created_by=creator
                    )
            else:
                try:
                    from ai_agents.tasks import summarize_facebook_conversation
                    action_user_id = action_user.id if action_user else None
                    summarize_facebook_conversation.delay(lead.id, lead.customer.id, action_user_id)
                except Exception as e:
                    logger.error(f"Failed to queue summarize_facebook_conversation: {e}")
            lead.is_customer_converted = True
            lead.save(update_fields=["is_customer_converted", "updated_at"])
        # Cập nhật email/address nếu thiếu hoặc được truyền
        cust_updated = False
        if final_email and not lead.customer.email:
            lead.customer.email = final_email
            cust_updated = True
        if final_address and not lead.customer.address:
            lead.customer.address = final_address
            cust_updated = True
        if cust_updated:
            lead.customer.save(update_fields=["email", "address", "updated_at"])
        return lead.customer

    company = lead.company
    final_name = customer_name or lead.fb_user_name or f"KH Facebook {lead.fb_user_id[-6:]}"

    existing = Customer.objects.filter(company=company, phone=phone_number).first()
    if existing:
        customer = existing
        cust_updated = False
        if final_email and not customer.email:
            customer.email = final_email
            cust_updated = True
        if final_address and not customer.address:
            customer.address = final_address
            cust_updated = True
        if cust_updated:
            customer.save(update_fields=["email", "address", "updated_at"])
    else:
        customer = Customer.objects.create(
            company=company,
            name=final_name,
            phone=phone_number,
            email=final_email,
            address=final_address,
            source="facebook",
            status="new",
            assigned_to=assigned_user or lead.assigned_to,
        )
        logger.info(f"[FacebookConvert] Created Customer #{customer.id} from Lead #{lead.id}")

    lead.customer = customer
    lead.is_customer_converted = True
    if phone_number and not lead.detected_phone:
        lead.detected_phone = phone_number
        
    auto_assign = lead.page_config.auto_assign_lead_to_customer_assignee if lead.page_config else True
    if auto_assign and customer.assigned_to and not lead.assigned_to:
        lead.assigned_to = customer.assigned_to
    lead.save(update_fields=["customer", "is_customer_converted", "detected_phone", "assigned_to", "updated_at"])
    
    if getattr(lead, 'ai_summary', None):
        creator = action_user or assigned_user or lead.assigned_to
        if not creator:
            from users.models import User
            creator = User.objects.filter(company=lead.company).first()
        if creator:
            CustomerInteraction.objects.create(
                customer=customer,
                type="system",
                content=f"[AI Tóm tắt Hội thoại Facebook]\n{lead.ai_summary}",
                created_by=creator
            )
    else:
        # Nếu chưa có summary (do đồng bộ lịch sử thủ công), trigger task để AI đọc và tóm tắt
        try:
            from ai_agents.tasks import summarize_facebook_conversation
            action_user_id = action_user.id if action_user else None
            summarize_facebook_conversation.delay(lead.id, customer.id, action_user_id)
        except Exception as e:
            logger.error(f"Failed to queue summarize_facebook_conversation: {e}")

    return customer


# ── Đồng bộ Lịch sử Trò chuyện từ Graph API ──────────────────────────────────

def sync_lead_messages(lead, limit_messages: int = 100) -> dict:
    """
    Đồng bộ tin nhắn bị thiếu cho một hội thoại (lead) cụ thể từ Facebook Graph API.
    Thường dùng khi Meta AI Business đã kiểm soát thread và chặn webhook,
    khiến tin nhắn của khách không được gửi về hệ thống.

    Quy trình:
    1. Tìm conversation_id của lead bằng cách query /conversations?user_id={psid}
    2. Kéo messages từ /{conv_id}/messages
    3. Chỉ lưu những tin nhắn chưa có trong DB (get_or_create theo fb_message_id)
    4. Cập nhật last_message_at, last_message_preview, unread nếu có tin mới

    Trả về dict: {synced_messages: int, skipped: int, conversation_id: str}
    """
    from facebook_integration.models import FacebookMessage
    from django.utils.dateparse import parse_datetime

    page_config = lead.page_config
    if not page_config or not page_config.page_access_token:
        raise ValueError("Hội thoại này chưa được liên kết với Trang Facebook hợp lệ.")

    token = page_config.page_access_token
    psid = lead.fb_user_id
    page_id = str(page_config.page_id)

    # Bước 1: Tìm conversation_id qua /conversations?user_id={psid}
    conv_url = f"{FB_GRAPH_API_BASE}/{page_id}/conversations"
    conv_params = {
        "user_id": psid,
        "fields": "id,updated_time,snippet,unread_count,participants",
        "access_token": token,
        "limit": 1,
    }
    conv_id = None
    try:
        resp = requests.get(conv_url, params=conv_params, timeout=10)
        resp_data = resp.json()
        convs = resp_data.get("data", [])
        if convs:
            conv = convs[0]
            conv_id = conv.get("id")
            
            # Khôi phục Tên nếu bị thiếu
            if lead.fb_user_name and lead.fb_user_name.startswith("FB "):
                participants = conv.get("participants", {}).get("data", [])
                for p in participants:
                    if str(p.get("id")) == str(psid) and p.get("name"):
                        lead.fb_user_name = p.get("name")
                        break

            # Cập nhật metadata hội thoại nếu có
            upd_str = conv.get("updated_time")
            snippet = conv.get("snippet", "")
            unread_cnt = int(conv.get("unread_count", 0) or 0)
            upd_dt = parse_datetime(upd_str) if upd_str else None
            
            update_fields = []
            if lead.fb_user_name and lead.fb_user_name.startswith("FB ") == False:
                update_fields.append("fb_user_name")
                
            if upd_dt and (not lead.last_message_at or upd_dt > lead.last_message_at):
                lead.last_message_at = upd_dt
                if snippet:
                    lead.last_message_preview = snippet[:255]
                lead.has_unread_message = (unread_cnt > 0)
                lead.unread_count = unread_cnt
                update_fields.extend(["last_message_at", "last_message_preview", "has_unread_message", "unread_count"])
            
            if update_fields:
                lead.save(update_fields=update_fields)
        else:
            logger.warning(f"[SyncLeadMessages] Không tìm thấy conversation_id cho PSID={psid}")
    except Exception as e:
        logger.error(f"[SyncLeadMessages] Lỗi tìm conversation_id: {e}")
        raise ValueError(f"Không thể tìm thấy hội thoại trên Facebook: {e}")

    if not conv_id:
        raise ValueError("Không tìm được conversation_id từ Facebook. PSID có thể không còn tồn tại hoặc token hết hạn.")

    # Bước 2: Kéo messages từ /{conv_id}/messages
    msg_url = f"{FB_GRAPH_API_BASE}/{conv_id}/messages"
    msg_params = {
        "fields": "id,created_time,from,to,message,attachments{id,mime_type,name,size,image_data,video_data,file_url,payload}",
        "access_token": token,
        "limit": min(limit_messages, 100),
    }

    synced_messages = 0
    skipped = 0

    try:
        m_resp = requests.get(msg_url, params=msg_params, timeout=15)
        if m_resp.status_code != 200:
            logger.error(f"[SyncLeadMessages] Lỗi gọi /messages: {m_resp.status_code} - {m_resp.text}")
            raise ValueError(f"Facebook API trả lỗi: {m_resp.status_code}")

        m_data = m_resp.json().get("data", [])
        m_data.reverse()  # Sắp xếp cũ → mới

        for m_item in m_data:
            m_id = m_item.get("id")
            if not m_id:
                continue

            # Xác định người gửi
            m_from = m_item.get("from", {})
            from_id = str(m_from.get("id", ""))
            s_type = "customer" if (from_id and str(from_id) == str(psid)) else "page"
            m_text = m_item.get("message", "")
            
            # Cập nhật tên nếu vẫn thiếu
            if s_type == "customer" and lead.fb_user_name.startswith("FB "):
                if m_from.get("name"):
                    lead.fb_user_name = m_from.get("name")
                    lead.save(update_fields=["fb_user_name"])

            # Xử lý đính kèm
            att_url = None
            att_type = ""
            atts = m_item.get("attachments", {}).get("data", [])
            if atts:
                first_att = atts[0]
                mime = (first_att.get("mime_type") or "").lower()
                payload = first_att.get("payload", {})
                img_data = first_att.get("image_data", {})
                vid_data = first_att.get("video_data", {})
                att_url = (
                    payload.get("url")
                    or img_data.get("url")
                    or img_data.get("preview_url")
                    or vid_data.get("url")
                    or vid_data.get("preview_url")
                    or first_att.get("file_url")
                    or first_att.get("url")
                )
                if mime.startswith("video/") or vid_data or (att_url and any(ext in att_url.lower() for ext in [".mp4", ".mov", ".avi", ".webm", "/videos/", "video_redirect"])):
                    att_type = "video"
                elif mime.startswith("image/") or img_data or (att_url and any(ext in att_url.lower() for ext in [".jpg", ".jpeg", ".png", ".gif", ".webp"])):
                    att_type = "image"
                elif mime.startswith("audio/") or (att_url and any(ext in att_url.lower() for ext in [".mp3", ".wav", ".ogg", ".m4a"])):
                    att_type = "audio"
                elif att_url:
                    att_type = "image"

            c_dt_str = m_item.get("created_time")
            c_dt = parse_datetime(c_dt_str) if c_dt_str else timezone.now()

            # Chỉ lưu tin nhắn chưa có trong DB
            msg_obj, m_created = FacebookMessage.objects.get_or_create(
                fb_message_id=m_id,
                defaults={
                    "lead": lead,
                    "sender_type": s_type,
                    "text": m_text,
                    "attachment_url": att_url,
                    "attachment_type": att_type,
                }
            )
            if m_created:
                FacebookMessage.objects.filter(id=msg_obj.id).update(created_at=c_dt)
                synced_messages += 1
                # Tự động phát hiện SĐT/Email từ tin nhắn khách
                if s_type == "customer" and m_text:
                    extract_and_process_phone_fb(lead, m_text)
            else:
                skipped += 1

    except ValueError:
        raise
    except Exception as e:
        logger.error(f"[SyncLeadMessages] Lỗi kéo messages: {e}")
        raise ValueError(f"Lỗi khi đồng bộ tin nhắn: {e}")

    logger.info(f"[SyncLeadMessages] Lead {lead.id} (PSID={psid}): synced={synced_messages}, skipped={skipped}")
    return {
        "synced_messages": synced_messages,
        "skipped": skipped,
        "conversation_id": conv_id,
    }


def sync_page_conversations_history(page_config, max_conversations: int = 100, limit_messages: int = 50):

    """
    Kéo danh sách hội thoại cũ (/conversations) và tin nhắn (/messages)
    cho một Trang Facebook từ Graph API.
    """
    if not page_config.page_access_token or not page_config.page_id:
        raise ValueError("Trang Facebook chưa có Page ID hoặc Page Access Token hợp lệ.")

    token = page_config.page_access_token
    page_id = str(page_config.page_id)
    url = f"{FB_GRAPH_API_BASE}/{page_id}/conversations"
    params = {
        "fields": "id,participants,updated_time,snippet,unread_count,message_count",
        "access_token": token,
        "limit": min(max_conversations, 100),
    }

    synced_conversations = 0
    synced_messages = 0

    from facebook_integration.models import FacebookLead, FacebookMessage
    from django.utils.dateparse import parse_datetime

    while url and synced_conversations < max_conversations:
        try:
            resp = requests.get(url, params=params, timeout=15)
            if resp.status_code != 200:
                logger.error(f"[SyncHistory] Lỗi gọi API /conversations: {resp.status_code} - {resp.text}")
                break
            data = resp.json()
        except Exception as e:
            logger.error(f"[SyncHistory] Lỗi kết nối Graph API: {e}")
            break

        conv_list = data.get("data", [])
        if not conv_list:
            break

        for conv in conv_list:
            if synced_conversations >= max_conversations:
                break

            conv_id = conv.get("id")
            participants = conv.get("participants", {}).get("data", [])
            # Tìm participant không phải là Page
            psid = None
            psid_name = ""
            for p in participants:
                if str(p.get("id")) != page_id:
                    psid = str(p.get("id"))
                    psid_name = p.get("name", "")
                    break

            if not psid:
                continue

            # Parse updated_time
            upd_str = conv.get("updated_time")
            last_dt = parse_datetime(upd_str) if upd_str else timezone.now()
            snippet = conv.get("snippet", "")
            unread_cnt = int(conv.get("unread_count", 0) or 0)
            unread = (unread_cnt > 0)

            # Tạo hoặc cập nhật FacebookLead
            lead, created = FacebookLead.objects.get_or_create(
                page_config=page_config,
                fb_user_id=psid,
                defaults={
                    "company": page_config.company,
                    "fb_user_name": psid_name or f"FB {psid[-6:]}",
                    "last_message_at": last_dt,
                    "last_message_preview": snippet[:255],
                    "has_unread_message": unread,
                    "unread_count": unread_cnt,
                    "assigned_to": page_config.assigned_to,
                }
            )
            if created or not lead.fb_user_avatar or not lead.fb_user_name or lead.fb_user_name.startswith("FB "):
                profile = get_fb_user_profile(token, psid)
                if profile.get("name"):
                    lead.fb_user_name = profile["name"]
                elif psid_name and not lead.fb_user_name:
                    lead.fb_user_name = psid_name
                if profile.get("avatar"):
                    lead.fb_user_avatar = profile["avatar"]
                if not lead.company_id and page_config.company_id:
                    lead.company = page_config.company
                if last_dt and (not lead.last_message_at or last_dt > lead.last_message_at):
                    lead.last_message_at = last_dt
                    lead.last_message_preview = snippet[:255]
                    lead.has_unread_message = unread
                    lead.unread_count = unread_cnt
                lead.save()
            else:
                if not lead.company_id and page_config.company_id:
                    lead.company = page_config.company
                if psid_name and not lead.fb_user_name:
                    lead.fb_user_name = psid_name
                if last_dt and (not lead.last_message_at or last_dt > lead.last_message_at):
                    lead.last_message_at = last_dt
                    lead.last_message_preview = snippet[:255]
                    lead.has_unread_message = unread
                    lead.unread_count = unread_cnt
                lead.save()

            # ── Tự động kế thừa assigned_to từ Customer đã có ─────────────
            if not lead.assigned_to:
                try:
                    existing_lead_with_customer = FacebookLead.objects.filter(
                        company=page_config.company,
                        fb_user_id=psid,
                        customer__isnull=False,
                        customer__assigned_to__isnull=False,
                    ).exclude(id=lead.id).select_related('customer').first()
                    if existing_lead_with_customer:
                        lead.assigned_to = existing_lead_with_customer.customer.assigned_to
                        lead.customer = existing_lead_with_customer.customer
                        lead.is_customer_converted = True
                        lead.save(update_fields=["assigned_to", "customer", "is_customer_converted"])
                except Exception as e:
                    logger.error(f"[SyncHistory] Failed to inherit assigned_to: {e}")
            # ────────────────────────────────────────────────────────────────

            synced_conversations += 1

            # Kéo tin nhắn của hội thoại này (/messages)
            msg_url = f"{FB_GRAPH_API_BASE}/{conv_id}/messages"
            msg_params = {
                "fields": "id,created_time,from,to,message,attachments{id,mime_type,name,size,image_data,video_data,file_url,payload}",
                "access_token": token,
                "limit": min(limit_messages, 100),
            }
            try:
                m_resp = requests.get(msg_url, params=msg_params, timeout=10)
                if m_resp.status_code == 200:
                    m_data = m_resp.json().get("data", [])
                    m_data.reverse()
                    for m_item in m_data:
                        m_id = m_item.get("id")
                        if not m_id:
                            continue
                        m_from = m_item.get("from", {})
                        from_id = str(m_from.get("id", ""))
                        # Nếu ID người gửi trùng với ID khách hàng (psid) -> Khách hàng gửi. Khác -> Page gửi
                        s_type = "customer" if (from_id and str(from_id) == str(psid)) else "page"
                        m_text = m_item.get("message", "")

                        att_url = None
                        att_type = ""
                        atts = m_item.get("attachments", {}).get("data", [])
                        if atts:
                            first_att = atts[0]
                            mime = (first_att.get("mime_type") or "").lower()
                            payload = first_att.get("payload", {})
                            img_data = first_att.get("image_data", {})
                            vid_data = first_att.get("video_data", {})

                            att_url = (
                                payload.get("url")
                                or img_data.get("url")
                                or img_data.get("preview_url")
                                or vid_data.get("url")
                                or vid_data.get("preview_url")
                                or first_att.get("file_url")
                                or first_att.get("url")
                            )

                            # Ưu tiên kiểm tra video TRƯỚC image, vì URL video Facebook cũng chứa 'scontent' và 'fbcdn'
                            if mime.startswith("video/") or vid_data or (att_url and any(ext in att_url.lower() for ext in [".mp4", ".mov", ".avi", ".webm", "/videos/", "video_redirect"])):
                                att_type = "video"
                            elif mime.startswith("image/") or img_data or (att_url and any(ext in att_url.lower() for ext in [".jpg", ".jpeg", ".png", ".gif", ".webp"])):
                                att_type = "image"
                            elif mime.startswith("audio/") or (att_url and any(ext in att_url.lower() for ext in [".mp3", ".wav", ".ogg", ".m4a"])):
                                att_type = "audio"
                            elif att_url:
                                # Nếu không rõ, thử đoán từ đặc điểm URL Facebook CDN
                                att_type = "image"  # Mặc định hình ảnh nếu là CDN Facebook thường

                        c_dt_str = m_item.get("created_time")
                        c_dt = parse_datetime(c_dt_str) if c_dt_str else timezone.now()

                        msg_obj, m_created = FacebookMessage.objects.get_or_create(
                            fb_message_id=m_id,
                            defaults={
                                "lead": lead,
                                "sender_type": s_type,
                                "text": m_text,
                                "attachment_url": att_url,
                                "attachment_type": att_type,
                            }
                        )
                        if m_created:
                            FacebookMessage.objects.filter(id=msg_obj.id).update(created_at=c_dt)
                            synced_messages += 1

                            if s_type == "customer" and m_text:
                                extract_and_process_phone_fb(lead, m_text)
                        else:
                            upd = []
                            if msg_obj.sender_type != s_type:
                                msg_obj.sender_type = s_type
                                upd.append("sender_type")
                            if m_text and not msg_obj.text:
                                msg_obj.text = m_text
                                upd.append("text")
                            if att_url and not msg_obj.attachment_url:
                                msg_obj.attachment_url = att_url
                                msg_obj.attachment_type = att_type
                                upd.extend(["attachment_url", "attachment_type"])
                            if upd:
                                msg_obj.save(update_fields=upd)

            except Exception as me:
                logger.error(f"[SyncHistory] Lỗi kéo tin nhắn của hội thoại {conv_id}: {me}")

        paging = data.get("paging", {})
        url = paging.get("next")
        params = {}

    logger.info(f"[SyncHistory] Đã đồng bộ xong cho Trang {page_config.page_name}: {synced_conversations} hội thoại, {synced_messages} tin nhắn.")
    return {
        "synced_conversations": synced_conversations,
        "synced_messages": synced_messages,
    }

def send_facebook_carousel(page_access_token: str, recipient_psid: str, elements: list) -> dict:
    if not page_access_token or not recipient_psid or not elements:
        return {"success": False, "error": "Thiếu thông tin."}

    url = f"{FB_GRAPH_API_BASE}/me/messages"
    params = {"access_token": page_access_token}
    
    # 0. Đánh dấu đã đọc trên Facebook (mark_seen)
    try:
        mark_seen_payload = {
            "recipient": {"id": recipient_psid},
            "sender_action": "mark_seen"
        }
        requests.post(url, params=params, json=mark_seen_payload, timeout=5)
    except Exception as e:
        pass

    # Format elements for Facebook Generic Template
    fb_elements = []
    for item in elements:
        fb_elements.append({
            "title": item.get('title', '')[:80],
            "subtitle": item.get('subtitle', '')[:80],
            "image_url": item.get('image_url', ''),
            "buttons": [{
                "type": "postback",
                "title": "Nhận tư vấn",
                "payload": f"CARE_{item.get('sku', '')}"
            }]
        })
        
    payload = {
        "recipient": {"id": recipient_psid},
        "message": {
            "attachment": {
                "type": "template",
                "payload": {
                    "template_type": "generic",
                    "elements": fb_elements[:10]  # Facebook allows max 10 elements
                }
            }
        }
    }
    
    try:
        resp = requests.post(url, params=params, json=payload, timeout=15)
        resp_data = resp.json()
        if "error" in resp_data:
            logger.error(f"[Facebook] Carousel Error: {resp_data['error']}")
            return {"success": False, "error": resp_data["error"].get("message", "Lỗi gửi Facebook Carousel")}
        return {"success": True, "message_id": resp_data.get("message_id")}
    except Exception as e:
        logger.error(f"[Facebook] Exception Carousel: {e}")
        return {"success": False, "error": str(e)}
def extract_and_process_phone_fb(lead, text: str):
    """
    Điểm truy cập chính cho việc trích xuất thông tin liên hệ Facebook (Cơ chế Hybrid).
    Kiểm tra sơ bộ xem có chứa SĐT hay Địa chỉ không.
    Nếu có và AI đang bật, đẩy sang AI xử lý ngầm.
    Nếu AI tắt, dùng RegEx cũ.
    """
    if not text:
        return None
        
    import re
    text_lower = text.lower()
    
    # 1. Phát hiện nhanh (Heuristics)
    has_potential_info = (
        bool(re.search(r'\d{8,}', text)) or
        any(k in text_lower for k in ['tỉnh', 'thành phố', 'quận', 'huyện', 'phường', 'xã', 'đường', 'phố', 'ngõ', 'ngách', 'số nhà', 'chung cư', 'nhà', 'ship', '@'])
    )
    
    if not has_potential_info:
        return None
        
    # 2. Kiểm tra AI
    company = lead.company
    has_active_ai = lead.is_ai_active and company.ai_agents.filter(is_active=True).exists()
    
    if has_active_ai:
        from ai_agents.tasks import async_extract_contact_info_hybrid
        async_extract_contact_info_hybrid.delay(lead.id, text, 'facebook', company.id)
        return None # Async processing
    else:
        # Fallback
        return extract_and_process_phone_fb_regex(lead, text)
