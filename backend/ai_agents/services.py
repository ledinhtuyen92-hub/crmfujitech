import json
import logging
from django.conf import settings
from .models import SystemAiKey, CompanyAiSettings, AiAgent

# Import AI Providers
from openai import OpenAI
from google import genai as google_genai
from google.genai import types as genai_types
import anthropic

logger = logging.getLogger(__name__)

# ========================================================
# ► HẰNG DẪN JSON CHO AI: Điều chỉnh ở đây hoặc trực tiếp trên Giao diện
# (Khi để trống trường Core Prompt trên UI, hệ thống sẽ dùng mẫu dưới đây)
# ========================================================
DEFAULT_JSON_TEMPLATE = """{
    "thought": "Phân tích tâm lý khách. Quyết định chiến thuật: Ưu tiên đặt câu hỏi mở để giữ tương tác. CHỈ xin SĐT khi khách đã rất quan tâm, cần báo giá chi tiết, hoặc cần khảo sát tận nơi. Tuyệt đối không xin số dồn dập ở những câu đầu.",
    "reply": "Câu trả lời gửi khách. NẾU BẠN GỬI ẢNH (Bằng product_search_keyword) thì BẮT BUỘC trong câu trả lời phải nhắc đến việc bạn đang gửi ảnh (Ví dụ: 'Để em gửi anh vài mẫu nhé'). LUÔN KẾT THÚC bằng một câu hỏi mở để khách phản hồi, trừ khi đã chốt được SĐT. ĐIỀN '[STOP]' NẾU KHÁCH CHỈ NHẮN NGẮN GỌN XÁC NHẬN (Ok, vâng, dạ...) HOẶC THẢ TIM VÀ HỘI THOẠI ĐÃ KẾT THÚC.",
    "sentiment": "angry / handoff / neutral",
    "image_url": "Trích xuất chính xác Đường link (URL) của ảnh từ [TRÍCH XUẤT KIẾN THỨC NỘI BỘ] nếu có (Ví dụ: ![ảnh](https://abc.com/1.jpg) thì điền https://abc.com/1.jpg). TUYỆT ĐỐI KHÔNG lấy link ảnh từ tin nhắn của khách hàng. Tuyệt đối không tự bịa ra link.",
    "product_search_keyword": "BẮT BUỘC ĐIỀN TỪ KHÓA NẾU KHÁCH YÊU CẦU 'gửi ảnh', 'cho xem VÀI MẪU'. LƯU Ý: Phải điền CHÍNH XÁC và ĐẦY ĐỦ tên dòng sản phẩm (VD: 'Cửa composite 1 cánh', 'Tủ lạnh Samsung Inverter') thay vì điền chung chung ('Cửa', 'Tủ lạnh') để tránh hệ thống gửi nhầm sang các phụ kiện. Nếu không cần tìm ảnh thì ĐỂ TRỐNG.",
    "extracted_info": {
        "phone": "Trích xuất SĐT nếu có (nếu không có thì để rỗng)",
        "address": "Trích xuất địa chỉ nếu có (nếu không có thì để rỗng)",
        "notes": "Ghi chú (size, màu sắc, mã sản phẩm cần tư vấn...)"
    },
    "tags": ["Hỏi giá", "Khách VIP", "Đã chốt"...],
    "summary": "Tóm tắt ngắn gọn lịch sử chat"
}"""

