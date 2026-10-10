from django.test import TestCase
from django.urls import reverse
from rest_framework.test import APIClient
from unittest.mock import patch, ANY

from users.models import User, Company
from inventory.models import Product
from ai_agents.models import AiAgent
from live_sessions.models import LiveSession, LiveDevice

class LiveConsoleTests(TestCase):
    def setUp(self):
        self.client = APIClient()
        self.company = Company.objects.create(name="Test Company")
        self.user = User.objects.create_user(
            username="admin_test",
            password="password123",
            company=self.company
        )
        self.client.force_authenticate(user=self.user)
        
        # Give permission
        from users.models import Role, Permission
        role = Role.objects.create(name="Admin", company=self.company)
        perm, _ = Permission.objects.get_or_create(code="ai_agent.manage_agents")
        role.permissions.add(perm)
        self.user.role = role
        self.user.save()

        self.device = LiveDevice.objects.create(company=self.company, name="Test Device")
        self.product = Product.objects.create(company=self.company, name="Test Product", price=0)
        self.agent = AiAgent.objects.create(company=self.company, name="Test Agent")
        
        self.session = LiveSession.objects.create(
            company=self.company,
            device=self.device,
            platform="custom",
            product=self.product,
            ai_agent=self.agent,
            status=LiveSession.STATUS_RUNNING
        )

    def test_session_control_transitions(self):
        """Test pause, human_takeover, resume actions."""
        # 1. Pause
        url_pause = reverse('sessions-pause', args=[self.session.id])
        resp = self.client.post(url_pause)
        self.assertEqual(resp.status_code, 200)
        self.session.refresh_from_db()
        self.assertEqual(self.session.status, LiveSession.STATUS_PAUSED)
        
        # 2. Resume
        url_resume = reverse('sessions-resume', args=[self.session.id])
        resp = self.client.post(url_resume)
        self.assertEqual(resp.status_code, 200)
        self.session.refresh_from_db()
        self.assertEqual(self.session.status, LiveSession.STATUS_RUNNING)
        
        # 3. Human Takeover
        url_ht = reverse('sessions-human-takeover', args=[self.session.id])
        resp = self.client.post(url_ht)
        self.assertEqual(resp.status_code, 200)
        self.session.refresh_from_db()
        self.assertEqual(self.session.status, LiveSession.STATUS_HUMAN_TAKEOVER)
        
        # 4. Stop
        url_stop = reverse('sessions-stop', args=[self.session.id])
        resp = self.client.post(url_stop)
        self.assertEqual(resp.status_code, 200)
        self.session.refresh_from_db()
        self.assertEqual(self.session.status, LiveSession.STATUS_STOPPED)

    @patch('live_sessions.tasks.handle_live_message.delay')
    def test_synthetic_comment(self, mock_delay):
        """Test synthetic comment endpoint."""
        url = reverse('sessions-test-comment', args=[self.session.id])
        
        # No content -> 400
        resp = self.client.post(url, {})
        self.assertEqual(resp.status_code, 400)
        
        # Valid
        resp = self.client.post(url, {'content': 'Bao nhiêu tiền?'}, format='json')
        self.assertEqual(resp.status_code, 200)
        self.assertIn('correlation_id', resp.data)
        
        mock_delay.assert_called_once_with(
            session_id=str(self.session.id),
            user_message='Bao nhiêu tiền?',
            correlation_id=resp.data['correlation_id']
        )

    @patch('live_sessions.console_events.get_channel_layer')
    @patch('live_sessions.console_events.async_to_sync')
    def test_console_event_service(self, mock_async_to_sync, mock_get_channel_layer):
        """Test LiveConsoleEventService emits correct envelope."""
        from live_sessions.console_events import LiveConsoleEventService
        
        mock_channel_layer = mock_get_channel_layer.return_value
        
        LiveConsoleEventService.emit(
            session_id=str(self.session.id),
            event_type="test.event",
            payload={"key": "val"},
            correlation_id="corr-123"
        )
        
        mock_async_to_sync.return_value.assert_called_once_with(
            f"live_session_{self.session.id}_admin",
            {
                "type": "admin.event",
                "envelope": {
                    "event_version": "1.0",
                    "event_type": "test.event",
                    "timestamp": ANY,
                    "session_id": str(self.session.id),
                    "message_id": ANY,
                    "correlation_id": "corr-123",
                    "payload": {"key": "val"}
                }
            }
        )

    def test_start_from_draft(self):
        """Test DRAFT -> START transitions correctly through READY to RUNNING."""
        session = LiveSession.objects.create(
            company=self.company,
            device=self.device,
            platform="custom",
            product=self.product,
            ai_agent=self.agent,
            stream_url="rtmp://test.live/stream",
            status=LiveSession.STATUS_DRAFT
        )
        url = reverse('sessions-start', args=[session.id])
        resp = self.client.post(url)
        self.assertEqual(resp.status_code, 200)
        session.refresh_from_db()
        self.assertEqual(session.status, LiveSession.STATUS_RUNNING)

    def test_start_from_ready(self):
        """Test READY -> START transitions correctly to RUNNING."""
        session = LiveSession.objects.create(
            company=self.company,
            device=self.device,
            platform="custom",
            product=self.product,
            ai_agent=self.agent,
            stream_url="rtmp://test.live/stream",
            status=LiveSession.STATUS_READY
        )
        url = reverse('sessions-start', args=[session.id])
        resp = self.client.post(url)
        self.assertEqual(resp.status_code, 200)
        session.refresh_from_db()
        self.assertEqual(session.status, LiveSession.STATUS_RUNNING)

    def test_start_invalid_state(self):
        """Test STOPPED -> START throws validation error and enforces FSM."""
        session = LiveSession.objects.create(
            company=self.company,
            device=self.device,
            platform="custom",
            product=self.product,
            ai_agent=self.agent,
            stream_url="rtmp://test.live/stream",
            status=LiveSession.STATUS_STOPPED
        )
        from django.core.exceptions import ValidationError
        url = reverse('sessions-start', args=[session.id])
        with self.assertRaises(ValidationError):
            self.client.post(url)
        session.refresh_from_db()
        self.assertEqual(session.status, LiveSession.STATUS_STOPPED)

    def test_start_atomic_rollback(self):
        """Test that if READY -> RUNNING fails, the DB stays at DRAFT due to atomic rollback."""
        session = LiveSession.objects.create(
            company=self.company,
            device=self.device,
            platform="custom",
            product=self.product,
            ai_agent=self.agent,
            stream_url="rtmp://test.live/stream",
            status=LiveSession.STATUS_DRAFT
        )
        
        url = reverse('sessions-start', args=[session.id])
        
        with patch('live_sessions.models.LiveSession.save') as mock_save:
            # First save() is for READY, second is for RUNNING (which fails)
            mock_save.side_effect = [None, Exception("Simulated DB Failure")]
            
            with self.assertRaises(Exception):
                self.client.post(url)
        
        # Verify the rollback happened (status should remain DRAFT, not READY)
        session.refresh_from_db()
        self.assertEqual(session.status, LiveSession.STATUS_DRAFT)
