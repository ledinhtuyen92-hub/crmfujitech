import logging
from rest_framework import viewsets, permissions
from users.permissions import ActionBasedPermission
from rest_framework.decorators import action
from rest_framework.response import Response
from .tasks import process_document_rag
from django.db import transaction
from .models import AiKnowledgeChunk
from .models import SystemAiKey, CompanyAiSettings, AiAgent, AiKnowledgeDocument, CompanyAiKey, AiModelPricing
from .serializers import SystemAiKeySerializer, CompanyAiSettingsSerializer, AiAgentSerializer, AiKnowledgeDocumentSerializer, CompanyAiKeySerializer, AiModelPricingSerializer
from .services import DEFAULT_JSON_TEMPLATE, DEFAULT_SYSTEM_RULES

logger = logging.getLogger(__name__)

class SystemAiKeyViewSet(viewsets.ModelViewSet):
    queryset = SystemAiKey.objects.all().order_by('-priority', '-created_at')
    serializer_class = SystemAiKeySerializer
    permission_classes = [permissions.IsAdminUser]

class CompanyAiKeyViewSet(viewsets.ModelViewSet):
    serializer_class = CompanyAiKeySerializer
    permission_classes = [permissions.IsAuthenticated, ActionBasedPermission]
    action_permissions = {
        'list': 'ai_agent.manage_keys',
        'retrieve': 'ai_agent.manage_keys',
        'create': 'ai_agent.manage_keys',
        'update': 'ai_agent.manage_keys',
        'partial_update': 'ai_agent.manage_keys',
        'destroy': 'ai_agent.manage_keys',
    }

    def get_queryset(self):
        return CompanyAiKey.objects.filter(company=self.request.user.company).order_by('-priority', '-created_at')

    def perform_create(self, serializer):
        serializer.save(company=self.request.user.company)

