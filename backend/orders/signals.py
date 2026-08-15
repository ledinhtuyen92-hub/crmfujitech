"""
Django Signals cho Orders app.
Kích hoạt khi Order.status thay đổi sang 'approved':
  1. Tự động xuất kho (InventoryTransaction) cho mỗi OrderItem
  2. Tự động tạo ProductionOrder
  3. Gửi notification cho người tạo đơn
  4. Gửi notification cho Quản lý khi có đơn mới cần duyệt
"""
import logging

from django.db import transaction
from django.db.models.signals import post_save, pre_save, post_delete
from django.dispatch import receiver

logger = logging.getLogger(__name__)


@receiver(pre_save, sender="orders.Order")
def track_order_status_change(sender, instance, **kwargs):
    """
    Trước khi save, lưu lại status cũ vào _original_status
    để so sánh sau khi save.
    """
    if kwargs.get('raw'):
        return
    if instance.pk:
        try:
            original = sender.objects.get(pk=instance.pk)
            instance._original_status = original.status
        except sender.DoesNotExist:
            instance._original_status = None
    else:
        instance._original_status = None


@receiver(post_delete, sender="orders.Order")
def on_order_deleted(sender, instance, **kwargs):
    """
    Khi xóa đơn hàng, cần đồng bộ lại trạng thái Khách hàng
    """
    sync_customer_pipeline_status(instance.customer)


@receiver(post_save, sender="orders.Order")
def on_order_saved(sender, instance, created, **kwargs):
    """
    Sau khi save Order:
    - Nếu MỚI TẠO → thông báo cho Quản lý/Kế toán
    - Nếu STATUS THAY ĐỔI SANG 'approved' → xuất kho + tạo lệnh SX + thông báo
    - Nếu STATUS THAY ĐỔI SANG 'rejected' → thông báo cho người tạo
    """
    if kwargs.get('raw'):
        return
    from orders.models import Order

    if created:
        # Đơn hàng mới → thông báo cho Quản lý/Kế toán
        _notify_managers_new_order(instance)
        return

    original_status = getattr(instance, "_original_status", None)
    if original_status == instance.status:
        # Không có thay đổi status
        return

    if instance.status == Order.STATUS_APPROVED:
        _handle_order_approved(instance)
    elif instance.status == Order.STATUS_REJECTED:
        _handle_order_rejected(instance)
    elif instance.status == Order.STATUS_CANCELLED:
        _handle_order_cancelled(instance)
    elif instance.status == Order.STATUS_PENDING:
        _handle_order_pending(instance)

    # Nếu đơn hàng bị mất trạng thái approved (ví dụ: chuyển sang canceled, draft), đồng bộ lại Khách hàng
    if original_status == Order.STATUS_APPROVED and instance.status != Order.STATUS_APPROVED:
        sync_customer_pipeline_status(instance.customer)


def _notify_managers_new_order(order):
    """Gửi thông báo cho Quản lý và Kế toán khi có đơn hàng mới."""
    try:
        from users.models import User
        from notifications.utils import notify_order_pending
        from django.db.models import Q

        # Lấy users có quyền approve hoặc là company admin
        recipients = User.objects.filter(
            company=order.company,
            is_active=True,
        ).filter(
            Q(is_company_admin=True)
            | Q(role__permissions__code="orders.approve")
        ).exclude(
            id=order.created_by_id  # Không gửi cho chính người tạo
        ).distinct()

        notify_order_pending(order, recipients)
    except Exception as exc:
        logger.error("Failed to notify managers for new order %s: %s", order.order_number, exc)

def sync_customer_pipeline_status(customer):
    """
    Đồng bộ lại trạng thái Khách hàng (Pipeline) dựa trên số lượng đơn hàng đã duyệt.
    """
    if not customer:
        return
    try:
        from orders.models import Order
        from crm.models import Customer
        valid_count = customer.orders.exclude(status__in=[Order.STATUS_CANCELLED, Order.STATUS_REJECTED]).count()
        
        # Nếu có từ 2 đơn trở lên -> Khách hàng quay lại (Mua thêm)
        if valid_count >= 2:
            if customer.status != Customer.STATUS_REPEAT_ORDER:
                customer.status = Customer.STATUS_REPEAT_ORDER
                customer.save(update_fields=['status'])
        # Nếu mới có 1 đơn -> Khách hàng mới chốt (Đã có đơn hàng)
        elif valid_count == 1:
            if customer.status != Customer.STATUS_HAS_ORDER:
                customer.status = Customer.STATUS_HAS_ORDER
                customer.save(update_fields=['status'])
        else:
            # valid_count == 0
            # Chỉ lùi trạng thái về 'Sắp chốt' nếu khách hàng đang bị đánh dấu là đã có đơn hàng
            if customer.status in [Customer.STATUS_HAS_ORDER, Customer.STATUS_REPEAT_ORDER]:
                customer.status = Customer.STATUS_ACTIVE
                customer.save(update_fields=['status'])
    except Exception as exc:
        logger.error("Failed to sync customer pipeline status for customer %s: %s", customer.id, exc)


