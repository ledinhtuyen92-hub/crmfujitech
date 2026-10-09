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
    is_online = serializers.SerializerMethodField()

    class Meta:
        model = LiveDevice
        fields = ['id', 'name', 'is_active', 'last_seen_at', 'created_at', 'is_online', 'metadata', 'video_resolution', 'video_bitrate', 'video_fps']
        read_only_fields = ['id', 'last_seen_at', 'created_at', 'is_online', 'metadata']

    def get_is_online(self, obj):
        if not obj.last_seen_at:
            return False
        from django.utils import timezone
        import datetime
        return timezone.now() - obj.last_seen_at < datetime.timedelta(seconds=60)

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
    
    avatar_asset_url = serializers.SerializerMethodField()
    background_asset_url = serializers.SerializerMethodField()
    overlay_asset_url = serializers.SerializerMethodField()

    def get_avatar_asset_url(self, obj):
        if obj.avatar_asset and obj.avatar_asset.file:
            return obj.avatar_asset.file.url
        return None

    def get_background_asset_url(self, obj):
        if obj.background_asset and obj.background_asset.file:
            return obj.background_asset.file.url
        return None

    def get_overlay_asset_url(self, obj):
        if obj.overlay_asset and obj.overlay_asset.file:
            return obj.overlay_asset.file.url
        return None

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
        if 'product' in attrs and attrs['product'] and attrs['product'].company != company:
            raise serializers.ValidationError({"product": "Sản phẩm không hợp lệ."})
        if 'ai_agent' in attrs and attrs['ai_agent'].company != company:
            raise serializers.ValidationError({"ai_agent": "AI Agent không hợp lệ."})
            
        product = attrs.get('product')
        external_link = attrs.get('external_product_link')
        
        # If updating an existing instance, fallback to its values if not in attrs
        if self.instance:
            if 'product' not in attrs:
                product = self.instance.product
            if 'external_product_link' not in attrs:
                external_link = self.instance.external_product_link
                
        if not product and not external_link:
            raise serializers.ValidationError("Vui lòng chọn Sản phẩm từ kho nội bộ hoặc nhập Link giỏ hàng Affiliate.")
            
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

from .models import LiveMediaAsset

class LiveMediaAssetSerializer(serializers.ModelSerializer):
    asset_type_display = serializers.CharField(source='get_asset_type_display', read_only=True)
    is_system = serializers.SerializerMethodField()

    class Meta:
        model = LiveMediaAsset
        fields = '__all__'
        read_only_fields = ['company', 'created_at', 'updated_at']

    def get_is_system(self, obj):
        return obj.company is None
