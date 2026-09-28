from rest_framework import serializers

class ErrorPayloadSerializer(serializers.Serializer):
    error_code = serializers.ChoiceField(
        choices=[
            'COMMAND_EXPIRED', 
            'INVALID_STATE', 
            'AUTH_FAILED', 
            'EXECUTION_FAILED', 
            'DUPLICATE_COMMAND',
            'INVALID_SCHEMA'
        ], 
        required=True
    )
    detail = serializers.CharField(required=True)
