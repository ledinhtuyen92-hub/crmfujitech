from rest_framework import permissions, viewsets, status
from rest_framework.decorators import action
from rest_framework.response import Response
from django.shortcuts import get_object_or_404
from users.models import User

from users.views import TenantQuerySetMixin
from users.permissions import ActionBasedPermission
from core.pagination import StandardPagination

from .models import DeliveryOrder, WarrantyCard
from .serializers import DeliveryOrderSerializer, WarrantyCardSerializer
from orders.serializers import OrderSerializer
from inventory.serializers import InventoryTransactionSerializer


class DeliveryOrderViewSet(TenantQuerySetMixin, viewsets.ModelViewSet):
    """Quản lý Lệnh giao hàng."""
    module_code = "delivery"

    queryset = DeliveryOrder.objects.select_related(
        "company", "order__customer"
    ).order_by("-created_at")
    serializer_class = DeliveryOrderSerializer
    pagination_class = StandardPagination
    permission_classes = [permissions.IsAuthenticated, ActionBasedPermission]
    
    action_permissions = {
        "list": "delivery.view",
        "retrieve": "delivery.view",
        "create": "delivery.create",
        "update": "delivery.edit",
        "partial_update": "delivery.edit",
        "destroy": "delivery.delete",
        "assign_shipper": "delivery.assign",
        "order_details": "delivery.view",
        "export_details": "delivery.view",
    }

    @action(detail=True, methods=['get'])
    def order_details(self, request, pk=None):
        instance = self.get_object()
        if not instance.order:
            from rest_framework.exceptions import NotFound
            raise NotFound("Không tìm thấy đơn hàng liên kết.")
        # Return order details bypass standard view permissions
        serializer = OrderSerializer(instance.order, context={'request': request})
        return Response(serializer.data)

    @action(detail=True, methods=['get'])
    def export_details(self, request, pk=None):
        instance = self.get_object()
        if not instance.order:
            from rest_framework.exceptions import NotFound
            raise NotFound("Không tìm thấy đơn hàng liên kết.")
            
        from inventory.models import InventoryTransaction
        txns = InventoryTransaction.objects.filter(
            reference_order=instance.order, 
            type=InventoryTransaction.TYPE_EXPORT
        ).order_by('created_at')
        
        if not txns.exists():
            from rest_framework.exceptions import NotFound
            raise NotFound("Không tìm thấy phiếu xuất kho liên kết.")
            
        # Return export details bypass standard view permissions
        first_txn = txns.first()
        serializer = InventoryTransactionSerializer(first_txn, context={'request': request})
        data = serializer.data
        
        # Inject items for frontend TransactionPrintView
        items = []
        for t in txns:
            items.append({
                "id": t.id,
                "product_sku": t.product.sku if t.product else "",
                "product_name": t.custom_product_name if t.custom_product_name else (t.product.name if t.product else ""),
                "quantity": t.quantity,
                "unit_cost": t.unit_cost,
            })
        data["items"] = items
        return Response(data)

    def get_queryset(self):
        qs = super().get_queryset()
        user = self.request.user

        # Phân quyền phạm vi xem
        if not user.is_superuser and not getattr(user, 'is_company_admin', False):
            if not user.has_perm_code("delivery.scope_company") and not user.has_perm_code("delivery.assign"):
                from django.db.models import Q
                managed_deps = user.managed_departments.all()
                
                base_q = Q(order__created_by=user)
                if managed_deps.exists():
                    base_q |= Q(order__created_by__department__in=managed_deps)
                
                if user.has_perm_code("delivery.shipper"):
                    base_q |= Q(shipper_user=user)
                    
                qs = qs.filter(base_q)

        status_filter = self.request.query_params.get("status")
        search_query = self.request.query_params.get("search")
        
        if status_filter:
            qs = qs.filter(status=status_filter)
        
        if search_query:
            from django.db.models import Q
            qs = qs.filter(
                Q(delivery_code__icontains=search_query) |
                Q(order__order_number__icontains=search_query) |
                Q(order__customer__name__icontains=search_query) |
                Q(order__customer__phone__icontains=search_query) |
                Q(shipper_name__icontains=search_query) |
                Q(shipper_phone__icontains=search_query)
            )
        return qs

    def perform_create(self, serializer):
        company = self.request.user.company
        instance = serializer.save(company=company)
        if not instance.delivery_code and instance.order:
            from core.numbering import derive_code_from_order
            instance.delivery_code = derive_code_from_order(instance.order.order_number, company, "gh")
            instance.save(update_fields=["delivery_code"])

    def perform_update(self, serializer):
        instance = self.get_object()
        new_status = serializer.validated_data.get("status", instance.status)
        
        # Chỉ chặn lùi trạng thái nếu TRƯỚC ĐÓ là delivered và muốn đổi sang trạng thái khác
        if instance.status == "delivered" and new_status != "delivered":
            if hasattr(instance.order, 'warranty_card'):
                warranty = instance.order.warranty_card
                if warranty.status == "active":
                    from rest_framework.exceptions import ValidationError
                    raise ValidationError({"status": "Không thể lùi trạng thái khi Đơn hàng đã có Phiếu bảo hành đang hiệu lực. Vui lòng hủy Phiếu bảo hành trước."})
        
        serializer.save()

    @action(detail=True, methods=["post"])
    def assign_shipper(self, request, pk=None):
        delivery = self.get_object()
        shipper_id = request.data.get("shipper_user_id")
        
        if not shipper_id:
            return Response({"detail": "Vui lòng chọn nhân viên."}, status=status.HTTP_400_BAD_REQUEST)
            
        shipper = get_object_or_404(User, id=shipper_id, company=request.user.company)
        
        delivery.shipper_user = shipper
        delivery.shipper_name = shipper.full_name
        delivery.shipper_phone = shipper.phone
        delivery.save(update_fields=["shipper_user", "shipper_name", "shipper_phone"])
        
        serializer = self.get_serializer(delivery)
        return Response(serializer.data)

    @action(detail=True, methods=["post"])
    def recreate_warranty(self, request, pk=None):
        from rest_framework.exceptions import PermissionDenied
        # Chỉ những ai là admin công ty hoặc có quyền tạo mới phiếu bảo hành mới được phép
        user_perms = request.user.get_permission_codes()
        if not (request.user.is_company_admin or "warranty.create" in user_perms):
            raise PermissionDenied("Bạn không có quyền tạo phiếu bảo hành.")

        delivery = self.get_object()
        if delivery.status != "delivered":
            return Response({"detail": "Lệnh giao hàng chưa hoàn thành, không thể tạo phiếu bảo hành."}, status=status.HTTP_400_BAD_REQUEST)
        
        if hasattr(delivery.order, "warranty_card") and delivery.order.warranty_card:
            return Response({"detail": "Đơn hàng này đã có Phiếu bảo hành."}, status=status.HTTP_400_BAD_REQUEST)

        import datetime
        from django.utils import timezone
        months = delivery.order.warranty_months if hasattr(delivery.order, 'warranty_months') and delivery.order.warranty_months else 12
        start_date = delivery.actual_date or timezone.now().date()
        
        month = start_date.month - 1 + months
        year = start_date.year + month // 12
        month = month % 12 + 1
        day = min(start_date.day, [31,
            29 if year % 4 == 0 and not year % 400 == 0 else 28,
            31,30,31,30,31,31,30,31,30,31][month-1])
        end_date = datetime.date(year, month, day)

        company_settings = getattr(delivery.company, "settings", None)
        default_content = company_settings.default_warranty_content if company_settings else ""
        default_rules = company_settings.default_warranty_rules if company_settings else ""

        warranty = WarrantyCard.objects.create(
            order=delivery.order,
            company=delivery.company,
            customer=delivery.order.customer,
            status="active",
            start_date=start_date,
            end_date=end_date,
            terms=f"Bảo hành {months} tháng kể từ ngày giao hàng.",
            warranty_content=default_content,
            warranty_rules=default_rules,
        )
        from core.numbering import derive_code_from_order
        warranty.warranty_code = derive_code_from_order(delivery.order.order_number, delivery.company, "bh")
        warranty.save(update_fields=["warranty_code"])
        
        return Response({"detail": "Đã tạo phiếu bảo hành thành công."})