@transaction.atomic
def _handle_order_approved(order):
    """
    Xử lý khi đơn hàng được duyệt:
    1. Xuất kho cho từng OrderItem
    2. Tạo ProductionOrder
    3. Gửi notification
    """
    # Tự động tạo Lệnh xuất kho chờ duyệt và Lệnh sản xuất nếu đủ điều kiện tài chính
    check_and_trigger_mo_gate(order)

    # 4. Thông báo cho người tạo đơn
    try:
        notify_order_approved(order)
    except Exception as exc:
        logger.error("Failed to send approved notification for order %s: %s", order.order_number, exc)

    # 5. Tự động chuyển trạng thái Khách hàng (Pipeline)
    sync_customer_pipeline_status(order.customer)

def check_and_trigger_mo_gate(order):
    """Cổng kiểm soát MO: Chỉ khởi tạo lệnh sản xuất khi đơn đã cọc hoặc thanh toán đủ hoặc được duyệt ngoại lệ."""
    if order.status != order.STATUS_APPROVED:
        return
    allowed_statuses = [
        order.FIN_STATUS_DEPOSIT_PAID,
        order.FIN_STATUS_FULLY_PAID,
        order.FIN_STATUS_CREDIT_APPROVED,
    ]
    if order.financial_status in allowed_statuses:
        # Lệnh sản xuất (MO) chỉ được tạo sau khi Kho đã cấp vật tư thành công.
        _create_pending_inventory_export(order)
    else:
        logger.info("Order %s approved but waiting for deposit payment to open MO & Export Gate.", order.order_number)


def _create_production_order(order, factory_id=None):
    """Tự động tạo ProductionOrder sau khi kho cấp vật tư."""
    try:
        from production.models import ProductionOrder
        from orders.models import Order
        from core.numbering import derive_code_from_order
        from django.db import transaction

        with transaction.atomic():
            # Khóa đơn hàng trong transaction để tránh race condition khi duyệt xuất kho nhiều mục cùng lúc
            Order.objects.select_for_update().get(id=order.id)
            
            # Kiểm tra tránh duplicate
            if not ProductionOrder.objects.filter(order=order).exists():
                # Thừa kế hậu tố từ mã đơn hàng: DH-21072026-001 → LSX-21072026-001
                po_code = derive_code_from_order(order.order_number, order.company, "lsx")
                ProductionOrder.objects.create(
                    company=order.company,
                    order=order,
                    factory_id=factory_id,
                    production_order_code=po_code,
                    status=ProductionOrder.STATUS_PENDING,
                )
                logger.info("Auto-created ProductionOrder for order %s with code %s", order.order_number, po_code)
    except Exception as exc:
        logger.error("Failed to create ProductionOrder for order %s: %s", order.order_number, exc)



