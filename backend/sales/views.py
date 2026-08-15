from rest_framework import permissions, viewsets, status
from rest_framework.decorators import action
from rest_framework.response import Response
from rest_framework.views import APIView
from django.utils import timezone

from users.views import TenantQuerySetMixin
from users.permissions import ActionBasedPermission

from .models import Quotation, QuotationItem, QuotationTemplate, SavedTemplateBlock
from .serializers import QuotationItemSerializer, QuotationSerializer, QuotationTemplateSerializer, SavedTemplateBlockSerializer


class QuotationViewSet(TenantQuerySetMixin, viewsets.ModelViewSet):
    """CRUD báo giá — cô lập theo company."""
    module_code = "sales"

    queryset = Quotation.objects.select_related(
        "company", "customer", "created_by"
    ).prefetch_related("items").order_by("-created_at")
    serializer_class = QuotationSerializer
    permission_classes = [permissions.IsAuthenticated, ActionBasedPermission]
    
    action_permissions = {
        "list": ["sales.view", "sales.create", "sales.edit"],
        "retrieve": ["sales.view", "sales.create", "sales.edit"],
        "create": "sales.create",
        "update": ["sales.create", "sales.edit"],
        "partial_update": ["sales.create", "sales.edit"],
        "destroy": "sales.delete",
        "create_order": ["sales.view", "sales.create", "sales.edit"],
    }

    def get_queryset(self):
        qs = super().get_queryset()
        user = self.request.user
        # Phân quyền xem dữ liệu
        if not user.is_company_admin and not user.is_superuser and not user.has_perm_code("sales.view_all"):
            managed_deps = user.managed_departments.all()
            if managed_deps.exists():
                from django.db.models import Q
                qs = qs.filter(
                    Q(created_by=user) | 
                    Q(created_by__department__in=managed_deps)
                )
            else:
                qs = qs.filter(created_by=user)
        # Filter theo trạng thái nếu có
        status = self.request.query_params.get("status")
        if status:
            qs = qs.filter(status=status)
        return qs

    def check_object_permission(self, user, instance):
        if user.is_superuser or user.is_company_admin or user.has_perm_code("sales.view_all"):
            return True
        if instance.created_by == user:
            return True
        if instance.created_by and instance.created_by.department in user.managed_departments.all():
            return True
        return False

    def perform_update(self, serializer):
        if not self.check_object_permission(self.request.user, serializer.instance):
            from rest_framework.exceptions import PermissionDenied
            raise PermissionDenied("Bạn chỉ có quyền chỉnh sửa báo giá do mình tạo hoặc của nhân viên thuộc phòng ban do bạn quản lý.")
            
        instance = serializer.instance
        
        if instance.orders.filter(status="completed").exists():
            from rest_framework.exceptions import ValidationError
            raise ValidationError("Không thể chỉnh sửa báo giá vì đơn hàng tương ứng đã hoàn thành.")

        old_status = instance.status
        
        if old_status == Quotation.STATUS_ACCEPTED and not (self.request.user.is_superuser or self.request.user.is_company_admin):
            from rest_framework.exceptions import ValidationError
            raise ValidationError("Báo giá này đã được khách hàng ký chấp nhận, bạn không thể chỉnh sửa nữa.")
            
        new_status = serializer.validated_data.get('status', old_status)
        
        if new_status == Quotation.STATUS_ACCEPTED and old_status != Quotation.STATUS_ACCEPTED and not (self.request.user.is_superuser or self.request.user.is_company_admin):
            from rest_framework.exceptions import ValidationError
            raise ValidationError("Trạng thái 'Đã chấp nhận' tự động cập nhật khi khách ký qua link. Bạn không được tự chọn trạng thái này.")
            
        # Nếu sửa đổi báo giá đang ở trạng thái Chờ duyệt hoặc Đã duyệt -> Tự động đưa về Nháp
        if old_status in [Quotation.STATUS_APPROVED, Quotation.STATUS_PENDING_APPROVAL]:
            serializer.validated_data['status'] = Quotation.STATUS_DRAFT
            from approvals.models import ApprovalRequest
            from django.contrib.contenttypes.models import ContentType
            ctype = ContentType.objects.get_for_model(instance)
            ApprovalRequest.objects.filter(
                content_type=ctype,
                object_id=instance.id,
                status=ApprovalRequest.STATUS_PENDING
            ).update(status=ApprovalRequest.STATUS_CANCELED)
            
        serializer.save()

    def perform_destroy(self, instance):
        if not self.check_object_permission(self.request.user, instance):
            from rest_framework.exceptions import PermissionDenied
            raise PermissionDenied("Bạn chỉ có quyền xóa báo giá do mình tạo hoặc của nhân viên thuộc phòng ban do bạn quản lý.")
        if instance.status == Quotation.STATUS_ACCEPTED and not (self.request.user.is_superuser or self.request.user.is_company_admin):
            from rest_framework.exceptions import ValidationError
            raise ValidationError("Không thể xóa báo giá đã được chấp nhận. Vui lòng liên hệ Admin.")
        instance.delete()

    def perform_create(self, serializer):
        from core.numbering import generate_quotation_number
        company = self.request.user.company
        new_status = serializer.validated_data.get('status')
        if new_status == Quotation.STATUS_ACCEPTED and not (self.request.user.is_superuser or self.request.user.is_company_admin):
            from rest_framework.exceptions import ValidationError
            raise ValidationError("Trạng thái 'Đã chấp nhận' tự động cập nhật khi khách ký qua link. Bạn không được tự chọn trạng thái này.")
        quotation_number = generate_quotation_number(company)
        serializer.save(
            company=company,
            created_by=self.request.user,
            quotation_number=quotation_number,
        )

    @action(detail=False, methods=["post"], url_path="upload-item-image")
    def upload_item_image(self, request):
        """Upload ảnh cho dịch vụ phát sinh / sản phẩm trong báo giá."""
        if 'image' not in request.FILES:
            return Response({"error": "Không tìm thấy file ảnh."}, status=status.HTTP_400_BAD_REQUEST)
        
        image_file = request.FILES['image']
        
        from django.core.files.storage import default_storage
        import os
        import uuid
        
        ext = os.path.splitext(image_file.name)[1]
        filename = f"item_images/{uuid.uuid4()}{ext}"
        saved_path = default_storage.save(filename, image_file)
        url = request.build_absolute_uri(default_storage.url(saved_path))
        
        return Response({"url": url})

    @action(detail=True, methods=["post"], url_path="create-order")
    def create_order(self, request, pk=None):
        from django.db import transaction
        from core.numbering import derive_code_from_order
        from orders.models import Order, OrderItem
        from orders.serializers import OrderSerializer

        quotation = self.get_object()
        
        bypass_signature = request.user.is_superuser or request.user.is_company_admin or (
            request.user.role and request.user.role.permissions.filter(code="sales.bypass_customer_signature").exists()
        )

        if not bypass_signature and quotation.status != Quotation.STATUS_ACCEPTED:
            return Response(
                {"detail": "Chỉ có thể tạo đơn hàng từ báo giá đã được khách hàng xác nhận (Ký đồng ý)."},
                status=status.HTTP_400_BAD_REQUEST,
            )
            
        if bypass_signature and quotation.status in [Quotation.STATUS_REJECTED, Quotation.STATUS_PENDING_APPROVAL]:
            return Response(
                {"detail": "Không thể tạo đơn hàng từ báo giá đang chờ duyệt hoặc bị từ chối."},
                status=status.HTTP_400_BAD_REQUEST,
            )

        with transaction.atomic():
            order_number = derive_code_from_order(quotation.quotation_number, quotation.company, "dh")
            order = Order.objects.create(
                company=quotation.company,
                order_number=order_number,
                customer=quotation.customer,
                quotation=quotation,
                created_by=request.user,
                installation_date=quotation.installation_date,
                notes=quotation.notes,
                subtotal=quotation.subtotal,
                vat_rate=quotation.vat_rate,
                vat_amount=quotation.vat_amount,
                discount_total=quotation.discount_total,
                total_amount=quotation.total_amount,
                payment_terms_schedule=quotation.payment_terms_schedule,
                shipping_fee=quotation.shipping_fee,
                installation_fee=quotation.installation_fee,
                delivery_time=quotation.delivery_time,
                warranty_months=quotation.warranty_months,
                validity_days=quotation.validity_days,
                custom_data=quotation.custom_data,
                status=Order.STATUS_PENDING,
            )
            for item in quotation.items.all():
                OrderItem.objects.create(
                    order=order,
                    product=item.product,
                    item_type=item.item_type,
                    product_name=item.product_name,
                    unit_price=item.unit_price,
                    width=item.width,
                    height=item.height,
                    quantity=item.quantity,
                    discount_percent=item.discount_percent,
                    note=item.note,
                    length=item.length,
                    area=item.area,
                    spec=item.spec,
                    warranty=item.warranty,
                    thickness=item.thickness,
                    product_image=item.product_image,
                    custom_data=item.custom_data,
                )

            # Khởi tạo yêu cầu phê duyệt cho Đơn hàng
            try:
                from approvals.models import ApprovalRequest, ApprovalStep
                from django.contrib.contenttypes.models import ContentType
                ct = ContentType.objects.get_for_model(order)
                req = ApprovalRequest.objects.create(
                    company=order.company,
                    content_type=ct,
                    object_id=order.id,
                    requester=request.user,
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
                import logging
                logging.error(f"Failed to create ApprovalRequest for order {order.id}: {e}")

            order.generate_payment_milestones()

            return Response(OrderSerializer(order).data, status=status.HTTP_201_CREATED)

    @action(detail=True, methods=["post"], url_path="submit-approval")
    def submit_approval(self, request, pk=None):
        quotation = self.get_object()
        if quotation.status != Quotation.STATUS_DRAFT and quotation.status != Quotation.STATUS_REJECTED:
            return Response(
                {"detail": "Chỉ báo giá Nháp hoặc Bị từ chối mới có thể trình duyệt."},
                status=status.HTTP_400_BAD_REQUEST
            )
            
        approver_id = request.data.get("approver_id")
        description = request.data.get("description", "Yêu cầu phê duyệt báo giá")
        
        if not approver_id:
            return Response({"detail": "Vui lòng chọn người duyệt."}, status=status.HTTP_400_BAD_REQUEST)
            
        from users.models import User
        try:
            approver = User.objects.get(id=approver_id, company=request.user.company)
        except User.DoesNotExist:
            return Response({"detail": "Người duyệt không hợp lệ."}, status=status.HTTP_400_BAD_REQUEST)
            
        from approvals.models import ApprovalRequest, ApprovalStep
        from django.contrib.contenttypes.models import ContentType
        from django.db import transaction
        
        with transaction.atomic():
            # Create ApprovalRequest
            ct = ContentType.objects.get_for_model(quotation)
            approval_req = ApprovalRequest.objects.create(
                company=request.user.company,
                requester=request.user,
                content_type=ct,
                object_id=quotation.id,
                title=f"Phê duyệt Báo giá {quotation.quotation_number}",
                description=description,
                status=ApprovalRequest.STATUS_PENDING
            )
            
            # Create ApprovalStep for the selected approver
            ApprovalStep.objects.create(
                request=approval_req,
                step_order=1,
                approver_user=approver,
                status=ApprovalStep.STATUS_PENDING
            )
            
            # Update quotation status
            quotation.status = Quotation.STATUS_PENDING_APPROVAL
            quotation.save(update_fields=["status"])
            
        try:
            from notifications.utils import create_notification
            create_notification(
                company=request.user.company,
                recipient=approver,
                notif_type="approval",
                title=f"Yêu cầu duyệt báo giá {quotation.quotation_number}",
                message=f"{request.user.full_name or request.user.username} vừa trình duyệt báo giá {quotation.quotation_number} cho khách hàng {quotation.customer.name}.",
                link="/approvals",
                sender=request.user
            )
        except Exception:
            pass
            
        return Response({"detail": "Đã trình duyệt thành công."}, status=status.HTTP_200_OK)

    @action(detail=True, methods=["post"], url_path="quick-approve")
    def quick_approve(self, request, pk=None):
        quotation = self.get_object()
        if not (request.user.is_superuser or request.user.is_company_admin or request.user.has_permission("sales.approve")):
            from rest_framework.exceptions import PermissionDenied
            raise PermissionDenied("Bạn không có quyền duyệt báo giá.")
        if quotation.status != Quotation.STATUS_PENDING_APPROVAL:
            return Response({"detail": "Báo giá không ở trạng thái chờ duyệt."}, status=status.HTTP_400_BAD_REQUEST)

        from approvals.models import ApprovalRequest, ApprovalStep
        from django.contrib.contenttypes.models import ContentType
        ct = ContentType.objects.get_for_model(quotation)
        reqs = ApprovalRequest.objects.filter(content_type=ct, object_id=quotation.id, status=ApprovalRequest.STATUS_PENDING)
        for req in reqs:
            req.status = ApprovalRequest.STATUS_APPROVED
            req.save(update_fields=["status"])
            for step in req.steps.filter(status=ApprovalStep.STATUS_PENDING):
                step.status = ApprovalStep.STATUS_APPROVED
                step.save(update_fields=["status"])

        quotation.status = Quotation.STATUS_APPROVED
        quotation.save(update_fields=["status"])
        try:
            from notifications.utils import create_notification
            create_notification(
                company=request.user.company,
                recipient=quotation.created_by,
                notif_type="approval",
                title=f"Báo giá {quotation.quotation_number} đã được duyệt",
                message=f"Báo giá {quotation.quotation_number} đã được {request.user.full_name or request.user.username} phê duyệt.",
                link="/quotations",
                sender=request.user
            )
        except Exception:
            pass
        return Response({"detail": "Đã duyệt báo giá thành công."}, status=status.HTTP_200_OK)

    @action(detail=True, methods=["post"], url_path="quick-reject")
    def quick_reject(self, request, pk=None):
        quotation = self.get_object()
        if not (request.user.is_superuser or request.user.is_company_admin or request.user.has_permission("sales.approve")):
            from rest_framework.exceptions import PermissionDenied
            raise PermissionDenied("Bạn không có quyền từ chối báo giá.")
        if quotation.status != Quotation.STATUS_PENDING_APPROVAL:
            return Response({"detail": "Báo giá không ở trạng thái chờ duyệt."}, status=status.HTTP_400_BAD_REQUEST)

        from approvals.models import ApprovalRequest, ApprovalStep
        from django.contrib.contenttypes.models import ContentType
        ct = ContentType.objects.get_for_model(quotation)
        reqs = ApprovalRequest.objects.filter(content_type=ct, object_id=quotation.id, status=ApprovalRequest.STATUS_PENDING)
        for req in reqs:
            req.status = ApprovalRequest.STATUS_REJECTED
            req.save(update_fields=["status"])
            for step in req.steps.filter(status=ApprovalStep.STATUS_PENDING):
                step.status = ApprovalStep.STATUS_REJECTED
                step.save(update_fields=["status"])

        quotation.status = Quotation.STATUS_REJECTED
        quotation.save(update_fields=["status"])
        try:
            from notifications.utils import create_notification
            create_notification(
                company=request.user.company,
                recipient=quotation.created_by,
                notif_type="approval",
                title=f"Báo giá {quotation.quotation_number} bị từ chối",
                message=f"Báo giá {quotation.quotation_number} bị {request.user.full_name or request.user.username} từ chối duyệt.",
                link="/quotations",
                sender=request.user
            )
        except Exception:
            pass
        return Response({"detail": "Đã từ chối báo giá."}, status=status.HTTP_200_OK)

    @action(detail=True, methods=["post"], url_path="activate-link")
    def activate_link(self, request, pk=None):
        quotation = self.get_object()
        from django.utils import timezone
        from datetime import timedelta
        
        quotation.public_link_expires_at = timezone.now() + timedelta(hours=24)
        quotation.save(update_fields=["public_link_expires_at"])
        
        return Response({
            "detail": "Link chia sẻ đã được kích hoạt/gia hạn 24 giờ.",
            "public_token": quotation.public_token,
            "public_link_expires_at": quotation.public_link_expires_at
        }, status=status.HTTP_200_OK)


class QuotationItemViewSet(viewsets.ModelViewSet):
    """CRUD dòng sản phẩm trong báo giá — filter qua quotation.company."""
    module_code = "sales"

    queryset = QuotationItem.objects.select_related(
        "quotation__company", "product"
    ).order_by("quotation", "id")
    serializer_class = QuotationItemSerializer
    permission_classes = [permissions.IsAuthenticated, ActionBasedPermission]
    
    action_permissions = {
        "list": ["sales.view", "sales.create", "sales.edit"],
        "retrieve": ["sales.view", "sales.create", "sales.edit"],
        "create": ["sales.create", "sales.edit"],
        "update": ["sales.create", "sales.edit"],
        "partial_update": ["sales.create", "sales.edit"],
        "destroy": ["sales.create", "sales.edit"],
    }

    def get_queryset(self):
        user = self.request.user
        if user.is_superuser and user.company_id is None:
            return super().get_queryset()
        return self.queryset.filter(quotation__company=user.company)


class QuotationTemplateViewSet(viewsets.ModelViewSet):
    """
    CRUD Mẫu báo giá:
    - Superadmin: Toàn quyền Thêm, Sửa, Xóa.
    - Company Admin & Nhân viên: Chỉ đọc các mẫu đang hoạt động (is_active=True).
    """

    queryset = QuotationTemplate.objects.all().order_by("-is_default", "name")
    serializer_class = QuotationTemplateSerializer

    def get_permissions(self):
        if self.action in ["list", "retrieve", "active_templates", "my_company_template"]:
            return [permissions.IsAuthenticated()]
        from users.permissions import IsSuperAdmin
        return [permissions.IsAuthenticated(), IsSuperAdmin()]

    def get_queryset(self):
        qs = super().get_queryset()
        user = self.request.user
        if not user.is_superuser:
            qs = qs.filter(is_active=True)
        return qs

    @action(detail=False, methods=["get"], url_path="active")
    def active_templates(self, request):
        qs = QuotationTemplate.objects.filter(is_active=True).order_by("-is_default", "name")
        serializer = self.get_serializer(qs, many=True)
        return Response(serializer.data)

    @action(detail=False, methods=["get"], url_path="my-company-template")
    def my_company_template(self, request):
        company = request.user.company
        template = None
        if company and company.quotation_template and company.quotation_template.is_active:
            template = company.quotation_template
        if not template:
            template = QuotationTemplate.objects.filter(is_default=True, is_active=True).first()
        if not template:
            template = QuotationTemplate.objects.filter(is_active=True).first()
        if not template:
            return Response({"detail": "Chưa có mẫu báo giá nào."}, status=status.HTTP_404_NOT_FOUND)
        serializer = self.get_serializer(template)
        return Response(serializer.data)


class PublicQuotationView(APIView):
    """
    API dành cho khách hàng xem và ký duyệt báo giá (không cần đăng nhập).
    GET /api/sales/public-quotations/{public_token}/
    POST /api/sales/public-quotations/{public_token}/sign/
    """
    permission_classes = [permissions.AllowAny]

    def get(self, request, public_token):
        try:
            quotation = Quotation.objects.get(public_token=public_token)
            if quotation.public_link_expires_at and quotation.public_link_expires_at < timezone.now():
                return Response({"detail": "Báo giá này đã hết hạn truy cập."}, status=status.HTTP_403_FORBIDDEN)
                
            # Dùng context request để serialize ra absolute URL ảnh
            serializer = QuotationSerializer(quotation, context={"request": request})
            return Response(serializer.data)
        except Quotation.DoesNotExist:
            return Response({"detail": "Báo giá không tồn tại hoặc link đã hết hạn."}, status=status.HTTP_404_NOT_FOUND)

    def post(self, request, public_token):
        try:
            quotation = Quotation.objects.get(public_token=public_token)
        except Quotation.DoesNotExist:
            return Response({"detail": "Báo giá không tồn tại."}, status=status.HTTP_404_NOT_FOUND)

        if quotation.public_link_expires_at and quotation.public_link_expires_at < timezone.now():
            return Response({"detail": "Báo giá này đã hết hạn truy cập."}, status=status.HTTP_403_FORBIDDEN)

        if quotation.status == Quotation.STATUS_ACCEPTED:
            return Response({"detail": "Báo giá này đã được duyệt trước đó."}, status=status.HTTP_400_BAD_REQUEST)

        signature_image = request.data.get("signature_image")
        customer_name_signed = request.data.get("customer_name_signed")

        if not signature_image or not customer_name_signed:
            return Response({"detail": "Vui lòng cung cấp chữ ký và họ tên người ký."}, status=status.HTTP_400_BAD_REQUEST)

        quotation.signature_image = signature_image
        quotation.customer_name_signed = customer_name_signed
        quotation.signed_at = timezone.now()
        quotation.status = Quotation.STATUS_ACCEPTED
        quotation.save(update_fields=["signature_image", "customer_name_signed", "signed_at", "status"])

        return Response({"detail": "Ký duyệt báo giá thành công."})


class SavedTemplateBlockViewSet(TenantQuerySetMixin, viewsets.ModelViewSet):
    """CRUD Block mẫu đã lưu."""
    module_code = "sales"

    queryset = SavedTemplateBlock.objects.all().order_by("-created_at")
    serializer_class = SavedTemplateBlockSerializer
