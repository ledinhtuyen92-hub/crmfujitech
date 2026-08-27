from django.db.models.signals import post_save, post_delete
from django.dispatch import receiver
from .models import Product
from ai_agents.tasks import sync_company_products_to_rag

@receiver(post_save, sender=Product)
@receiver(post_delete, sender=Product)
def product_sync_to_rag(sender, instance, **kwargs):
    company = instance.company
    try:
        # Sử dụng try/except thay vì hasattr vì OneToOneField descriptor luôn tồn tại, 
        # gọi hasattr sẽ trả về True nhưng truy cập có thể raise RelatedObjectDoesNotExist
        if company.ai_settings and company.ai_settings.auto_sync_products:
            sync_company_products_to_rag.delay(company.id)
    except Exception: # Bắt luôn cả RelatedObjectDoesNotExist
        pass

from .models import ProductTemplate

@receiver(post_save, sender=ProductTemplate)
def trigger_sync_product_image_description(sender, instance, created, **kwargs):
    # Nếu có ảnh và chưa có mô tả ảnh, hoặc đang không trong quá trình sync
    if instance.image and not instance.image_description and not getattr(instance, '_vector_syncing', False):
        try:
            from ai_agents.tasks import sync_product_image_description
            sync_product_image_description.delay(instance.id)
        except Exception:
            pass
