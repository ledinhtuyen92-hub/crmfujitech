from rest_framework import serializers
from .audio import AudioAssetSerializer

class SessionControlPayloadSerializer(serializers.Serializer):
    command_id = serializers.UUIDField(required=True)
    action = serializers.ChoiceField(choices=['pause', 'resume', 'stop'], required=True)

class SpeechSpeakPayloadSerializer(serializers.Serializer):
    command_id = serializers.UUIDField(required=True)
    correlation_id = serializers.UUIDField(required=False, allow_null=True)
    text = serializers.CharField(required=True, allow_blank=True)
    audio_asset = AudioAssetSerializer(required=False, allow_null=True)
    interruptible = serializers.BooleanField(default=True)
    priority = serializers.ChoiceField(choices=['high', 'normal'], default='normal')

class AvatarActionPayloadSerializer(serializers.Serializer):
    command_id = serializers.UUIDField(required=True)
    action = serializers.CharField(max_length=100, required=True)
    duration_ms = serializers.IntegerField(min_value=0, required=True)

class SessionSyncPayloadSerializer(serializers.Serializer):
    cloud_to_device_sequence = serializers.IntegerField(min_value=0, required=True)
    device_to_cloud_sequence = serializers.IntegerField(min_value=0, required=True)
    status = serializers.ChoiceField(choices=['request', 'acknowledged'], default='request')

class StreamStartPayloadSerializer(serializers.Serializer):
    command_id = serializers.UUIDField(required=True)
    correlation_id = serializers.UUIDField(required=False, allow_null=True)
    stream_url = serializers.CharField(required=True)
    width = serializers.IntegerField(default=800)
    height = serializers.IntegerField(default=600)
    fps = serializers.IntegerField(default=30)
    video_codec = serializers.CharField(default='h264')
    bitrate = serializers.CharField(default='2500k')
    audio_sample_rate = serializers.IntegerField(default=44100)
    audio_channels = serializers.IntegerField(default=2)
    
    # Scene Configuration
    ai_agent_id = serializers.IntegerField(required=False, allow_null=True)
    session_prompt = serializers.CharField(required=False, allow_null=True, allow_blank=True)
    avatar_asset_url = serializers.CharField(required=False, allow_null=True, allow_blank=True)
    background_asset_url = serializers.CharField(required=False, allow_null=True, allow_blank=True)
    overlay_asset_url = serializers.CharField(required=False, allow_null=True, allow_blank=True)
    audio_asset_url = serializers.CharField(required=False, allow_null=True, allow_blank=True)

class StreamStopPayloadSerializer(serializers.Serializer):
    command_id = serializers.UUIDField(required=True)
    correlation_id = serializers.UUIDField(required=False, allow_null=True)
    reason = serializers.CharField(required=False, allow_null=True, allow_blank=True)
