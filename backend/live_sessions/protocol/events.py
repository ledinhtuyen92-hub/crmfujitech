from rest_framework import serializers
from .capabilities import CapabilitiesSerializer

class HeartbeatPayloadSerializer(serializers.Serializer):
    uptime_seconds = serializers.IntegerField(min_value=0, required=True)
    execution_state = serializers.ChoiceField(
        choices=['idle', 'initializing', 'ready', 'playing', 'error'], 
        required=True
    )
    capabilities_version = serializers.CharField(max_length=50, required=True)
    capabilities = CapabilitiesSerializer(required=True)

class CommentPayloadSerializer(serializers.Serializer):
    platform = serializers.CharField(max_length=50, required=True)
    comment_id = serializers.CharField(max_length=255, required=True)
    viewer_name = serializers.CharField(max_length=255, required=True)
    text = serializers.CharField(required=True)
    product_context = serializers.UUIDField(required=False, allow_null=True)
