import threading
from django.utils import timezone
from .models import AiAgent
from .services import generate_ai_reply
from zalo_integration.models import SocialLead as ZaloLead, ZaloMessage
from facebook_integration.models import FacebookLead, FacebookMessage
from zalo_integration.services import send_zalo_chat_message
from facebook_integration.services import send_facebook_message
import logging
logger = logging.getLogger(__name__)
from celery import shared_task

def get_public_domain():
    import requests
    try:
        res = requests.get("http://host.docker.internal:4040/api/tunnels", headers={"Host": "localhost"}, timeout=2)
        if res.status_code == 200:
            tunnels = res.json().get('tunnels', [])
            if tunnels:
                return tunnels[0]['public_url'].rstrip('/')
    except Exception:
        pass
    
    # Fallback for production or if ngrok not found
    from django.conf import settings
    import os
    return getattr(settings, 'SITE_URL', os.environ.get('SITE_URL', 'https://crm.mlgautobot.click')).rstrip('/')



def search_products_for_carousel(company, keyword: str, limit: int = 3):
    from inventory.models import Product
    from ai_agents.models import AiKnowledgeDocument
    from django.db.models import Q
    
    if not keyword:
        return []
        

    products_query = Q(name__icontains=keyword) | Q(template__description__icontains=keyword) | Q(sku__icontains=keyword)
    for kw in keyword.split():
        if len(kw) >= 3:
            products_query |= Q(name__icontains=kw) | Q(sku__icontains=kw)
            
    products = Product.objects.filter(
        company=company,
        is_active=True
    ).filter(products_query).select_related('template')[:limit]
    
    results = []
    for p in products:
        image_url = None
        if p.image:
            image_url = p.image.url
        elif p.template and p.template.image:
            image_url = p.template.image.url
            
        if image_url:
            if image_url.startswith('/'):
                image_url = f"{get_public_domain()}{image_url}"
                
            results.append({
                'title': p.name,
                'subtitle': f"Mã SP: {p.sku}" if p.sku else "Nhận tư vấn chi tiết",
                'image_url': image_url,
                'sku': p.sku
            })
            
    # Lấy thêm từ Kho tri thức (RAG) không phụ thuộc vào việc đã đủ limit hay chưa

    docs_query = Q(title__icontains=keyword) | Q(content__icontains=keyword)
    for kw in keyword.split():
        if len(kw) >= 3:
            docs_query |= Q(title__icontains=kw) | Q(content__icontains=kw)
            
    docs = AiKnowledgeDocument.objects.filter(
        agent__company=company,
        file_attachment__isnull=False
    ).exclude(file_attachment="").filter(docs_query)[:limit]
    
    for doc in docs:
        file_url = doc.file_attachment.url
        if any(file_url.lower().endswith(ext) for ext in ['.jpg', '.jpeg', '.png', '.webp', '.gif']):
            if file_url.startswith('/'):
                file_url = f"{get_public_domain()}{file_url}"
                
            results.append({
                'title': doc.title,
                'subtitle': "Nhận tư vấn chi tiết",
                'image_url': file_url,
                'sku': f"DOC-{doc.id}"
            })
            
    # Giới hạn lại số lượng cuối cùng sau khi mix
    return results[:limit]

def get_product_context(company, search_query, history=None):
    from inventory.models import Product
    from django.db.models import Q
    
    full_text = (search_query or "").lower()
    if history:
        for h in history:
            if h.get('role') == 'user' and h.get('content'):
                full_text += " " + h['content'].lower()
                
    if not full_text.strip():
        return ""
        
    products = Product.objects.filter(company=company, is_active=True)
    matched_products = []
    for p in products:
        sku = getattr(p, 'sku', "")
        name = getattr(p, 'name', "")
        sku_lower = sku.lower() if sku else ""
        name_lower = name.lower() if name else ""
        
        if (sku_lower and sku_lower in full_text) or (name_lower and len(name_lower) > 4 and name_lower in full_text):
            matched_products.append(p)
            if len(matched_products) >= 3:
                break
    
    context = ""
    if matched_products:
        context += "\n\n[Thông tin Sản phẩm cập nhật mới nhất từ Hệ thống]:\n"
        for p in matched_products:
            desc = getattr(p, 'description', None) or (p.template.description if p.template else "")
            ai_know = getattr(p, 'ai_knowledge', "")
            
            context += f"- Tên: {p.name} (Mã: {p.sku})\n  Giá bán: {getattr(p, 'price', 0):,.0f} VND\n"
            if desc:
                context += f"  Mô tả công khai: {desc}\n"
            if ai_know:
                context += f"  [Lưu ý: Nếu khách đang hỏi về sản phẩm này, hãy ưu tiên dùng thông tin nội bộ sau thay cho tài liệu cũ]: {ai_know}\n"
    return context