DEFAULT_SYSTEM_RULES = """Nhiệm vụ của bạn là tư vấn tận tình, chuyên nghiệp và hỗ trợ khách hàng.
NGUYÊN TẮC QUAN TRỌNG: 
1. Tuyệt đối KHÔNG gọi đích danh tên khách hàng trong câu trả lời. Chỉ xưng hô chung là "anh" hoặc "chị" (tự suy đoán giới tính hoặc dùng "anh/chị").
2. Luôn ưu tiên trả lời TRỰC TIẾP vào câu hỏi cuối cùng hoặc HÌNH ẢNH cuối cùng khách gửi. Nếu khách gửi ảnh, phải tập trung tư vấn về sản phẩm trong ảnh (dựa vào RAG Context) thay vì bị phân tâm bởi các sản phẩm ở tin nhắn cũ.
3. KHÔNG XIN SỐ ĐIỆN THOẠI liên tục. Chỉ khéo léo xin SĐT khi khách hàng đã thực sự quan tâm, ưng ý sản phẩm.
4. Luôn duy trì cuộc hội thoại bằng cách đặt CÂU HỎI MỞ ở cuối câu trả lời để kích thích khách hàng tương tác (hỏi về sở thích, màu sắc, kích thước, nhu cầu...).
5. Khi khách gửi VIDEO ([Video đính kèm]), AUDIO ([Audio đính kèm]) hoặc TỆP ([Tệp đính kèm]): Hãy phản hồi thân thiện, xác nhận đã nhận được (ví dụ: "Dạ, em đã nhận được video/file anh chị gửi ạ"), sau đó chủ động hỏi thêm thông tin hoặc gợi ý tư vấn liên quan. Không nói rằng bạn không xem được video.
6. QUY TẮC DỪNG HỘI THOẠI [STOP]: 
- NẾU CHƯA LẤY ĐƯỢC SỐ ĐIỆN THOẠI CỦA KHÁCH: TUYỆT ĐỐI KHÔNG ĐƯỢC DỪNG (không được xuất [STOP]). Dù khách chỉ nhắn "ok", "vâng", gửi icon 👍, thả tim... bạn VẪN PHẢI tiếp tục trả lời, chủ động khơi gợi nhu cầu, mời chào hoặc nhắc khéo lại lời đề nghị xin số điện thoại/hẹn lịch.
- CHỈ ĐƯỢC PHÉP điền "[STOP]" vào trường "reply" (để giữ im lặng) KHI VÀ CHỈ KHI: Bạn ĐÃ CÓ số điện thoại của khách, hoặc cuộc tư vấn đã hoàn toàn kết thúc (bạn đã chào tạm biệt) VÀ tin nhắn cuối cùng của khách chỉ là xác nhận ngắn gọn ("ok", "cảm ơn", thả tim 👍)."""

def get_provider_for_model(model_name: str) -> str:
    if not model_name:
        return 'openai'
    if 'gpt' in model_name.lower():
        return 'openai'
    elif 'gemini' in model_name.lower():
        return 'gemini'
    elif 'claude' in model_name.lower():
        return 'anthropic'
    return 'openai'

def get_api_keys(company, provider: str) -> list:
    """
    Trả về danh sách các API Key theo thứ tự ưu tiên.
    - Bước 1: Lấy toàn bộ CompanyAiKey đang is_active=True của provider đó, sắp xếp theo priority giảm dần.
    - Bước 2: Nếu CompanyAiSettings.use_system_keys đang là True, lấy thêm danh sách Key hệ thống ghép vào sau.
    """
    keys = []
    
    # 1. Lấy danh sách Key cá nhân của công ty
    from .models import CompanyAiKey
    company_keys = CompanyAiKey.objects.filter(
        company=company, 
        provider=provider, 
        is_active=True
    ).order_by('-priority', '-created_at')
    
    for ck in company_keys:
        if ck.api_key and ck.api_key.strip():
            keys.append(ck.api_key.strip())
            
    # 2. Kiểm tra xem công ty có dùng Quota dự phòng không
    try:
        company_settings = CompanyAiSettings.objects.get(company=company)
        use_system_keys = company_settings.use_system_keys
    except CompanyAiSettings.DoesNotExist:
        use_system_keys = False
        
    if use_system_keys:
        system_keys = SystemAiKey.objects.filter(is_active=True, provider=provider).order_by('-priority')
        for sk in system_keys:
            if sk.api_key and sk.api_key.strip():
                keys.append(sk.api_key.strip())
                
    return keys

