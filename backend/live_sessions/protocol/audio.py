from rest_framework import serializers

class AudioAssetSerializer(serializers.Serializer):
    asset_id = serializers.UUIDField(required=True)
    signed_url = serializers.URLField(required=True)
    expires_at = serializers.DateTimeField(required=True)