def process_ai_reply_zalo(lead_id, is_followup=False, trigger_msg_id=None):
    try:
        lead = ZaloLead.objects.get(id=lead_id)
        if not lead.oa_config or not lead.oa_config.is_ai_active or not lead.oa_config.ai_agent:
            return
        if not lead.is_ai_active and not is_followup:
            return
            
        if not is_followup:
            import time
            delay = lead.oa_config.ai_agent.debounce_delay
            time.sleep(delay)
            
        if not is_followup and trigger_msg_id:
            latest_msg = ZaloMessage.objects.filter(social_lead=lead, direction=ZaloMessage.DIRECTION_INBOUND).order_by('-created_at').first()
            if latest_msg and latest_msg.id != trigger_msg_id:
                logger.info(f"Zalo AI debounce: Bỏ qua tin nhắn cũ {trigger_msg_id} do đã có tin mới {latest_msg.id}")
                return

        # Lấy lịch sử
        messages = ZaloMessage.objects.filter(social_lead=lead).order_by('-created_at')[:10]
        history = []
        visual_search_text = ""
        
        for m in reversed(messages):
            role = 'user' if m.direction == ZaloMessage.DIRECTION_INBOUND else 'assistant'
            msg_dict = {'role': role, 'content': m.content or ''}
            if m.attachment_url:
                msg_dict['image_url'] = m.attachment_url
            if not msg_dict['content'] and not msg_dict.get('image_url'):
                msg_dict['content'] = '([File đính kèm])'
            history.append(msg_dict)
        # RAG Search (Semantic Text Search)
        rag_search_text = ""
        latest_user_msg = messages.first()
        if latest_user_msg and latest_user_msg.direction == ZaloMessage.DIRECTION_INBOUND:
            search_query = latest_user_msg.content or ""
            
            # Nếu tin nhắn có ảnh, dịch ảnh ra text để tìm kiếm
            if latest_user_msg.attachment_url:
                try:
                    from ai_agents.services import generate_image_description, get_api_keys
                    provider = getattr(lead.oa_config.ai_agent.company.ai_settings, 'default_embedding_provider', 'openai')
                    keys = get_api_keys(lead.oa_config.ai_agent.company, provider)
                    if keys:
                        img_desc = generate_image_description(
                            latest_user_msg.attachment_url, 
                            keys, 
                            provider,
                            lead.oa_config.ai_agent.model_name
                        )
                        if img_desc:
                            search_query += f" [Khách gửi ảnh: {img_desc}]"
                except Exception as e:
                    logger.error(f"Error generating image desc for Zalo lead {lead.id}: {e}")

            if search_query.strip():
                from ai_agents.rag_processor import search_knowledge
                rag_search_text = search_knowledge(lead.oa_config.ai_agent, search_query.strip(), limit=4)
                rag_search_text += get_product_context(lead.company, search_query.strip(), history)

        if is_followup:
            drip_hours = lead.oa_config.ai_agent.drip_followup_hours or 24
            history.append({'role': 'system', 'content': f'Khách hàng đã không phản hồi hơn {drip_hours} giờ. Hãy viết một câu chào hỏi, gợi mở hoặc hỏi thăm khéo léo để tiếp tục câu chuyện một cách tự nhiên nhất.'})

        result = generate_ai_reply(lead.oa_config.ai_agent, history, lead.display_name + rag_search_text)
        if result.get('error'):
            logger.error(f"[AI Zalo Internal Error] {result.get('reply')}")
            lead.is_ai_active = False
            lead.has_unread_message = True
            lead.save(update_fields=['is_ai_active', 'has_unread_message'])
            
            if result.get('reply'):
                ZaloMessage.objects.create(
                    company=lead.company,
                    social_lead=lead,
                    direction=ZaloMessage.DIRECTION_OUTBOUND,
                    content="Lỗi phản hồi tự động",
                    payload={"is_system_alert": True, "error_message": result.get('reply')}
                )
            return
            
        ai_agent = lead.oa_config.ai_agent
        
        # 1. Trích xuất dữ liệu
        extracted = result.get('extracted_info', {})
        if isinstance(extracted, dict):
            phone = extracted.get('phone', '')
            if phone and isinstance(phone, str) and 'rỗng' not in phone.lower() and len(phone) > 8 and not lead.detected_phone:
                lead.detected_phone = phone
            address = extracted.get('address', '')
            if address and isinstance(address, str) and 'rỗng' not in address.lower() and len(address) > 5 and not lead.detected_address:
                lead.detected_address = address
                
        # 2. Gắn Tag
        if ai_agent.enable_auto_tagging:
            tags = result.get('tags', [])
            if isinstance(tags, list) and tags:
                clean_tags = [t.strip()[:50] for t in tags if isinstance(t, str) and t.strip()]
                if clean_tags:
                    lead.ai_tags = clean_tags
                        
        # 3. Tóm tắt hội thoại
        if ai_agent.enable_auto_summary:
            summary = result.get('summary', '')
            if summary and isinstance(summary, str):
                lead.ai_summary = summary
                lead.last_message = summary[:250] # ZaloLead uses last_message
                
        # 4. Handoff
        if result.get('sentiment') in ['angry', 'handoff']:
            lead.is_ai_active = False
            lead.has_unread_message = True
            
        lead.save()

        # 5. Gửi tin nhắn (có Human Typing)
        reply_text = result.get('reply')
        image_url = result.get('image_url')
        if image_url and isinstance(image_url, str) and image_url.startswith('/'):
            image_url = f"{get_public_domain()}{image_url}"
            
        # Check for function calling (product search)
        product_search_keyword = result.get('product_search_keyword')
        if product_search_keyword:
            from zalo_integration.services import send_zalo_carousel
            products_for_carousel = search_products_for_carousel(lead.company, product_search_keyword, limit=5)
            if products_for_carousel:
                car_resp = send_zalo_carousel(lead.oa_config, lead.social_id, products_for_carousel)
                car_msg_id = car_resp.get("data", {}).get("message_id", "") if car_resp else ""
                ZaloMessage.objects.create(
                    company=lead.company,
                    social_lead=lead,
                    direction=ZaloMessage.DIRECTION_OUTBOUND,
                    content=f"[Đã gửi Danh sách tìm kiếm: {product_search_keyword}]",
                    attachment_type="carousel",
                    payload=products_for_carousel,
                    zalo_msg_id=car_msg_id
                )

        if not reply_text and not image_url and not product_search_keyword:
            # AI did not return anything to send!
            logger.error(f"[AI Zalo Internal Error] AI returned empty reply for lead {lead.id}")
            ZaloMessage.objects.create(
                company=lead.company,
                social_lead=lead,
                direction=ZaloMessage.DIRECTION_OUTBOUND,
                content="Lỗi phản hồi tự động",
                payload={"is_system_alert": True, "error_message": "AI không tạo ra câu trả lời hợp lệ."}
            )

        if reply_text or image_url:
            if ai_agent.enable_human_typing:
                import time
                delay = min(len(reply_text or '') * 0.03, 5.0) # max 5s delay
                time.sleep(delay)
                
            resp = send_zalo_chat_message(lead.oa_config, lead.social_id, text=reply_text, image_url=image_url)
            
            error_code = resp.get("error", 0)
            
            update_fields = []
            if error_code != 0:
                err_msg = resp.get("message", "")
                logger.error(f"[AI Zalo Error] Zalo API Error {error_code}: {err_msg}")
                lead.is_ai_active = False
                lead.has_unread_message = True
                update_fields.extend(['is_ai_active', 'has_unread_message'])
                
                ZaloMessage.objects.create(
                    company=lead.company,
                    social_lead=lead,
                    direction=ZaloMessage.DIRECTION_OUTBOUND,
                    content="Lỗi gửi tin",
                    payload={"is_system_alert": True, "error_code": error_code, "error_message": err_msg}
                )
            else:
                ZaloMessage.objects.create(
                    company=lead.company,
                    social_lead=lead,
                    direction=ZaloMessage.DIRECTION_OUTBOUND,
                    content=reply_text or "[Hình ảnh]",
                    zalo_msg_id=resp.get("data", {}).get("message_id", "") if resp and "data" in resp else ""
                )
                
                if lead.is_ai_active:
                    lead.has_unread_message = False
                    lead.unread_count = 0
                    update_fields.extend(['has_unread_message', 'unread_count'])
            if is_followup:
                lead.has_ai_followed_up = True
                update_fields.append('has_ai_followed_up')
            if update_fields:
                lead.save(update_fields=update_fields)
    except Exception as e:
        logger.error(f'Zalo AI Task Error: {e}')

