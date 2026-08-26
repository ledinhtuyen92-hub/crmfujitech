from django.db import models
from users.models import Company
from pgvector.django import VectorField

class SystemAiKey(models.Model):
    """
    Kho API Key hệ thống do Super Admin quản lý.
    """
    PROVIDER_CHOICES = (
        ('openai', 'OpenAI'),
        ('anthropic', 'Anthropic'),
        ('gemini', 'Google Gemini'),
    )
    provider = models.CharField(max_length=50, choices=PROVIDER_CHOICES, default='openai')
    api_key = models.CharField(max_length=255)
    is_active = models.BooleanField(default=True)
    priority = models.IntegerField(default=0, help_text="Độ ưu tiên (cao hơn sẽ được chọn trước)")
    created_at = models.DateTimeField(auto_now_add=True)
    
    def __str__(self):
        return f"{self.provider} - {self.api_key[:8]}..."

class CompanyAiSettings(models.Model):
    """
    Cấu hình AI chung cho toàn công ty.
    """
    company = models.OneToOneField(Company, on_delete=models.CASCADE, related_name='ai_settings')
    allow_system_keys = models.BooleanField(default=False, help_text="Super Admin cấp quyền dùng Quota hệ thống")
    use_system_keys = models.BooleanField(default=True, help_text="Công ty bật/tắt sử dụng Quota hệ thống")
    
    EMBEDDING_PROVIDER_CHOICES = (
        ('openai', 'OpenAI (1536 chiều)'),
        ('gemini', 'Google Gemini (768 chiều)')
    )
    default_embedding_provider = models.CharField(max_length=50, choices=EMBEDDING_PROVIDER_CHOICES, default='openai')
    auto_sync_products = models.BooleanField(default=False, help_text="Tự động đồng bộ Sản phẩm làm Tri thức RAG")
    enable_chat_extraction = models.BooleanField(default=True, help_text="Cho phép Đóng gói Hội thoại vào RAG")
    
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)
    
    def __str__(self):
        return f"AI Settings cho {self.company.name}"

class CompanyAiKey(models.Model):
    """
    Kho API Key riêng của từng công ty.
    """
    PROVIDER_CHOICES = (
        ('openai', 'OpenAI'),
        ('anthropic', 'Anthropic'),
        ('gemini', 'Google Gemini'),
    )
    company = models.ForeignKey(Company, on_delete=models.CASCADE, related_name='ai_keys')
    provider = models.CharField(max_length=50, choices=PROVIDER_CHOICES, default='openai')
    api_key = models.CharField(max_length=255)
    is_active = models.BooleanField(default=True)
    priority = models.IntegerField(default=0, help_text="Độ ưu tiên (cao hơn sẽ được chọn trước)")
    created_at = models.DateTimeField(auto_now_add=True)
    
    def __str__(self):
        return f"{self.company.name} - {self.provider} - {self.api_key[:8]}..."

