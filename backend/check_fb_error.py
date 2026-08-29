import os
import django
import sys
import json
import urllib.parse
import urllib.request

os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'core.settings')
django.setup()

from ai_agents.models import AiKnowledgeChunk
import re

print("========================================")
print("🔍 KIỂM TRA LỖI ẢNH FACEBOOK TRÊN VPS")
print("========================================\n")

print("1. Đang tìm các link ảnh trong kho dữ liệu RAG...")
chunks = AiKnowledgeChunk.objects.filter(content__contains='![')
found_urls = []
for c in chunks:
    matches = re.findall(r'!\[.*?\]\((.*?)\)', c.content)
    for m in matches:
        found_urls.append(m)

if not found_urls:
    print("❌ Không tìm thấy link ảnh nào trong các câu hỏi RAG!")
else:
    print(f"✅ Tìm thấy {len(found_urls)} link ảnh:")
    for url in found_urls:
        print(f"   👉 {url}")
        
        # Test 1: Kiểm tra HTTPS
        if not url.startswith('https://'):
            print(f"      ⚠️ CẢNH BÁO: Link này không phải HTTPS, Facebook sẽ từ chối!")
        
        # Test 2: Kiểm tra ký tự tiếng Việt / khoảng trắng
        encoded_url = urllib.parse.quote(url, safe=":/")
        if url != encoded_url:
            print(f"      ⚠️ CẢNH BÁO: Link chứa ký tự đặc biệt/tiếng Việt! Facebook có thể bị lỗi.")
            print(f"         Link chuẩn phải là: {encoded_url}")
            
        # Test 3: Thử tải ảnh bằng Python giả lập Facebook
        try:
            req = urllib.request.Request(url, headers={'User-Agent': 'facebookexternalhit/1.1'})
            resp = urllib.request.urlopen(req, timeout=5)
            print(f"      ✅ Tải ảnh thành công! (HTTP {resp.getcode()})")
        except urllib.error.HTTPError as e:
            print(f"      ❌ Facebook không thể tải ảnh này! Lỗi: HTTP {e.code}")
            if e.code == 403:
                print("         💡 403 Forbidden: Bị chặn bởi Tường lửa (Cloudflare) hoặc Nginx không cho phép bot Facebook truy cập!")
            elif e.code == 404:
                print("         💡 404 Not Found: Ảnh không tồn tại trên VPS!")
        except Exception as e:
            print(f"      ❌ Lỗi khi tải ảnh: {e}")

print("\n========================================")
