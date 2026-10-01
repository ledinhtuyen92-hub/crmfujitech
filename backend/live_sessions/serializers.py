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
    # stream_url and stream_key are write_only — NEVER returned in API responses
    # They contain RTMP credentials which must not be exposed.
    stream_url = serializers.CharField(write_only=True, required=False, allow_null=True, allow_blank=True)
    stream_key = serializers.CharField(
        write_only=True,
        required=False,
        allow_null=True,
        allow_blank=True,
        style={'input_type': 'password'},
        help_text="Stream Key (never returned after save)"
    )
    
    platform_display = serializers.CharField(source='get_platform_display', read_only=True)
    ai_agent_name = serializers.CharField(source='ai_agent.name', read_only=True)
    device_name = serializers.CharField(source='device.name', read_only=True)
    product_name = serializers.CharField(source='product.name', read_only=True)

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


class ShopeeManualRtmpSetupSerializer(serializers.Serializer):
    """
    Serializer for Manual RTMP mode setup.
    Used by the /sessions/{id}/setup-manual-rtmp/ endpoint.
    
    Security:
    - server_url and stream_key are write_only by nature (this is an input-only serializer)
    - They are never returned in any response
    - stream_key is validated to be non-empty
    - The combined RTMP URL is stored in LiveSession.stream_url (write_only field)
    """
    server_url = serializers.CharField(
        required=True,
        help_text="RTMP Server URL from Shopee Live PC (e.g. rtmp://...)"
    )
    stream_key = serializers.CharField(
        required=True,
        allow_blank=False,
        style={'input_type': 'password'},
        help_text="Stream Key from Shopee Live PC"
    )

    def validate_server_url(self, value):
        import re
        value = value.strip()
        if not re.match(r'^rtmps?://.+', value):
            raise serializers.ValidationError(
                "Server URL phải bắt đầu bằng rtmp:// hoặc rtmps://"
            )
        return value

    def validate_stream_key(self, value):
        value = value.strip()
        if len(value) < 4:
            raise serializers.ValidationError("Stream Key quá ngắn")
        return value

    def get_combined_rtmp_url(self) -> str:
        """
        Combine Server URL and Stream Key into canonical RTMP URL.
        Shopee's RTMP uses: server_url/stream_key
        NEVER log the output of this method.
        """
        server_url = self.validated_data['server_url'].rstrip('/')
        stream_key = self.validated_data['stream_key']
        return f"{server_url}/{stream_key}"

from .models import PlatformAccount

class PlatformAccountSerializer(serializers.ModelSerializer):
    class Meta:
        model = PlatformAccount
        fields = ['id', 'platform', 'account_id', 'display_name', 'status', 'created_at']
        read_only_fields = ['id', 'created_at']
