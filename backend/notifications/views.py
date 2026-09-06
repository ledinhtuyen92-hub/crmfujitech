from rest_framework import generics, permissions, status
from rest_framework.decorators import api_view, permission_classes
from rest_framework.response import Response

from .models import Notification
from .serializers import NotificationSerializer


class NotificationListView(generics.ListAPIView):
    """
    GET /api/notifications/
    Trả về danh sách thông báo của user đang đăng nhập, filter theo company.
    """

    serializer_class = NotificationSerializer
    permission_classes = [permissions.IsAuthenticated]

    def get_queryset(self):
        user = self.request.user
        qs = Notification.objects.filter(
            company=user.company,
            recipient=user,
        ).select_related("sender").order_by("-created_at")

        # Lọc chỉ chưa đọc nếu có query param ?unread=true
        if self.request.query_params.get("unread") == "true":
            qs = qs.filter(is_read=False)
        return qs


class NotificationMarkReadView(generics.UpdateAPIView):
    """
    PATCH /api/notifications/<id>/read/
    Đánh dấu một thông báo là đã đọc.
    """

    serializer_class = NotificationSerializer
    permission_classes = [permissions.IsAuthenticated]
    http_method_names = ["patch"]

    def get_queryset(self):
        return Notification.objects.filter(
            company=self.request.user.company,
            recipient=self.request.user,
        )

    def patch(self, request, *args, **kwargs):
        notification = self.get_object()
        notification.is_read = True
        notification.save(update_fields=["is_read"])
        return Response(NotificationSerializer(notification).data)


@api_view(["POST"])
@permission_classes([permissions.IsAuthenticated])
def mark_all_read(request):
    """
    POST /api/notifications/mark-all-read/
    Đánh dấu tất cả thông báo của user là đã đọc.
    """
    updated_count = Notification.objects.filter(
        company=request.user.company,
        recipient=request.user,
        is_read=False,
    ).update(is_read=True)
    return Response(
        {"detail": f"Đã đánh dấu {updated_count} thông báo là đã đọc."},
        status=status.HTTP_200_OK,
    )


