from rest_framework import viewsets, permissions
from users.permissions import ActionBasedPermission
from .models import LivePlatformProduct
from .serializers import LivePlatformProductSerializer

class LivePlatformProductViewSet(viewsets.ModelViewSet):
    serializer_class = LivePlatformProductSerializer
    permission_classes = [permissions.IsAuthenticated, ActionBasedPermission]
    action_permissions = {
        'list': 'ai_agent.manage_agents',
        'retrieve': 'ai_agent.manage_agents',
        'create': 'ai_agent.manage_agents',
        'update': 'ai_agent.manage_agents',
        'partial_update': 'ai_agent.manage_agents',
        'destroy': 'ai_agent.manage_agents',
    }

    def get_queryset(self):
        return LivePlatformProduct.objects.filter(company=self.request.user.company)

    def perform_create(self, serializer):
        serializer.save(company=self.request.user.company)

from .models import PlatformAccount
from .serializers import PlatformAccountSerializer

class PlatformAccountViewSet(viewsets.ModelViewSet):
    serializer_class = PlatformAccountSerializer
    permission_classes = [permissions.IsAuthenticated, ActionBasedPermission]
    action_permissions = {
        'list': 'ai_agent.manage_agents',
        'retrieve': 'ai_agent.manage_agents',
        'create': 'ai_agent.manage_agents',
        'update': 'ai_agent.manage_agents',
        'partial_update': 'ai_agent.manage_agents',
        'destroy': 'ai_agent.manage_agents',
    }

    def get_queryset(self):
        return PlatformAccount.objects.filter(company=self.request.user.company)

    def perform_create(self, serializer):
        serializer.save(company=self.request.user.company)

from rest_framework.decorators import action
from rest_framework.response import Response
from django.contrib.auth.hashers import make_password
from rest_framework import status
import secrets
from django.utils import timezone

from .models import LiveDevice, LiveSession
from .serializers import LiveDeviceSerializer, LiveSessionSerializer
from .authentication import DeviceTokenAuthentication
from .services import LiveContextService

def _generate_device_token(device):
    raw_secret = secrets.token_urlsafe(32)
    raw_token = f"ldt_{device.id.hex}_{raw_secret}"
    device.token_hash = make_password(raw_token)
    device.save(update_fields=['token_hash'])
    return raw_token

class LiveDeviceViewSet(viewsets.ModelViewSet):
    serializer_class = LiveDeviceSerializer
    permission_classes = [permissions.IsAuthenticated, ActionBasedPermission]
    
    action_permissions = {
        'list': 'ai_agent.manage_agents',
        'retrieve': 'ai_agent.manage_agents',
        'create': 'ai_agent.manage_agents',
        'update': 'ai_agent.manage_agents',
        'partial_update': 'ai_agent.manage_agents',
        'destroy': 'ai_agent.manage_agents',
        'regenerate_token': 'ai_agent.manage_agents',
    }

    def get_queryset(self):
        return LiveDevice.objects.filter(company=self.request.user.company)

    def perform_create(self, serializer):
        serializer.save(company=self.request.user.company)

    def create(self, request, *args, **kwargs):
        response = super().create(request, *args, **kwargs)
        device = LiveDevice.objects.get(id=response.data['id'])
        raw_token = _generate_device_token(device)
        response.data['token'] = raw_token
        return response

    @action(detail=True, methods=['post'], url_path='regenerate-token')
    def regenerate_token(self, request, pk=None):
        device = self.get_object()
        raw_token = _generate_device_token(device)
        return Response({'token': raw_token})


