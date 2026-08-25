"""
Dashboard API — trả về thống kê tổng quan phân theo vai trò.

GET /api/dashboard/summary/  → Tóm tắt KPIs
GET /api/dashboard/revenue-chart/?period=12  → Doanh thu theo tháng
GET /api/dashboard/orders-by-status/  → Đơn hàng theo trạng thái
GET /api/dashboard/top-customers/?limit=5  → Top khách hàng
GET /api/dashboard/top-sellers/?limit=5  → Top nhân viên (admin only)
"""
from datetime import date, timedelta

from django.db.models import Count, Q, Sum
from django.db.models.functions import TruncMonth
from rest_framework import permissions
from rest_framework.decorators import api_view, permission_classes
from rest_framework.response import Response


from django.utils import timezone

def _company_filter(user):
    """Trả về company filter phù hợp với user."""
    if user.is_superuser and user.company_id is None:
        return Q()  # Superuser hệ thống xem tất cả
    return Q(company=user.company)


def get_date_range(time_filter):
    """Tính toán start_date, end_date dựa trên time_filter."""
    today = timezone.localtime().date()
    if time_filter == "today":
        return today, today
    elif time_filter == "week":
        start = today - timedelta(days=today.weekday())
        return start, today
    elif time_filter == "month":
        start = today.replace(day=1)
        return start, today
    elif time_filter == "quarter":
        quarter = (today.month - 1) // 3 + 1
        start = today.replace(month=3 * quarter - 2, day=1)
        return start, today
    elif time_filter == "year":
        start = today.replace(month=1, day=1)
        return start, today
    return None, None


def apply_dashboard_scope(qs, request, user, user_field="created_by"):
    """
    Áp dụng filter dữ liệu dựa theo scope và phân quyền.
    user_field: Trường lưu người tạo/phụ trách. Nếu qs là bảng User thì truyền None.
    """
    scope = request.query_params.get("scope", "personal")
    dept_id = request.query_params.get("department_id")

    is_admin = user.is_company_admin or user.is_superuser
    prefix = f"{user_field}__" if user_field else ""
    user_filter_key = user_field if user_field else "pk"

    if scope == "company":
        if is_admin or user.has_perm_code("dashboard.scope_company"):
            return qs 
        else:
            scope = "personal" 

    if scope == "any_department":
        if is_admin or user.has_perm_code("dashboard.scope_any_department") or user.has_perm_code("dashboard.scope_company"):
            if dept_id:
                return qs.filter(**{f"{prefix}department_id": dept_id})
            return qs 
        else:
            scope = "personal"

    if scope == "my_department":
        if is_admin or user.has_perm_code("dashboard.scope_my_department") or user.has_perm_code("dashboard.scope_company"):
            if user.department_id:
                return qs.filter(**{f"{prefix}department_id": user.department_id})
            return qs.filter(**{user_filter_key: user})
        else:
            scope = "personal"

    return qs.filter(**{user_filter_key: user})


