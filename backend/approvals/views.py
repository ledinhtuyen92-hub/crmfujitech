from rest_framework import viewsets, permissions, status
from rest_framework.decorators import action
from rest_framework.response import Response
from django.utils import timezone
from django.db.models import Q

from users.views import TenantQuerySetMixin
from .models import ApprovalRequest, ApprovalStep
from .serializers import ApprovalRequestSerializer, ApprovalStepSerializer

class ApprovalRequestViewSet(TenantQuerySetMixin, viewsets.ModelViewSet):
    """
    API Quản lý Yêu cầu Phê duyệt
    """
    serializer_class = ApprovalRequestSerializer
    permission_classes = [permissions.IsAuthenticated]

    def get_queryset(self):
        qs = ApprovalRequest.objects.filter(company=self.request.user.company).prefetch_related('steps')
        
        # Filter for "My Approvals" vs "My Requests"
        mode = self.request.query_params.get("mode", "all")
        user = self.request.user

        if mode == "my_requests":
            qs = qs.filter(requester=user)
        elif mode == "to_approve":
            if user.is_superuser or user.is_company_admin:
                # Admin/superuser thấy tất cả đang chờ duyệt
                qs = qs.filter(status="pending")
            else:
                # Người dùng thường chỉ thấy yêu cầu mà họ được chỉ định trực tiếp
                # hoặc được chỉ định qua role — không phụ thuộc vào quyền has_perm
                q_filter = Q(steps__approver_user=user)
                if user.role:
                    q_filter |= Q(steps__approver_role=user.role)
                qs = qs.filter(q_filter).distinct()

        req_status = self.request.query_params.get("status")
        if req_status:
            qs = qs.filter(status=req_status)

        search_query = self.request.query_params.get("search")
        if search_query:
            qs = qs.filter(title__icontains=search_query)

        return qs.order_by("-created_at")

    def perform_create(self, serializer):
        serializer.save(company=self.request.user.company, requester=self.request.user)

    def destroy(self, request, *args, **kwargs):
        user = request.user
        has_perm = (
            user.is_superuser
            or user.is_company_admin
            or (user.role and user.role.permissions.filter(code="approvals.delete").exists())
        )
        if not has_perm:
            return Response(
                {"detail": "Bạn không có quyền xóa yêu cầu phê duyệt."},
                status=status.HTTP_403_FORBIDDEN,
            )
        instance = self.get_object()
        if instance.status == ApprovalRequest.STATUS_PENDING or instance.status == "pending":
            return Response(
                {"detail": "Không thể xóa yêu cầu phê duyệt đang ở trạng thái chờ duyệt!"},
                status=status.HTTP_400_BAD_REQUEST,
            )
        return super().destroy(request, *args, **kwargs)

    @action(detail=False, methods=["post"], url_path="bulk-delete")
    def bulk_delete(self, request):
        user = request.user
        has_perm = (
            user.is_superuser
            or user.is_company_admin
            or (user.role and user.role.permissions.filter(code="approvals.delete").exists())
        )
        if not has_perm:
            return Response(
                {"detail": "Bạn không có quyền xóa yêu cầu phê duyệt."},
                status=status.HTTP_403_FORBIDDEN,
            )

        delete_all = request.data.get("delete_all", False)
        ids = request.data.get("ids", [])

        if delete_all:
            qs = ApprovalRequest.objects.filter(company=user.company).exclude(status=ApprovalRequest.STATUS_PENDING).exclude(status="pending")
            deleted_count, _ = qs.delete()
            return Response({"detail": f"Đã xóa thành công {deleted_count} yêu cầu phê duyệt (đã loại trừ các yêu cầu đang chờ duyệt)."})
        else:
            if not ids or not isinstance(ids, list):
                return Response({"detail": "Danh sách ID không hợp lệ."}, status=status.HTTP_400_BAD_REQUEST)
            qs = ApprovalRequest.objects.filter(company=user.company, id__in=ids)
            if qs.filter(Q(status=ApprovalRequest.STATUS_PENDING) | Q(status="pending")).exists():
                return Response(
                    {"detail": "Trong danh sách chọn có yêu cầu đang ở trạng thái chờ duyệt, không thể xóa!"},
                    status=status.HTTP_400_BAD_REQUEST,
                )
            deleted_count, _ = qs.delete()
            return Response({"detail": f"Đã xóa thành công {deleted_count} yêu cầu phê duyệt."})

    @action(detail=True, methods=["post"], url_path="approve-step")
    def approve_step(self, request, pk=None):
        approval_req = self.get_object()
        step_id = request.data.get("step_id")
        comment = request.data.get("comment", "")

        try:
            step = approval_req.steps.get(id=step_id)
        except ApprovalStep.DoesNotExist:
            return Response({"detail": "Bước duyệt không tồn tại."}, status=status.HTTP_404_NOT_FOUND)

        if step.status != ApprovalStep.STATUS_PENDING:
            return Response({"detail": "Bước này đã được xử lý."}, status=status.HTTP_400_BAD_REQUEST)

        # Kiểm tra quyền duyệt
        user = request.user
        can_approve = False
        if step.approver_user == user:
            can_approve = True
        elif step.approver_role and step.approver_role == user.role:
            can_approve = True
        elif user.is_superuser or user.is_company_admin:
            can_approve = True # Admin có thể duyệt thay

        if not can_approve and hasattr(user, 'has_perm_code'):
            ct_model = approval_req.content_type.model
            if ct_model == 'order' and user.has_perm_code('orders.approve'):
                can_approve = True
            elif ct_model == 'quotation' and user.has_perm_code('sales.approve'):
                can_approve = True
            elif ct_model not in ['order', 'quotation'] and user.has_perm_code('approvals.approve'):
                can_approve = True

        if not can_approve:
            return Response({"detail": "Bạn không có quyền duyệt bước này."}, status=status.HTTP_403_FORBIDDEN)

        step.status = ApprovalStep.STATUS_APPROVED
        step.comment = comment
        step.acted_by = user
        step.acted_at = timezone.now()
        step.save()

        # Kiểm tra xem tất cả các bước đã duyệt chưa
        if not approval_req.steps.filter(status=ApprovalStep.STATUS_PENDING).exists():
            approval_req.status = ApprovalRequest.STATUS_APPROVED
            approval_req.save()
            # Notify the linked object
            if hasattr(approval_req.content_object, 'handle_approval_result'):
                try:
                    approval_req.content_object.handle_approval_result('approved', acted_by=user)
                except TypeError:
                    approval_req.content_object.handle_approval_result('approved')
            try:
                from notifications.utils import create_notification
                create_notification(
                    company=request.user.company,
                    recipient=approval_req.requester,
                    notif_type="approval",
                    title=f"Yêu cầu {approval_req.title} đã được duyệt",
                    message=f"{user.full_name or user.username} đã phê duyệt yêu cầu của bạn.",
                    link="/approvals",
                    sender=user
                )
            except Exception:
                pass

        return Response({"detail": "Đã duyệt thành công."})

    @action(detail=True, methods=["post"], url_path="reject-step")
    def reject_step(self, request, pk=None):
        approval_req = self.get_object()
        step_id = request.data.get("step_id")
        comment = request.data.get("comment", "")

        try:
            step = approval_req.steps.get(id=step_id)
        except ApprovalStep.DoesNotExist:
            return Response({"detail": "Bước duyệt không tồn tại."}, status=status.HTTP_404_NOT_FOUND)

        if step.status != ApprovalStep.STATUS_PENDING:
            return Response({"detail": "Bước này đã được xử lý."}, status=status.HTTP_400_BAD_REQUEST)

        # Kiểm tra quyền duyệt
        user = request.user
        can_approve = False
        if step.approver_user == user:
            can_approve = True
        elif step.approver_role and step.approver_role == user.role:
            can_approve = True
        elif user.is_superuser or user.is_company_admin:
            can_approve = True

        if not can_approve and hasattr(user, 'has_perm_code'):
            ct_model = approval_req.content_type.model
            if ct_model == 'order' and user.has_perm_code('orders.approve'):
                can_approve = True
            elif ct_model == 'quotation' and user.has_perm_code('sales.approve'):
                can_approve = True
            elif ct_model not in ['order', 'quotation'] and user.has_perm_code('approvals.approve'):
                can_approve = True

        if not can_approve:
            return Response({"detail": "Bạn không có quyền từ chối bước này."}, status=status.HTTP_403_FORBIDDEN)

        step.status = ApprovalStep.STATUS_REJECTED
        step.comment = comment
        step.acted_by = user
        step.acted_at = timezone.now()
        step.save()

        # Từ chối 1 bước thì toàn bộ request bị từ chối
        approval_req.status = ApprovalRequest.STATUS_REJECTED
        approval_req.save()
        
        if hasattr(approval_req.content_object, 'handle_approval_result'):
            try:
                approval_req.content_object.handle_approval_result('rejected', acted_by=user)
            except TypeError:
                approval_req.content_object.handle_approval_result('rejected')

        try:
            from notifications.utils import create_notification
            create_notification(
                company=request.user.company,
                recipient=approval_req.requester,
                notif_type="approval",
                title=f"Yêu cầu {approval_req.title} bị từ chối",
                message=f"{user.full_name or user.username} đã từ chối yêu cầu của bạn{': ' + comment if comment else '.'}",
                link="/approvals",
                sender=user
            )
        except Exception:
            pass

        return Response({"detail": "Đã từ chối thành công."})
