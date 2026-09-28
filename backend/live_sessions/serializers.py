from rest_framework import serializers
from .models import LivePlatformProduct

class LivePlatformProductSerializer(serializers.ModelSerializer):
    class Meta:
        model = LivePlatformProduct
        fields = '__all__'
        read_only_fields = ['company']

    def validate_product(self, value):
        # Enforce Company Ownership
        request = self.context.get('request')
        if request and hasattr(request, 'user'):
            if value.company != request.user.company:
                raise serializers.ValidationError("Bạn không thể map sản phẩm của công ty khác.")
        return value

from .models import LiveDevice, LiveSession

class LiveDeviceSerializer(serializers.ModelSerializer):
    class Meta:
        model = LiveDevice
        fields = ['id', 'name', 'is_active', 'last_seen_at', 'created_at']
        read_only_fields = ['id', 'last_seen_at', 'created_at']

class LiveSessionSerializer(serializers.ModelSerializer):
    class Meta:
        model = LiveSession
        fields = '__all__'
        read_only_fields = ['id', 'company', 'started_at', 'ended_at', 'created_at', 'updated_at', 'status']
    
    def validate(self, attrs):
        request = self.context.get('request')
        company = request.user.company if request and hasattr(request, 'user') else None
        if not company:
            return attrs
        if 'device' in attrs and attrs['device'].company != company:
            raise serializers.ValidationError({"device": "Thiết bị không hợp lệ."})
        if 'product' in attrs and attrs['product'].company != company:
            raise serializers.ValidationError({"product": "Sản phẩm không hợp lệ."})
        if 'ai_agent' in attrs and attrs['ai_agent'].company != company:
            raise serializers.ValidationError({"ai_agent": "AI Agent không hợp lệ."})
        return attrs