def process_ai_reply_facebook(lead_id, is_followup=False, trigger_msg_id=None):
    try:
        lead = FacebookLead.objects.get(id=lead_id)
        if not lead.page_config or not lead.page_config.is_ai_active or not lead.page_config.ai_agent:
            return
        if not lead.is_ai_active and not is_followup:
            return
            
        if not is_followup:
            import time
            delay = lead.page_config.ai_agent.debounce_delay
            time.sleep(delay)
            
        if not is_followup and trigger_msg_id:
            latest_msg = FacebookMessage.objects.filter(lead=lead, sender_type='customer').order_by('-created_at').first()
            if latest_msg and latest_msg.id != trigger_msg_id:
                logger.info(f"Facebook AI debounce: Bỏ qua tin nhắn cũ {trigger_msg_id} do đã có tin mới {latest_msg.id}")
                return

        messages = FacebookMessage.objects.filter(lead=lead).order_by('-created_at')[:10]
        history = []
        visual_search_text = ""
        
        for m in reversed(messages):
            role = 'user' if m.sender_type == 'customer' else 'assistant'
            msg_dict = {'role': role, 'content': m.text or ''}
            if m.attachment_url:
                msg_dict['image_url'] = m.attachment_url
            if not msg_dict['content'] and not msg_dict.get('image_url'):
                msg_dict['content'] = '([File đính kèm])'
            history.append(msg_dict)
        # RAG Search (Semantic Text Search)
        rag_search_text = ""
        latest_user_msg = messages.first()
        if latest_user_msg and latest_user_msg.sender_type == 'customer':
            search_query = latest_user_msg.text or ""
            
            # Nếu tin nhắn có ảnh, dịch ảnh ra text để tìm kiếm
            if latest_user_msg.attachment_url:
                try:
                    from ai_agents.services import generate_image_description, get_api_keys
                    provider = getattr(lead.page_config.ai_agent.company.ai_settings, 'default_embedding_provider', 'openai')
                    keys = get_api_keys(lead.page_config.ai_agent.company, provider)
                    if keys:
                        img_desc = generate_image_description(
                            latest_user_msg.attachment_url, 
                            keys, 
                            provider,
                            lead.page_config.ai_agent.model_name
                        )
                        if img_desc:
                            search_query += f" [Khách gửi ảnh: {img_desc}]"
                except Exception as e:
                    logger.error(f"Error generating image desc for FB lead {lead.id}: {e}")

            if search_query.strip():
                from ai_agents.rag_processor import search_knowledge
                rag_search_text = search_knowledge(lead.page_config.ai_agent, search_query.strip(), limit=4)
                rag_search_text += get_product_context(lead.company, search_query.strip(), history)
        if is_followup:
            drip_hours = lead.page_config.ai_agent.drip_followup_hours or 24
            history.append({'role': 'system', 'content': f'Khách hàng đã không phản hồi hơn {drip_hours} giờ. Hãy viết một câu chào hỏi, gợi mở hoặc hỏi thăm khéo léo để tiếp tục câu chuyện một cách tự nhiên nhất.'})

        result = generate_ai_reply(lead.page_config.ai_agent, history, lead.fb_user_name + rag_search_text)
        if result.get('error'):
            logger.error(f"[AI Facebook Internal Error] {result.get('reply')}")
            lead.is_ai_active = False
            lead.has_unread_message = True
            lead.save(update_fields=['is_ai_active', 'has_unread_message'])
            
            if result.get('reply'):
                FacebookMessage.objects.create(
                    lead=lead,
                    sender_type='page',
                    text="Lỗi phản hồi tự động",
                    payload={"is_system_alert": True, "error_message": result.get('reply')}
                )
            return

        ai_agent = lead.page_config.ai_agent

        # 1. Trích xuất dữ liệu
        extracted = result.get('extracted_info', {})
        if isinstance(extracted, dict):
            phone = extracted.get('phone', '')
            if phone and isinstance(phone, str) and 'rỗng' not in phone.lower() and len(phone) > 8 and not lead.detected_phone:
                lead.detected_phone = phone
            address = extracted.get('address', '')
            if address and isinstance(address, str) and 'rỗng' not in address.lower() and len(address) > 5 and not lead.detected_address:
                lead.detected_address = address
                
        # 2. Gắn Tag
        if ai_agent.enable_auto_tagging:
            tags = result.get('tags', [])
            if isinstance(tags, list) and tags:
                clean_tags = [t.strip()[:50] for t in tags if isinstance(t, str) and t.strip()]
                if clean_tags:
                    lead.ai_tags = clean_tags
                        
        # 3. Tóm tắt hội thoại
        if ai_agent.enable_auto_summary:
            summary = result.get('summary', '')
            if summary and isinstance(summary, str):
                lead.ai_summary = summary
                lead.last_message_preview = summary[:250] # FacebookLead uses last_message_preview
                
        # 4. Handoff
        if result.get('sentiment') in ['angry', 'handoff']:
            lead.is_ai_active = False
            lead.has_unread_message = True
            
        lead.save()

        # 5. Gửi tin nhắn (có Human Typing)
        reply_text = result.get('reply')
        image_url = result.get('image_url')
        if image_url and isinstance(image_url, str) and image_url.startswith('/'):
            image_url = f"{get_public_domain()}{image_url}"
            
        if reply_text or image_url:
            if ai_agent.enable_human_typing:
                import time
                delay = min(len(reply_text or '') * 0.03, 5.0) # max 5s delay
                # Facebook supports typing_on
                import requests
                url = f"https://graph.facebook.com/v19.0/me/messages?access_token={lead.page_config.page_access_token}"
                payload = {
                    "recipient": {"id": lead.fb_user_id},
                    "sender_action": "typing_on"
                }
                requests.post(url, json=payload)
                time.sleep(delay)

        # Check for function calling (product search)
        product_search_keyword = result.get('product_search_keyword')
        if product_search_keyword:
            from facebook_integration.services import send_facebook_carousel
            products_for_carousel = search_products_for_carousel(lead.company, product_search_keyword, limit=5)
            if products_for_carousel:
                car_resp = send_facebook_carousel(lead.page_config.page_access_token, lead.fb_user_id, products_for_carousel)
                # KHÔNG tạo FacebookMessage ở đây nữa vì webhook message_echoes sẽ tự động tạo tin nhắn này trên hệ thống
                pass

        if not reply_text and not image_url and not products_for_carousel:
            # AI did not return anything to send!
            logger.error(f"[AI Facebook Internal Error] AI returned empty reply for lead {lead.id}")
            FacebookMessage.objects.create(
                lead=lead,
                sender_type='page',
                text="Lỗi phản hồi tự động",
                payload={"is_system_alert": True, "error_message": "AI không tạo ra câu trả lời hợp lệ."}
            )

        update_fields = []
        if reply_text or image_url:
            resp = send_facebook_message(lead.page_config.page_access_token, lead.fb_user_id, message_text=reply_text, attachment_url=image_url)
            if not resp.get("success"):
                err_msg = resp.get("error", "Unknown error")
                logger.error(f"[AI Facebook Error] Facebook API Error: {err_msg}")
                lead.is_ai_active = False
                lead.has_unread_message = True
                update_fields.extend(['is_ai_active', 'has_unread_message'])
                
                FacebookMessage.objects.create(
                    lead=lead,
                    sender_type='page',
                    text="Lỗi gửi tin",
                    payload={"is_system_alert": True, "error_message": err_msg}
                )
            else:
                # KHÔNG tạo FacebookMessage cục bộ nữa vì webhook message_echoes sẽ chịu trách nhiệm tạo.
                # Tránh tình trạng lưu trùng 2 tin nhắn trên giao diện.
                pass
                
                if lead.is_ai_active:
                    lead.has_unread_message = False
                    lead.unread_count = 0
                    update_fields.extend(['has_unread_message', 'unread_count'])
            if is_followup:
                lead.has_ai_followed_up = True
                update_fields.append('has_ai_followed_up')
            if update_fields:
                lead.save(update_fields=update_fields)
    except Exception as e:
        logger.error(f'Facebook AI Task Error: {e}')