class AiAgentViewSet(viewsets.ModelViewSet):
    serializer_class = AiAgentSerializer
    permission_classes = [permissions.IsAuthenticated, ActionBasedPermission]
    action_permissions = {
        'list': 'ai_agent.manage_agents',
        'retrieve': 'ai_agent.manage_agents',
        'create': 'ai_agent.manage_agents',
        'update': 'ai_agent.manage_agents',
        'partial_update': 'ai_agent.manage_agents',
        'destroy': 'ai_agent.manage_agents',
        'default_prompt': 'ai_agent.manage_agents',
        'usage_stats': 'ai_agent.view_dashboard',
        'extract_conversation': 'ai_agent.manage_knowledge',
        'save_extracted_conversation': 'ai_agent.manage_knowledge',
    }
    
    def get_queryset(self):
        return AiAgent.objects.filter(company=self.request.user.company)

    @action(detail=False, methods=['get'], url_path='default-prompt')
    def default_prompt(self, request):
        """Trả về cấu trúc JSON mặc định dùng trong Core Prompt (Single Source of Truth)."""
        return Response({
            'template': DEFAULT_JSON_TEMPLATE,
            'core_system_rules': DEFAULT_SYSTEM_RULES
        })
        
    def perform_create(self, serializer):
        self._verify_agent_model(serializer.validated_data)
        serializer.save(company=self.request.user.company)

    def perform_update(self, serializer):
        self._verify_agent_model(serializer.validated_data)
        serializer.save()
        
    def _verify_agent_model(self, validated_data):
        from rest_framework import serializers
        provider = validated_data.get('provider')
        model_name = validated_data.get('model_name')
        
        if provider and model_name:
            from .services import get_api_keys
            company = self.request.user.company
            keys = get_api_keys(company, provider)
            if keys:
                api_key = keys[0]
                try:
                    if provider == 'gemini':
                        from google import genai as google_genai
                        client = google_genai.Client(api_key=api_key)
                        client.models.generate_content(model=model_name, contents="hi")
                    elif provider == 'openai':
                        from openai import OpenAI
                        client = OpenAI(api_key=api_key)
                        client.chat.completions.create(
                            model=model_name,
                            messages=[{"role": "user", "content": "hi"}],
                            max_completion_tokens=1
                        )
                    elif provider == 'anthropic':
                        from anthropic import Anthropic
                        client = Anthropic(api_key=api_key)
                        client.messages.create(
                            model=model_name,
                            max_tokens=1,
                            messages=[{"role": "user", "content": "hi"}]
                        )
                except Exception as e:
                    err = str(e).lower()
                    if '429' in err or 'quota' in err or 'resource_exhausted' in err:
                        # Bỏ qua lỗi Rate Limit để không chặn người dùng lưu cấu hình Agent
                        pass
                    elif 'not found' in err or '404' in err or '403' in err or 'permission' in err:
                        raise serializers.ValidationError({"model_name": f"Mô hình '{model_name}' bị chặn hoặc tài khoản của bạn chưa được cấp quyền dùng nó. Vui lòng chọn mô hình khác."})

    @action(detail=False, methods=['GET'], url_path='default-prompt')
    def default_prompt(self, request):
        from .services import DEFAULT_JSON_TEMPLATE, DEFAULT_SYSTEM_RULES
        return Response({
            'template': DEFAULT_JSON_TEMPLATE,
            'core_system_rules': DEFAULT_SYSTEM_RULES
        })

    @action(detail=False, methods=['POST'])
    def reset_usage_stats(self, request):
        from .models import ApiUsageLog
        # Xoá toàn bộ lịch sử log của công ty này
        ApiUsageLog.objects.filter(company=request.user.company).delete()
        return Response({'status': 'ok'})

    @action(detail=False, methods=['GET'])
    def usage_stats(self, request):
        from .models import ApiUsageLog
        from django.db.models import Sum
        from django.utils import timezone
        
        now = timezone.now()
        period = request.query_params.get('period', 'month')
        
        import datetime
        logs = ApiUsageLog.objects.filter(company=request.user.company)
        if period == 'today':
            start_date = now.replace(hour=0, minute=0, second=0, microsecond=0)
            logs = logs.filter(created_at__gte=start_date)
        elif period == 'week':
            start_date = (now - datetime.timedelta(days=now.weekday())).replace(hour=0, minute=0, second=0, microsecond=0)
            logs = logs.filter(created_at__gte=start_date)
        elif period == 'month':
            start_date = now.replace(day=1, hour=0, minute=0, second=0, microsecond=0)
            logs = logs.filter(created_at__gte=start_date)
        
        total_input = logs.aggregate(Sum('input_tokens'))['input_tokens__sum'] or 0
        total_output = logs.aggregate(Sum('output_tokens'))['output_tokens__sum'] or 0
        total_cost = logs.aggregate(Sum('total_cost_usd'))['total_cost_usd__sum'] or 0
        
        # Group by agent and model directly from logs to show historical data
        from django.db.models import F
        grouped_logs = logs.values(
            'model_name',
            agent_name_str=F('agent__name')
        ).annotate(
            input_sum=Sum('input_tokens'),
            output_sum=Sum('output_tokens'),
            cost_sum=Sum('total_cost_usd')
        ).order_by('-cost_sum')

        agent_stats = []
        for g in grouped_logs:
            agent_name = g['agent_name_str'] or 'Trợ lý đã xoá / Hệ thống'
            agent_stats.append({
                'agent_name': agent_name,
                'model_name': g['model_name'],
                'input_tokens': g['input_sum'],
                'output_tokens': g['output_sum'],
                'total_cost_usd': g['cost_sum']
            })
                
        return Response({
            'total_input_tokens': total_input,
            'total_output_tokens': total_output,
            'total_cost_usd': total_cost,
            'agent_stats': agent_stats
        })