@api_view(["GET"])
@permission_classes([permissions.IsAuthenticated])
def summary(request):
    """
    Trả về các KPI tóm tắt:
    - Số khách hàng (tổng / hôm nay)
    - Số báo giá (theo trạng thái)
    - Số đơn hàng (theo trạng thái / hôm nay)
    - Doanh thu tháng này
    - Tồn kho cảnh báo thấp
    - Số đơn chờ duyệt (dành cho có quyền approve)
    """
    from crm.models import Customer
    from sales.models import Quotation
    from orders.models import Order
    from inventory.models import StockLevel
    from users.models import User
    from orders.models import OrderItem

    user = request.user
    today = date.today()
    cf = _company_filter(user)

    time_filter = request.query_params.get("time_filter", "month")
    start_date, end_date = get_date_range(time_filter)

    # ── Khách hàng ────────────────────────────────────────────────
    customer_qs = Customer.objects.filter(cf)
    customer_qs = apply_dashboard_scope(customer_qs, request, user, user_field="assigned_to")
    
    if start_date and end_date:
        customer_qs = customer_qs.filter(created_at__date__gte=start_date, created_at__date__lte=end_date)

    customer_stats = customer_qs.aggregate(
        total=Count("id"),
        new_today=Count("id", filter=Q(created_at__date=today)),
        by_status_lead=Count("id", filter=Q(status="lead")),
        by_status_potential=Count("id", filter=Q(status="potential")),
        by_status_customer=Count("id", filter=Q(status="customer")),
    )

    # ── Báo giá ────────────────────────────────────────────────
    quotation_qs = Quotation.objects.filter(cf)
    quotation_qs = apply_dashboard_scope(quotation_qs, request, user, user_field="created_by")
            
    if start_date and end_date:
        quotation_qs = quotation_qs.filter(created_at__date__gte=start_date, created_at__date__lte=end_date)

    quotation_stats = quotation_qs.aggregate(
        total=Count("id", distinct=True),
        draft=Count("id", filter=Q(status="draft"), distinct=True),
        sent=Count("id", filter=Q(status="sent"), distinct=True),
        accepted=Count("id", filter=Q(status="accepted"), distinct=True),
        rejected=Count("id", filter=Q(status="rejected"), distinct=True),
        won=Count("id", filter=Q(orders__status__in=["approved", "completed"]), distinct=True),
    )

    # ── Đơn hàng ────────────────────────────────────────────────
    order_qs = Order.objects.filter(cf)
    order_qs = apply_dashboard_scope(order_qs, request, user, user_field="created_by")
            
    if start_date and end_date:
        order_qs = order_qs.filter(created_at__date__gte=start_date, created_at__date__lte=end_date)

    revenue_in_period = order_qs.filter(
        status__in=["approved", "in_production", "completed"]
    ).aggregate(total=Sum("total_amount"))["total"] or 0

    order_stats = order_qs.aggregate(
        total=Count("id"),
        pending=Count("id", filter=Q(status="pending")),
        approved=Count("id", filter=Q(status="approved")),
        rejected=Count("id", filter=Q(status="rejected")),
        completed=Count("id", filter=Q(status="completed")),
    )
    order_stats["revenue_in_period"] = float(revenue_in_period)

    order_items_qs = OrderItem.objects.filter(order__in=order_qs, item_type="product").exclude(custom_data__has_key='actual_product_id')
    won_products = order_items_qs.filter(
        order__status__in=["approved", "in_production", "completed"]
    ).aggregate(total=Sum("quantity"))["total"] or 0
    completed_products = order_items_qs.filter(
        order__status="completed"
    ).aggregate(total=Sum("quantity"))["total"] or 0
    
    order_stats["won_products_count"] = float(won_products)
    order_stats["completed_products_count"] = float(completed_products)

    # ── Tồn kho thấp ────────────────────────────────────────────
    low_stock_count = 0
    if user.is_company_admin or user.has_perm_code("inventory.view"):
        stock_qs = StockLevel.objects.filter(
            product__company=user.company if user.company else None,
            min_quantity__gt=0,
        ).select_related("product")
        low_stock_count = sum(1 for s in stock_qs if s.is_low_stock)

    # ── Nhân viên ───────────────────────────────────────────────
    employee_qs = User.objects.filter(cf, is_active=True)
    if not user.is_company_admin and not user.is_superuser and not user.has_perm_code("settings.users"):
        managed_deps = user.managed_departments.all()
        if managed_deps.exists():
            employee_qs = employee_qs.filter(department__in=managed_deps)
        else:
            if user.department:
                employee_qs = employee_qs.filter(department=user.department)
            else:
                employee_qs = employee_qs.filter(id=user.id)
            
    employee_count = employee_qs.count()

    # ── Tính Win Rate ───────────────────────────────────────────
    # Tính theo số lượng báo giá đã được chuyển thành đơn hàng (Đã duyệt/Hoàn thành)
    total_quotes = (quotation_stats.get("sent") or 0) + (quotation_stats.get("accepted") or 0) + (quotation_stats.get("rejected") or 0)
    won_quotes = quotation_stats.get("won") or 0
    total_quotes = max(total_quotes, won_quotes) # Đảm bảo tỷ lệ không quá 100%
    
    win_rate = 0
    if total_quotes > 0:
        win_rate = (won_quotes / total_quotes) * 100

    return Response({
        "customers": customer_stats,
        "quotations": {
            **quotation_stats,
            "win_rate": float(round(win_rate, 1)),
        },
        "orders": {
            **order_stats,
            "revenue_in_period": float(order_stats.get("revenue_in_period") or 0),
        },
        "inventory": {
            "low_stock_count": low_stock_count,
        },
        "employees": {
            "total_active": employee_count
        }
    })


