from rest_framework import serializers

class AckPayloadSerializer(serializers.Serializer):
    command_id = serializers.UUIDField(required=True)
    reference_message_id = serializers.UUIDField(required=True)
    status = serializers.ChoiceField(choices=['received', 'completed', 'failed'], required=True)
    error_detail = serializers.CharField(required=False, allow_null=True, allow_blank=True)
