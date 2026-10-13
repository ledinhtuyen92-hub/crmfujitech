from django.core.management.base import BaseCommand
import logging

logger = logging.getLogger(__name__)

class Command(BaseCommand):
    help = 'Re-index lại tài liệu RAG theo thuật toán chunking mới (bảo toàn cặp Q&A nguyên vẹn, không cắt rời ảnh/file)'

    def add_arguments(self, parser):
        parser.add_argument(
            '--doc-id',
            type=int,
            default=None,
            help='ID tài liệu cụ thể cần re-index (mặc định: re-index tất cả tài liệu Q&A)'
        )
        parser.add_argument(
            '--all',
            action='store_true',
            default=False,
            help='Re-index TẤT CẢ tài liệu (bao gồm cả PDF/DOCX)'
        )

    def handle(self, *args, **options):
        from ai_agents.models import AiKnowledgeDocument
        from ai_agents.tasks import process_document_rag

        doc_id = options.get('doc_id')
        reindex_all = options.get('all')

        if doc_id:
            docs = AiKnowledgeDocument.objects.filter(id=doc_id)
            if not docs.exists():
                self.stderr.write(self.style.ERROR(f'Không tìm thấy tài liệu có ID={doc_id}'))
                return
        elif reindex_all:
            docs = AiKnowledgeDocument.objects.filter(status='completed')
        else:
            # Mặc định: các tài liệu Q&A
            docs = AiKnowledgeDocument.objects.filter(status='completed', doc_type='qa')

        self.stdout.write(f'Tìm thấy {docs.count()} tài liệu cần re-index...')
        for doc in docs:
            self.stdout.write(f'Đang xử lý Document [{doc.id}]: "{doc.title}" (type={doc.doc_type})...')
            try:
                process_document_rag(doc.id)
                self.stdout.write(self.style.SUCCESS(f'  ✓ Hoàn tất Document [{doc.id}], chunks mới: {doc.chunks.count()}'))
            except Exception as e:
                self.stderr.write(self.style.ERROR(f'  ✗ Lỗi Document [{doc.id}]: {e}'))

        self.stdout.write(self.style.SUCCESS('Re-index hoàn tất!'))
