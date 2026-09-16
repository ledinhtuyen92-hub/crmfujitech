import logging
from datetime import timedelta
from django.utils import timezone
from celery import shared_task
from django.db.models import Max
from users.models import CompanySettings
from crm.models import Customer
from orders.models import Order

logger = logging.getLogger(__name__)

@shared_task
def check_and_update_inactive_customers():
    """
    Quét mỗi đêm: Tự động đánh dấu is_inactive = True cho khách hàng
    nếu số ngày không có đơn hàng vượt quá inactive_days_threshold.
    """
    logger.info("Starting check_and_update_inactive_customers...")
    
    # Duyệt qua các cấu hình công ty có threshold > 0
    settings = CompanySettings.objects.filter(inactive_days_threshold__gt=0)
    
    total_updated = 0
    now = timezone.now()
    
    for setting in settings:
        threshold_days = setting.inactive_days_threshold
        company = setting.company
        
        # Chỉ xét các khách hàng không ở trạng thái lost/inactive và chưa bị đánh dấu is_inactive
        customers = Customer.objects.filter(
            company=company,
            is_inactive=False
        ).exclude(
            status__in=[Customer.STATUS_LOST, Customer.STATUS_INACTIVE]
        )
        
        for customer in customers:
            # Tìm ngày đơn hàng duyệt gần nhất
            last_order = Order.objects.filter(
                customer=customer, 
                status=Order.STATUS_APPROVED
            ).aggregate(Max('created_at'))['created_at__max']
            
            # Nếu không có đơn hàng nào, lấy ngày tạo khách hàng
            if not last_order:
                last_active_date = customer.created_at
            else:
                last_active_date = last_order
                
            if last_active_date:
                days_since_active = (now - last_active_date).days
                if days_since_active > threshold_days:
                    customer.is_inactive = True
                    customer.save(update_fields=['is_inactive'])
                    total_updated += 1
                    logger.info(f"Customer {customer.id} marked as inactive. Last active: {days_since_active} days ago.")
                    
    logger.info(f"Finished check_and_update_inactive_customers. Total updated: {total_updated}")
    return total_updated

@shared_task
def check_follow_up_appointments():
    """
    Quét mỗi 15 phút: Tìm khách hàng có follow_up_time sắp tới
    để gửi thông báo cho Sale phụ trách. Tuỳ chỉnh thời gian nhắc có thể
    ở mức Company hoặc ghi đè ở mức Customer.
    """
    from notifications.models import Notification
    
    logger.info("Starting check_follow_up_appointments...")
    settings = CompanySettings.objects.all()
    now = timezone.now()
    max_future = now + timedelta(days=30) # Chỉ quét các lịch hẹn trong 30 ngày tới để tối ưu
    total_notified = 0

    for setting in settings:
        company = setting.company
        company_hours_before = setting.follow_up_remind_before_hours
        
        # Tìm khách hàng có lịch chăm sóc chưa được nhắc nhở,
        # và thời gian hẹn nằm ở tương lai (đến tối đa 30 ngày)
        customers = Customer.objects.filter(
            company=company,
            follow_up_time__isnull=False,
            follow_up_reminded=False,
            follow_up_time__gte=now,
            follow_up_time__lte=max_future,
            assigned_to__isnull=False
        )
        
        for customer in customers:
            # Ưu tiên lấy cấu hình nhắc nhở của riêng khách hàng này, nếu không thì lấy mặc định công ty
            if customer.follow_up_remind_before_minutes is not None:
                mins_before = customer.follow_up_remind_before_minutes
            else:
                if not company_hours_before:
                    continue # Công ty không cấu hình nhắc nhở mặc định
                mins_before = company_hours_before * 60
                
            # Nếu thiết lập là 0 phút thì báo đúng giờ
            target_time = customer.follow_up_time - timedelta(minutes=mins_before)
            
            # Nếu thời điểm hiện tại đã đạt tới hoặc vượt qua mốc target_time
            if now >= target_time:
                # Tạo thông báo cho Sale phụ trách
                message = f"Sắp đến lịch chăm sóc khách hàng {customer.name} vào lúc {customer.follow_up_time.strftime('%H:%M %d/%m/%Y')}."
                Notification.objects.create(
                    recipient=customer.assigned_to,
                    company=company,
                    type=Notification.TYPE_CRM_ASSIGNED,
                    title="Nhắc nhở lịch chăm sóc khách hàng",
                    message=message,
                    link=f"/customers/{customer.id}"
                )
                
                # Đánh dấu đã nhắc nhở
                customer.follow_up_reminded = True
                customer.save(update_fields=['follow_up_reminded'])
                total_notified += 1
            
    logger.info(f"Finished check_follow_up_appointments. Total notified: {total_notified}")
    return total_notified