def trigger_zalo_ai(lead_id, is_followup=False):
    from zalo_integration.models import ZaloMessage
    latest_msg = None
    if not is_followup:
        latest_msg = ZaloMessage.objects.filter(social_lead_id=lead_id, direction=ZaloMessage.DIRECTION_INBOUND).order_by('-created_at').first()
    msg_id = latest_msg.id if latest_msg else None
    threading.Thread(target=process_ai_reply_zalo, args=(lead_id, is_followup, msg_id)).start()

def trigger_facebook_ai(lead_id, is_followup=False):
    from facebook_integration.models import FacebookMessage
    latest_msg = None
    if not is_followup:
        latest_msg = FacebookMessage.objects.filter(lead_id=lead_id, sender_type='customer').order_by('-created_at').first()
    msg_id = latest_msg.id if latest_msg else None
    threading.Thread(target=process_ai_reply_facebook, args=(lead_id, is_followup, msg_id)).start()

from celery import shared_task
from datetime import timedelta

@shared_task(name="ai_agents.drip_followup")
def ai_drip_followup():
    """
    Tự động follow-up khách hàng nếu không phản hồi sau số giờ cấu hình (mặc định 24h).
    """
    logger.info("[AI FollowUp] Bắt đầu quét follow-up...")
    now = timezone.now()
    
    # Lấy danh sách các agent có bật tính năng follow-up
    agents = AiAgent.objects.filter(enable_drip_followup=True, is_active=True)
    
    for agent in agents:
        hours = agent.drip_followup_hours or 24
        cutoff_start = now - timedelta(hours=hours + 1)
        cutoff_end = now - timedelta(hours=hours)
        
        # 1. Quét Zalo
        zalo_leads = ZaloLead.objects.filter(
            is_customer_converted=False,
            has_ai_followed_up=False,
            has_unread_message=False,
            oa_config__ai_agent=agent,
            last_interaction_date__gte=cutoff_start,
            last_interaction_date__lte=cutoff_end
        )
        
        for lead in zalo_leads:
            logger.info(f"[AI FollowUp] Trigger Zalo Follow-up cho {lead.social_id} sau {hours}h")
            trigger_zalo_ai(lead.id, is_followup=True)

        # 2. Quét Facebook
        fb_leads = FacebookLead.objects.filter(
            is_customer_converted=False,
            has_ai_followed_up=False,
            has_unread_message=False,
            page_config__ai_agent=agent,
            last_message_at__gte=cutoff_start,
            last_message_at__lte=cutoff_end
        )

        for lead in fb_leads:
            logger.info(f"[AI FollowUp] Trigger Facebook Follow-up cho {lead.fb_user_id} sau {hours}h")
            trigger_facebook_ai(lead.id, is_followup=True)
            
    logger.info("[AI FollowUp] Hoàn thành quét follow-up.")



