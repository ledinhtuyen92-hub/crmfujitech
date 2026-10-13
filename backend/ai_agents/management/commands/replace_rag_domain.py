"""
Management command: replace_rag_domain
---------------------------------------
Thay thế domain cũ bằng domain mới trong toàn bộ nội dung RAG
(AiKnowledgeDocument.content và AiKnowledgeChunk.content) trực tiếp trong DB.

Cách dùng (chạy trên VPS bên trong container crm_web):
    docker exec -i crm_web python manage.py replace_rag_domain \
        --old crm.fujitechgroup.vn \
        --new crm.fujitechgroup.com

Hoặc từ ngoài container:
    docker exec crm_web python manage.py replace_rag_domain --old crm.fujitechgroup.vn --new crm.fujitechgroup.com
"""
from django.core.management.base import BaseCommand
from django.db import transaction


class Command(BaseCommand):
    help = 'Thay thế domain cũ bằng domain mới trong toàn bộ nội dung RAG (AiKnowledgeDocument + AiKnowledgeChunk)'

    def add_arguments(self, parser):
        parser.add_argument(
            '--old',
            type=str,
            required=True,
            help='Domain cũ cần thay (VD: crm.fujitechgroup.vn)'
        )
        parser.add_argument(
            '--new',
            type=str,
            required=True,
            help='Domain mới (VD: crm.fujitechgroup.com)'
        )
        parser.add_argument(
            '--dry-run',
            action='store_true',
            default=False,
            help='Chỉ xem trước số lượng bản ghi sẽ thay, KHÔNG thực sự ghi vào DB'
        )

    def handle(self, *args, **options):
        from ai_agents.models import AiKnowledgeDocument, AiKnowledgeChunk

        old_domain = options['old'].strip()
        new_domain = options['new'].strip()
        dry_run = options['dry_run']

        # Chuẩn hoá: đảm bảo không có protocol trong domain nhập vào
        for d in (old_domain, new_domain):
            if d.startswith('http'):
                self.stderr.write(
                    self.style.ERROR(f'Nhập domain không cần tiền tố http/https (VD: crm.fujitechgroup.vn). Bạn nhập: "{d}"')
                )
                return

        self.stdout.write(f'Domain cũ : {old_domain}')
        self.stdout.write(f'Domain mới: {new_domain}')
        if dry_run:
            self.stdout.write(self.style.WARNING('[DRY RUN] Không có thay đổi thực sự nào được ghi vào DB.'))

        # ── 1. AiKnowledgeDocument.content ─────────────────────────────────────
        docs_qs = AiKnowledgeDocument.objects.filter(content__icontains=old_domain)
        doc_count = docs_qs.count()
        self.stdout.write(f'\n[1/2] AiKnowledgeDocument.content: tìm thấy {doc_count} tài liệu cần cập nhật')

        if not dry_run and doc_count > 0:
            updated_docs = 0
            with transaction.atomic():
                for doc in docs_qs.iterator():
                    new_content = doc.content.replace(old_domain, new_domain)
                    if new_content != doc.content:
                        doc.content = new_content
                        doc.save(update_fields=['content'])
                        updated_docs += 1
            self.stdout.write(self.style.SUCCESS(f'    ✅ Đã cập nhật {updated_docs} AiKnowledgeDocument'))

        # ── 2. AiKnowledgeChunk.content ────────────────────────────────────────
        chunks_qs = AiKnowledgeChunk.objects.filter(content__icontains=old_domain)
        chunk_count = chunks_qs.count()
        self.stdout.write(f'\n[2/2] AiKnowledgeChunk.content: tìm thấy {chunk_count} chunks cần cập nhật')

        if not dry_run and chunk_count > 0:
            updated_chunks = 0
            with transaction.atomic():
                for chunk in chunks_qs.iterator():
                    new_content = chunk.content.replace(old_domain, new_domain)
                    if new_content != chunk.content:
                        chunk.content = new_content
                        chunk.save(update_fields=['content'])
                        updated_chunks += 1
            self.stdout.write(self.style.SUCCESS(f'    ✅ Đã cập nhật {updated_chunks} AiKnowledgeChunk'))

        # ── Kết quả ─────────────────────────────────────────────────────────────
        self.stdout.write('')
        if dry_run:
            self.stdout.write(self.style.WARNING(
                f'[DRY RUN] Sẽ cập nhật {doc_count} document và {chunk_count} chunk.\n'
                f'Chạy lại không có --dry-run để thực hiện thực sự.'
            ))
        else:
            self.stdout.write(self.style.SUCCESS(
                f'🎉 Hoàn tất! Đã thay thế "{old_domain}" → "{new_domain}" '
                f'trong {doc_count} document và {chunk_count} chunk.'
            ))