class AiKnowledgeDocumentViewSet(viewsets.ModelViewSet):
    serializer_class = AiKnowledgeDocumentSerializer
    permission_classes = [permissions.IsAuthenticated, ActionBasedPermission]
    action_permissions = {
        'list': 'ai_agent.manage_knowledge',
        'retrieve': 'ai_agent.manage_knowledge',
        'create': 'ai_agent.manage_knowledge',
        'update': 'ai_agent.manage_knowledge',
        'partial_update': 'ai_agent.manage_knowledge',
        'destroy': 'ai_agent.manage_knowledge',
        'retry': 'ai_agent.manage_knowledge',
        'test_retrieval': 'ai_agent.manage_knowledge',
        'get_content': 'ai_agent.manage_knowledge',
    }
    
    def get_queryset(self):
        return AiKnowledgeDocument.objects.filter(agent__company=self.request.user.company)
        
    def perform_create(self, serializer):
        doc = serializer.save()
        transaction.on_commit(lambda: process_document_rag.delay(doc.id))
        
    def perform_update(self, serializer):
        needs_reembed = 'content' in serializer.validated_data or 'file_attachment' in serializer.validated_data
        doc = serializer.save()
        if needs_reembed:
            doc.status = 'pending'
            doc.error_message = ''
            doc.save(update_fields=['status', 'error_message'])
            transaction.on_commit(lambda: process_document_rag.delay(doc.id))

    @action(detail=True, methods=['GET'])
    def get_content(self, request, pk=None):
        """Trả về nội dung text của tài liệu (từ content field hoặc ghép từ chunks)."""
        doc = self.get_object()
        if doc.content:
            return Response({'content': doc.content})
        # Fallback: ghép từ chunks đã lưu trong DB
        chunks = doc.chunks.order_by('id').values_list('content', flat=True)
        text = '\n\n'.join(chunks)
        return Response({'content': text})

    @action(detail=True, methods=['POST'])
    def retry(self, request, pk=None):
        doc = self.get_object()
        doc.status = 'pending'
        doc.error_message = ''
        doc.save(update_fields=['status', 'error_message'])
        transaction.on_commit(lambda: process_document_rag.delay(doc.id))
        return Response({'status': 'đã gửi yêu cầu học lại'})

    @action(detail=False, methods=['POST'])
    def test_retrieval(self, request):
        query = request.data.get('query', '')
        agent_id = request.data.get('agent_id')
        
        if not query or not agent_id:
            return Response({'error': 'Vui lòng cung cấp query và agent_id'}, status=400)
            
        from .services import get_api_keys
        from openai import OpenAI
        import google.generativeai as genai
        from pgvector.django import L2Distance
        
        company = request.user.company
        try:
            provider = company.ai_settings.default_embedding_provider
        except Exception:
            provider = 'openai'
        keys = get_api_keys(company, provider)
        
        if not keys:
            return Response({'error': f'Không có {provider.upper()} API Key hợp lệ để tìm kiếm'}, status=400)
            
        try:
            # Xoay vòng API Key để embed câu hỏi
            query_embedding = None
            last_error = None
            for api_key in keys:
                try:
                    if provider == 'gemini':
                        genai.configure(api_key=api_key)
                        response = genai.embed_content(
                            model="models/gemini-embedding-001",
                            content=query,
                            task_type="retrieval_query",
                            output_dimensionality=768
                        )
                        query_embedding = response['embedding']
                    else:
                        client = OpenAI(api_key=api_key)
                        res = client.embeddings.create(input=[query], model="text-embedding-3-small")
                        query_embedding = res.data[0].embedding
                    break
                except Exception as e:
                    last_error = e
                    logger.warning(f"[Knowledge Search] Key thất bại ({provider}), thử key tiếp... Lỗi: {e}")
                    continue
            
            if query_embedding is None:
                return Response({'error': f'Tất cả API Key {provider.upper()} đều thất bại: {str(last_error)[:200]}'}, status=500)
            
            if provider == 'gemini':
                distance_expr = L2Distance('embedding_gemini', query_embedding)
            else:
                distance_expr = L2Distance('embedding', query_embedding)
            
            # Tìm kiếm vector bằng pgvector
            chunks = AiKnowledgeChunk.objects.filter(
                document__agent_id=agent_id,
                embedding_provider=provider
            ).annotate(
                distance=distance_expr
            ).order_by('distance')[:3]
            
            results = []
            for chunk in chunks:
                results.append({
                    'document': chunk.document.title,
                    'content': chunk.content,
                    'distance': chunk.distance
                })
                
            return Response({'results': results})
        except Exception as e:
            return Response({'error': str(e)}, status=500)

    @action(detail=False, methods=['POST'])
    def extract_conversation(self, request):
        lead_id = request.data.get('lead_id')
        platform = request.data.get('platform')
        agent_id = request.data.get('agent_id')
        
        if not all([lead_id, platform, agent_id]):
            return Response({'error': 'Thiếu tham số'}, status=400)
            
        try:
            agent = AiAgent.objects.get(id=agent_id, company=request.user.company)
            # Fetch messages
            messages_text = []
            if platform == 'zalo':
                from zalo_integration.models import ZaloMessage, SocialLead
                lead = SocialLead.objects.get(id=lead_id, company=request.user.company)
                msgs = ZaloMessage.objects.filter(social_lead=lead).order_by('created_at')[:30]
                for m in msgs:
                    sender = "Khách" if m.direction == 'inbound' else "Sale"
                    messages_text.append(f"{sender}: {m.content}")
            elif platform == 'facebook':
                from facebook_integration.models import FacebookMessage, FacebookLead
                lead = FacebookLead.objects.get(id=lead_id, company=request.user.company)
                msgs = FacebookMessage.objects.filter(lead=lead).order_by('created_at')[:30]
                for m in msgs:
                    sender = "Khách" if m.sender_type == 'customer' else "Sale"
                    messages_text.append(f"{sender}: {m.text}")
                    
            if not messages_text:
                return Response({'error': 'Không có lịch sử hội thoại'}, status=400)
                
            transcript = "\n".join(messages_text)
            
            # Use agent.model_name to extract
            from ai_agents.services import generate_raw_text
            prompt = f"Bạn là chuyên gia huấn luyện AI. Hãy đọc đoạn hội thoại sau và bóc tách ra các thắc mắc khó của khách và cách Sale trả lời. Trình bày dưới dạng các cặp Hỏi - Đáp (Q&A) cực kỳ ngắn gọn, chuẩn mực.\n\nBẮT BUỘC phải định dạng chính xác từng cặp theo mẫu sau (KHÔNG thay đổi chữ 'Hỏi:' và 'Đáp:'):\n\nHỏi: [Nội dung câu hỏi của khách]\nĐáp: [Nội dung trả lời của Sale]\n\nKhông chứa tên riêng, số điện thoại hay khuyến mãi cá biệt. CHỈ xuất ra danh sách các cặp theo đúng mẫu trên, mỗi cặp cách nhau 1 dòng trắng. Tuyệt đối KHÔNG viết thêm các câu dẫn dắt, giải thích hay mào đầu.\n\nHội thoại:\n{transcript}"
            
            try:
                extracted_text = generate_raw_text(agent, prompt)
            except Exception as llm_err:
                logger.error(f"[RAG Extract] LLM Error: {llm_err}")
                return Response({'error': f'Lỗi khi trích xuất qua LLM: {str(llm_err)[:300]}'}, status=500)
                
            if not extracted_text:
                return Response({'error': 'LLM trả về kết quả rỗng. Vui lòng thử lại.'}, status=500)
                
            return Response({
                'status': 'success',
                'extracted_text': extracted_text,
                'agent_id': agent_id
            })
            
        except Exception as e:
            import traceback
            traceback.print_exc()
            return Response({'error': str(e)}, status=500)

    @action(detail=False, methods=['POST'])
    def save_extracted_conversation(self, request):
        extracted_text = request.data.get('extracted_text')
        agent_id = request.data.get('agent_id')
        
        if not extracted_text or not agent_id:
            return Response({'error': 'Thiếu tham số'}, status=400)
            
        try:
            agent = AiAgent.objects.get(id=agent_id, company=request.user.company)
            # Master document
            try:
                provider = agent.company.ai_settings.default_embedding_provider
            except Exception:
                provider = 'openai'
            doc, created = AiKnowledgeDocument.objects.get_or_create(
                agent=agent,
                title='📚 Tổng hợp Q&A Hội thoại (Auto)',
                doc_type='qa',
                defaults={'content': extracted_text, 'status': 'pending', 'embedding_provider': provider}
            )
            
            if not created:
                doc.content = f"{doc.content}\n\n{extracted_text}"
                doc.status = 'pending'
                doc.embedding_provider = provider
                doc.save()
                
            process_document_rag.delay(doc.id)
            return Response({'status': 'Đã lưu thành công vào Cẩm nang'})
        except Exception as e:
            return Response({'error': str(e)}, status=500)

    @action(detail=False, methods=['GET'])
    def export_data(self, request):
        """Xuất toàn bộ kho tri thức của công ty ra JSON"""
        docs = AiKnowledgeDocument.objects.filter(agent__company=request.user.company)
        data = []
        for doc in docs:
            data.append({
                'agent_name': doc.agent.name,
                'title': doc.title,
                'content': doc.content,
                'doc_type': doc.doc_type,
                'image_description': doc.image_description,
            })
        return Response(data)

    @action(detail=False, methods=['POST'])
    def import_data(self, request):
        """Nhập kho tri thức từ JSON"""
        target_agent_id = request.data.get('agent_id')
        docs_data = request.data.get('documents', [])
        
        if not target_agent_id:
            return Response({'error': 'Vui lòng chọn Trợ lý AI đích'}, status=400)
            
        if not isinstance(docs_data, list):
            return Response({'error': 'Dữ liệu không hợp lệ'}, status=400)
            
        try:
            target_agent = AiAgent.objects.get(id=target_agent_id, company=request.user.company)
        except AiAgent.DoesNotExist:
            return Response({'error': 'Không tìm thấy Trợ lý AI đích'}, status=404)
            
        try:
            provider = request.user.company.ai_settings.default_embedding_provider
        except Exception:
            provider = 'openai'
        
        imported_count = 0
        for doc_data in docs_data:
            # Bỏ qua các doc rỗng
            if not doc_data.get('title') and not doc_data.get('content'):
                continue
                
            doc = AiKnowledgeDocument.objects.create(
                agent=target_agent,
                title=doc_data.get('title', 'Tài liệu nhập (Không tên)'),
                content=doc_data.get('content', ''),
                doc_type=doc_data.get('doc_type', 'file'),
                image_description=doc_data.get('image_description', ''),
                status='pending',
                embedding_provider=provider
            )
            transaction.on_commit(lambda d_id=doc.id: process_document_rag.delay(d_id))
            imported_count += 1
            
        return Response({'status': f'Đã nhập thành công {imported_count} tài liệu'})


