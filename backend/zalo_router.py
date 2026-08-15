def extract_and_process_phone(social_lead, text: str):
    """
    Điểm truy cập chính cho việc trích xuất thông tin liên hệ Zalo (Cơ chế Hybrid).
    Kiểm tra sơ bộ xem có chứa SĐT hay Địa chỉ không.
    Nếu có và AI đang bật, đẩy sang AI xử lý ngầm.
    Nếu AI tắt, dùng RegEx cũ.
    """
    if not text:
        return None
        
    import re
    text_lower = text.lower()
    
    # 1. Phát hiện nhanh (Heuristics)
    # Có số đt (>=8 số liên tiếp) hoặc chứa các từ khóa địa chỉ / email
    has_potential_info = (
        bool(re.search(r'\d{8,}', text)) or
        any(k in text_lower for k in ['tỉnh', 'thành phố', 'quận', 'huyện', 'phường', 'xã', 'đường', 'phố', 'ngõ', 'ngách', 'số nhà', 'chung cư', 'nhà', 'ship', '@'])
    )
    
    if not has_potential_info:
        return None
        
    # 2. Kiểm tra AI
    company = social_lead.company
    has_active_ai = company.ai_agents.filter(is_active=True).exists()
    
    if has_active_ai:
        from ai_agents.tasks import async_extract_contact_info_hybrid
        async_extract_contact_info_hybrid.delay(social_lead.id, text, 'zalo', company.id)
    else:
        # Fallback
        extract_and_process_phone_regex(social_lead, text)