@shared_task
def sync_ai_model_pricing():
    import requests
    from decimal import Decimal
    from .models import AiModelPricing, SystemAiKey, CompanyAiKey
    import logging
    logger = logging.getLogger(__name__)
    
    # Thu thập danh sách mô hình thực tế từ API
    allowed_models = set([
        'claude-3-5-sonnet-20241022', 'claude-3-5-haiku-20241022', 
        'claude-opus-4-5', 'claude-sonnet-4-5'
    ])
    
    # Lấy 1 key active cho OpenAI
    openai_key = SystemAiKey.objects.filter(provider='openai', is_active=True).first()
    if not openai_key:
        openai_key = CompanyAiKey.objects.filter(provider='openai', is_active=True).first()
    if openai_key:
        try:
            from openai import OpenAI
            client = OpenAI(api_key=openai_key.api_key)
            models = client.models.list()
            for m in models.data:
                allowed_models.add(m.id)
        except Exception as e:
            logger.error(f'OpenAI fetch models error: {e}')

    # Lấy 1 key active cho Gemini
    gemini_key = SystemAiKey.objects.filter(provider='gemini', is_active=True).first()
    if not gemini_key:
        gemini_key = CompanyAiKey.objects.filter(provider='gemini', is_active=True).first()
    if gemini_key:
        try:
            from google import genai as google_genai
            client = google_genai.Client(api_key=gemini_key.api_key)
            for m in client.models.list():
                if hasattr(m, 'supported_actions') and m.supported_actions and 'generateContent' in m.supported_actions:
                    allowed_models.add(m.name.replace('models/', ''))
        except Exception as e:
            logger.error(f'Gemini fetch models error: {e}')

    url = 'https://raw.githubusercontent.com/BerriAI/litellm/main/model_prices_and_context_window.json'
    logger.info(f'Đang đồng bộ giá AI từ: {url}')
    
    try:
        response = requests.get(url, timeout=15)
        response.raise_for_status()
        data = response.json()
        
        updated_count = 0
        created_count = 0
        
        for model_name, info in data.items():
            if not isinstance(info, dict):
                continue
                
            input_price = info.get('input_cost_per_token', 0)
            output_price = info.get('output_cost_per_token', 0)
            provider = info.get('litellm_provider', 'unknown')
            
            if provider not in ['openai', 'gemini', 'anthropic']:
                continue
                
            if model_name not in allowed_models:
                clean_name = model_name.split('/')[-1]
                if clean_name not in allowed_models:
                    continue
                model_name = clean_name
            else:
                model_name = model_name.split('/')[-1]
            
            if input_price is None or output_price is None:
                continue
                
            try:
                input_per_1m = Decimal(str(input_price)) * Decimal('1000000')
                output_per_1m = Decimal(str(output_price)) * Decimal('1000000')
                
                pricing, created = AiModelPricing.objects.get_or_create(
                    model_name=model_name,
                    defaults={
                        'provider': provider,
                        'input_price_per_1m': input_per_1m,
                        'output_price_per_1m': output_per_1m
                    }
                )
                
                if created:
                    created_count += 1
                else:
                    if not pricing.is_custom:
                        pricing.provider = provider
                        pricing.input_price_per_1m = input_per_1m
                        pricing.output_price_per_1m = output_per_1m
                        pricing.save(update_fields=['provider', 'input_price_per_1m', 'output_price_per_1m', 'updated_at'])
                        updated_count += 1
            except Exception as e:
                logger.error(f'Lỗi parse {model_name}: {e}')
                
        logger.info(f'Xong. Tạo mới {created_count}, Cập nhật {updated_count}')
        return {'created': created_count, 'updated': updated_count}
    except Exception as e:
        logger.error(f'Lỗi đồng bộ: {e}')
        return {'error': str(e)}

