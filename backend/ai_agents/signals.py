import re
from urllib.parse import urlparse
from django.conf import settings
from django.db.models.signals import pre_save, post_delete
from django.dispatch import receiver
from django.core.files.storage import default_storage
from .models import AiKnowledgeDocument

def extract_media_paths(text):
    """
    Trích xuất danh sách các đường dẫn file (relative path) bên trong thư mục media từ đoạn text Markdown.
    Ví dụ: ![ảnh](http://localhost:8000/media/uploads/xyz.jpg) -> 'uploads/xyz.jpg'
    """
    if not text:
        return []
    
    # Tìm tất cả các link nằm trong Markdown cú pháp: ![...](URL)
    urls = re.findall(r'!\[.*?\]\((.*?)\)', text)
    paths = []
    
    media_url = settings.MEDIA_URL # Thường là '/media/'
    
    for url in urls:
        try:
            parsed = urlparse(url)
            path = parsed.path
            
            # Chỉ xử lý các link thuộc hệ thống lưu trữ media nội bộ
            if path.startswith(media_url):
                # Cắt bỏ phần '/media/' để lấy đường dẫn tương đối (relative) trong storage
                relative_path = path[len(media_url):]
                paths.append(relative_path)
        except Exception:
            pass
            
    return paths

@receiver(post_delete, sender=AiKnowledgeDocument)
def cleanup_knowledge_files(sender, instance, **kwargs):
    """
    Xóa file đính kèm chính và các file rác (ảnh) chèn trong Markdown khi xóa tài liệu.
    """
    # 1. Xóa file đính kèm chính (FileField)
    if instance.file_attachment:
        try:
            instance.file_attachment.delete(save=False)
        except Exception:
            pass
            
    # 2. Xóa các file ảnh rác trong Markdown
    paths = extract_media_paths(instance.content)
    for path in paths:
        try:
            if default_storage.exists(path):
                default_storage.delete(path)
        except Exception:
            pass

@receiver(pre_save, sender=AiKnowledgeDocument)
def cleanup_updated_knowledge_files(sender, instance, **kwargs):
    """
    Quét và xóa các file ảnh bị gỡ bỏ khỏi đoạn Text (Markdown) khi chỉnh sửa tài liệu.
    """
    if not instance.pk:
        return
        
    try:
        old_instance = AiKnowledgeDocument.objects.get(pk=instance.pk)
    except AiKnowledgeDocument.DoesNotExist:
        return
        
    old_paths = set(extract_media_paths(old_instance.content))
    new_paths = set(extract_media_paths(instance.content))
    
    # Tìm các file có ở bản cũ nhưng không còn ở bản mới
    deleted_paths = old_paths - new_paths
    
    for path in deleted_paths:
        try:
            if default_storage.exists(path):
                default_storage.delete(path)
        except Exception:
            pass
