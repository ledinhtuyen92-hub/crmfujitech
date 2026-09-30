
import uuid
from django.test import TestCase
from rest_framework.test import APIClient
from django.urls import reverse
from unittest.mock import patch, MagicMock, AsyncMock

from users.models import User, Company
from live_sessions.models import LiveSession, LiveDevice
from inventory.models import Product
from ai_agents.models import AiAgent
from live_sessions.orchestrator import LiveOrchestrator
from live_sessions.serializers import LiveSessionSerializer

class StreamIntegrationTests(TestCase):
    def setUp(self):
        self.company = Company.objects.create(name="Test Company", tax_code=str(uuid.uuid4())[:15], workspace_id=str(uuid.uuid4()))
        self.user = User.objects.create_user(
            username="testuser", email="test@test.com", password="password123", 
            first_name="Test", last_name="User", company=self.company
        )
        from users.models import Role, Permission
        perm, _ = Permission.objects.get_or_create(code="ai_agent.manage_agents", defaults={"name": "Manage Agents"})
        role = Role.objects.create(name="Live Manager", company=self.company)
        role.permissions.add(perm)
        self.user.role = role
        self.user.save()
        
        self.client = APIClient()
        self.client.force_authenticate(user=self.user)
        
        self.device = LiveDevice.objects.create(company=self.company, name="Test Device")
        self.product = Product.objects.create(company=self.company, name="Test Product", sku="TEST-01", price=100)
        self.agent = AiAgent.objects.create(company=self.company, name="Test Agent", system_prompt="Test")
        
        self.session = LiveSession.objects.create(
            company=self.company,
            device=self.device,
            platform="custom",
            product=self.product,
            ai_agent=self.agent,
            stream_url="rtmp://test.local/live/stream123",
            status=LiveSession.STATUS_READY
        )

    def test_stream_url_redaction_in_api(self):
        url = reverse('sessions-detail', kwargs={'pk': self.session.id})
        response = self.client.get(url)
        self.assertEqual(response.status_code, 200)
        self.assertNotIn('stream_url', response.data)
        
    @patch('live_sessions.orchestrator.get_channel_layer')
    def test_dispatch_stream_start(self, mock_get_channel_layer):
        mock_channel_layer = MagicMock()
        mock_channel_layer.group_send = AsyncMock()
        mock_get_channel_layer.return_value = mock_channel_layer
        
        orchestrator = LiveOrchestrator()
        result = orchestrator.dispatch_stream_start(str(self.session.id))
        
        self.assertEqual(result['status'], 'success')
        
        # Verify it sent via channel layer
        mock_channel_layer.group_send.assert_called_once()
        args, kwargs = mock_channel_layer.group_send.call_args
        self.assertEqual(args[0], f"live_session_{self.session.id}_device")
        envelope = args[1]['envelope']
        self.assertEqual(envelope['name'], 'stream.start')
        self.assertEqual(envelope['payload']['stream_url'], 'rtmp://test.local/live/stream123')
        
    @patch('live_sessions.orchestrator.get_channel_layer')
    def test_dispatch_stream_stop(self, mock_get_channel_layer):
        mock_channel_layer = MagicMock()
        mock_channel_layer.group_send = AsyncMock()
        mock_get_channel_layer.return_value = mock_channel_layer
        
        orchestrator = LiveOrchestrator()
        result = orchestrator.dispatch_stream_stop(str(self.session.id), reason="manual_stop")
        
        self.assertEqual(result['status'], 'success')
        
        # Verify it sent via channel layer
        mock_channel_layer.group_send.assert_called_once()
        args, kwargs = mock_channel_layer.group_send.call_args
        envelope = args[1]['envelope']
        self.assertEqual(envelope['name'], 'stream.stop')
        self.assertEqual(envelope['payload']['reason'], 'manual_stop')
