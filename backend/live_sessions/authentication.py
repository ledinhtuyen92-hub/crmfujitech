from rest_framework.authentication import BaseAuthentication
from rest_framework.exceptions import AuthenticationFailed
from django.contrib.auth.hashers import check_password
from .models import LiveDevice
import logging

logger = logging.getLogger(__name__)

class DeviceTokenAuthentication(BaseAuthentication):
    """
    Xác thực thiết bị Live Studio thông qua Device Token.
    Header yêu cầu:
    Authorization: Device ldt_<device_id_hex>_<secret_token>
    """
    keyword = 'Device'

    def authenticate(self, request):
        auth = request.headers.get('Authorization', '')
        if not auth:
            return None

        parts = auth.split()
        if len(parts) != 2 or parts[0] != self.keyword:
            return None

        token = parts[1]
        
        # Parse token
        # Token format expected: ldt_<device_id_hex>_<secret>
        token_parts = token.split('_', 2)
        if len(token_parts) != 3 or token_parts[0] != 'ldt':
            raise AuthenticationFailed("Invalid token format.")

        device_id_hex = token_parts[1]
        secret = token_parts[2]

        try:
            device = LiveDevice.objects.get(id=device_id_hex)
        except (LiveDevice.DoesNotExist, ValueError):
            raise AuthenticationFailed("Invalid token.")

        if not device.is_active:
            raise AuthenticationFailed("Device is disabled.")
            
        if not device.company.is_active:
            raise AuthenticationFailed("Company is disabled.")

        # Verify hash
        if not check_password(token, device.token_hash):
            raise AuthenticationFailed("Invalid token.")

        # Attach device as auth principal
        # User is None, auth is the device
        return (None, device)

    def authenticate_header(self, request):
        return self.keyword