@api_view(["GET"])
@permission_classes([permissions.IsAuthenticated])
def unread_count(request):
    """
    GET /api/notifications/unread-count/
    Trả về số lượng thông báo chưa đọc — dùng cho Badge trên icon Chuông.
    """
    count = Notification.objects.filter(
        company=request.user.company,
        recipient=request.user,
        is_read=False,
    ).count()

    # Tính toán thêm số lượng badge cho menu
    pending_inventory_count = 0
    pending_approval_count = 0
    pending_sales_count = 0
    pending_orders_count = 0
    pending_production_count = 0
    pending_delivery_count = 0
    unread_announcements_count = 0

    from .models import InternalAnnouncement
    from django.db.models import Q
    
    announcement_qs = InternalAnnouncement.objects.filter(company=request.user.company)
    if not (request.user.is_superuser or request.user.is_company_admin):
        if request.user.department_id:
            announcement_qs = announcement_qs.filter(
                Q(is_all_company=True) | 
                Q(departments=request.user.department_id) |
                Q(target_users=request.user) |
                Q(created_by=request.user)
            ).distinct()
        else:
            announcement_qs = announcement_qs.filter(
                Q(is_all_company=True) | 
                Q(target_users=request.user) |
                Q(created_by=request.user)
            ).distinct()
    unread_announcements_count = announcement_qs.exclude(reads__user=request.user).count()

    from inventory.models import InventoryTransaction
    from approvals.models import ApprovalStep
    
    # 1. Kho vận: đếm số lệnh xuất chờ duyệt
    if request.user.is_superuser or request.user.is_company_admin or (request.user.role and request.user.role.permissions.filter(code="inventory.approve_export").exists()):
        pending_inventory_count = InventoryTransaction.objects.filter(
            company=request.user.company,
            type=InventoryTransaction.TYPE_EXPORT,
            status=InventoryTransaction.STATUS_PENDING
        ).values('transaction_code').distinct().count()

    # 2. Phê duyệt (Tổng): đếm số yêu cầu đang chờ chính user này duyệt
    from approvals.models import ApprovalRequest
    from django.db.models import Q
    from django.contrib.contenttypes.models import ContentType

    qs = ApprovalRequest.objects.filter(company=request.user.company, status=ApprovalRequest.STATUS_PENDING)
    
    if not (request.user.is_superuser or request.user.is_company_admin):
        # Chỉ hiển thị yêu cầu mà user được chỉ định trực tiếp hoặc qua role
        q_filter = Q(steps__approver_user=request.user)
        if request.user.role:
            q_filter |= Q(steps__approver_role=request.user.role)
        qs = qs.filter(q_filter).distinct()
    
    base_approval_qs = qs
    pending_approval_count = base_approval_qs.count()

    # Phê duyệt theo từng loại (Bán hàng, Đơn hàng)
    pending_sales_count = base_approval_qs.filter(content_type__model='quotation').count()
    pending_orders_count = base_approval_qs.filter(content_type__model='order').count()

    # 3. Sản xuất: đếm số lệnh chờ sản xuất
    if request.user.is_superuser or request.user.is_company_admin or (request.user.role and request.user.role.permissions.filter(code__in=["production.update_step", "production.manage_factory", "production.view"]).exists()):
        from production.models import ProductionOrder
        pending_production_count = ProductionOrder.objects.filter(
            company=request.user.company,
            status=ProductionOrder.STATUS_PENDING
        ).count()
        
    # 4. Giao hàng: đếm số lệnh chờ giao
    if request.user.is_superuser or request.user.is_company_admin or (request.user.role and request.user.role.permissions.filter(code__in=["delivery.assign", "delivery.edit", "delivery.view"]).exists()):
        from delivery.models import DeliveryOrder
        pending_delivery_count = DeliveryOrder.objects.filter(
            company=request.user.company,
            status=DeliveryOrder.STATUS_PENDING
        ).count()

    return Response({
        "unread_count": count,
        "pending_inventory_count": pending_inventory_count,
        "pending_approval_count": pending_approval_count,
        "pending_sales_count": pending_sales_count,
        "pending_orders_count": pending_orders_count,
        "pending_production_count": pending_production_count,
        "pending_delivery_count": pending_delivery_count,
        "unread_announcements_count": unread_announcements_count,
    })


from rest_framework import viewsets
from rest_framework.decorators import action
from django.db.models import Q
from .models import InternalAnnouncement, AnnouncementAttachment, AnnouncementRead, AnnouncementCategory
from .serializers import InternalAnnouncementSerializer
from users.permissions import ActionBasedPermission, IsModuleActivePermission