class WarrantyCardViewSet(TenantQuerySetMixin, viewsets.ModelViewSet):
    """Quản lý Phiếu bảo hành."""
    module_code = "warranty"

    queryset = WarrantyCard.objects.select_related(
        "company", "order", "customer"
    ).order_by("-created_at")
    serializer_class = WarrantyCardSerializer
    pagination_class = StandardPagination
    permission_classes = [permissions.IsAuthenticated, ActionBasedPermission]
    
    action_permissions = {
        "list": "warranty.view",
        "retrieve": "warranty.view",
        "create": "warranty.create",
        "update": "warranty.edit",
        "partial_update": "warranty.edit",
        "destroy": "warranty.delete",
    }

    def get_queryset(self):
        qs = super().get_queryset()
        user = self.request.user

        # Phân quyền phạm vi xem
        if not user.is_superuser and not getattr(user, 'is_company_admin', False):
            if not user.has_perm_code("warranty.scope_company"):
                from django.db.models import Q
                managed_deps = user.managed_departments.all()
                base_q = Q(order__created_by=user)
                if managed_deps.exists():
                    base_q |= Q(order__created_by__department__in=managed_deps)
                qs = qs.filter(base_q)

        status_filter = self.request.query_params.get("status")
        search_query = self.request.query_params.get("search")
        
        if status_filter:
            from django.utils import timezone
            today = timezone.now().date()
            if status_filter == "expired":
                qs = qs.filter(status="active", end_date__lt=today)
            elif status_filter == "active":
                # Active must not be expired
                from django.db.models import Q
                qs = qs.filter(Q(status="active") & (Q(end_date__gte=today) | Q(end_date__isnull=True)))
            else:
                qs = qs.filter(status=status_filter)
                
        if search_query:
            from django.db.models import Q
            qs = qs.filter(
                Q(warranty_code__icontains=search_query) |
                Q(order__order_number__icontains=search_query) |
                Q(customer__name__icontains=search_query) |
                Q(customer__phone__icontains=search_query)
            )
        return qs

    def perform_create(self, serializer):
        company = self.request.user.company
        order = serializer.validated_data.get('order')
        end_date = serializer.validated_data.get('end_date')
        
        status = "active"
        if end_date:
            from django.utils import timezone
            today = timezone.now().date()
            if end_date < today:
                status = "expired"

        company_settings = getattr(company, "settings", None)
        warranty_content = serializer.validated_data.get('warranty_content', '')
        if not warranty_content and company_settings:
            warranty_content = company_settings.default_warranty_content or ""
            
        warranty_rules = serializer.validated_data.get('warranty_rules', '')
        if not warranty_rules and company_settings:
            warranty_rules = company_settings.default_warranty_rules or ""

        instance = serializer.save(
            company=company,
            customer=order.customer if order else None,
            status=status,
            warranty_content=warranty_content,
            warranty_rules=warranty_rules
        )
        if not instance.warranty_code:
            if instance.order:
                from core.numbering import derive_code_from_order
                instance.warranty_code = derive_code_from_order(instance.order.order_number, company, "bh")
            else:
                from core.numbering import generate_warranty_code
                instance.warranty_code = generate_warranty_code(company)
            instance.save(update_fields=["warranty_code"])

    def perform_update(self, serializer):
        instance = self.get_object()
        end_date = serializer.validated_data.get('end_date', instance.end_date)
        
        status = "active"
        if end_date:
            from django.utils import timezone
            today = timezone.now().date()
            if end_date < today:
                status = "expired"
        
        # Ensure customer doesn't get detached, though it's read_only now.
        serializer.save(status=status)
