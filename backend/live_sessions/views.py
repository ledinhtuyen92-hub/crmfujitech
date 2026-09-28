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
    }

    def get_queryset(self):
        return LiveSession.objects.filter(company=self.request.user.company)

    def perform_create(self, serializer):
        serializer.save(company=self.request.user.company)

    @action(detail=True, methods=['post'])
    def start(self, request, pk=None):
        session = self.get_object()
        session.change_status(LiveSession.STATUS_RUNNING)
        return Response({'status': session.status})

    @action(detail=True, methods=['post'])
    def stop(self, request, pk=None):
        session = self.get_object()
        session.change_status(LiveSession.STATUS_STOPPED)
        return Response({'status': session.status})


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