@api_view(["GET"])
@permission_classes([permissions.IsAuthenticated])
def revenue_chart(request):
    """
    Doanh thu theo thời gian.
    Query param: ?time_filter=...
    """
    from orders.models import Order
    from django.db.models.functions import TruncMonth, TruncDay

    user = request.user
    time_filter = request.query_params.get("time_filter", "month")
    
    start_date, end_date = get_date_range(time_filter)
    # Nếu không có time_filter, mặc định lấy 6 tháng (giống period=6 cũ)
    if not start_date:
        start_date = date.today().replace(day=1) - timedelta(days=30 * 5)
        end_date = date.today()

    cf = _company_filter(user)

    order_qs = Order.objects.filter(
        cf,
        status__in=["approved", "in_production", "completed"],
        created_at__date__gte=start_date,
        created_at__date__lte=end_date,
    )
    order_qs = apply_dashboard_scope(order_qs, request, user, user_field="created_by")

    use_daily = time_filter in ["today", "week", "month"]
    trunc_func = TruncDay("created_at") if use_daily else TruncMonth("created_at")
    date_format = "%Y-%m-%d" if use_daily else "%Y-%m"

    grouped = (
        order_qs
        .annotate(date_group=trunc_func)
        .values("date_group")
        .annotate(revenue=Sum("total_amount"), count=Count("id"))
        .order_by("date_group")
    )

    return Response([
        {
            "month": item["date_group"].strftime(date_format) if item["date_group"] else "",
            "revenue": float(item["revenue"] or 0),
            "count": item["count"],
        }
        for item in grouped
    ])


@api_view(["GET"])
@permission_classes([permissions.IsAuthenticated])
def orders_by_status(request):
    """Phân phối đơn hàng theo trạng thái (cho biểu đồ Pie/Donut)."""
    from orders.models import Order

    user = request.user
    cf = _company_filter(user)

    order_qs = Order.objects.filter(cf)
    order_qs = apply_dashboard_scope(order_qs, request, user, user_field="created_by")

    STATUS_LABELS = {
        "pending": "Chờ duyệt",
        "approved": "Đã duyệt",
        "rejected": "Từ chối",
        "in_production": "Đang sản xuất",
        "completed": "Hoàn thành",
        "cancelled": "Huỷ",
    }

    data = (
        order_qs
        .values("status")
        .annotate(count=Count("id"))
        .order_by("-count")
    )

    return Response([
        {
            "status": item["status"],
            "label": STATUS_LABELS.get(item["status"], item["status"]),
            "count": item["count"],
        }
        for item in data
    ])


@api_view(["GET"])
@permission_classes([permissions.IsAuthenticated])
def top_customers(request):
    """Top khách hàng theo doanh thu đơn hàng đã duyệt."""
    from orders.models import Order

    user = request.user
    limit = min(int(request.query_params.get("limit", 5)), 20)
    cf = _company_filter(user)

    order_qs = Order.objects.filter(cf, status__in=["approved", "in_production", "completed"])
    order_qs = apply_dashboard_scope(order_qs, request, user, user_field="created_by")

    top = (
        order_qs
        .values("customer_id", "customer__name", "customer__phone")
        .annotate(
            total_revenue=Sum("total_amount"),
            order_count=Count("id"),
        )
        .order_by("-total_revenue")[:limit]
    )

    return Response([
        {
            "customer_id": item["customer_id"],
            "name": item["customer__name"],
            "phone": item["customer__phone"],
            "total_revenue": float(item["total_revenue"] or 0),
            "order_count": item["order_count"],
        }
        for item in top
    ])


