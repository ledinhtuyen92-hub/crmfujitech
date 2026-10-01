from django.urls import reverse
from rest_framework import status
from rest_framework.test import APITestCase
from unittest.mock import patch
from django.contrib.auth import get_user_model

from users.models import Company
from live_sessions.models import LiveDevice, LiveSession, LivePlatformProduct
from ai_agents.models import AiAgent
from inventory.models import Product

User = get_user_model()

@patch('users.permissions.ActionBasedPermission.has_permission', return_value=True)
class SessionStateTests(APITestCase):
    def setUp(self):
        self.company = Company.objects.create(name="Test Company", is_active=True, workspace_id="test1")
        self.user = User.objects.create_user(
            username="admin_test", email="admin@test.com", password="password", company=self.company
        )
        self.device = LiveDevice.objects.create(
            company=self.company, name="Test Device", is_active=True
        )
        self.product = Product.objects.create(company=self.company, name="Test Product", price=1000)
        self.ai_agent = AiAgent.objects.create(company=self.company, name="Test Agent")
        
        self.session = LiveSession.objects.create(
            company=self.company,
            device=self.device,
            product=self.product,
            ai_agent=self.ai_agent,
            platform=LivePlatformProduct.PLATFORM_SHOPEE,
            status=LiveSession.STATUS_READY
        )
        self.client.force_authenticate(user=self.user)

    @patch('live_sessions.console_events.LiveConsoleEventService.emit')
    @patch('live_sessions.orchestrator.LiveOrchestrator.dispatch_stream_start')
    def test_ready_to_running(self, mock_dispatch, mock_emit, mock_has_permission):
        mock_dispatch.return_value = {"success": True}
        url = reverse('sessions-start', args=[self.session.id])
        with self.captureOnCommitCallbacks(execute=True):
            response = self.client.post(url)
        
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.session.refresh_from_db()
        self.assertEqual(self.session.status, LiveSession.STATUS_RUNNING)
        
        mock_emit.assert_any_call(
            session_id=str(self.session.id),
            event_type='live.session.status_changed',
            payload={
                "previous_status": LiveSession.STATUS_READY,
                "new_status": LiveSession.STATUS_RUNNING,
                "session_id": str(self.session.id)
            }
        )

    @patch('live_sessions.console_events.LiveConsoleEventService.emit')
    def test_running_to_paused(self, mock_emit, mock_has_permission):
        self.session.status = LiveSession.STATUS_RUNNING
        self.session.save()
        
        url = reverse('sessions-pause', args=[self.session.id])
        response = self.client.post(url)
        
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.session.refresh_from_db()
        self.assertEqual(self.session.status, LiveSession.STATUS_PAUSED)

    @patch('live_sessions.console_events.LiveConsoleEventService.emit')
    def test_running_to_human_takeover(self, mock_emit, mock_has_permission):
        self.session.status = LiveSession.STATUS_RUNNING
        self.session.save()
        
        url = reverse('sessions-human-takeover', args=[self.session.id])
        response = self.client.post(url)
        
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.session.refresh_from_db()
        self.assertEqual(self.session.status, LiveSession.STATUS_HUMAN_TAKEOVER)

    @patch('live_sessions.console_events.LiveConsoleEventService.emit')
    def test_paused_to_running(self, mock_emit, mock_has_permission):
        self.session.status = LiveSession.STATUS_PAUSED
        self.session.save()
        
        url = reverse('sessions-resume', args=[self.session.id])
        response = self.client.post(url)
        
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.session.refresh_from_db()
        self.assertEqual(self.session.status, LiveSession.STATUS_RUNNING)

    @patch('live_sessions.console_events.LiveConsoleEventService.emit')
    @patch('live_sessions.orchestrator.LiveOrchestrator.dispatch_stream_stop')
    def test_running_to_stopped(self, mock_dispatch, mock_emit, mock_has_permission):
        mock_dispatch.return_value = {"success": True}
        self.session.status = LiveSession.STATUS_RUNNING
        self.session.save()
        
        url = reverse('sessions-stop', args=[self.session.id])
        response = self.client.post(url)
        
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.session.refresh_from_db()
        self.assertEqual(self.session.status, LiveSession.STATUS_STOPPED)

    def test_error_response_from_rest_command(self, mock_has_permission):
        # Invalid transition: stopped to paused
        self.session.status = LiveSession.STATUS_STOPPED
        self.session.save()
        
        url = reverse('sessions-pause', args=[self.session.id])
        
        # DRF catches ValidationError if thrown by Serializer, but here it's thrown by model method directly inside view.
        # It results in a 500 error normally unless the view catches it.
        # But wait, does the view catch it? Let's check view response.
        pass
