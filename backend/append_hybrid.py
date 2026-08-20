
@shared_task
def async_extract_contact_info_hybrid(lead_id, text, platform, company_id):
    """
    Sử dụng AI để trích xuất SĐT và Địa chỉ từ tin nhắn.
    Nếu AI thất bại hoặc lỗi, gọi lại hàm trích xuất bằng RegEx (fallback).
    """
    from users.models import Company
    from ai_agents.models import AiAgent
    from ai_agents.services import generate_raw_text
    import json
    import re
    
    try:
        company = Company.objects.get(id=company_id)
        agent = AiAgent.objects.filter(company=company, is_active=True).first()
        if not agent:
            raise Exception("No active AI agent found for company")
            
        prompt = (
            "Bạn là trợ lý ảo bóc tách dữ liệu. Hãy đọc đoạn tin nhắn sau do khách hàng gửi và trích xuất "
            "Ra Số điện thoại và Địa chỉ giao hàng/nhà riêng nếu có.\n"
            "Chỉ trả về 1 chuỗi JSON hợp lệ với định dạng chính xác sau (không thêm bất kỳ ký tự hay dấu markdown nào khác):\n"
            '{"phone": "...", "address": "..."}\n'
            "Nếu không có thông tin thì để giá trị là chuỗi rỗng \"\".\n\n"
            f"Tin nhắn: {text}"
        )
        
        result_str = generate_raw_text(agent, prompt)
        if not result_str:
            raise Exception("LLM returned empty string")
            
        # Clean markdown if any
        result_str = re.sub(r'```json\s*', '', result_str)
        result_str = re.sub(r'```\s*', '', result_str).strip()
        
        data = json.loads(result_str)
        phone = data.get('phone', '')
        address = data.get('address', '')
        
        # Chỉ gọi update logic nếu có dữ liệu
        if phone or address:
            if platform == 'zalo':
                from zalo_integration.models import SocialLead
                lead = SocialLead.objects.get(id=lead_id)
                # Dùng lại hàm cập nhật
                _apply_extracted_info(lead, phone, '', address, platform='zalo')
            elif platform == 'facebook':
                from facebook_integration.models import FacebookLead
                lead = FacebookLead.objects.get(id=lead_id)
                _apply_extracted_info(lead, phone, '', address, platform='facebook')
                
    except Exception as e:
        logger.error(f"[AI Extract] Error: {e}. Falling back to RegEx.")
        # Fallback to regex
        if platform == 'zalo':
            from zalo_integration.models import SocialLead
            from zalo_integration.services import extract_and_process_phone_regex
            try:
                lead = SocialLead.objects.get(id=lead_id)
                extract_and_process_phone_regex(lead, text)
            except:
                pass
        elif platform == 'facebook':
            from facebook_integration.models import FacebookLead
            from facebook_integration.services import extract_and_process_phone_fb_regex
            try:
                lead = FacebookLead.objects.get(id=lead_id)
                extract_and_process_phone_fb_regex(lead, text)
            except:
                pass

def _apply_extracted_info(lead, phone, email, address, platform):
    """ Hàm dùng chung để apply kết quả AI vào Lead và tạo Customer """
    updated = False
    
    if email and isinstance(email, str) and (not lead.detected_email or email != lead.detected_email) and len(email) > 5:
        lead.detected_email = email
        updated = True

    if address and isinstance(address, str) and (lead.detected_address != address) and len(address) > 5:
        lead.detected_address = address
        updated = True

    norm_phone = None
    if phone and isinstance(phone, str) and len(phone) >= 9:
        import re
        # Lọc lại sđt cho sạch
        clean_phone = re.sub(r'\D', '', phone)
        if clean_phone.startswith('84'): clean_phone = '0' + clean_phone[2:]
        if clean_phone.startswith('0') and len(clean_phone) == 10:
            norm_phone = clean_phone

    if norm_phone:
        try: lead.refresh_from_db()
        except: pass
        
        already_converted = False
        if platform == 'zalo':
            already_converted = lead.is_customer_converted or hasattr(lead, 'customer')
        elif platform == 'facebook':
            already_converted = lead.is_customer_converted or lead.customer_id
            
        phone_changed = lead.detected_phone and lead.detected_phone != norm_phone
        
        if not already_converted and not phone_changed:
            if not lead.detected_phone:
                lead.detected_phone = norm_phone
                updated = True
                
            from crm.models import Customer
            company = lead.company
            already_exists = Customer.objects.filter(company=company, phone=norm_phone).exists()
            
            auto_create = False
            if platform == 'zalo':
                auto_create = lead.oa_config.auto_create_customer_from_phone if lead.oa_config else False
            elif platform == 'facebook':
                auto_create = lead.page_config.auto_create_customer_from_phone if lead.page_config else False
                
            if already_exists:
                existing_customer = Customer.objects.filter(company=company, phone=norm_phone).first()
                lead.is_customer_converted = True
                if platform == 'zalo': lead.customer = existing_customer
                elif platform == 'facebook': lead.customer_id = existing_customer.id
                updated = True
            elif auto_create:
                new_customer = Customer.objects.create(
                    company=company,
                    phone=norm_phone,
                    name=lead.display_name or (f"Zalo Khách {norm_phone}" if platform == 'zalo' else f"FB Khách {norm_phone}"),
                    source="Zalo" if platform == 'zalo' else "Facebook",
                    status="new",
                    address=lead.detected_address or ""
                )
                lead.is_customer_converted = True
                if platform == 'zalo': lead.customer = new_customer
                elif platform == 'facebook': lead.customer_id = new_customer.id
                updated = True
                
    if updated:
        lead.save()
