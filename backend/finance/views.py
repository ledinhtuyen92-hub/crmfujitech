from rest_framework import viewsets, permissions, status
from rest_framework.decorators import action
from rest_framework.response import Response
from users.views import TenantQuerySetMixin
from users.permissions import ActionBasedPermission
from .models import OrderPaymentMilestone, PaymentReceipt
from .serializers import OrderPaymentMilestoneSerializer, PaymentReceiptSerializer
from django.utils import timezone


from core.numbering import generate_receipt_code


class OrderPaymentMilestoneViewSet(TenantQuerySetMixin, viewsets.ModelViewSet):
    queryset = OrderPaymentMilestone.objects.select_related("order", "company").prefetch_related("receipts").order_by("id")
    serializer_class = OrderPaymentMilestoneSerializer
    permission_classes = [permissions.IsAuthenticated]

    def get_queryset(self):
        qs = super().get_queryset()
        order_id = self.request.query_params.get("order_id")
        if order_id:
            qs = qs.filter(order_id=order_id)
        return qs


class PaymentReceiptViewSet(TenantQuerySetMixin, viewsets.ModelViewSet):
    queryset = PaymentReceipt.objects.select_related("order", "milestone", "created_by").order_by("-payment_date", "-created_at")
    serializer_class = PaymentReceiptSerializer
    permission_classes = [permissions.IsAuthenticated]

    def get_queryset(self):
        qs = super().get_queryset()
        order_id = self.request.query_params.get("order_id")
        if order_id:
            qs = qs.filter(order_id=order_id)
        return qs

    def perform_create(self, serializer):
        user = self.request.user
        if not user.is_company_admin and not user.is_superuser and not user.has_perm_code("finance.create_receipt"):
            from rest_framework.exceptions import PermissionDenied
            raise PermissionDenied("Bạn không có quyền lập phiếu thu.")
            
        company = self.request.user.company
        code = generate_receipt_code(company)
        
        receipt = serializer.save(
            company=company,
            receipt_code=code,
            created_by=self.request.user,
        )
        
        payment_target = self.request.data.get("payment_target")
        if payment_target and receipt.order and not receipt.order.payment_target:
            receipt.order.payment_target = payment_target
            receipt.order.save(update_fields=["payment_target"])

    def perform_destroy(self, instance):
        user = self.request.user
        if not user.is_company_admin and not user.is_superuser and not user.has_perm_code("finance.delete"):
            from rest_framework.exceptions import PermissionDenied
            raise PermissionDenied("Bạn không có quyền xóa phiếu thu tiền.")
        instance.delete()