@shared_task
def process_document_rag(doc_id):
    """
    Celery task để xử lý tài liệu RAG ngầm.
    """
    from .models import AiKnowledgeDocument
    from .rag_processor import process_and_save_document
    from .services import get_api_keys
    
    try:
        doc = AiKnowledgeDocument.objects.get(id=doc_id)
        provider = getattr(doc.agent.company.ai_settings, 'default_embedding_provider', 'openai')
        
        # Lưu lại nền tảng đọc vào doc
        doc.embedding_provider = provider
        doc.save(update_fields=['embedding_provider'])
        
        # Lấy API key dựa trên provider đã chọn
        keys = get_api_keys(doc.agent.company, provider)
        if not keys:
            raise ValueError(f"Chưa cấu hình API Key cho {provider.upper()}")

        # Nếu là tài liệu dạng ảnh, dùng AI để dịch ảnh ra text trước
        if doc.doc_type == 'image' and doc.file_attachment:
            from .services import generate_image_description
            image_url = doc.file_attachment.url
            if image_url.startswith('/'):
                image_url = f"{get_public_domain()}{image_url}"
                
            description = generate_image_description(image_url, keys, provider, doc.agent.model_name)
            if description:
                doc.image_description = description
                # Gộp mô tả vào content để RAG nhúng vector
                if doc.content:
                    import re
                    new_content = re.sub(r'\[Mô tả ảnh\]:.*$', '', doc.content, flags=re.DOTALL).strip()
                    if new_content:
                        doc.content = f"{new_content}\n\n[Mô tả ảnh]: {description}"
                    else:
                        doc.content = f"[Mô tả ảnh]: {description}"
                else:
                    doc.content = f"[Mô tả ảnh]: {description}"
                doc.save(update_fields=['image_description', 'content'])
            
        # Thực hiện xử lý RAG (Text) - truyền toàn bộ danh sách keys để xoay vòng
        process_and_save_document(doc.id, keys, provider)
    except Exception as e:
        # Catch any unexpected errors
        try:
            doc = AiKnowledgeDocument.objects.get(id=doc_id)
            doc.status = 'failed'
            doc.error_message = str(e)
            doc.save()
        except:
            pass