def call_openai(api_key, agent, system_prompt, conversation_history):
    client = OpenAI(api_key=api_key)
    messages = [{'role': 'system', 'content': system_prompt}]
    for msg in conversation_history[-10:]:
        if msg.get('image_url'):
            content = []
            if msg.get('content'):
                content.append({"type": "text", "text": msg['content']})
                
            import requests
            import base64
            img_url_payload = {"url": msg['image_url']}
            try:
                resp = requests.get(msg['image_url'], timeout=10)
                if resp.status_code == 200:
                    mime_type = resp.headers.get('content-type', 'image/jpeg')
                    b64 = base64.b64encode(resp.content).decode('utf-8')
                    img_url_payload = {"url": f"data:{mime_type};base64,{b64}"}
            except Exception as e:
                logger.error(f"OpenAI image download error: {e}")
                
            content.append({
                "type": "image_url",
                "image_url": img_url_payload
            })
            messages.append({'role': msg['role'], 'content': content})
        else:
            messages.append({'role': msg['role'], 'content': msg.get('content', '')})

    response = client.chat.completions.create(
        model=agent.model_name or 'gpt-4o-mini',
        messages=messages,
        temperature=agent.temperature,
        response_format={ "type": "json_object" }
    )
    usage = {
        'input': response.usage.prompt_tokens if hasattr(response, 'usage') and response.usage else 0,
        'output': response.usage.completion_tokens if hasattr(response, 'usage') and response.usage else 0,
    }
    return json.loads(response.choices[0].message.content), usage

def call_gemini(api_key, agent, system_prompt, conversation_history):
    client = google_genai.Client(api_key=api_key)
    
    # Build contents from conversation history  
    raw_contents = []
    for msg in conversation_history[-10:]:
        role = 'model' if msg['role'] == 'assistant' else 'user'
        parts = []
        if msg.get('content'):
            parts.append(genai_types.Part.from_text(text=msg['content']))
            
        if msg.get('image_url'):
            import requests
            try:
                resp = requests.get(msg['image_url'], timeout=10)
                if resp.status_code == 200:
                    mime_type = resp.headers.get('content-type', 'image/jpeg')
                    if not mime_type.startswith('image/'):
                        mime_type = 'image/jpeg'
                    parts.append(genai_types.Part.from_bytes(data=resp.content, mime_type=mime_type))
            except Exception as e:
                logger.error(f"Gemini image download error: {e}")
                
        if not parts:
            parts.append(genai_types.Part.from_text(text="[Tin nhắn trống]"))
            
        raw_contents.append((role, parts))
        
    # Gemini requires strictly alternating roles and must end with 'user'.
    merged_contents = []
    for role, parts in raw_contents:
        if not merged_contents:
            merged_contents.append({'role': role, 'parts': parts})
        elif merged_contents[-1]['role'] == role:
            merged_contents[-1]['parts'].extend(parts)
        else:
            merged_contents.append({'role': role, 'parts': parts})
            
    if merged_contents and merged_contents[-1]['role'] == 'model':
        merged_contents.append({'role': 'user', 'parts': [genai_types.Part.from_text(text="[Khách hàng đang chờ phản hồi, hãy tiếp tục tư vấn]")]})
        
    contents = [genai_types.Content(role=c['role'], parts=c['parts']) for c in merged_contents]
    
    model_name = agent.model_name or 'gemini-2.0-flash'
    # Remove 'models/' prefix if present
    if model_name.startswith('models/'):
        model_name = model_name[7:]
    
    response = client.models.generate_content(
        model=model_name,
        contents=contents,
        config=genai_types.GenerateContentConfig(
            system_instruction=system_prompt,
            temperature=agent.temperature,
            response_mime_type='application/json',
        )
    )
    
    # Extract usage from Gemini response
    usage = {'input': 0, 'output': 0}
    try:
        if hasattr(response, 'usage_metadata') and response.usage_metadata:
            usage['input'] = response.usage_metadata.prompt_token_count or 0
            usage['output'] = response.usage_metadata.candidates_token_count or 0
    except:
        pass
        
    return json.loads(response.text), usage

