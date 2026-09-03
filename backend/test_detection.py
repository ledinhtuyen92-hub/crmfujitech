"""
Test toàn diện các hàm phát hiện SĐT và Địa chỉ
Chạy: python test_detection.py
"""
import sys
import re

# ────────────────────────────────────────────────────────
# Copy các hàm cần test (test độc lập, không cần Django)
# ────────────────────────────────────────────────────────

def smart_extract_vn_phone(text: str):
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


def smart_extract_address(text: str):
    if not text:
        return None

    ignore_patterns = [
        r'địa\s*chỉ\s*(?:email|shop|bên\s*mình|ở\s*đâu|cty|công\s*ty|nào|để|của|chi\s*tiết|\?)',
        r'(?:xin|hỏi|cho|tìm|qua|biết|gửi|lấy)\s*(?:xin\s*)?địa\s*chỉ',
        r'catalogue.*email|email.*catalogue'
    ]

    raw_lines = [line.strip() for line in text.split('\n') if line.strip()]

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

        sub_sentences = [s.strip() for s in re.split(r'[\.!\?]\s+|\s{2,}', line) if s.strip()]

        for sent in sub_sentences:
            sent_low = sent.lower()
            if any(re.search(pat, sent_low) for pat in ignore_patterns):
                continue

            has_prefix = bool(re.search(r'\b(?:địa\s*chỉ|đ\/c|d\/c|đc|dc|ship\s*(?:đến|tới|về)?|giao\s*(?:đến|tới|về)?|nhà\s*số)\s*[:\-\.]', sent_low))

            if has_prefix:
                clean_addr = prefix_regex.sub('', sent).strip()
                clean_addr = re.sub(r'\b(?:0|\+84)[35789]\d{8}\b', '', clean_addr).strip(' .,:-')
                if len(clean_addr) >= 6 and any(c.isalpha() for c in clean_addr):
                    extracted_segments.append(clean_addr)
            else:
                matching_kws = [kw for kw in admin_keywords if kw in sent_low]
                strong_kws = [
                    'số nhà', 'chung cư', 'khu đô thị', 'kđt', 'phường', 'quận', 'huyện',
                    'thành phố', 'tp.', 'tỉnh', 'hà nội', 'tphcm', 'tp hcm', 'hồ chí minh',
                    'sài gòn', 'đà nẵng', 'cần thơ', 'hải phòng', 'hn', 'hcm',
                    'thôn ', 'xóm ', 'ấp ', 'ngõ ', 'ngách ', 'hẻm ', 'đường ', 'phố '
                ]
                has_strong = any(skw in sent_low for skw in strong_kws)
                starts_with_house_number = bool(re.match(r'^\d{1,4}(?:[\/-]\d{1,4})*\s+[A-Za-zĐđÂâĂăÊêÔôƠơƯưÁáÀàẠạẢảÃã]', sent.strip()))
                has_comma_or_admin = (',' in sent) or (len(matching_kws) >= 1)

                if len(matching_kws) >= 2 or (has_strong and len(matching_kws) >= 1 and len(sent) >= 8) or (starts_with_house_number and has_comma_or_admin and len(sent) >= 8):
                    clean_addr = re.sub(r'\b(?:0|\+84)[35789]\d{8}\b', '', sent).strip(' .,:-')
                    if len(clean_addr) >= 6 and any(c.isalpha() for c in clean_addr):
                        CHAT_EXCLUSIONS = [
                            'ko ak', 'được ko', 'khi nào', 'hay sao vậy', 'muốn mua', 'hết hàng',
                            'giá bao nhiêu', 'bán cho', 'lít mật ong', 'kg ', 'gram ',
                            'ship đi', 'ship tới', 'giao đi', 'giao tới', 'giao tỉnh', 'ship tỉnh',
                            'bao nhiêu tiền', 'giá bộ', 'giá sản phẩm', 'giá sp',
                            'có giao không', 'có ship không', 'freeship', 'free ship',
                            'bao tiền', 'giá bao', 'tư vấn', 'hỏi thăm', 'cần tư vấn'
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


def _is_valid_extracted_address(address: str) -> bool:
    if not address or len(address) < 6:
        return False
    addr_lower = address.lower()
    geo_keywords = [
        'số ', 'ngõ', 'ngách', 'hẻm', 'đường ', 'phố ', 'phường', 'p.',
        'quận', 'q.', 'huyện', 'h.', 'xã', 'tỉnh ', 'thành phố', 'tp.',
        'khu ', 'chung cư', 'tòa ', 'tầng ', 'block', 'hà nội', 'tphcm',
        'tp hcm', 'hồ chí minh', 'sài gòn', 'đà nẵng', 'cần thơ',
        'hải phòng', 'bình dương', 'đồng nai', 'thôn ', 'xóm ', 'ấp ',
        'địa chỉ', 'đ/c', 'd/c', 'đc:', 'dc:',
    ]
    chat_exclusions = [
        'cảm ơn', 'xin chào', 'chào bạn', 'chào anh', 'chào chị',
        'đã nhận', 'đã cung cấp', 'đã có', 'sẽ tư vấn', 'sẽ liên hệ',
        'vui lòng', 'bạn ơi', 'anh ơi', 'chị ơi', 'em xin', 'em sẽ',
        'tôi muốn', 'cần tư vấn', 'hỏi thăm', 'không có', 'chưa có',
        'bao nhiêu', 'giá cả', 'cho hỏi', 'muốn mua', 'cơ sở bạn',
        'cơ sở ở', 'ở đâu', 'bên mình', 'shop ở', 'liên hệ ngay',
        'chuyển cho bộ phận', 'kiệm doanh', 'nhanh nhất',
    ]
    has_geo = any(kw in addr_lower for kw in geo_keywords)
    has_chat = any(exc in addr_lower for exc in chat_exclusions)
    return has_geo and not has_chat


# ────────────────────────────────────────────────────────
PASS = "✅ PASS"
FAIL = "❌ FAIL"

def check(label, result, expected):
    ok = result == expected
    s = PASS if ok else FAIL
    print(f"  {s} {label}")
    if not ok:
        print(f"       Expected: {expected!r}")
        print(f"       Got     : {result!r}")
    return ok

def run_all():
    results = []

    print("\n" + "="*65)
    print("📱 TEST 1: smart_extract_vn_phone")
    print("="*65)
    phone_cases = [
        ("Số điện thoại của tôi là 0976132071", "0976132071", "SĐT với tiền tố rõ ràng"),
        ("SĐT: 0901234567", "0901234567", "SĐT với 'SĐT:'"),
        ("Liên hệ 0332456789 nhé", "0332456789", "SĐT với từ khóa 'Liên hệ'"),
        ("zalo 0912.345.678", "0912345678", "Zalo + SĐT có dấu chấm"),
        ("số của mình là 097.613.2071", "0976132071", "SĐT dấu chấm"),
        ("+84976132071", "0976132071", "SĐT quốc tế +84"),
        ("84976132071", "0976132071", "SĐT 84... (11 số)"),
        ("phone: 0786543210", "0786543210", "SĐT với 'phone:'"),
        ("Gọi cho tôi 0352 345 678", "0352345678", "SĐT có khoảng trắng"),
        ("alo 0923456789", "0923456789", "SĐT với 'alo'"),
        ("gọi 0933111222 nha", "0933111222", "SĐT với 'gọi'"),
        ("Mình ở Quận 5, số nhà 123, liên hệ 0909.123.456", "0909123456", "SĐT trong câu địa chỉ"),
        # Không phải SĐT
        ("Giá sản phẩm 3500000đ", None, "Số tiền đồng - KHÔNG nhận"),
        ("5.000.000 VND", None, "Số tiền VND - KHÔNG nhận"),
        ("0903000000k", None, "Có hậu tố 'k' tiền - KHÔNG nhận"),
        ("Cảm ơn anh chị đã cung cấp thông tin", None, "Câu xã giao - KHÔNG nhận"),
        ("Xin chào tôi cần tư vấn", None, "Không có SĐT"),
    ]
    for text, expected, desc in phone_cases:
        ok = check(desc, smart_extract_vn_phone(text), expected)
        results.append(ok)

    print("\n" + "="*65)
    print("📍 TEST 2: smart_extract_address (Regex)")
    print("="*65)
    addr_cases_detect = [
        ("Đc: 12 Lê Lợi, Phường 5, Quận 1, TP.HCM", "Địa chỉ đầy đủ với 'Đc:'"),
        ("Địa chỉ: Số 5 Nguyễn Huệ, Phường Bến Nghé, Quận 1", "Địa chỉ với tiền tố"),
        ("Ship đến: 220 Định Công, Hà Nội", "Địa chỉ ship đến"),
        ("Nhà tôi ở ngõ 10 Trần Đại Nghĩa, Hà Nội", "Địa chỉ ngõ + Hà Nội"),
        ("Giao hàng tới: Số 45 đường Lê Duẩn, Đà Nẵng", "Địa chỉ giao hàng"),
        ("Tòa CT2, Chung cư Xa La, Hà Đông, Hà Nội", "Chung cư"),
        ("Hẻm 12 đường Phan Đình Phùng, Đà Nẵng", "Địa chỉ hẻm"),
        ("Thôn 3, Xã Tam Phước, Huyện Long Thành, Đồng Nai", "Thôn xã huyện"),
        ("220 Định Công, Hà Nội - giao hàng không?", "Địa chỉ + câu hỏi ship"),
        ("Số nhà 45, Bình Dương", "Địa chỉ đơn giản + tỉnh"),
    ]
    for text, desc in addr_cases_detect:
        r = smart_extract_address(text)
        ok = r is not None
        s = PASS if ok else FAIL
        print(f"  {s} [Phải nhận] {desc}")
        if ok: print(f"       → {r!r}")
        results.append(ok)

    addr_cases_skip = [
        ("Cảm ơn anh chị đã cung cấp thông tin", "Bug cũ - câu cảm ơn AI"),
        ("Cơ sở bạn ở đâu ak?", "Hỏi địa chỉ shop"),
        ("Địa chỉ email của tôi là abc@gmail.com", "Email"),
        ("Địa chỉ shop ở đâu vậy?", "Hỏi shop"),
        ("Xin cho hỏi địa chỉ bên mình?", "Hỏi địa chỉ bên mình"),
        ("Ship tỉnh Bắc Giang được không?", "Hỏi ship tỉnh"),
        ("Tôi muốn mua 3 bộ cửa", "Câu mua hàng"),
    ]
    for text, desc in addr_cases_skip:
        r = smart_extract_address(text)
        ok = r is None
        s = PASS if ok else FAIL
        print(f"  {s} [Không nhận] {desc}")
        if not ok: print(f"       ❗ Got: {r!r}")
        results.append(ok)

    print("\n" + "="*65)
    print("🤖 TEST 3: _is_valid_extracted_address (AI Output Validator)")
    print("="*65)
    ai_valid = [
        ("12 Lê Lợi, Phường 5, Quận 1, TP.HCM", True, "Địa chỉ đầy đủ"),
        ("Số 45 đường Nguyễn Trãi, Quận 5, Hồ Chí Minh", True, "Đường + quận + TP"),
        ("Ngõ 3, Định Công, Hà Nội", True, "Ngõ Hà Nội"),
        ("Hẻm 5 Phan Đình Phùng, Phường 1, Đà Lạt", True, "Hẻm + phường"),
        ("Block A, Chung cư Vinhomes, Quận 9", True, "Chung cư có quận"),
        ("Địa chỉ: 220 Trần Phú, Hải Phòng", True, "Tiền tố + TP"),
        ("123 Phố Huế, Hà Nội", True, "Phố + Hà Nội"),
        # Bug cũ
        ("Cảm ơn anh chị đã cung cấp thông tin", False, "Bug cũ - câu cảm ơn AI"),
        ("Em sẽ chuyển cho bộ phận kinh doanh liên hệ sớm nhất", False, "Câu AI phản hồi"),
        ("Cơ sở bạn ở đâu vậy?", False, "Câu hỏi shop"),
        ("Xin chào, tôi cần tư vấn sản phẩm", False, "Câu chào hỏi"),
        ("Không có thông tin địa chỉ", False, "Không có địa chỉ"),
        ("Vui lòng cung cấp địa chỉ giao hàng", False, "Yêu cầu địa chỉ"),
        ("Chào bạn, shop ở đâu vậy?", False, "Hỏi shop"),
        ("", False, "Rỗng"),
    ]
    for text, expected, desc in ai_valid:
        ok = check(desc, _is_valid_extracted_address(text), expected)
        results.append(ok)

    total = len(results)
    passed = sum(results)
    failed = total - passed
    print("\n" + "="*65)
    print(f"📊 TỔNG HỢP: {passed}/{total} PASS  |  {failed} FAIL")
    if failed == 0:
        print("🎉 TẤT CẢ TEST ĐỀU ĐẠT!")
    else:
        print(f"⚠️  CÓ {failed} TEST THẤT BẠI - CẦN XEM LẠI!")
    print("="*65)
    return failed

if __name__ == "__main__":
    sys.exit(run_all())