@shared_task
def sync_company_products_to_rag(company_id):
    """
    Task ngầm đồng bộ toàn bộ sản phẩm của công ty vào Knowledge Base của AI.
    """
    from inventory.models import Product
    from .models import AiKnowledgeDocument, AiAgent
    
    products = Product.objects.filter(company_id=company_id).order_by('name')
    if not products.exists():
        return
        
    # Tạo nội dung tổng hợp
    content_lines = ["# BẢNG GIÁ VÀ THÔNG SỐ SẢN PHẨM / DỊCH VỤ\n"]
    for p in products:
        line = f"- Tên sản phẩm: {p.name}"
        if getattr(p, 'sku', None):
            line += f" (Mã: {p.sku})"
        if getattr(p, 'price', None):
            line += f" | Giá bán: {p.price:,.0f} VNĐ"
        if getattr(p, 'unit', None):
            line += f" / {p.get_unit_display()}"
        
        description = getattr(p, 'description', None) or (getattr(p.template, 'description', None) if p.template else None)
        if description:
            line += f" | Mô tả: {description}"
            
        ai_knowledge = getattr(p, 'ai_knowledge', None)
        if ai_knowledge:
            line += f" | KIẾN THỨC BÁN HÀNG DÀNH CHO AI: {ai_knowledge}"
            
        img_url = None
        if getattr(p, 'image', None):
            img_url = p.image.url
        elif p.template and getattr(p.template, 'image', None):
            img_url = p.template.image.url
            
        if img_url:
            line += f" | Hình ảnh (URL): {img_url}"
            
        content_lines.append(line)
        
    full_content = "\n".join(content_lines)
    
    # Lấy Agent đầu tiên của công ty để gán tài liệu (tạm thời)
    # Trong tương lai có thể gán cho toàn bộ Agent
    first_agent = AiAgent.objects.filter(company_id=company_id).first()
    if not first_agent:
        return
        
    provider = getattr(first_agent.company.ai_settings, 'default_embedding_provider', 'openai')
    doc, created = AiKnowledgeDocument.objects.get_or_create(
        agent=first_agent,
        title='Danh mục Sản phẩm Hệ thống (Auto)',
        doc_type='file',
        defaults={'content': full_content, 'status': 'pending', 'embedding_provider': provider}
    )
    
    if not created:
        doc.content = full_content
        doc.status = 'pending'
        doc.embedding_provider = provider
        doc.save()
        
    # Kích hoạt học RAG
    process_document_rag.delay(doc.id)