def call_anthropic(api_key, agent, system_prompt, conversation_history):
    client = anthropic.Anthropic(api_key=api_key)
    messages = []
    for msg in conversation_history[-10:]:
        # Anthropic uses 'user' and 'assistant' ONLY
        messages.append({'role': msg['role'], 'content': msg['content']})

    response = client.messages.create(
        model=agent.model_name or 'claude-3-5-sonnet-20240620',
        max_tokens=1024,
        temperature=agent.temperature,
        system=system_prompt,
        messages=messages
    )
    text_content = response.content[0].text
    if "```json" in text_content:
        text_content = text_content.split("```json")[1].split("```")[0]
        
    usage = {
        'input': response.usage.input_tokens if hasattr(response, 'usage') and response.usage else 0,
        'output': response.usage.output_tokens if hasattr(response, 'usage') and response.usage else 0,
    }
    return json.loads(text_content.strip()), usage

def generate_image_description(image_url: str, api_keys, provider: str = 'gemini', model_name: str = None) -> str:
    """
    Sử dụng Gemini/OpenAI Vision API để mô tả hình ảnh thành văn bản.
    api_keys: một key đơn (str) hoặc danh sách keys (list) để xoay vòng.
    """
    if isinstance(api_keys, str):
        api_keys = [api_keys]
    
    system_prompt = "Hãy mô tả thật chi tiết bức ảnh này (đây là sản phẩm gì, màu sắc, kiểu dáng, chất liệu, tính năng, hoặc nội dung chữ nếu có). Chỉ mô tả những gì thấy được trong ảnh bằng 1-2 câu ngắn gọn, không giải thích thêm."
    
    if not model_name:
        model_name = 'gemini-2.0-flash' if provider == 'gemini' else 'gpt-4o-mini'
    if model_name.startswith('models/'):
        model_name = model_name[7:]
    
    for api_key in api_keys:
        try:
            if provider == 'gemini':
                client = google_genai.Client(api_key=api_key)
                import requests
                resp = requests.get(image_url, timeout=10)
                if resp.status_code == 200:
                    mime_type = resp.headers.get('content-type', 'image/jpeg')
                    if not mime_type.startswith('image/'):
                        mime_type = 'image/jpeg'
                    part = genai_types.Part.from_bytes(data=resp.content, mime_type=mime_type)
                    
                    response = client.models.generate_content(
                        model=model_name,
                        contents=[part, system_prompt],
                    )
                    return response.text.strip()
                return ""
            elif provider == 'openai':
                client = OpenAI(api_key=api_key)
                
                img_url_payload = {"url": image_url}
                try:
                    import requests
                    resp = requests.get(image_url, timeout=10)
                    if resp.status_code == 200:
                        mime_type = resp.headers.get('content-type', 'image/jpeg')
                        import base64
                        b64 = base64.b64encode(resp.content).decode('utf-8')
                        img_url_payload = {"url": f"data:{mime_type};base64,{b64}"}
                except Exception as e:
                    logger.error(f"OpenAI image download error: {e}")

                response = client.chat.completions.create(
                    model=model_name,
                    messages=[
                        {'role': 'system', 'content': system_prompt},
                        {'role': 'user', 'content': [
                            {"type": "image_url", "image_url": img_url_payload}
                        ]}
                    ],
                    max_tokens=200
                )
                return response.choices[0].message.content.strip()
        except Exception as e:
            logger.warning(f"[Image Description] Key thất bại ({provider}), thử key tiếp... Lỗi: {e}")
            continue
    return ""

