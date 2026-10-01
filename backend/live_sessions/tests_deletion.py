from rest_framework.test import APITestCase
from rest_framework import status
from django.urls import reverse
from users.models import User, Company
from inventory.models import Product
from ai_agents.models import AiAgent
from live_sessions.models import LiveDevice, LiveSession, PlatformAccount
import uuid
from unittest.mock import patch

@patch('users.permissions.ActionBasedPermission.has_permission', return_value=True)
@patch('users.permissions.ActionBasedPermission.has_object_permission', return_value=True)
class LiveSessionDeletionTests(APITestCase):
    def setUp(self):
        self.company1 = Company.objects.create(name="Company 1", workspace_id="ws1", tax_code="t1")
        self.company2 = Company.objects.create(name="Company 2", workspace_id="ws2", tax_code="t2")
        
        self.user1 = User.objects.create_user(
            username="user1", email="u1@test.com", password="pw", company=self.company1
        )
        self.user2 = User.objects.create_user(
            username="user2", email="u2@test.com", password="pw", company=self.company2
        )
        
        self.device1 = LiveDevice.objects.create(name="Dev1", company=self.company1)
        self.product1 = Product.objects.create(name="Prod1", price=100, company=self.company1)
        self.agent1 = AiAgent.objects.create(name="Agent1", company=self.company1, system_prompt="Test")

        self.account1 = PlatformAccount.objects.create(platform="shopee", display_name="Acc1", company=self.company1)
        
        self.client.force_authenticate(user=self.user1)

    def create_session(self, status_val):
        return LiveSession.objects.create(
            company=self.company1,
            device=self.device1,
            product=self.product1,
            ai_agent=self.agent1,
            platform_account=self.account1,
            platform="shopee",
            status=status_val
        )

    def test_delete_draft_session(self, *args, **kwargs):
        session = self.create_session(LiveSession.STATUS_DRAFT)
        url = reverse('sessions-detail', kwargs={'pk': session.id})
        response = self.client.delete(url)
        self.assertEqual(response.status_code, status.HTTP_204_NO_CONTENT)
        self.assertEqual(LiveSession.objects.filter(id=session.id).count(), 0)

    def test_delete_stopped_session(self, *args, **kwargs):
        session = self.create_session(LiveSession.STATUS_STOPPED)
        url = reverse('sessions-detail', kwargs={'pk': session.id})
        response = self.client.delete(url)
        self.assertEqual(response.status_code, status.HTTP_204_NO_CONTENT)
        self.assertEqual(LiveSession.objects.filter(id=session.id).count(), 0)

    def test_delete_error_session(self, *args, **kwargs):
        session = self.create_session(LiveSession.STATUS_ERROR)
        url = reverse('sessions-detail', kwargs={'pk': session.id})
        response = self.client.delete(url)
        self.assertEqual(response.status_code, status.HTTP_204_NO_CONTENT)
        self.assertEqual(LiveSession.objects.filter(id=session.id).count(), 0)

    def test_reject_delete_running_session(self, *args, **kwargs):
        session = self.create_session(LiveSession.STATUS_RUNNING)
        url = reverse('sessions-detail', kwargs={'pk': session.id})
        response = self.client.delete(url)
        self.assertEqual(response.status_code, status.HTTP_409_CONFLICT)
        self.assertEqual(LiveSession.objects.filter(id=session.id).count(), 1)
        
    def test_reject_delete_paused_session(self, *args, **kwargs):
        session = self.create_session(LiveSession.STATUS_PAUSED)
        url = reverse('sessions-detail', kwargs={'pk': session.id})
        response = self.client.delete(url)
        self.assertEqual(response.status_code, status.HTTP_409_CONFLICT)
        self.assertEqual(LiveSession.objects.filter(id=session.id).count(), 1)
        
    def test_reject_delete_human_takeover_session(self, *args, **kwargs):
        session = self.create_session(LiveSession.STATUS_HUMAN_TAKEOVER)
        url = reverse('sessions-detail', kwargs={'pk': session.id})
        response = self.client.delete(url)
        self.assertEqual(response.status_code, status.HTTP_409_CONFLICT)
        self.assertEqual(LiveSession.objects.filter(id=session.id).count(), 1)

    def test_tenant_isolation(self, *args, **kwargs):
        session = self.create_session(LiveSession.STATUS_DRAFT)
        # Attempt to delete from user2 (different company)
        self.client.force_authenticate(user=self.user2)
        url = reverse('sessions-detail', kwargs={'pk': session.id})
        response = self.client.delete(url)
        self.assertEqual(response.status_code, status.HTTP_404_NOT_FOUND)
        self.assertEqual(LiveSession.objects.filter(id=session.id).count(), 1)

    def test_nonexistent_session(self, *args, **kwargs):
        url = reverse('sessions-detail', kwargs={'pk': uuid.uuid4()})
        response = self.client.delete(url)
        self.assertEqual(response.status_code, status.HTTP_404_NOT_FOUND)