class LiveSessionViewSet(viewsets.ModelViewSet):
    serializer_class = LiveSessionSerializer
    permission_classes = [permissions.IsAuthenticated, ActionBasedPermission]
    action_permissions = {
        'list': 'ai_agent.manage_agents',
        'retrieve': 'ai_agent.manage_agents',
        'create': 'ai_agent.manage_agents',
        'update': 'ai_agent.manage_agents',
        'partial_update': 'ai_agent.manage_agents',
        'destroy': 'ai_agent.manage_agents',
        'start': 'ai_agent.manage_agents',
        'stop': 'ai_agent.manage_agents',
        'pause': 'ai_agent.manage_agents',
        'human_takeover': 'ai_agent.manage_agents',
        'resume': 'ai_agent.manage_agents',
        'test_comment': 'ai_agent.manage_agents',
        'setup_manual_rtmp': 'ai_agent.manage_agents',
    }

    def get_queryset(self):
        return LiveSession.objects.filter(company=self.request.user.company)

    def perform_create(self, serializer):
        serializer.save(company=self.request.user.company)

    @action(detail=True, methods=['post'])
    def start(self, request, pk=None):
        from django.db import transaction
        from .orchestrator import LiveOrchestrator
        session = self.get_object()
        
        with transaction.atomic():
            if session.status == LiveSession.STATUS_DRAFT:
                session.change_status(LiveSession.STATUS_READY)
            session.change_status(LiveSession.STATUS_RUNNING)
            
        orchestrator = LiveOrchestrator()
        result = orchestrator.dispatch_stream_start(str(session.id))
        
        return Response({
            'status': session.status,
            'dispatch': result
        })

    @action(detail=True, methods=['post'])
    def stop(self, request, pk=None):
        from .orchestrator import LiveOrchestrator
        session = self.get_object()
        session.change_status(LiveSession.STATUS_STOPPED)
        
        orchestrator = LiveOrchestrator()
        result = orchestrator.dispatch_stream_stop(str(session.id), reason="manual_stop")
        
        return Response({
            'status': session.status,
            'dispatch': result
        })

    @action(detail=True, methods=['post'])
    def pause(self, request, pk=None):
        session = self.get_object()
        session.change_status(LiveSession.STATUS_PAUSED)
        return Response({'status': session.status})

    @action(detail=True, methods=['post'], url_path='human-takeover')
    def human_takeover(self, request, pk=None):
        session = self.get_object()
        session.change_status(LiveSession.STATUS_HUMAN_TAKEOVER)
        return Response({'status': session.status})

    @action(detail=True, methods=['post'])
    def resume(self, request, pk=None):
        session = self.get_object()
        session.change_status(LiveSession.STATUS_RUNNING)
        return Response({'status': session.status})
        
    @action(detail=True, methods=['post'], url_path='test-comment')
    def test_comment(self, request, pk=None):
        session = self.get_object()
        content = request.data.get('content')
        if not content:
            return Response({'detail': 'content is required'}, status=status.HTTP_400_BAD_REQUEST)
            
        import uuid
        correlation_id = str(uuid.uuid4())
        
        # Dispatch to existing live comment pipeline
        from .tasks import handle_live_message
        handle_live_message.delay(
            session_id=str(session.id),
            user_message=content,
            correlation_id=correlation_id
        )
        return Response({'status': 'dispatched', 'correlation_id': correlation_id})

    @action(detail=True, methods=['post'], url_path='setup-manual-rtmp')
    def setup_manual_rtmp(self, request, pk=None):
        """
        Phase 1E-8: Configure Manual RTMP mode for a Shopee session.
        
        Accepts Server URL + Stream Key (from Shopee Live PC).
        Combines them into a canonical RTMP URL and stores securely.
        The stream_key is NEVER returned in any response.
        
        Sets shopee_connection_mode = 'manual_rtmp' on the session.
        """
        from .serializers import ShopeeManualRtmpSetupSerializer
        from .models import LiveSession
        import logging
        logger = logging.getLogger(__name__)
        
        session = self.get_object()
        
        if session.platform != 'shopee':
            return Response(
                {'detail': 'This endpoint is only for Shopee sessions.'},
                status=status.HTTP_400_BAD_REQUEST
            )
        
        serializer = ShopeeManualRtmpSetupSerializer(data=request.data)
        if not serializer.is_valid():
            return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)
        
        # Combine server_url + stream_key into RTMP URL
        # NEVER log this value — it contains the stream_key credential
        rtmp_url = serializer.get_combined_rtmp_url()
        
        session.stream_url = rtmp_url
        session.shopee_connection_mode = LiveSession.SHOPEE_CONNECTION_MANUAL_RTMP
        session.save(update_fields=['stream_url', 'shopee_connection_mode'])
        
        logger.info(
            f"[Session: {session.id}] Manual RTMP configured. "
            f"Server: {serializer.validated_data['server_url'][:30]}... [key redacted]"
        )
        
        return Response({
            'status': 'configured',
            'connection_mode': 'manual_rtmp',
            'server_url_preview': serializer.validated_data['server_url'][:50],
            # stream_key deliberately omitted
        })


class IsAuthenticatedDevice(permissions.BasePermission):
    def has_permission(self, request, view):
        return bool(request.auth and isinstance(request.auth, LiveDevice))

class DeviceSessionViewSet(viewsets.ViewSet):
    """
    API dành riêng cho Device. 
    Không dùng IsAuthenticated (JWT). Dùng DeviceTokenAuthentication.
    """
    authentication_classes = [DeviceTokenAuthentication]
    permission_classes = [IsAuthenticatedDevice]

    def _get_session(self, request, pk):
        device = request.auth
        try:
            return LiveSession.objects.get(id=pk, device=device, company=device.company)
        except LiveSession.DoesNotExist:
            return None

    @action(detail=True, methods=['post'])
    def heartbeat(self, request, pk=None):
        device = request.auth
        session = self._get_session(request, pk)
        if not session:
            return Response({'detail': 'Not found'}, status=404)
        
        device.last_seen_at = timezone.now()
        device.save(update_fields=['last_seen_at'])
        
        # Cập nhật LiveContext TTL nếu cần
        # LiveContextService.update_context(...)
        
        return Response({'status': 'ok'})

    @action(detail=True, methods=['post'])
    def status(self, request, pk=None):
        device = request.auth
        session = self._get_session(request, pk)
        if not session:
            return Response({'detail': 'Not found'}, status=404)
            
        new_status = request.data.get('status')
        if not new_status:
            return Response({'detail': 'status required'}, status=400)
            
        try:
            session.change_status(new_status)
        except Exception as e:
            return Response({'detail': str(e)}, status=400)
            
        return Response({'status': session.status})

from django.http import FileResponse, Http404
from rest_framework.decorators import api_view, permission_classes, authentication_classes
from .audio.storage import LocalAudioStorageBackend

@api_view(['GET'])
@authentication_classes([DeviceTokenAuthentication])
@permission_classes([IsAuthenticatedDevice])
def serve_audio_asset(request, token):
    """
    Secure endpoint to download audio assets.
    The token acts as a signed URL, but we also enforce that the requesting Device
    belongs to the same company as the asset.
    """
    storage = LocalAudioStorageBackend()
    payload = storage.verify_token(token)
    
    if not payload:
        raise Http404("Audio token invalid or expired.")
        
    device = request.auth
    if str(device.company_id) != payload["company_id"]:
        return Response({'detail': 'Forbidden. Tenant mismatch.'}, status=403)
        
    file_path = storage.get_audio_path(payload)
    if not file_path:
        raise Http404("Audio file not found on server.")
        
    return FileResponse(open(file_path, 'rb'), content_type=f'audio/{payload["format"]}')