def generate_ai_reply(agent: AiAgent, conversation_history: list, lead_name: str):
    provider = get_provider_for_model(agent.model_name)
    api_keys = get_api_keys(agent.company, provider)
    
    if not api_keys:
        logger.warning(f"No API Key configured for provider {provider}")
        return {'error': True, 'reply': 'Hệ thống AI chưa được cấu hình API Key.', 'sentiment': 'handoff', 'summary': ''}

    json_template = agent.core_prompt_template.strip() if agent.core_prompt_template else DEFAULT_JSON_TEMPLATE
    core_rules = agent.core_system_rules.strip() if agent.core_system_rules else DEFAULT_SYSTEM_RULES

    extra_rules = ""
    # Ép AI không dùng product_search_keyword nếu tính năng bị tắt
    if not getattr(agent.company.ai_settings, 'auto_sync_products', True):
        extra_rules = "\nLƯU Ý QUAN TRỌNG: Tính năng kết nối Sản phẩm đã bị TẮT. BẠN TUYỆT ĐỐI KHÔNG ĐƯỢC TỰ TÌM SẢN PHẨM VÀ KHÔNG ĐƯỢC HỨA HẸN GỬI ẢNH (Bắt buộc để trống trường `product_search_keyword`). Nếu khách yêu cầu xem ảnh/mẫu, hãy khéo léo báo rằng hệ thống không gửi được ảnh tại đây và XIN SỐ ĐIỆN THOẠI ZALO để nhân viên tư vấn gửi trực tiếp Catalogue ảnh mẫu cho khách."
    else:
        extra_rules = "\nLƯU Ý: Tính năng kết nối Sản phẩm đang BẬT. Nếu khách hàng muốn xem mẫu/ảnh, HÃY SỬ DỤNG trường `product_search_keyword` để tìm và gửi ảnh, đồng thời báo với khách trong câu trả lời là bạn đang gửi ảnh mẫu cho họ xem."

    system_prompt = f"""Bạn là {agent.name}. {agent.system_prompt}
Bạn đang chat với khách hàng (thông tin context bổ sung: {lead_name}).
{core_rules}{extra_rules}
TRẢ LỜI BẮT BUỘC THEO ĐỊNH DẠNG JSON SAU (không trả về Markdown, chỉ JSON thôi):
{json_template}"""

    last_error = None
    for api_key in api_keys:
        try:
            if provider == 'openai':
                result, usage = call_openai(api_key, agent, system_prompt, conversation_history)
            elif provider == 'gemini':
                result, usage = call_gemini(api_key, agent, system_prompt, conversation_history)
            elif provider == 'anthropic':
                result, usage = call_anthropic(api_key, agent, system_prompt, conversation_history)
            
            # Log usage
            try:
                from .models import ApiUsageLog, AiModelPricing
                from decimal import Decimal
                
                model_name = agent.model_name or ('gpt-4o-mini' if provider == 'openai' else 'gemini-2.0-flash' if provider == 'gemini' else 'claude-3-5-sonnet-20240620')
                if model_name.startswith('models/'):
                    model_name = model_name[7:]
                    
                input_price = 0.0
                output_price = 0.0
                
                pricing_obj = AiModelPricing.objects.filter(model_name=model_name).first()
                if pricing_obj:
                    input_price = float(pricing_obj.input_price_per_1m)
                    output_price = float(pricing_obj.output_price_per_1m)
                else:
                    pricing_obj = AiModelPricing.objects.filter(model_name__icontains=provider).first()
                    if pricing_obj:
                        input_price = float(pricing_obj.input_price_per_1m)
                        output_price = float(pricing_obj.output_price_per_1m)
                
                total_cost = (usage.get('input', 0) * input_price / 1_000_000) + (usage.get('output', 0) * output_price / 1_000_000)
                ApiUsageLog.objects.create(
                    company=agent.company,
                    agent=agent,
                    provider=provider,
                    model_name=model_name,
                    input_tokens=usage.get('input', 0),
                    output_tokens=usage.get('output', 0),
                    total_cost_usd=Decimal(str(total_cost))
                )
            except Exception as log_e:
                logger.error(f"Failed to log API usage: {log_e}")
                    
            return result
        except Exception as e:
            last_error = e
            continue
            
    logger.error(f"All API Keys failed for provider {provider}. Last error: {last_error}")
    
    # Catch quota errors
    if last_error and ('429' in str(last_error) or 'quota' in str(last_error).lower() or 'insufficient' in str(last_error).lower()):
        try:
            from notifications.models import Notification
            import json
            Notification.objects.create(
                company=agent.company,
                recipient=None, # System wide
                title="CẢNH BÁO QUOTA AI",
                message=f"Hệ thống báo lỗi hết Quota / Hết tiền đối với API Key {provider.upper()}. Vui lòng kiểm tra lại thiết lập.",
                type='ai_error',
                related_data=json.dumps({"agent_id": agent.id, "error": str(last_error)})
            )
        except:
            pass

    # Gửi thông báo cho Sale team biết AI đã bị tắt do lỗi
    try:
        from notifications.models import Notification
        import json
        Notification.objects.create(
            company=agent.company,
            recipient=None,
            title="⚠️ AI bị tắt tự động do lỗi API",
            message=f"AI Agent '{agent.name}' không thể trả lời do tất cả API Key đều thất bại. Vui lòng kiểm tra API Key của {provider.upper()} và tiếp tục trả lời khách.",
            type='ai_error',
            related_data=json.dumps({"agent_id": agent.id, "error": str(last_error)})
        )
    except:
        pass
    
    # Trả về cờ lỗi để task.py biết mà TẮT AI và ĐẢY HANDOFF - TUYỆT ĐỐI KHÔNG GỬi ra cho khách
    return {
        'error': True,
        'reply': f'[Hệ thống AI] Lỗi API Key {provider.upper()}: {str(last_error)[:150]}...',
        'sentiment': 'handoff',
        'summary': ''
    }

