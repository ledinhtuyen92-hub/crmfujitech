from django.core.management.base import BaseCommand
from facebook_integration.models import FacebookLead
from facebook_integration.services import extract_and_process_phone_fb
from zalo_integration.models import SocialLead, ZaloMessage
from zalo_integration.services import extract_and_process_phone


class Command(BaseCommand):
    help = "Quét lại toàn bộ lịch sử tin nhắn Facebook và Zalo để phát hiện SĐT, Email, Địa chỉ và tự động đồng bộ sang Khách hàng."

    def handle(self, *args, **options):
        self.stdout.write(self.style.NOTICE("── Bắt đầu quét thông tin liên hệ cho Facebook Leads... ──"))
        fb_leads = FacebookLead.objects.all()
        fb_scanned = 0
        fb_updated = 0
        for lead in fb_leads:
            msgs = lead.messages.filter(sender_type="customer").order_by("-created_at")[:50]
            text_pool = "\n".join([m.text for m in msgs if m.text] + [lead.last_message_preview or ""])
            before_phone, before_email, before_address = lead.detected_phone, lead.detected_email, lead.detected_address
            extract_and_process_phone_fb(lead, text_pool)
            lead.refresh_from_db()
            fb_scanned += 1
            if (lead.detected_phone != before_phone or 
                lead.detected_email != before_email or 
                lead.detected_address != before_address):
                fb_updated += 1
                self.stdout.write(f"  [FB Lead #{lead.id}] Cập nhật -> SĐT: {lead.detected_phone}, Email: {lead.detected_email}, Địa chỉ: {lead.detected_address}")

        self.stdout.write(self.style.SUCCESS(f"✔ Đã quét {fb_scanned} FB Leads, phát hiện mới/cập nhật {fb_updated} hội thoại.\n"))

        self.stdout.write(self.style.NOTICE("── Bắt đầu quét thông tin liên hệ cho Zalo Social Leads... ──"))
        zalo_leads = SocialLead.objects.all()
        zalo_scanned = 0
        zalo_updated = 0
        for lead in zalo_leads:
            msgs = ZaloMessage.objects.filter(social_lead=lead, direction=ZaloMessage.DIRECTION_INBOUND).order_by("-created_at")[:50]
            text_pool = "\n".join([m.content for m in msgs if m.content] + [lead.last_message or ""])
            before_phone, before_email, before_address = lead.detected_phone, lead.detected_email, lead.detected_address
            extract_and_process_phone(lead, text_pool)
            lead.refresh_from_db()
            zalo_scanned += 1
            if (lead.detected_phone != before_phone or 
                lead.detected_email != before_email or 
                lead.detected_address != before_address):
                zalo_updated += 1
                self.stdout.write(f"  [Zalo Lead #{lead.id}] Cập nhật -> SĐT: {lead.detected_phone}, Email: {lead.detected_email}, Địa chỉ: {lead.detected_address}")

        self.stdout.write(self.style.SUCCESS(f"✔ Đã quét {zalo_scanned} Zalo Leads, phát hiện mới/cập nhật {zalo_updated} hội thoại."))