class InternalAnnouncementViewSet(viewsets.ModelViewSet):
    """
    API ViewSet cho Thông báo nội bộ
    - Cần quyền `announcements.view` để xem
    - Cần quyền `announcements.create` để tạo.
    - Cần quyền `announcements.delete` để xóa.
    """
    serializer_class = InternalAnnouncementSerializer
    permission_classes = [permissions.IsAuthenticated, IsModuleActivePermission, ActionBasedPermission]
    module_code = "notifications"

    # ActionBasedPermission uses action_permissions
    action_permissions = {
        "list": "notifications.view_announcements",
        "retrieve": "notifications.view_announcements",
        "create": "notifications.create_announcements",
        "update": "notifications.create_announcements",
        "partial_update": "notifications.create_announcements",
        "destroy": "notifications.delete_announcements",
        "mark_read": "notifications.view_announcements",
    }

    def get_queryset(self):
        user = self.request.user
        qs = InternalAnnouncement.objects.filter(company=user.company).order_by("-is_pinned", "-created_at")
        
        # Nếu không phải là người tạo hoặc superadmin, thì chỉ xem những thông báo dành cho toàn công ty 
        # hoặc gửi riêng cho phòng ban của user
        if not (user.is_superuser or user.is_company_admin):
            if user.department_id:
                qs = qs.filter(
                    Q(is_all_company=True) | 
                    Q(departments=user.department_id) |
                    Q(target_users=user) |
                    Q(created_by=user)
                ).distinct()
            else:
                # User ko có phòng ban thì chỉ xem thông báo toàn cty, cá nhân hoặc do mình tạo
                qs = qs.filter(
                    Q(is_all_company=True) | 
                    Q(target_users=user) |
                    Q(created_by=user)
                ).distinct()
        
        # Tính năng Lọc chưa đọc
        if self.request.query_params.get("unread") == "true":
            qs = qs.exclude(reads__user=user)
            
        return qs.prefetch_related("attachments", "departments", "reads")

    @action(detail=False, methods=['get'], url_path='categories')
    def get_categories(self, request):
        categories = AnnouncementCategory.objects.filter(
            company=request.user.company
        ).values_list('name', flat=True)
        return Response(list(categories))

    @action(detail=False, methods=['post'], url_path='delete-category')
    def delete_category(self, request):
        category_name = request.data.get('category')
        if not category_name:
            return Response({'detail': 'Vui lòng cung cấp category cần xóa.'}, status=status.HTTP_400_BAD_REQUEST)
        
        # Xóa record category
        AnnouncementCategory.objects.filter(
            company=request.user.company,
            name=category_name
        ).delete()
        
        # Cập nhật rỗng cho các thông báo cũ (nếu muốn triệt để)
        InternalAnnouncement.objects.filter(
            company=request.user.company,
            category=category_name
        ).update(category="")
        
        return Response({'detail': 'Xóa danh mục thành công.'}, status=status.HTTP_200_OK)

    def perform_create(self, serializer):
        priority = self.request.data.get("priority", "normal")
        is_pinned = str(self.request.data.get("is_pinned", "false")).lower() == "true"
        
        # Lưu thông báo
        announcement = serializer.save(
            company=self.request.user.company, 
            created_by=self.request.user,
            priority=priority,
            is_pinned=is_pinned
        )
        
        # Lưu AnnouncementCategory nếu có
        if announcement.category:
            AnnouncementCategory.objects.get_or_create(
                company=self.request.user.company,
                name=announcement.category
            )
        
        # Xử lý up file
        files = self.request.FILES.getlist("attachments")
        if not files:
            files = self.request.FILES.getlist("files") # fallback
            
        for f in files:
            AnnouncementAttachment.objects.create(
                announcement=announcement,
                file=f,
                file_name=f.name,
                file_size=f.size
            )
            
        # Xử lý departments (vì ManyToMany cần được set sau khi lưu object)
        departments_data = self.request.data.getlist("departments") if hasattr(self.request.data, "getlist") else self.request.data.get("departments", [])
        if not announcement.is_all_company and departments_data:
            # Parse list of IDs (vì form-data gửi lên có thể là string)
            dept_ids = []
            for d in departments_data:
                # Handle trường hợp ["1, 2"] hoặc ["1", "2"]
                if isinstance(d, str):
                    dept_ids.extend([int(x.strip()) for x in d.split(",") if x.strip().isdigit()])
                else:
                    dept_ids.append(int(d))
            announcement.departments.set(dept_ids)
            
        # Xử lý target_users
        target_users_data = self.request.data.getlist("target_users") if hasattr(self.request.data, "getlist") else self.request.data.get("target_users", [])
        if not announcement.is_all_company and target_users_data:
            user_ids = []
            for d in target_users_data:
                import json
                try:
                    parsed = json.loads(d)
                    if isinstance(parsed, list):
                        user_ids.extend([int(x) for x in parsed])
                    else:
                        user_ids.append(int(parsed))
                except (ValueError, TypeError, json.JSONDecodeError):
                    if isinstance(d, str):
                        user_ids.extend([int(x.strip()) for x in d.split(",") if x.strip().isdigit()])
                    else:
                        user_ids.append(int(d))
            announcement.target_users.set(user_ids)
            
    def perform_update(self, serializer):
        priority = self.request.data.get("priority", "normal")
        is_pinned = str(self.request.data.get("is_pinned", "false")).lower() == "true"
        
        announcement = serializer.save(
            priority=priority,
            is_pinned=is_pinned
        )
        
        if announcement.category:
            AnnouncementCategory.objects.get_or_create(
                company=self.request.user.company,
                name=announcement.category
            )
            
        # Xử lý up file (thêm mới)
        files = self.request.FILES.getlist("attachments")
        if not files:
            files = self.request.FILES.getlist("files") # fallback
            
        for f in files:
            AnnouncementAttachment.objects.create(
                announcement=announcement,
                file=f,
                file_name=f.name,
                file_size=f.size
            )
            
        # Xử lý xóa file đính kèm cũ
        deleted_attachments = self.request.data.getlist("deleted_attachments") if hasattr(self.request.data, "getlist") else self.request.data.get("deleted_attachments", [])
        if deleted_attachments:
            deleted_ids = []
            for d in deleted_attachments:
                if isinstance(d, str):
                    deleted_ids.extend([int(x.strip()) for x in d.split(",") if x.strip().isdigit()])
                else:
                    deleted_ids.append(int(d))
            if deleted_ids:
                AnnouncementAttachment.objects.filter(announcement=announcement, id__in=deleted_ids).delete()

        # Xử lý departments
        departments_data = self.request.data.getlist("departments") if hasattr(self.request.data, "getlist") else self.request.data.get("departments", [])
        if not announcement.is_all_company and departments_data:
            dept_ids = []
            for d in departments_data:
                if isinstance(d, str):
                    dept_ids.extend([int(x.strip()) for x in d.split(",") if x.strip().isdigit()])
                else:
                    dept_ids.append(int(d))
            announcement.departments.set(dept_ids)
        elif announcement.is_all_company:
            announcement.departments.clear()
            
        # Xử lý target_users
        target_users_data = self.request.data.getlist("target_users") if hasattr(self.request.data, "getlist") else self.request.data.get("target_users", [])
        if not announcement.is_all_company and target_users_data:
            user_ids = []
            for d in target_users_data:
                import json
                try:
                    parsed = json.loads(d)
                    if isinstance(parsed, list):
                        user_ids.extend([int(x) for x in parsed])
                    else:
                        user_ids.append(int(parsed))
                except (ValueError, TypeError, json.JSONDecodeError):
                    if isinstance(d, str):
                        user_ids.extend([int(x.strip()) for x in d.split(",") if x.strip().isdigit()])
                    else:
                        user_ids.append(int(d))
            announcement.target_users.set(user_ids)
        elif announcement.is_all_company:
            announcement.target_users.clear()
            
        # [FEATURE] Bắn quả chuông cho các nhân viên liên quan
        target_users = set()
        if announcement.is_all_company:
            for u in self.request.user.company.users.exclude(id=self.request.user.id):
                target_users.add(u)
        else:
            # Filter users theo phòng ban
            from users.models import User
            dept_users = User.objects.filter(
                company=self.request.user.company,
                department__in=announcement.departments.all()
            ).exclude(id=self.request.user.id)
            for u in dept_users:
                target_users.add(u)
            
            specific_users = announcement.target_users.exclude(id=self.request.user.id)
            for u in specific_users:
                target_users.add(u)
            
        notifications_to_create = []
        for u in target_users:
            notifications_to_create.append(
                Notification(
                    company=self.request.user.company,
                    recipient=u,
                    sender=self.request.user,
                    type=Notification.TYPE_SYSTEM_UPDATE,
                    title=f"Có thông báo nội bộ mới: {announcement.title}",
                    message=announcement.content[:100] + "..." if len(announcement.content) > 100 else announcement.content,
                    link="/announcements"
                )
            )
        if notifications_to_create:
            Notification.objects.bulk_create(notifications_to_create)

    @action(detail=True, methods=["post"])
    def mark_read(self, request, pk=None):
        announcement = self.get_object()
        AnnouncementRead.objects.get_or_create(
            announcement=announcement,
            user=request.user
        )
        return Response({"status": "ok"})