class CompanyAiSettingsViewSet(viewsets.ModelViewSet):
    serializer_class = CompanyAiSettingsSerializer
    permission_classes = [permissions.IsAuthenticated]
    
    def get_queryset(self):
        return CompanyAiSettings.objects.filter(company=self.request.user.company)
        
    @action(detail=False, methods=['GET', 'PUT', 'PATCH'])
    def mine(self, request):
        settings, _ = CompanyAiSettings.objects.get_or_create(company=request.user.company)
        if request.method == 'GET':
            return Response(self.get_serializer(settings).data)
        else:
            serializer = self.get_serializer(settings, data=request.data, partial=True)
            serializer.is_valid(raise_exception=True)
            serializer.save()
                
            return Response(serializer.data)

    @action(detail=False, methods=['POST'])
    def manual_sync_products(self, request):
        from .tasks import sync_company_products_to_rag
        from .models import AiKnowledgeDocument, AiAgent
        
        # Tạo document trước để UI thấy ngay lập tức
        first_agent = AiAgent.objects.filter(company_id=request.user.company.id).first()
        if first_agent:
            try:
                provider = request.user.company.ai_settings.default_embedding_provider
            except Exception:
                provider = 'openai'
            doc, created = AiKnowledgeDocument.objects.get_or_create(
                agent=first_agent,
                title='Danh mục Sản phẩm Hệ thống (Auto)',
                doc_type='file',
                defaults={'content': '', 'status': 'pending', 'embedding_provider': provider}
            )
            if not created:
                doc.status = 'pending'
                doc.embedding_provider = provider
                doc.save(update_fields=['status', 'embedding_provider'])

        sync_company_products_to_rag.delay(request.user.company.id)
        return Response({'status': 'Đã gửi yêu cầu đồng bộ danh sách sản phẩm thành công'})

    @action(detail=False, methods=['GET'])
    def available_providers(self, request):
        company = request.user.company
        settings, _ = CompanyAiSettings.objects.get_or_create(company=company)
        
        # Lấy các provider có key cá nhân đang active
        company_providers = list(CompanyAiKey.objects.filter(
            company=company, is_active=True
        ).values_list('provider', flat=True).distinct())
        
        # Nếu được phép dùng key hệ thống, lấy thêm các provider có key hệ thống đang active
        system_providers = []
        if settings.allow_system_keys and settings.use_system_keys:
            system_providers = list(SystemAiKey.objects.filter(
                is_active=True
            ).values_list('provider', flat=True).distinct())
            
        # Gộp lại và loại bỏ trùng lặp
        available = list(set(company_providers + system_providers))
        return Response({'available_providers': available})

    @action(detail=False, methods=['GET'])
    def fetch_models(self, request):
        """Gọi thẳng API của từng Provider để lấy danh sách model đang hỗ trợ."""
        provider = request.query_params.get('provider')
        if not provider:
            return Response({'error': 'Missing provider parameter'}, status=400)

        company = request.user.company
        from .services import get_api_keys
        keys = get_api_keys(company, provider)

        if not keys:
            return Response({'error': f'Không có API Key nào đang hoạt động cho nhà cung cấp "{provider}".'}, status=400)

        api_key = keys[0]
        models = []

        try:
            if provider == 'gemini':
                from google import genai as google_genai
                client = google_genai.Client(api_key=api_key)
                SKIP_KEYWORDS = ['tts', 'embed', 'aqa', 'imagen', 'veo', 'audio', 'live', 'translate', 'robotics', 'research', 'nano', 'lyria', 'omni', 'computer', 'antigravity', 'clip', 'image']
                for m in client.models.list():
                    name = m.name  # e.g. "models/gemini-2.5-flash"
                    # Only include text generation models
                    if hasattr(m, 'supported_actions') and m.supported_actions and 'generateContent' in m.supported_actions:
                        short_name = name.replace('models/', '')
                        if not any(kw in short_name.lower() for kw in SKIP_KEYWORDS):
                            models.append({'id': short_name, 'name': short_name})
                
                verified_models = models # Bỏ qua xác thực để tránh lỗi 429 Quota Exceeded
                
                models = verified_models

            elif provider == 'openai':
                from openai import OpenAI
                client = OpenAI(api_key=api_key)
                INCLUDE_PREFIXES = ('gpt-', 'o1', 'o2', 'o3', 'o4', 'chatgpt')
                for m in client.models.list():
                    if any(m.id.startswith(p) for p in INCLUDE_PREFIXES):
                        # Filter out fine-tuned or legacy models
                        if 'instruct' not in m.id and 'vision' not in m.id and '0301' not in m.id and '0314' not in m.id:
                            models.append({'id': m.id, 'name': m.id})
                
                verified_models = models # Bỏ qua xác thực để tránh lỗi 429 Quota Exceeded
                models = sorted(verified_models, key=lambda x: x['id'])

            elif provider == 'anthropic':
                # Anthropic doesn't have a public list endpoint, return known models
                models = [
                    {'id': 'claude-3-5-sonnet-20241022', 'name': 'Claude 3.5 Sonnet (Cân bằng)'},
                    {'id': 'claude-3-5-haiku-20241022', 'name': 'Claude 3.5 Haiku (Nhanh, Rẻ)'},
                    {'id': 'claude-opus-4-5', 'name': 'Claude Opus 4.5 (Thông minh nhất)'},
                    {'id': 'claude-sonnet-4-5', 'name': 'Claude Sonnet 4.5 (Thế hệ mới)'},
                ]
                
                # Bỏ qua xác thực để tránh lỗi 429 Quota Exceeded
                pass

        except Exception as e:
            return Response({'error': f'Lỗi khi kết nối tới {provider}: {str(e)}'}, status=400)

        # Mask API key for security
        masked_key = f"{api_key[:6]}...{api_key[-4:]}" if len(api_key) > 10 else "***"
        return Response({
            'models': models, 
            'count': len(models),
            'used_key': masked_key
        })

class AiModelPricingViewSet(viewsets.ModelViewSet):
    serializer_class = AiModelPricingSerializer
    permission_classes = [permissions.IsAuthenticated]
    pagination_class = None
    
    def get_queryset(self):
        return AiModelPricing.objects.all().order_by('provider', 'model_name')
        
    @action(detail=False, methods=['post'])
    def sync(self, request):
        try:
            from .tasks import sync_ai_model_pricing
            result = sync_ai_model_pricing() # Synchronous call for instant feedback
            return Response(result)
        except Exception as e:
            return Response({'error': str(e)}, status=500)
            
    @action(detail=True, methods=['post'])
    def reset(self, request, pk=None):
        pricing = self.get_object()
        pricing.is_custom = False
        pricing.save()
        return Response({'status': 'ok'})
