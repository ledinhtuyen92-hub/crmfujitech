from rest_framework import permissions, status, viewsets
from rest_framework.decorators import action
from rest_framework.response import Response

from users.views import TenantQuerySetMixin
from users.permissions import ActionBasedPermission

from .models import Order, OrderItem
from .serializers import OrderItemSerializer, OrderSerializer


class OrderViewSet(TenantQuerySetMixin, viewsets.ModelViewSet):
    """
    CRUD đơn hàng — cô lập theo company.
    Action đặc biệt: POST /orders/{id}/approve/ — duyệt đơn hàng.
    Backend chặn cứng: chỉ user có quyền orders.approve mới duyệt được.
    """
    module_code = "orders"

    queryset = Order.objects.select_related(
        "company", "customer", "quotation", "created_by", "approved_by"
    ).prefetch_related("items").order_by("-created_at")
    serializer_class = OrderSerializer
    permission_classes = [permissions.IsAuthenticated, ActionBasedPermission]
    
    action_permissions = {
        "list": "orders.view",
        "retrieve": ["orders.view", "delivery.shipper"],
        "create": "orders.create",
        "update": ["orders.create", "orders.edit"],
        "partial_update": ["orders.create", "orders.edit"],
        "destroy": ["orders.create", "orders.delete"],
        "approve": "orders.approve",
        "reject": "orders.approve",
        "cancel": "orders.cancel",
    }

    def get_queryset(self):
        qs = super().get_queryset()
        user = self.request.user
        # Phân quyền xem dữ liệu
        if not user.is_company_admin and not user.is_superuser and not user.has_perm_code("orders.view_all"):
            from django.db.models import Q
            managed_deps = user.managed_departments.all()
            
            base_q = Q(created_by=user)
            if managed_deps.exists():
                base_q |= Q(created_by__department__in=managed_deps)
                
            if user.has_perm_code("delivery.shipper"):
                base_q |= Q(delivery_order__shipper_user=user)
                
            qs = qs.filter(base_q)
        # Filter theo trạng thái
        order_status = self.request.query_params.get("status")
        if order_status:
            qs = qs.filter(status=order_status)

        # Filter theo thanh toán & công nợ
        fin_status = self.request.query_params.get("financial_status")
        
        # Filter theo đối tượng thanh toán
        payment_target = self.request.query_params.get("payment_target")
        if payment_target:
            qs = qs.filter(payment_target=payment_target)

        if fin_status == "pending_credit":
            from approvals.models import ApprovalRequest
            from django.contrib.contenttypes.models import ContentType
            from django.db.models import Exists, OuterRef
            ct = ContentType.objects.get_for_model(qs.model)
            pending_requests = ApprovalRequest.objects.filter(
                content_type=ct, 
                object_id=OuterRef('pk'), 
                status=ApprovalRequest.STATUS_PENDING,
                title__startswith="Duyệt xuất kho nợ"
            )
            qs = qs.filter(Exists(pending_requests))
        elif fin_status:
            qs = qs.filter(financial_status=fin_status)

        # Filter theo vận hành kho
        export_status = self.request.query_params.get("export_status")
        if export_status == "rejected":
            from inventory.models import InventoryTransaction
            from django.db.models import Exists, OuterRef
            active_exports = InventoryTransaction.objects.filter(
                reference_order=OuterRef('pk'),
                type=InventoryTransaction.TYPE_EXPORT
            ).exclude(status=InventoryTransaction.STATUS_REJECTED)
            rejected_exports = InventoryTransaction.objects.filter(
                reference_order=OuterRef('pk'),
                type=InventoryTransaction.TYPE_EXPORT,
                status=InventoryTransaction.STATUS_REJECTED
            )
            qs = qs.filter(
                status="approved",
                financial_status__in=["fully_paid", "deposit_paid", "credit_approved"]
            ).filter(~Exists(active_exports), Exists(rejected_exports))
        elif export_status == "pending_export":
            from inventory.models import InventoryTransaction
            from django.db.models import Exists, OuterRef
            pending_exports = InventoryTransaction.objects.filter(
                reference_order=OuterRef('pk'),
                type=InventoryTransaction.TYPE_EXPORT,
                status=InventoryTransaction.STATUS_PENDING
            )
            qs = qs.filter(Exists(pending_exports))

        # Tìm kiếm theo tên khách, SĐT khách, mã đơn hàng
        search = self.request.query_params.get("search")
        if search:
            from django.db.models import Q
            qs = qs.filter(
                Q(order_number__icontains=search) | 
                Q(customer__name__icontains=search) |
                Q(customer__phone__icontains=search)
            )

        without_warranty = self.request.query_params.get("without_warranty")
        if without_warranty == "true":
            qs = qs.filter(warranty_card__isnull=True)

        ready_for_delivery = self.request.query_params.get("ready_for_delivery")
        if ready_for_delivery == "true":
            qs = qs.filter(production_orders__status="completed", delivery_order__isnull=True)
            
        return qs

    def destroy(self, request, *args, **kwargs):
        order = self.get_object()
        
        # Kiểm tra Lệnh xuất kho (InventoryTransaction)
        # Chỉ cho phép xóa nếu KHÔNG có phiếu kho nào, hoặc tất cả đều đã bị Hủy/Từ chối
        has_active_inventory = order.inventory_transactions.exclude(status='rejected').exists()
        if has_active_inventory:
            from rest_framework.exceptions import ValidationError
            raise ValidationError({"detail": "Không thể xóa đơn hàng. Vui lòng Hủy hoặc Từ chối lệnh xuất kho trước."})
            
        # Kiểm tra Lệnh sản xuất (ProductionOrder)
        if hasattr(order, 'production_order') and order.production_order.status != 'cancelled':
            from rest_framework.exceptions import ValidationError
            raise ValidationError({"detail": "Không thể xóa đơn hàng. Đang có Lệnh sản xuất chưa bị hủy."})
            
        # Kiểm tra Lệnh giao hàng (DeliveryOrder)
        if hasattr(order, 'delivery_order') and order.delivery_order.status not in ['failed']:
            from rest_framework.exceptions import ValidationError
            raise ValidationError({"detail": "Không thể xóa đơn hàng. Đang có Lệnh giao hàng chưa bị hủy hoặc thất bại."})

        return super().destroy(request, *args, **kwargs)

    def perform_create(self, serializer):
        from core.numbering import generate_order_number
        company = self.request.user.company
        order_number = generate_order_number(company)
        order = serializer.save(
            company=company,
            created_by=self.request.user,
            order_number=order_number,
            status="pending",
        )
        order.generate_payment_milestones()
        try:
            from approvals.models import ApprovalRequest, ApprovalStep
            from django.contrib.contenttypes.models import ContentType
            ct = ContentType.objects.get_for_model(order)
            req = ApprovalRequest.objects.create(
                company=company,
                content_type=ct,
                object_id=order.id,
                requester=self.request.user,
                title=f"Phê duyệt Đơn hàng {order.order_number}",
                description=f"Đơn hàng {order.order_number} — Khách hàng: {order.customer.name if order.customer else 'Khách lẻ'}",
                status=ApprovalRequest.STATUS_PENDING,
            )
            ApprovalStep.objects.create(
                request=req,
                step_order=1,
                status=ApprovalStep.STATUS_PENDING,
            )
        except Exception as e:
            import traceback
            with open("error_approval.txt", "w", encoding="utf-8") as f:
                f.write(traceback.format_exc())

    def perform_update(self, serializer):
        instance = self.get_object()
        
        # Nếu chỉ cập nhật các trường phụ (như payment_target), không reset trạng thái
        safe_fields = {"payment_target"}
        updated_fields = set(serializer.validated_data.keys())
        if updated_fields and updated_fields.issubset(safe_fields):
            serializer.save()
            return
            
        old_status = instance.status
        new_status = serializer.validated_data.get("status", instance.status)
        if new_status != instance.status:
            if hasattr(instance, 'delivery_order') and instance.delivery_order.status == 'delivered':
                from rest_framework.exceptions import ValidationError
                raise ValidationError({"status": "Không thể thay đổi trạng thái khi Đơn hàng đã được giao thành công."})
            if hasattr(instance, 'production_order') and instance.production_order.status in ['in_progress', 'completed'] and new_status in ['pending', 'rejected', 'cancelled']:
                from rest_framework.exceptions import ValidationError
                raise ValidationError({"status": "Không thể chuyển về chờ duyệt/hủy khi Lệnh sản xuất đang thực hiện hoặc đã hoàn thành."})
        if old_status in ["pending", "rejected", "approved"]:
            serializer.validated_data["status"] = "pending"
            
        order = serializer.save()
        order.generate_payment_milestones()

        if old_status in ["pending", "rejected", "approved"]:
            try:
                from approvals.models import ApprovalRequest, ApprovalStep
                from django.contrib.contenttypes.models import ContentType
                ct = ContentType.objects.get_for_model(order)
                
                # Hủy tất cả request cũ đang pending
                ApprovalRequest.objects.filter(
                    content_type=ct,
                    object_id=order.id,
                    status=ApprovalRequest.STATUS_PENDING
                ).update(status=ApprovalRequest.STATUS_CANCELED)
                
                # Tạo request mới
                req = ApprovalRequest.objects.create(
                    company=order.company,
                    content_type=ct,
                    object_id=order.id,
                    requester=self.request.user,
                    title=f"Phê duyệt Đơn hàng {order.order_number} (Cập nhật)",
                    description=f"Đơn hàng {order.order_number} — Khách hàng: {order.customer.name if order.customer else 'Khách lẻ'}",
                    status=ApprovalRequest.STATUS_PENDING,
                )
                ApprovalStep.objects.create(
                    request=req,
                    step_order=1,
                    status=ApprovalStep.STATUS_PENDING,
                )
            except Exception as e:
                pass

    @action(detail=True, methods=["post"], url_path="approve")
    def approve(self, request, pk=None):
        """
        POST /api/orders/{id}/approve/
        Duyệt đơn hàng — chỉ user có quyền orders.approve.
        Tự động trigger xuất kho sau khi duyệt.
        """
        order = self.get_object()

        # Kiểm tra quyền approve
        if not request.user.is_company_admin and not request.user.has_perm_code("orders.approve"):
            return Response(
                {"detail": "Bạn không có quyền duyệt đơn hàng."},
                status=status.HTTP_403_FORBIDDEN,
            )

        try:
            order.approve(approved_by_user=request.user)
            from approvals.models import ApprovalRequest, ApprovalStep
            from django.contrib.contenttypes.models import ContentType
            ct = ContentType.objects.get_for_model(order)
            reqs = ApprovalRequest.objects.filter(content_type=ct, object_id=order.id)
            for req in reqs:
                req.status = ApprovalRequest.STATUS_APPROVED
                req.save(update_fields=["status"])
                req.steps.filter(status=ApprovalStep.STATUS_PENDING).update(status=ApprovalStep.STATUS_APPROVED, acted_by=request.user)
        except ValueError as e:
            return Response({"detail": str(e)}, status=status.HTTP_400_BAD_REQUEST)

        return Response(
            OrderSerializer(order, context={"request": request}).data,
            status=status.HTTP_200_OK,
        )

    @action(detail=True, methods=["post"], url_path="reject")
    def reject(self, request, pk=None):
        """POST /api/orders/{id}/reject/ — Từ chối đơn hàng."""
        order = self.get_object()

        if not request.user.is_company_admin and not request.user.has_perm_code("orders.approve"):
            return Response(
                {"detail": "Bạn không có quyền từ chối đơn hàng."},
                status=status.HTTP_403_FORBIDDEN,
            )

        if order.status != Order.STATUS_PENDING:
            return Response(
                {"detail": "Chỉ có thể từ chối đơn đang ở trạng thái 'Chờ duyệt'."},
                status=status.HTTP_400_BAD_REQUEST,
            )

        if hasattr(order, 'production_order') and order.production_order.status != 'cancelled':
            return Response(
                {"detail": "Đơn hàng đang có lệnh sản xuất. Cần hủy lệnh sản xuất trước."},
                status=status.HTTP_400_BAD_REQUEST,
            )
        if hasattr(order, 'delivery_order') and order.delivery_order.status == 'delivered':
            return Response(
                {"detail": "Đơn hàng đã giao thành công, không thể từ chối."},
                status=status.HTTP_400_BAD_REQUEST,
            )

        order.status = Order.STATUS_REJECTED
        order.approved_by = request.user
        order.save(update_fields=["status", "approved_by", "updated_at"])
        try:
            from approvals.models import ApprovalRequest, ApprovalStep
            from django.contrib.contenttypes.models import ContentType
            ct = ContentType.objects.get_for_model(order)
            reqs = ApprovalRequest.objects.filter(content_type=ct, object_id=order.id)
            for req in reqs:
                req.status = ApprovalRequest.STATUS_REJECTED
                req.save(update_fields=["status"])
                req.steps.filter(status=ApprovalStep.STATUS_PENDING).update(status=ApprovalStep.STATUS_REJECTED, acted_by=request.user)
        except Exception:
            pass
        return Response(
            OrderSerializer(order, context={"request": request}).data,
            status=status.HTTP_200_OK,
        )

    @action(detail=True, methods=["post"], url_path="re-request-export")
    def re_request_export(self, request, pk=None):
        """POST /api/orders/{id}/re-request-export/ — Gửi lại lệnh xuất kho sau khi bị từ chối."""
        order = self.get_object()

        if not request.user.is_company_admin and request.user != order.created_by:
            return Response(
                {"detail": "Chỉ người tạo đơn hoặc Quản trị viên mới được yêu cầu xuất kho lại."},
                status=status.HTTP_403_FORBIDDEN,
            )

        if order.status != Order.STATUS_APPROVED:
            return Response(
                {"detail": "Đơn hàng phải ở trạng thái Đã duyệt mới có thể yêu cầu xuất kho."},
                status=status.HTTP_400_BAD_REQUEST,
            )
            
        from orders.signals import _create_pending_inventory_export
        _create_pending_inventory_export(order)
        
        return Response({"detail": "Đã gửi lại yêu cầu xuất kho thành công."}, status=status.HTTP_200_OK)

    @action(detail=True, methods=["post"], url_path="cancel")
    def cancel(self, request, pk=None):
        """POST /api/orders/{id}/cancel/ — Hủy đơn hàng."""
        order = self.get_object()
        if order.status in [Order.STATUS_COMPLETED, Order.STATUS_CANCELLED]:
            return Response(
                {"detail": "Không thể hủy đơn hàng đã hoàn thành hoặc đã bị hủy."},
                status=status.HTTP_400_BAD_REQUEST,
            )
            
        if hasattr(order, 'delivery_order') and order.delivery_order.status == 'delivered':
            return Response(
                {"detail": "Đơn hàng đã giao thành công, không thể hủy."},
                status=status.HTTP_400_BAD_REQUEST,
            )
        if hasattr(order, 'production_order') and order.production_order.status in ['in_progress', 'completed']:
            return Response(
                {"detail": "Đơn hàng đang trong quá trình sản xuất hoặc đã xong. Vui lòng hủy Lệnh sản xuất trước."},
                status=status.HTTP_400_BAD_REQUEST,
            )

        order.status = Order.STATUS_CANCELLED
        order.save(update_fields=["status", "updated_at"])
        
        try:
            from approvals.models import ApprovalRequest, ApprovalStep
            from django.contrib.contenttypes.models import ContentType
            ct = ContentType.objects.get_for_model(order)
            reqs = ApprovalRequest.objects.filter(content_type=ct, object_id=order.id)
            for req in reqs:
                req.status = ApprovalRequest.STATUS_REJECTED
                req.save(update_fields=["status"])
                req.steps.filter(status=ApprovalStep.STATUS_PENDING).update(status=ApprovalStep.STATUS_REJECTED, acted_by=request.user)
        except Exception:
            pass

        return Response(
            OrderSerializer(order, context={"request": request}).data,
            status=status.HTTP_200_OK,
        )

    @action(detail=True, methods=["post"], url_path="resubmit")
    def resubmit(self, request, pk=None):
        """POST /api/orders/{id}/resubmit/ — Trình duyệt lại đơn hàng đã bị từ chối."""
        order = self.get_object()
        if order.status != Order.STATUS_REJECTED:
            return Response(
                {"detail": "Chỉ có thể trình duyệt lại đơn hàng đã bị từ chối."},
                status=status.HTTP_400_BAD_REQUEST,
            )
        order.status = Order.STATUS_PENDING
        order.approved_by = None
        order.save(update_fields=["status", "approved_by", "updated_at"])

        try:
            from approvals.models import ApprovalRequest, ApprovalStep
            from django.contrib.contenttypes.models import ContentType
            ct = ContentType.objects.get_for_model(order)
            
            req = ApprovalRequest.objects.create(
                company=order.company,
                content_type=ct,
                object_id=order.id,
                requester=request.user,
                title=f"Phê duyệt lại Đơn hàng {order.order_number}",
                description=f"Đơn hàng {order.order_number} — Khách hàng: {order.customer.name if order.customer else 'Khách lẻ'}",
                status=ApprovalRequest.STATUS_PENDING,
            )
            ApprovalStep.objects.create(
                request=req,
                step_order=1,
                status=ApprovalStep.STATUS_PENDING,
            )
        except Exception:
            pass

        return Response(
            OrderSerializer(order, context={"request": request}).data,
            status=status.HTTP_200_OK,
        )

    @action(detail=True, methods=["post"], url_path="request_credit_approval")
    def request_credit_approval(self, request, pk=None):
        """POST /api/orders/{id}/request_credit_approval/ — Trình duyệt xuất kho nợ cho đơn hàng."""
        order = self.get_object()
        if order.financial_status in [Order.FIN_STATUS_FULLY_PAID, Order.FIN_STATUS_CREDIT_APPROVED]:
            return Response(
                {"detail": "Đơn hàng này đã đủ điều kiện xuất kho, không cần trình duyệt nợ."},
                status=status.HTTP_400_BAD_REQUEST,
            )

        approver_id = request.data.get("approver_id")
        if not approver_id:
            return Response({"detail": "Vui lòng chọn người duyệt nợ."}, status=status.HTTP_400_BAD_REQUEST)

        from approvals.models import ApprovalRequest, ApprovalStep
        from users.models import User
        from django.db.models import Q

        approver = User.objects.filter(
            id=approver_id,
            company=order.company,
            is_active=True
        ).first()

        if not approver:
            return Response({"detail": "Người duyệt không hợp lệ hoặc đã bị vô hiệu hóa."}, status=status.HTTP_400_BAD_REQUEST)

        # Kiểm tra quyền duyệt nợ
        if not approver.is_company_admin and not approver.is_superuser:
            if not approver.role or not approver.role.permissions.filter(code="finance.approve_credit").exists():
                return Response(
                    {"detail": "Người duyệt được chọn không có quyền phê duyệt nợ (finance.approve_credit)."},
                    status=status.HTTP_400_BAD_REQUEST,
                )

        req = ApprovalRequest.objects.create(
            company=order.company,
            title=f"Duyệt xuất kho nợ - {order.order_number}",
            description=f"Khách hàng {order.customer.name} còn nợ {order.remaining_debt:,.0f} đ. Trình duyệt xuất kho trước khi thu đủ tiền.",
            requester=request.user,
            content_object=order,
            status=ApprovalRequest.STATUS_PENDING,
        )

        ApprovalStep.objects.create(
            request=req,
            step_order=1,
            approver_user=approver,
            status=ApprovalStep.STATUS_PENDING,
        )

        return Response(
            {"detail": "Đã gửi yêu cầu trình duyệt xuất kho nợ tới người duyệt!"},
            status=status.HTTP_201_CREATED,
        )

    def perform_destroy(self, instance):
        if instance.payment_receipts.exists():
            from rest_framework.exceptions import ValidationError
            raise ValidationError("Không thể xóa đơn hàng đã có phiếu thu tiền. Vui lòng xóa phiếu thu trước.")

        from production.models import ProductionOrder
        ProductionOrder.objects.filter(order=instance).delete()
        from inventory.models import InventoryTransaction
        InventoryTransaction.objects.filter(reference_order=instance).update(reference_order=None)
        try:
            from approvals.models import ApprovalRequest
            from django.contrib.contenttypes.models import ContentType
            ct = ContentType.objects.get_for_model(instance)
            ApprovalRequest.objects.filter(content_type=ct, object_id=instance.id).delete()
        except Exception:
            pass
        instance.delete()


class OrderItemViewSet(viewsets.ModelViewSet):
    """CRUD dòng sản phẩm trong đơn hàng — filter qua order.company."""
    module_code = "orders"

    queryset = OrderItem.objects.select_related(
        "order__company", "product"
    ).order_by("order", "id")
    serializer_class = OrderItemSerializer
    permission_classes = [permissions.IsAuthenticated, ActionBasedPermission]
    
    action_permissions = {
        "list": ["orders.view", "orders.create", "orders.edit"],
        "retrieve": ["orders.view", "orders.create", "orders.edit"],
        "create": ["orders.create", "orders.edit"],
        "update": ["orders.create", "orders.edit"],
        "partial_update": ["orders.create", "orders.edit"],
        "destroy": ["orders.create", "orders.edit"],
    }

    def get_queryset(self):
        user = self.request.user
        if user.is_superuser and user.company_id is None:
            return super().get_queryset()
        return self.queryset.filter(order__company=user.company)
