from rest_framework import serializers
from django.utils import timezone
from .commands import (
    SessionControlPayloadSerializer, SpeechSpeakPayloadSerializer, 
    AvatarActionPayloadSerializer, SessionSyncPayloadSerializer,
    StreamStartPayloadSerializer, StreamStopPayloadSerializer
)
from .events import HeartbeatPayloadSerializer, CommentPayloadSerializer
from .acks import AckPayloadSerializer
from .errors import ErrorPayloadSerializer

PAYLOAD_SCHEMAS = {
    'command': {
        'session.control': SessionControlPayloadSerializer,
        'speech.speak': SpeechSpeakPayloadSerializer,
        'avatar.action': AvatarActionPayloadSerializer,
        'session.sync': SessionSyncPayloadSerializer,
        'stream.start': StreamStartPayloadSerializer,
        'stream.stop': StreamStopPayloadSerializer,
    },
    'event': {
        'device.heartbeat': HeartbeatPayloadSerializer,
        'event.comment': CommentPayloadSerializer,
    },
    'ack': {
        'command.ack': AckPayloadSerializer,
    },
    'error': {
        'error': ErrorPayloadSerializer,
    }
}

class ProtocolEnvelopeSerializer(serializers.Serializer):
    protocol_version = serializers.CharField(required=True)
    type = serializers.ChoiceField(choices=['command', 'event', 'ack', 'error'], required=True)
    name = serializers.CharField(required=True)
    message_id = serializers.UUIDField(required=True)
    timestamp = serializers.DateTimeField(required=True)
    sequence_number = serializers.IntegerField(min_value=1, required=True)
    session_id = serializers.UUIDField(required=True)
    reference_message_id = serializers.UUIDField(required=False, allow_null=True)
    payload = serializers.DictField(required=True)

    def validate(self, data):
        type_str = data.get('type')
        name_str = data.get('name')
        payload = data.get('payload')

        if type_str and name_str:
            type_mapping = PAYLOAD_SCHEMAS.get(type_str)
            if not type_mapping:
                raise serializers.ValidationError({"type": f"Unknown type: {type_str}"})
                
            schema_class = type_mapping.get(name_str)
            if not schema_class:
                raise serializers.ValidationError({"name": f"Name '{name_str}' is invalid for type '{type_str}'"})
            
            # Validate payload using the chosen schema
            payload_serializer = schema_class(data=payload)
            if not payload_serializer.is_valid():
                raise serializers.ValidationError({"payload": payload_serializer.errors})
            
            # Replace payload with validated data
            data['payload'] = payload_serializer.validated_data

        if type_str == 'error':
            if not data.get('reference_message_id'):
                raise serializers.ValidationError({"reference_message_id": "This field is required for error types."})
                
        return data
