from rest_framework import serializers

class AckPayloadSerializer(serializers.Serializer):
    command_id = serializers.UUIDField(required=True)
    reference_message_id = serializers.UUIDField(required=False, allow_null=True)
    status = serializers.ChoiceField(choices=['received', 'completed', 'failed'], required=True)
    error_detail = serializers.CharField(required=False, allow_null=True, allow_blank=True)

    def to_internal_value(self, data):
        if isinstance(data, dict):
            ref = data.get('reference_message_id')
            if ref == '' or ref is False:
                data = data.copy()
                data['reference_message_id'] = None
        return super().to_internal_value(data)