def generate_raw_text(agent: AiAgent, prompt: str) -> str:
    """
    Gọi LLM để sinh văn bản thô (không phải JSON).
    Tự động xoay vòng qua tất cả API Keys khi key hiện tại bị lỗi (hết quota, sai key...).
    Raise Exception nếu TẤT CẢ keys đều thất bại.
    """
    provider = get_provider_for_model(agent.model_name)
    api_keys = get_api_keys(agent.company, provider)
    
    if not api_keys:
        raise ValueError(f"Chưa cấu hình API Key cho nhà cung cấp {provider.upper()}. Vào Cài đặt AI > API Keys để thêm.")
    
    model_name = agent.model_name
    last_error = None
    
    for api_key in api_keys:
        try:
            if provider == 'openai':
                from openai import OpenAI
                client = OpenAI(api_key=api_key)
                res = client.chat.completions.create(
                    model=model_name or 'gpt-4o-mini',
                    messages=[{"role": "user", "content": prompt}]
                )
                return res.choices[0].message.content
            elif provider == 'gemini':
                from google import genai as google_genai
                client = google_genai.Client(api_key=api_key)
                gm_name = model_name or 'gemini-2.0-flash'
                if gm_name.startswith('models/'):
                    gm_name = gm_name[7:]
                res = client.models.generate_content(
                    model=gm_name,
                    contents=prompt
                )
                return res.text
            elif provider == 'anthropic':
                import anthropic
                client = anthropic.Anthropic(api_key=api_key)
                res = client.messages.create(
                    model=model_name or 'claude-3-5-sonnet-20241022',
                    max_tokens=2048,
                    messages=[{"role": "user", "content": prompt}]
                )
                return res.content[0].text
            else:
                raise ValueError(f"Nhà cung cấp AI '{provider}' không được hỗ trợ.")
        except Exception as e:
            last_error = e
            logger.warning(f"[generate_raw_text] Key thất bại ({provider}), thử key tiếp theo... Lỗi: {e}")
            continue
    
    # Tất cả keys đều thất bại
    raise RuntimeError(f"Tất cả {len(api_keys)} API Key {provider.upper()} đều thất bại. Lỗi cuối: {str(last_error)[:200]}")

