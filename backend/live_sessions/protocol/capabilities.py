from rest_framework import serializers

class EnvironmentCapabilitySerializer(serializers.Serializer):
    type = serializers.ChoiceField(choices=['local_studio', 'cloud_gpu_worker', 'dedicated_gpu'])
    os = serializers.CharField(max_length=100)

class RenderingCapabilitySerializer(serializers.Serializer):
    avatar_engine = serializers.CharField(max_length=100)
    max_resolution = serializers.CharField(max_length=50)
    lip_sync_supported = serializers.BooleanField(default=False)

class AudioCapabilitySerializer(serializers.Serializer):
    tts_mode = serializers.ChoiceField(choices=['remote', 'local'])
    local_models = serializers.ListField(
        child=serializers.CharField(max_length=100), 
        required=False, 
        default=list
    )

class CapabilitiesSerializer(serializers.Serializer):
    environment = EnvironmentCapabilitySerializer()
    rendering = RenderingCapabilitySerializer()
    audio = AudioCapabilitySerializer()

    def to_internal_value(self, data):
        """Allow forward compatibility by keeping unknown fields."""
        validated = super().to_internal_value(data)
        # Keep unknown capabilities for forward compatibility
        if isinstance(data, dict):
            for key, value in data.items():
                if key not in self.fields:
                    validated[key] = value
        return validated
