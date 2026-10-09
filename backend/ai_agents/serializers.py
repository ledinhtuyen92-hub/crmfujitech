from rest_framework import serializers
from .models import SystemAiKey, CompanyAiSettings, AiAgent, AiKnowledgeDocument, CompanyAiKey, AiModelPricing

class SystemAiKeySerializer(serializers.ModelSerializer):
    class Meta:
        model = SystemAiKey
        fields = '__all__'

class CompanyAiKeySerializer(serializers.ModelSerializer):
    class Meta:
        model = CompanyAiKey
        fields = '__all__'
        read_only_fields = ['company']

class AiKnowledgeDocumentSerializer(serializers.ModelSerializer):
    class Meta:
        model = AiKnowledgeDocument
        fields = '__all__'
        
    def validate(self, data):
        agent = data.get('agent')
        product = data.get('product')
        
        # Nếu đang update một document đã có sẵn
        if not agent and self.instance:
            agent = self.instance.agent
            
        if agent and product:
            if product.company != agent.company:
                raise serializers.ValidationError({"product": "Sản phẩm không thuộc cùng công ty với AI Agent."})
        
        return data

class SimpleAiKnowledgeDocumentSerializer(serializers.ModelSerializer):
    class Meta:
        model = AiKnowledgeDocument
        fields = ['id', 'title', 'doc_type', 'status', 'embedding_provider', 'created_at', 'updated_at']

class AiAgentSerializer(serializers.ModelSerializer):
    knowledge_docs = SimpleAiKnowledgeDocumentSerializer(many=True, read_only=True)
    class Meta:
        model = AiAgent
        fields = '__all__'
        read_only_fields = ['company']

class CompanyAiSettingsSerializer(serializers.ModelSerializer):
    class Meta:
        model = CompanyAiSettings
        fields = '__all__'
        read_only_fields = ['company', 'allow_system_keys']

class AiModelPricingSerializer(serializers.ModelSerializer):
    class Meta:
        model = AiModelPricing
        fields = '__all__'