def _create_pending_inventory_export(order):
    """
    Tạo hoặc tái tạo lệnh xuất kho ở trạng thái chờ duyệt (pending).

    Logic mã phiếu:
    - Thừa kế hậu tố từ mã đơn hàng (DH-21072026-001 → EXP-21072026-001).
    - Xóa các dòng rejected cũ trước khi tạo mới để tránh trùng sản phẩm.
    - Đảm bảo hậu tố phiếu xuất luôn khớp với đơn hàng tương ứng.
    """
    try:
        from core.numbering import derive_code_from_order
        from inventory.models import InventoryTransaction

        # Xóa toàn bộ dòng rejected cũ của đơn hàng này để tạo phiếu mới sạch
        InventoryTransaction.objects.filter(
            reference_order=order,
            type=InventoryTransaction.TYPE_EXPORT,
            status=InventoryTransaction.STATUS_REJECTED
        ).delete()

        # Kiểm tra xem đã có dòng pending/completed nào chưa (để tránh tạo trùng)
        pending_or_done = InventoryTransaction.objects.filter(
            reference_order=order,
            type=InventoryTransaction.TYPE_EXPORT,
        ).exclude(status=InventoryTransaction.STATUS_REJECTED)

        if pending_or_done.exists():
            # Đã có phiếu đang chờ duyệt hoặc hoàn thành → không tạo thêm
            return

        # Sinh mã phiếu: thừa kế hậu tố từ mã đơn hàng
        # VD: FUJI-DH-21072026-001 → FUJI-EXP-21072026-001
        txn_code = derive_code_from_order(order.order_number, order.company, "export")

        for item in order.items.select_related("product").all():
            # Skip services as they don't require physical stock outward
            if item.item_type == 'service' or (item.product and item.product.product_type == 'service'):
                continue
                
            # Generate custom product name with dimensions
            custom_name = item.product.name if item.product else item.product_name
            dims = []
            
            def format_dim(val):
                f_val = float(val)
                return f"{int(f_val)}" if f_val.is_integer() else f"{f_val}"
                
            if hasattr(item, 'length') and item.length and float(item.length) > 0: dims.append(format_dim(item.length))
            if hasattr(item, 'height') and item.height and float(item.height) > 0: dims.append(format_dim(item.height))
            if hasattr(item, 'width') and item.width and float(item.width) > 0: dims.append(format_dim(item.width))
            if hasattr(item, 'thickness') and item.thickness and float(item.thickness) > 0: dims.append(format_dim(item.thickness))
            
            if dims:
                custom_name += f" ({' x '.join(dims)})"

            InventoryTransaction.objects.create(
                company=order.company,
                transaction_code=txn_code,
                type=InventoryTransaction.TYPE_EXPORT,
                status=InventoryTransaction.STATUS_PENDING,
                product=item.product,
                custom_product_name=custom_name,
                warehouse=None,
                quantity=item.quantity,
                unit_cost=0,
                reference_order=order,
                note=f"Lệnh xuất kho chờ duyệt cho đơn hàng {order.order_number}",
                created_by=order.approved_by,
            )
        logger.info("Auto-created pending InventoryTransaction(s) for order %s with code %s", order.order_number, txn_code)
    except Exception as exc:
        logger.error("Failed to create/update pending InventoryTransaction for order %s: %s", order.order_number, exc)




def _handle_order_rejected(order):
    """Gửi thông báo khi đơn bị từ chối."""
    try:
        from notifications.utils import notify_order_rejected
        notify_order_rejected(order)
    except Exception as exc:
        logger.error("Failed to send rejected notification for order %s: %s", order.order_number, exc)


def _handle_order_cancelled(order):
    """
    Xử lý khi đơn hàng bị HỦY (Cancelled):
    1. Hủy Lệnh sản xuất (nếu chưa hoàn thành)
    2. Hủy Lệnh xuất kho (nếu chưa hoàn thành)
    """
    try:
        from production.models import ProductionOrder
        from inventory.models import InventoryTransaction

        # 1. Hủy lệnh sản xuất chưa hoàn thành
        ProductionOrder.objects.filter(
            order=order
        ).exclude(
            status=ProductionOrder.STATUS_COMPLETED
        ).update(status=ProductionOrder.STATUS_CANCELLED)
        
        # 2. Hủy các lệnh xuất kho chờ duyệt
        InventoryTransaction.objects.filter(
            reference_order=order,
            status=InventoryTransaction.STATUS_PENDING,
            type=InventoryTransaction.TYPE_EXPORT
        ).update(status=InventoryTransaction.STATUS_REJECTED)
        
        logger.info("Successfully cancelled related MO and Export transactions for cancelled order %s", order.order_number)
    except Exception as exc:
        logger.error("Failed to cancel related transactions for order %s: %s", order.order_number, exc)


def _handle_order_pending(order):
    """
    Xu ly khi don hang chuyen ve lai trang thai Cho duyet (VD: do nguoi dung chinh sua don hang):
    1. Huy Lenh san xuat (neu chua hoan thanh)
    2. Huy Lenh xuat kho (neu chua hoan thanh)
    """
    try:
        from production.models import ProductionOrder
        from inventory.models import InventoryTransaction

        # 1. Huy lenh san xuat chua hoan thanh
        ProductionOrder.objects.filter(
            order=order
        ).exclude(
            status=ProductionOrder.STATUS_COMPLETED
        ).update(status=ProductionOrder.STATUS_CANCELLED)
        
        # 2. Huy cac lenh xuat kho cho duyet
        InventoryTransaction.objects.filter(
            reference_order=order,
            status=InventoryTransaction.STATUS_PENDING,
            type=InventoryTransaction.TYPE_EXPORT
        ).update(status=InventoryTransaction.STATUS_REJECTED)
        
        import logging
        logger = logging.getLogger(__name__)
        logger.info("Successfully cancelled related MO and Export transactions for pending order %s", order.order_number)
    except Exception as exc:
        import logging
        logger = logging.getLogger(__name__)
        logger.error("Failed to cancel related transactions for order %s: %s", order.order_number, exc)
