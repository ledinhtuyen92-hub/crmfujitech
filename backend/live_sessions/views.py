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


from rest_framework.authentication import BaseAuthentication

class QueryParamJWTAuthentication(BaseAuthentication):
    """
    Minimal authenticator that reads a JWT token from ?token= query param.
    Used by HLS proxy so that HLS.js (which can't set custom headers for
    media segments) can still authenticate via a URL token.
    """
    def authenticate(self, request):
        from rest_framework_simplejwt.authentication import JWTAuthentication
        token = request.query_params.get('token') or request.GET.get('token')
        if not token:
            return None
        # Inject into Authorization header temporarily so JWTAuthentication works
        request.META['HTTP_AUTHORIZATION'] = f'Bearer {token}'
        try:
            return JWTAuthentication().authenticate(request)
        except Exception:
            return None

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
        'ping': 'ai_agent.manage_agents',
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

    @action(detail=True, methods=['post'], url_path='ping')
    def ping(self, request, pk=None):
        device = self.get_object()
        device.last_seen_at = timezone.now()
        
        # Update hardware metrics if provided
        metadata = device.metadata or {}
        
        for key in ['cpu_usage', 'ram_usage', 'total_ram_gb', 'os_version', 'cpu_model', 'gpu_model', 'disk_total_gb']:
            if key in request.data:
                metadata[key] = request.data[key]
                
        device.metadata = metadata
        
        device.save(update_fields=['last_seen_at', 'metadata'])
        return Response({'status': 'ok'})


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
        'hls_proxy': 'ai_agent.manage_agents',
    }

    def get_authenticators(self):
        if getattr(self, 'action', None) in ('hls_proxy', 'hls_proxy_custom'):
            from rest_framework_simplejwt.authentication import JWTAuthentication
            return [JWTAuthentication(), QueryParamJWTAuthentication()]
        return super().get_authenticators()

    def get_permissions(self):
        # Allow access if they pass the authentication above
        if getattr(self, 'action', None) in ('hls_proxy', 'hls_proxy_custom'):
            from rest_framework.permissions import IsAuthenticated
            return [IsAuthenticated()]
        return super().get_permissions()

    def get_queryset(self):
        return LiveSession.objects.filter(company=self.request.user.company)

    def perform_create(self, serializer):
        serializer.save(company=self.request.user.company)

    def destroy(self, request, *args, **kwargs):
        session = self.get_object()
        
        allowed_states = [
            LiveSession.STATUS_DRAFT,
            LiveSession.STATUS_STOPPED,
            LiveSession.STATUS_ERROR
        ]
        
        if session.status not in allowed_states:
            return Response(
                {"detail": f"Không thể xóa phiên livestream đang ở trạng thái {session.get_status_display()}."},
                status=status.HTTP_409_CONFLICT
            )
            
        return super().destroy(request, *args, **kwargs)

    @action(detail=True, methods=['post'])
    def start(self, request, pk=None):
        from django.db import transaction
        from .orchestrator import LiveOrchestrator
        import traceback
        
        try:
            session = self.get_object()
            
            # Save previous status for potential rollback
            previous_status = session.status
            
            with transaction.atomic():
                if session.status == LiveSession.STATUS_DRAFT:
                    session.change_status(LiveSession.STATUS_READY)
                session.change_status(LiveSession.STATUS_RUNNING)
                
            orchestrator = LiveOrchestrator()
            test_mode = request.data.get('test_mode') is True or request.query_params.get('test_mode') == '1'
            result = orchestrator.dispatch_stream_start(str(session.id), test_mode=test_mode)
            
            # If dispatch failed synchronously (e.g. invalid stream URL)
            if result.get("status") in ["error", "failed"]:
                session.change_status(LiveSession.STATUS_ERROR)
                
                raw_reason = result.get('reason', 'Lỗi không xác định')
                friendly_reason = raw_reason
                
                if "stream_provider_error" in raw_reason:
                    if "not a valid RTMP URL" in raw_reason:
                        friendly_reason = "Đường dẫn máy chủ (Server URL / Stream Key) chưa đúng định dạng. Vui lòng kiểm tra lại (phải bắt đầu bằng rtmp://)."
                    else:
                        friendly_reason = "Lỗi kết nối đến nền tảng phát sóng. Vui lòng kiểm tra lại thông tin cài đặt."
                elif raw_reason == "missing_stream_url":
                    friendly_reason = "Chưa có đường dẫn phát sóng. Bạn hãy chỉnh sửa phiên và nhập Server URL / Stream Key."
                elif raw_reason == "SEQUENCE_UNAVAILABLE":
                    friendly_reason = "Lỗi cấp phát mã điều khiển thiết bị."
                
                return Response({
                    'status': session.status,
                    'detail': f"Không thể bắt đầu: {friendly_reason}",
                    'dispatch': result
                }, status=status.HTTP_400_BAD_REQUEST)
            
            return Response({
                'status': session.status,
                'dispatch': result
            })
        except Exception as e:
            error_trace = traceback.format_exc()
            return Response({
                'detail': f"Internal Server Error: {str(e)}",
                'traceback': error_trace
            }, status=status.HTTP_500_INTERNAL_SERVER_ERROR)

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
        from .orchestrator import LiveOrchestrator
        session = self.get_object()
        session.change_status(LiveSession.STATUS_PAUSED)
        result = LiveOrchestrator().dispatch_session_control(str(session.id), "pause")
        return Response({'status': session.status, 'dispatch': result})

    @action(detail=True, methods=['post'], url_path='human-takeover')
    def human_takeover(self, request, pk=None):
        from .orchestrator import LiveOrchestrator
        session = self.get_object()
        session.change_status(LiveSession.STATUS_HUMAN_TAKEOVER)
        result = LiveOrchestrator().dispatch_session_control(str(session.id), "pause")
        return Response({'status': session.status, 'dispatch': result})

    @action(detail=True, methods=['post'])
    def resume(self, request, pk=None):
        from .orchestrator import LiveOrchestrator
        session = self.get_object()
        session.change_status(LiveSession.STATUS_RUNNING)
        result = LiveOrchestrator().dispatch_session_control(str(session.id), "resume")
        return Response({'status': session.status, 'dispatch': result})

    # Custom route defined in urls.py to avoid trailing slash enforcement
    def hls_proxy_custom(self, request, pk=None, hls_path=None):
        """
        Proxy HLS stream from device's local MediaMTX to the browser.
        The device streams RTMP to the MediaMTX server (local dev: 127.0.0.1:1935, VPS: configured via MEDIAMTX_RTMP_URL).
        MediaMTX converts to HLS at MEDIAMTX_SERVER_URL.
        This endpoint fetches the HLS content from MediaMTX and relays it to the browser.
        
        URL: /api/live_sessions/sessions/<session_id>/hls-proxy/<hls_path>/
        e.g. /api/live_sessions/sessions/<id>/hls-proxy/live/index.m3u8
        """
        import requests as http_client
        from django.http import HttpResponse, Http404
        from django.conf import settings
        from .models import LiveSession
        
        try:
            session = LiveSession.objects.get(pk=pk)
        except LiveSession.DoesNotExist:
            raise Http404('Session not found.')
        
        # Check there's an active stream for this session
        context = LiveContextService.get_context(session.company_id, session.id)
        stream_state = context.get('stream_state', '')
        
        if stream_state not in ('LIVE', 'playing', 'STARTING'):
            raise Http404('No active HLS stream for this session.')
        
        # DRF's DefaultRouter might strip suffixes like .ts into a format kwarg.
        # To be safe, we extract the exact path after 'hls-proxy/' from the raw URL.
        raw_path = request.path
        if '/hls-proxy/' in raw_path:
            hls_path = raw_path.split('/hls-proxy/')[-1]
            # Strip trailing slash if any, to avoid 404s on MediaMTX
            hls_path = hls_path.rstrip('/')

        # Use the configured MediaMTX server URL (works for both local and VPS)
        mediamtx_base = getattr(settings, 'MEDIAMTX_SERVER_URL', 'http://127.0.0.1:8888').rstrip('/')
        upstream_url = f"{mediamtx_base}/{hls_path}"
        
        try:
            import time
            max_retries = 5 if hls_path.endswith('.m3u8') else 1
            for attempt in range(max_retries):
                resp = http_client.get(upstream_url, timeout=10, stream=True)
                if resp.status_code == 404 and attempt < max_retries - 1:
                    time.sleep(1.5)
                    continue
                break
            
            content_type = resp.headers.get('Content-Type', 'application/vnd.apple.mpegurl')
            
            if resp.status_code == 404:
                raise Http404('HLS segment not found on MediaMTX.')
            
            # For m3u8 playlists, rewrite the segment URLs to point to this proxy
            if 'mpegurl' in content_type or hls_path.endswith('.m3u8'):
                content = resp.text
                session_id_str = str(session.id)
                proxy_base = f"/api/live_sessions/sessions/{session_id_str}/hls-proxy"
                
                def rewrite_line(line):
                    line = line.strip()
                    if line and not line.startswith('#'):
                        if not line.startswith('http'):
                            path_dir = '/'.join(hls_path.split('/')[:-1])
                            full_path = f"{path_dir}/{line}" if path_dir else line
                            # Do NOT add a trailing slash to the segment URL!
                            return f"{proxy_base}/{full_path}"
                        else:
                            return line
                    return line
                
                rewritten = '\n'.join(rewrite_line(line) for line in content.splitlines())
                
                response = HttpResponse(rewritten, content_type='application/vnd.apple.mpegurl')
                response['Access-Control-Allow-Origin'] = '*'
                response['Cache-Control'] = 'no-cache'
                return response
            else:
                # Binary content (TS segments)
                response = HttpResponse(resp.content, content_type=content_type)
                response['Access-Control-Allow-Origin'] = '*'
                response['Cache-Control'] = 'no-cache'
                return response
                
        except Http404:
            raise
        except Exception as e:
            import logging
            logging.getLogger(__name__).error(f'HLS proxy error for {upstream_url}: {e}')
            return HttpResponse(status=502, content=f'HLS proxy error: {e}')

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
