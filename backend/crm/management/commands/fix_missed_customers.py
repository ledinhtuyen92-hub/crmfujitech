from django.core.management.base import BaseCommand
from facebook_integration.models import FacebookLead
from zalo_integration.models import SocialLead
from ai_agents.tasks import _apply_extracted_info

class Command(BaseCommand):
    help = "Sửa lỗi: Tạo Khách hàng CRM cho các Lead đã có Số điện thoại nhưng chưa được tạo do lỗi AI auto-reply trước đó."

    def handle(self, *args, **options):
        self.stdout.write(self.style.NOTICE("Bắt đầu xử lý Facebook Leads..."))
        fb_leads = FacebookLead.objects.exclude(detected_phone="").exclude(detected_phone__isnull=True).filter(is_customer_converted=False, customer__isnull=True)
        fb_count = 0
        for lead in fb_leads:
            try:
                # Chỉ xử lý nếu trang đó có bật tính năng tự tạo KH
                if lead.page_config and getattr(lead.page_config, 'auto_create_customer_from_phone', False):
                    # Truyền lại chính số điện thoại đã quét được vào hàm dùng chung để nó đi tiếp luồng tạo KH
                    _apply_extracted_info(lead, lead.detected_phone, lead.detected_email or '', lead.detected_address or '', 'facebook')
                    fb_count += 1
            except Exception as e:
                self.stdout.write(self.style.ERROR(f"Lỗi FB Lead {lead.id}: {e}"))
                
        self.stdout.write(self.style.SUCCESS(f"✔ Đã xử lý thành công {fb_count} Facebook Leads."))

        self.stdout.write(self.style.NOTICE("Bắt đầu xử lý Zalo Leads..."))
        zalo_leads = SocialLead.objects.exclude(detected_phone="").exclude(detected_phone__isnull=True).filter(is_customer_converted=False, customer__isnull=True)
        zalo_count = 0
        for lead in zalo_leads:
            try:
                # Chỉ xử lý nếu OA đó có bật tính năng tự tạo KH
                if lead.oa_config and getattr(lead.oa_config, 'auto_create_customer_from_phone', False):
                    _apply_extracted_info(lead, lead.detected_phone, lead.detected_email or '', lead.detected_address or '', 'zalo')
                    zalo_count += 1
            except Exception as e:
                self.stdout.write(self.style.ERROR(f"Lỗi Zalo Lead {lead.id}: {e}"))
                
        self.stdout.write(self.style.SUCCESS(f"✔ Đã xử lý thành công {zalo_count} Zalo Leads."))
        self.stdout.write(self.style.SUCCESS("HOÀN TẤT!"))
