"""
Debug luồng ảnh Q&A trong RAG pipeline.

Chạy trên VPS:
    docker exec -it crm_web python manage.py debug_rag_images --agent-id 1

Chỉ cần 1 lệnh, kết quả in ra rõ ràng ở cuối.
"""

import re
from django.core.management.base import BaseCommand, CommandError
from ai_agents.models import AiAgent, AiKnowledgeDocument, AiKnowledgeChunk


QUERY = "nhà máy ở đâu"   # Câu test cố định
LIMIT = 6
THRESHOLD = 0.7

OK  = "  [OK]  "
ERR = " [LỖI] "
INF = " [INFO] "

class Command(BaseCommand):
    help = "Kiểm tra tại sao ảnh Q&A không được gửi cho khách"

    def add_arguments(self, parser):
        parser.add_argument("--agent-id", type=int, required=True)
        parser.add_argument("--query", type=str, default=QUERY)

    def p(self, line=""):
        self.stdout.write(line)

    def ok(self, msg):
        self.stdout.write(self.style.SUCCESS(f"{OK} {msg}"))

    def err(self, msg):
        self.stdout.write(self.style.ERROR(f"{ERR} {msg}"))

    def inf(self, msg):
        self.stdout.write(self.style.WARNING(f"{INF} {msg}"))

    def handle(self, *args, **options):
        agent_id = options["agent_id"]
        query    = options["query"]
        errors   = []   # Danh sách lỗi tổng hợp cuối cùng

        self.p("=" * 65)
        self.p(f"  CHẨN ĐOÁN ẢNH Q&A  |  query: '{query}'")
        self.p("=" * 65)

        # ── 1. Agent ─────────────────────────────────────────────────
        try:
            agent = AiAgent.objects.get(id=agent_id)
            self.ok(f"Agent: {agent.name} (id={agent.id})")
        except AiAgent.DoesNotExist:
            self.err(f"Không tìm thấy AiAgent id={agent_id}")
            return

        # ── 2. Code version check ────────────────────────────────────
        try:
            import inspect
            from ai_agents.rag_processor import search_knowledge
            src = inspect.getsource(search_knowledge)
            if "seen_img_urls" in src and "HÌNH ẢNH ĐÍNH KÈM" in src:
                self.ok("Code rag_processor.py: phiên bản MỚI (có logic tìm ảnh)")
            else:
                self.err("Code rag_processor.py: phiên bản CŨ — chưa load code mới!")
                errors.append("Container chưa chạy code mới. Cần: docker restart crm_web")
        except Exception as e:
            self.err(f"Không import được rag_processor: {e}")
            errors.append(str(e))

        # ── 3. Tài liệu Q&A có ảnh ───────────────────────────────────
        qa_docs_with_img = []
        qa_docs = AiKnowledgeDocument.objects.filter(
            agent=agent, doc_type="qa", status="completed"
        )
        self.inf(f"Tổng Q&A docs (completed): {qa_docs.count()}")
        for doc in qa_docs:
            urls = re.findall(r"!\[.*?\]\((https?://[^\)]+)\)", doc.content or "")
            if urls:
                qa_docs_with_img.append((doc, urls))
                self.ok(f"Doc id={doc.id} '{doc.title[:40]}': {len(urls)} ảnh")
                for u in urls:
                    self.p(f"          → {u}")

        if not qa_docs_with_img:
            self.err("Không tìm thấy ảnh https:// trong bất kỳ doc Q&A nào!")
            errors.append(
                "Ảnh không có trong doc.content với URL https://\n"
                "  Gợi ý: URL ảnh có thể đang là /media/... (relative) thay vì https://..."
            )

        # ── 4. Chạy search_knowledge ──────────────────────────────────
        self.p()
        self.inf(f"Gọi search_knowledge('{query}', limit={LIMIT})...")
        try:
            rag_result = search_knowledge(agent, query, limit=LIMIT)
        except Exception as e:
            self.err(f"search_knowledge crash: {e}")
            import traceback; self.p(traceback.format_exc())
            errors.append(f"search_knowledge lỗi: {e}")
            rag_result = ""

        if not rag_result:
            self.err("search_knowledge trả về rỗng (không tìm được chunk nào khớp)")
            errors.append("RAG không tìm được chunk nào — kiểm tra API key và embedding")
        else:
            self.ok(f"search_knowledge trả về {len(rag_result)} ký tự")

            # Có section ảnh không?
            if "[HÌNH ẢNH ĐÍNH KÈM" in rag_result:
                img_urls_in_result = re.findall(r"!\[.*?\]\((https?://[^\)]+)\)", rag_result)
                self.ok(f"Section [HÌNH ẢNH ĐÍNH KÈM] CÓ trong RAG — {len(img_urls_in_result)} URL ảnh:")
                for u in img_urls_in_result:
                    self.p(f"          → {u}")
            else:
                self.err("Section [HÌNH ẢNH ĐÍNH KÈM] KHÔNG có trong RAG result!")
                # Phân tích nguyên nhân
                chunks_in_result = re.findall(r"\(Nguồn: ([^\)]+)\)", rag_result)
                self.inf(f"Các nguồn được chọn: {chunks_in_result}")

                # Kiểm tra chunk từ doc Q&A có ảnh có được chọn không
                img_doc_titles = [d.title for d, _ in qa_docs_with_img]
                matched = [s for s in chunks_in_result if any(t[:20] in s for t in img_doc_titles)]
                if matched:
                    self.err(f"Chunk từ doc có ảnh ĐÃ được chọn nhưng ảnh vẫn không xuất hiện → Bug trong code extract ảnh!")
                    errors.append("Bug: doc Q&A có ảnh được chọn nhưng seen_img_urls bị rỗng → cần xem lại regex hoặc doc.content")
                else:
                    self.err("Không có chunk nào từ doc Q&A có ảnh được RAG chọn (threshold quá chặt)")
                    errors.append(
                        f"Chunk Q&A nhà máy không lọt qua threshold={THRESHOLD}\n"
                        "  Gợi ý: hạ threshold hoặc tách riêng Q&A có ảnh thành doc riêng"
                    )

        # ── 5. Kiểm tra embedding ─────────────────────────────────────
        self.p()
        try:
            provider = agent.company.ai_settings.default_embedding_provider
        except Exception:
            provider = "openai"
        self.inf(f"Embedding provider: {provider}")

        for doc, _ in qa_docs_with_img:
            total  = AiKnowledgeChunk.objects.filter(document=doc).count()
            if provider == "gemini":
                embed = AiKnowledgeChunk.objects.filter(document=doc).exclude(embedding_gemini=None).count()
            else:
                embed = AiKnowledgeChunk.objects.filter(document=doc).exclude(embedding=None).count()
            if embed == total:
                self.ok(f"Doc id={doc.id}: {embed}/{total} chunks có embedding")
            else:
                self.err(f"Doc id={doc.id}: CHỈ {embed}/{total} chunks có embedding — thiếu!")
                errors.append(f"Doc id={doc.id} thiếu embedding. Chạy lại: process_document_rag.delay({doc.id})")

        # ── TỔNG KẾT ─────────────────────────────────────────────────
        self.p()
        self.p("=" * 65)
        if not errors:
            self.ok("TẤT CẢ BƯỚC ĐỀU PASS — Ảnh có trong RAG context!")
            self.p("  → Nếu AI vẫn không gửi ảnh, vấn đề nằm ở AI system prompt")
            self.p("    Cần kiểm tra: core_prompt_template có hướng dẫn image_urls không?")
        else:
            self.err(f"TÌM THẤY {len(errors)} LỖI CẦN SỬA:")
            for i, e in enumerate(errors, 1):
                self.p(self.style.ERROR(f"\n  [{i}] {e}"))
        self.p("=" * 65)