@api_view(["GET"])
@permission_classes([permissions.IsAuthenticated])
def top_sellers(request):
    """Top nhân viên Sale theo doanh thu toàn công ty."""
    from users.models import User
    from orders.models import Order, OrderItem
    from django.db.models.functions import Coalesce
    from django.db.models import Sum, Count, Q, DecimalField, IntegerField
    from decimal import Decimal

    user = request.user
    cf = _company_filter(user)
    
    time_filter = request.query_params.get("time_filter", "month")
    start_date, end_date = get_date_range(time_filter)

    # Sử dụng Subquery để tránh lỗi Cartesian Product khi tính tổng (do join nhiều bảng)
    from django.db.models import Subquery, OuterRef
    
    order_qs = Order.objects.filter(
        created_by=OuterRef('pk'), 
        status__in=["approved", "in_production", "completed"]
    )
    if start_date and end_date:
        order_qs = order_qs.filter(created_at__date__gte=start_date, created_at__date__lte=end_date)
        
    revenue_subquery = order_qs.values('created_by').annotate(t=Sum('total_amount')).values('t')
    order_count_subquery = order_qs.values('created_by').annotate(t=Count('id')).values('t')
    
    product_qs = OrderItem.objects.filter(
        order__created_by=OuterRef('pk'),
        order__status__in=["approved", "in_production", "completed"],
        item_type='product'
    )
    if start_date and end_date:
        product_qs = product_qs.filter(order__created_at__date__gte=start_date, order__created_at__date__lte=end_date)
        
    product_count_subquery = product_qs.values('order__created_by').annotate(t=Sum('quantity')).values('t')

    # Lấy toàn bộ nhân viên có phát sinh đơn hàng, không phân biệt phòng ban
    users = User.objects.filter(cf, is_active=True)
    users = apply_dashboard_scope(users, request, user, user_field=None)
    users = users.annotate(
        total_revenue=Coalesce(Subquery(revenue_subquery), Decimal('0.0'), output_field=DecimalField()),
        order_count=Coalesce(Subquery(order_count_subquery), 0, output_field=IntegerField()),
        product_count=Coalesce(Subquery(product_count_subquery), 0, output_field=IntegerField())
    ).exclude(order_count=0).order_by("-total_revenue")

    return Response([
        {
            "user_id": item.id,
            "full_name": item.full_name or item.email,
            "total_revenue": float(item.total_revenue),
            "order_count": item.order_count,
            "product_count": item.product_count,
        }
        for item in users
    ])


@api_view(["GET"])
@permission_classes([permissions.IsAuthenticated])
def debt_stats(request):
    """
    Trả về tổng công nợ và biểu đồ công nợ (theo tháng) của các đơn hàng.
    Kiểm tra dashboard.view_debt hoặc orders.view_all hoặc is_company_admin.
    """
    from orders.models import Order
    from finance.models import PaymentReceipt
    from django.db.models.functions import TruncMonth, Coalesce
    from django.db.models import Sum, OuterRef, Subquery, F, DecimalField
    from django.db.models.functions import TruncMonth, TruncDay

    user = request.user
    cf = _company_filter(user)
    
    time_filter = request.query_params.get("time_filter", "month")
    start_date, end_date = get_date_range(time_filter)

    order_qs = Order.objects.filter(cf).exclude(status__in=["cancelled", "rejected"])
    
    if start_date and end_date:
        order_qs = order_qs.filter(created_at__date__gte=start_date, created_at__date__lte=end_date)

    # Phân quyền
    order_qs = apply_dashboard_scope(order_qs, request, user, user_field="created_by")

    # Subquery tính tổng đã thanh toán cho từng Order
    receipts_subquery = PaymentReceipt.objects.filter(
        order=OuterRef("pk")
    ).values("order").annotate(
        total_paid=Sum("amount")
    ).values("total_paid")

    # Annotate total_paid và debt
    order_qs = order_qs.annotate(
        paid=Coalesce(Subquery(receipts_subquery), 0.0, output_field=DecimalField()),
    ).annotate(
        debt=F("total_amount") - F("paid")
    )
    
    # Lọc ra những đơn còn nợ (debt > 0)
    debt_qs = order_qs.filter(debt__gt=0)

    # 1. Tổng công nợ hiện tại
    total_debt = debt_qs.aggregate(t=Sum("debt"))["t"] or 0

    # 2. Biểu đồ công nợ
    # Nếu không có time_filter thì lấy 6 tháng gần nhất
    if not start_date:
        start_date = date.today().replace(day=1) - timedelta(days=30 * 5)
    
    monthly_qs = debt_qs.filter(created_at__date__gte=start_date)
    
    use_daily = time_filter in ["today", "week", "month"]
    trunc_func = TruncDay("created_at") if use_daily else TruncMonth("created_at")
    date_format = "%Y-%m-%d" if use_daily else "%Y-%m"
    monthly = (
        monthly_qs
        .annotate(date_group=trunc_func)
        .values("date_group")
        .annotate(total_debt=Sum("debt"))
        .order_by("date_group")
    )

    return Response({
        "total_debt": float(total_debt),
        "chart_data": [
            {
                "month": item["date_group"].strftime(date_format) if item["date_group"] else "",
                "debt": float(item["total_debt"] or 0),
            }
            for item in monthly
        ]
    })
