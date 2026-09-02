"""
Management command để debug luồng RAG + ảnh Q&A trên VPS.

Sử dụng:
    python manage.py debug_rag_images --query "nhà máy ở đâu" --agent-id 1
    python manage.py debug_rag_images --query "nhà máy ở đâu" --agent-id 1 --full

Không tạo file/ảnh nào. Chỉ in log ra stdout.
"""

import re
from django.core.management.base import BaseCommand, CommandError
from ai_agents.models import AiAgent, AiKnowledgeDocument, AiKnowledgeChunk


class Command(BaseCommand):
    help = "Debug RAG pipeline và ảnh Q&A - kiểm tra từng bước không tạo file"

    def add_arguments(self, parser):
        parser.add_argument("--query", type=str, required=True, help="Câu hỏi của khách cần test")
        parser.add_argument("--agent-id", type=int, required=True, help="ID của AiAgent cần debug")
        parser.add_argument("--full", action="store_true", help="In toàn bộ content của document")
        parser.add_argument("--threshold", type=float, default=0.7, help="Ngưỡng cosine distance (mặc định 0.7)")

    def handle(self, *args, **options):
        query = options["query"]
        agent_id = options["agent_id"]
        full = options["full"]
        threshold = options["threshold"]

        self.stdout.write(self.style.SUCCESS("=" * 70))
        self.stdout.write(self.style.SUCCESS("  DEBUG RAG IMAGES"))
        self.stdout.write(self.style.SUCCESS("=" * 70))

        # ── 1. Lấy Agent ─────────────────────────────────────────────────────
        try:
            agent = AiAgent.objects.get(id=agent_id)
        except AiAgent.DoesNotExist:
            raise CommandError(f"Không tìm thấy AiAgent id={agent_id}")

        self.stdout.write(f"\n[1] Agent: {agent.name} (id={agent.id}, company={agent.company.name})")

        # ── 2. Kiểm tra documents Q&A có ảnh ─────────────────────────────────
        qa_docs = AiKnowledgeDocument.objects.filter(agent=agent, doc_type="qa", status="completed")
        self.stdout.write(f"\n[2] Tài liệu Q&A đã học (status=completed): {qa_docs.count()} doc")

        img_found_in_content = 0
        for doc in qa_docs:
            img_urls = re.findall(r"!\[.*?\]\((https?://[^\)]+)\)", doc.content or "")
            if img_urls:
                img_found_in_content += 1
                self.stdout.write(self.style.WARNING(f"   ✔ Doc id={doc.id}: '{doc.title}' → {len(img_urls)} ảnh nhúng"))
                for u in img_urls:
                    self.stdout.write(f"       {u}")
                if full:
                    self.stdout.write(f"   --- Content ---\n{doc.content[:2000]}\n   ---")

        if img_found_in_content == 0:
            self.stdout.write(self.style.ERROR(
                "   ✗ Không tìm thấy ảnh markdown trong bất kỳ doc Q&A nào!\n"
                "     Kiểm tra lại: ảnh có được upload thành công không? URL có đúng không?"
            ))
        
        # ── 3. Kiểm tra chunks của doc Q&A ───────────────────────────────────
        self.stdout.write(f"\n[3] Chunks từ Q&A docs có ảnh:")
        for doc in qa_docs:
            img_urls_in_doc = re.findall(r"!\[.*?\]\((https?://[^\)]+)\)", doc.content or "")
            if not img_urls_in_doc:
                continue
            chunks = AiKnowledgeChunk.objects.filter(document=doc).order_by("id")
            self.stdout.write(f"\n   Doc id={doc.id} → {chunks.count()} chunks:")
            for i, ch in enumerate(chunks):
                has_img = bool(re.findall(r"!\[.*?\]\((https?://[^\)]+)\)", ch.content))
                img_marker = "📷" if has_img else "  "
                snippet = ch.content[:120].replace("\n", " ")
                self.stdout.write(f"   {img_marker} Chunk #{i+1}: {snippet}...")

        # ── 4. Chạy search_knowledge và in kết quả ────────────────────────────
        self.stdout.write(f"\n[4] Chạy search_knowledge(query='{query}', threshold={threshold}):")
        try:
            from ai_agents.rag_processor import search_knowledge
            result = search_knowledge(agent, query, limit=6)
            if result:
                self.stdout.write(self.style.SUCCESS("\n   ✔ search_knowledge trả về:\n"))
                self.stdout.write(result)

                img_in_result = re.findall(r"!\[.*?\]\((https?://[^\)]+)\)", result)
                if img_in_result:
                    self.stdout.write(self.style.SUCCESS(f"\n   ✔ TÌM THẤY {len(img_in_result)} ảnh trong kết quả RAG:"))
                    for u in img_in_result:
                        self.stdout.write(f"     {u}")
                else:
                    self.stdout.write(self.style.ERROR(
                        "\n   ✗ KHÔNG có ảnh trong kết quả RAG!\n"
                        "     → Nguyên nhân có thể do:\n"
                        "       a) Chunk chứa ảnh không được chọn (kém liên quan semantic)\n"
                        "       b) URL ảnh trong content không phải dạng http(s)\n"
                        "       c) Cosine distance > threshold (chunk quá xa với query)"
                    ))
            else:
                self.stdout.write(self.style.ERROR(
                    "\n   ✗ search_knowledge trả về rỗng!\n"
                    "     → Kiểm tra: API key có hợp lệ không? Embedding đã được tạo chưa?"
                ))
        except Exception as e:
            self.stdout.write(self.style.ERROR(f"\n   ✗ Exception: {e}"))
            import traceback
            self.stdout.write(traceback.format_exc())

        # ── 5. Kiểm tra embedding có tồn tại không ───────────────────────────
        self.stdout.write(f"\n[5] Kiểm tra embedding của Q&A docs có ảnh:")
        try:
            provider = agent.company.ai_settings.default_embedding_provider
        except Exception:
            provider = "openai"
        self.stdout.write(f"   Provider: {provider}")

        for doc in qa_docs:
            img_urls_in_doc = re.findall(r"!\[.*?\]\((https?://[^\)]+)\)", doc.content or "")
            if not img_urls_in_doc:
                continue
            chunks = AiKnowledgeChunk.objects.filter(document=doc)
            if provider == "gemini":
                embedded = chunks.exclude(embedding_gemini=None).count()
            else:
                embedded = chunks.exclude(embedding=None).count()
            total = chunks.count()
            status_str = self.style.SUCCESS(f"{embedded}/{total} chunks có embedding") if embedded == total else self.style.ERROR(f"{embedded}/{total} chunks có embedding — THIẾU!")
            self.stdout.write(f"   Doc id={doc.id}: {status_str}")

        # ── 6. Test cosine distance thực tế ──────────────────────────────────
        self.stdout.write(f"\n[6] Cosine distance của các chunks Q&A có ảnh với query '{query}':")
        try:
            from ai_agents.services import get_api_keys
            from ai_agents.rag_processor import get_embeddings, get_gemini_embeddings
            from pgvector.django import CosineDistance

            keys = get_api_keys(agent.company, provider)
            if keys:
                if provider == "gemini":
                    query_vector = get_gemini_embeddings([query], keys[0])[0]
                else:
                    query_vector = get_embeddings([query], keys[0])[0]

                for doc in qa_docs:
                    img_urls_in_doc = re.findall(r"!\[.*?\]\((https?://[^\)]+)\)", doc.content or "")
                    if not img_urls_in_doc:
                        continue
                    if provider == "gemini":
                        chunks = AiKnowledgeChunk.objects.filter(
                            document=doc, embedding_gemini__isnull=False
                        ).annotate(dist=CosineDistance("embedding_gemini", query_vector)).order_by("dist")
                    else:
                        chunks = AiKnowledgeChunk.objects.filter(
                            document=doc, embedding__isnull=False
                        ).annotate(dist=CosineDistance("embedding", query_vector)).order_by("dist")

                    self.stdout.write(f"\n   Doc id={doc.id} '{doc.title}':")
                    for ch in chunks:
                        dist = round(ch.dist, 4)
                        has_img = bool(re.findall(r"!\[.*?\]\((https?://[^\)]+)\)", ch.content))
                        color = self.style.SUCCESS if dist < threshold else self.style.ERROR
                        img_label = " 📷[CÓ ẢNH]" if has_img else ""
                        snippet = ch.content[:80].replace("\n", " ")
                        self.stdout.write(color(f"     dist={dist} {'✔PASS' if dist < threshold else '✗FAIL'}{img_label}: {snippet}..."))
            else:
                self.stdout.write(self.style.ERROR("   ✗ Không có API key để tính cosine distance"))
        except Exception as e:
            self.stdout.write(self.style.ERROR(f"   ✗ Exception: {e}"))
            import traceback
            self.stdout.write(traceback.format_exc())

        self.stdout.write(self.style.SUCCESS("\n" + "=" * 70))
        self.stdout.write(self.style.SUCCESS("  XONG. Xem kết quả ở trên để tìm nguyên nhân."))
        self.stdout.write(self.style.SUCCESS("=" * 70 + "\n"))
