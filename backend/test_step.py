from approvals.models import ApprovalRequest, ApprovalStep
from users.models import User
import traceback

r = ApprovalRequest.objects.get(id=171)
print('Request:', r)
approver = User.objects.first()
print('Approver:', approver)
try:
    step = ApprovalStep.objects.create(request=r, approver_user=approver, step_order=1, status=ApprovalStep.STATUS_PENDING)
    print('Success:', step.id)
except Exception as e:
    print('Error:', type(e), str(e))
    traceback.print_exc()