@shared_task
def sync_product_image_description(template_id):
    """
    Dịch ảnh của ProductTemplate thành văn bản để dùng cho RAG.
    """
    from inventory.models import ProductTemplate
    from .services import generate_image_description, get_api_keys
    
    try:
        template = ProductTemplate.objects.get(id=template_id)
        if not template.image:
            return
            
        provider = getattr(template.company.ai_settings, 'default_embedding_provider', 'openai')
        keys = get_api_keys(template.company, provider)
        if not keys:
            return
            
        image_url = template.image.url
        if image_url.startswith('/'):
            image_url = f"{get_public_domain()}{image_url}"
            
        agent = template.company.ai_agents.first()
        model_name = agent.model_name if agent else None
        desc = generate_image_description(image_url, keys, provider, model_name)
        if desc:
            template.image_description = desc
            template.save(update_fields=['image_description'])
            
            # Cập nhật lại toàn bộ RAG cho công ty này
            sync_company_products_to_rag.delay(template.company_id)
            
    except Exception as e:
        logger.error(f"Error generating image description for template {template_id}: {e}")

@shared_task
def summarize_facebook_conversation(lead_id, customer_id, action_user_id=None):
    from facebook_integration.models import FacebookLead, FacebookMessage
    from crm.models import Customer, CustomerInteraction
    from users.models import User
    from .services import generate_ai_reply
    try:
        lead = FacebookLead.objects.get(id=lead_id)
        if not lead.page_config or not lead.page_config.ai_agent_id:
            return
            
        messages = FacebookMessage.objects.filter(lead=lead).order_by('-created_at')[:10]
        history = []
        for m in reversed(messages):
            role = 'user' if m.sender_type == 'customer' else 'assistant'
            msg_dict = {'role': role, 'content': m.text or ''}
            if m.attachment_url:
                msg_dict['image_url'] = m.attachment_url
            if not msg_dict['content'] and not msg_dict.get('image_url'):
                msg_dict['content'] = '([File đính kèm])'
            history.append(msg_dict)
            
        result = generate_ai_reply(lead.page_config.ai_agent, history, lead.fb_user_name)
        if result and not result.get('error'):
            summary = result.get('summary', '')
            if summary:
                lead.ai_summary = summary
                lead.save(update_fields=['ai_summary'])
                
                customer = Customer.objects.filter(id=customer_id).first()
                creator = User.objects.filter(id=action_user_id).first() if action_user_id else lead.assigned_to
                if not creator:
                    creator = User.objects.filter(company=lead.company).first()
                    
                if customer and creator:
                    CustomerInteraction.objects.create(
                        customer=customer,
                        type="system",
                        content=f"[AI Tóm tắt Hội thoại Facebook]\n{summary}",
                        created_by=creator
                    )
    except Exception as e:
        logger.error(f"Error summarizing facebook conversation {lead_id}: {e}")

@shared_task
def summarize_zalo_conversation(lead_id, customer_id, action_user_id=None):
    from zalo_integration.models import SocialLead, ZaloMessage
    from crm.models import Customer, CustomerInteraction
    from users.models import User
    from .services import generate_ai_reply
    try:
        lead = SocialLead.objects.get(id=lead_id)
        if not lead.oa_config or not lead.oa_config.ai_agent_id:
            return
            
        messages = ZaloMessage.objects.filter(social_lead=lead).order_by('-created_at')[:10]
        history = []
        for m in reversed(messages):
            role = 'user' if m.direction == ZaloMessage.DIRECTION_INBOUND else 'assistant'
            msg_dict = {'role': role, 'content': m.content or ''}
            if m.attachment_url:
                msg_dict['image_url'] = m.attachment_url
            if not msg_dict['content'] and not msg_dict.get('image_url'):
                msg_dict['content'] = '([File đính kèm])'
            history.append(msg_dict)
            
        result = generate_ai_reply(lead.oa_config.ai_agent, history, lead.display_name)
        if result and not result.get('error'):
            summary = result.get('summary', '')
            if summary:
                lead.ai_summary = summary
                lead.save(update_fields=['ai_summary'])
                
                customer = Customer.objects.filter(id=customer_id).first()
                creator = User.objects.filter(id=action_user_id).first() if action_user_id else lead.assigned_to
                if not creator:
                    creator = User.objects.filter(company=lead.company).first()
                    
                if customer and creator:
                    CustomerInteraction.objects.create(
                        customer=customer,
                        type="system",
                        content=f"[AI Tóm tắt Hội thoại Zalo]\n{summary}",
                        created_by=creator
                    )
    except Exception as e:
        logger.error(f"Error summarizing zalo conversation {lead_id}: {e}")

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