class AiAgent(models.Model):
    """
    Trợ lý AI (Multi-Agent). Một công ty có thể tạo nhiều AI với tính cách khác nhau.
    """
    company = models.ForeignKey(Company, on_delete=models.CASCADE, related_name='ai_agents')
    name = models.CharField(max_length=100, help_text="Ví dụ: AI CSKH Zalo, AI Chốt Sale Fanpage")
    
    PROVIDER_CHOICES = (
        ('openai', 'OpenAI'),
        ('anthropic', 'Anthropic'),
        ('gemini', 'Google Gemini'),
    )
    provider = models.CharField(max_length=50, choices=PROVIDER_CHOICES, default='openai')
    
    MODEL_CHOICES = (
        # OpenAI
        ('gpt-4o-mini', 'GPT-4o-mini (Nhanh, Rẻ - Khuyên dùng CSKH)'),
        ('gpt-4o', 'GPT-4o (Thông minh, Phổ biến)'),
        ('gpt-4.5-turbo', 'GPT-4.5 Turbo (Nâng cấp lớn)'),
        ('gpt-5', 'GPT-5 (Tối tân nhất)'),
        ('o1-mini', 'O1 Mini (Lập luận logic nhanh)'),
        ('o1', 'O1 (Siêu trí tuệ)'),
        # Anthropic
        ('claude-3-5-sonnet', 'Claude 3.5 Sonnet (Cân bằng)'),
        ('claude-3-5-opus', 'Claude 3.5 Opus (Cao cấp)'),
        ('claude-4-sonnet', 'Claude 4 Sonnet (Thế hệ mới)'),
        ('claude-4-opus', 'Claude 4 Opus (Tối tân nhất)'),
        # Google Gemini
        ('gemini-flash-latest', 'Gemini Flash Latest (Nhanh, Rẻ nhất - Khuyên dùng CSKH)'),
        ('gemini-pro-latest', 'Gemini Pro Latest (Thông minh, Xử lý tài liệu lớn)'),
        ('gemini-flash-lite-latest', 'Gemini Flash Lite Latest (Siêu nhẹ, Free Tier)'),
    )
    model_name = models.CharField(max_length=100, default='gpt-4o-mini')
    system_prompt = models.TextField(help_text="Nhân cách và hướng dẫn hành vi cho AI", blank=True)
    core_system_rules = models.TextField(help_text="Luật ngầm định cốt lõi của hệ thống", blank=True, null=True)
    core_prompt_template = models.TextField(help_text="Cấu trúc JSON cốt lõi của AI", blank=True, null=True)
    temperature = models.FloatField(default=0.7, help_text="Độ sáng tạo (0 - 1)")
    
    # Các tùy chọn nâng cao (Toggles)
    enable_human_typing = models.BooleanField(default=False, verbose_name="Giả lập gõ phím")
    enable_auto_summary = models.BooleanField(default=True, verbose_name="Tóm tắt hội thoại cho Sale")
    enable_auto_tagging = models.BooleanField(default=False, verbose_name="Tự động gắn thẻ Inbox")
    enable_drip_followup = models.BooleanField(default=False, verbose_name="Tự động bám đuổi (Follow-up)")
    drip_followup_hours = models.IntegerField(default=24, help_text="Số giờ chờ trước khi tự động bám đuổi")
    debounce_delay = models.IntegerField(default=4, help_text="Thời gian chờ (giây) sau tin nhắn cuối để gộp các tin nhắn lại. Khuyên dùng: 4-15 giây", verbose_name="Thời gian chờ gộp tin (Debounce)")
    
    is_active = models.BooleanField(default=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    def __str__(self):
        return f"{self.name} ({self.company.name})"

class AiKnowledgeDocument(models.Model):
    """
    Tài liệu tri thức (RAG) được gán cho AI.
    """
    agent = models.ForeignKey(AiAgent, on_delete=models.CASCADE, related_name='knowledge_docs')
    title = models.CharField(max_length=200)
    content = models.TextField(help_text="Nội dung văn bản (hoặc trích xuất từ file)", blank=True)
    file_attachment = models.FileField(upload_to='ai_docs/', blank=True, null=True)
    image_description = models.TextField(
        blank=True,
        verbose_name="Mô tả ảnh (AI sinh ra)",
        help_text="Được dùng để tìm kiếm tài liệu khi khách gửi ảnh"
    )
    
    DOC_TYPE_CHOICES = (
        ('file', 'File tài liệu'),
        ('qa', 'Hỏi - Đáp (Q&A)'),
        ('image', 'Hình ảnh Mẫu'),
    )
    doc_type = models.CharField(max_length=20, choices=DOC_TYPE_CHOICES, default='file')
    
    STATUS_CHOICES = (
        ('pending', 'Chờ xử lý'),
        ('processing', 'Đang học'),
        ('completed', 'Hoàn thành'),
        ('failed', 'Lỗi'),
    )
    status = models.CharField(max_length=20, choices=STATUS_CHOICES, default='pending')
    error_message = models.TextField(blank=True, null=True)
    
    embedding_provider = models.CharField(max_length=20, default='openai', help_text="Nền tảng nhúng dữ liệu (openai hoặc gemini)")
    
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)
    
    def __str__(self):
        return f"{self.title} ({self.get_status_display()})"

class AiKnowledgeChunk(models.Model):
    """
    Lưu trữ các đoạn văn bản (chunks) đã được băm nhỏ từ AiKnowledgeDocument
    kèm theo vector nhúng (embedding) để tìm kiếm Semantic Search.
    """
    document = models.ForeignKey(AiKnowledgeDocument, on_delete=models.CASCADE, related_name='chunks')
    content = models.TextField(help_text="Nội dung đoạn text đã băm nhỏ")
    
    embedding_provider = models.CharField(max_length=50, default='openai', help_text="Nền tảng đã dùng để nhúng Vector")
    embedding = VectorField(dimensions=1536, blank=True, null=True, help_text="Vector sinh bởi OpenAI")
    embedding_gemini = VectorField(dimensions=768, blank=True, null=True, help_text="Vector sinh bởi Gemini")
    created_at = models.DateTimeField(auto_now_add=True)

    def __str__(self):
        return f"Chunk of {self.document.title}"


class ApiUsageLog(models.Model):
    """
    Theo dõi lượng token và chi phí API của từng công ty.
    """
    company = models.ForeignKey(Company, on_delete=models.CASCADE, related_name='api_usage_logs')
    agent = models.ForeignKey(AiAgent, on_delete=models.SET_NULL, null=True, blank=True, related_name='usage_logs')
    provider = models.CharField(max_length=50) # openai, gemini, anthropic
    model_name = models.CharField(max_length=100)
    input_tokens = models.IntegerField(default=0)
    output_tokens = models.IntegerField(default=0)
    total_cost_usd = models.DecimalField(max_digits=12, decimal_places=6, default=0.0)
    created_at = models.DateTimeField(auto_now_add=True)

    def __str__(self):
        return f"{self.company.name} - {self.model_name} - {self.total_cost_usd}$"

class AiModelPricing(models.Model):
    """
    Bảng giá AI model để tham chiếu. Có thể tự động bét từ LiteLLM hoặc chỉnh sửa thủ công.
    """
    provider = models.CharField(max_length=50) # openai, gemini, anthropic...
    model_name = models.CharField(max_length=100, unique=True)
    input_price_per_1m = models.DecimalField(max_digits=12, decimal_places=6, default=0.0)
    output_price_per_1m = models.DecimalField(max_digits=12, decimal_places=6, default=0.0)
    is_custom = models.BooleanField(default=False, help_text="Nếu True, auto-sync sẽ không ghi đè giá này.")
    updated_at = models.DateTimeField(auto_now=True)

    def __str__(self):
        return f"{self.model_name} ({self.provider}) - Input: {self.input_price_per_1m}$ - Output: {self.output_price_per_1m}$"
