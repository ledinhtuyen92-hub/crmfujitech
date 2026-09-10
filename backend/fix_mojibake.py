import os
import sys
import django

# Khởi tạo môi trường Django
os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'core.settings')
BASE_DIR = os.path.dirname(os.path.abspath(__file__))
if BASE_DIR not in sys.path:
    sys.path.insert(0, BASE_DIR)
django.setup()

from django.apps import apps
from django.db import models

def fix_text(text):
    """
    Hàm tự động nhận diện và sửa lỗi Mojibake (ví dụ: TÃ¬nh tráº¡ng -> Tình trạng)
    Bằng cách mã hóa ngược về latin1 và giải mã lại bằng utf-8.
    """
    if not isinstance(text, str) or not text:
        return text
    try:
        # Nếu chuỗi chứa các byte UTF-8 bị hiểu nhầm thành latin1
        fixed = text.encode('latin1').decode('utf-8')
        if fixed != text:
            return fixed
    except (UnicodeEncodeError, UnicodeDecodeError):
        # Nếu không phải lỗi mojibake hoặc chuỗi vốn đã chuẩn, ta bỏ qua
        pass
    
    # Trường hợp phổ biến khác: Windows-1252
    try:
        fixed = text.encode('cp1252').decode('utf-8')
        if fixed != text:
            return fixed
    except (UnicodeEncodeError, UnicodeDecodeError):
        pass

    return text

def run():
    print("=" * 60)
    print("🔍 Bắt đầu quét và sửa lỗi font (Mojibake) trên toàn bộ Database...")
    print("=" * 60)
    
    total_fixed_objects = 0
    
    # Quét toàn bộ các Model trong hệ thống
    for model in apps.get_models():
        # Tìm tất cả các trường chứa text (CharField, TextField)
        text_fields = [f.name for f in model._meta.fields if isinstance(f, (models.CharField, models.TextField))]
        
        if not text_fields:
            continue
            
        try:
            # Bỏ qua các model không có data để chạy nhanh hơn
            if not model.objects.exists():
                continue
                
            objects = model.objects.all()
            for obj in objects:
                needs_save = False
                for field in text_fields:
                    val = getattr(obj, field)
                    fixed_val = fix_text(val)
                    if fixed_val != val:
                        setattr(obj, field, fixed_val)
                        needs_save = True
                        # Rút gọn chuỗi in ra màn hình cho đỡ rối
                        print(f"[Đã sửa] {model.__name__} (ID: {obj.pk}) | {field}: '{val[:20]}...' -> '{fixed_val[:20]}...'")
                
                if needs_save:
                    obj.save(update_fields=text_fields)
                    total_fixed_objects += 1
                    
        except Exception as e:
            # Bỏ qua nếu model là abstract hoặc view
            pass

    print("=" * 60)
    print(f"✨ HOÀN TẤT! Đã sửa thành công {total_fixed_objects} bản ghi bị lỗi font.")
    print("=" * 60)

if __name__ == '__main__':
    run()
