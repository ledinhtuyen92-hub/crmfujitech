import os
import django
import sys
import json

os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'core.settings')
django.setup()

from ai_agents.services import generate_ai_reply
from ai_agents.models import AiAgent

def test_vps_ai():
    # Lấy con AI đang bật
    agent = AiAgent.objects.filter(is_active=True).first()
    if not agent:
        print("Không tìm thấy AI Agent nào đang bật!")
        return

    print(f"=== ĐANG KIỂM TRA AI: {agent.name} ===")
    
    # Giả lập lịch sử chat
    history = [
        {"role": "user", "content": "địa chỉ nhà máy bên em ở đâu"}
    ]
    
    print("\n⏳ Đang gọi Gemini, vui lòng chờ...")
    result = generate_ai_reply(agent, history, "Khách hàng Test")
    
    print("\n" + "="*40)
    print("🤖 KẾT QUẢ AI GEMINI TRẢ VỀ CHUẨN XÁC TỪNG CHỮ:")
    print("="*40)
    print(json.dumps(result, indent=4, ensure_ascii=False))
    print("="*40)
    
    if not result.get('image_urls') and not result.get('image_url'):
        print("\n❌ CẢNH BÁO: AI KHÔNG HỀ TRẢ VỀ ĐƯỜNG LINK ẢNH NÀO!")
        print("Đó là lý do tại sao hệ thống không gửi ảnh. Vui lòng kiểm tra lại cấu hình Prompt hoặc RAG!")
    else:
        print("\n✅ AI có trả về link ảnh:", result.get('image_urls') or result.get('image_url'))

if __name__ == "__main__":
    test_vps_ai()
