from approvals.models import ApprovalRequest, ApprovalStep
from orders.models import Order
from django.contrib.contenttypes.models import ContentType

ct = ContentType.objects.get_for_model(Order)
reqs = ApprovalRequest.objects.filter(content_type=ct, object_id=8).order_by('-created_at')

for r in reqs:
    print(f"Request {r.id}: status={r.status}, created_at={r.created_at}")
    for s in r.steps.all():
        print(f"  Step {s.id}: status={s.status}, approver_user_id={s.approver_user_id}")
