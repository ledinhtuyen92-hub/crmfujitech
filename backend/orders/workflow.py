import logging
from django.utils.module_loading import import_string

logger = logging.getLogger(__name__)

class OrderWorkflowEngine:
    """
    Dynamic Workflow Engine for Orders.
    Decides the next step in the pipeline based on the company's active modules.
    
    Pipeline order: inventory -> production -> delivery
    """
    
    PIPELINE = ["inventory", "production", "delivery", "warranty"]

    @classmethod
    def get_active_modules(cls, order):
        """
        Đọc FRESH từ DB để tránh ORM cache stale (có thể bị cache từ trước khi admin thay đổi module).
        """
        try:
            from users.models import CompanySettings
            settings_obj = CompanySettings.objects.get(company_id=order.company_id)
            modules = settings_obj.active_modules
            if isinstance(modules, str):
                import ast
                try:
                    modules = ast.literal_eval(modules)
                except Exception:
                    modules = [m.strip() for m in modules.split(',') if m.strip()]
            if isinstance(modules, list):
                logger.info(f"WorkflowEngine: Fresh active_modules for company {order.company_id}: {modules}")
                return modules
        except Exception as e:
            logger.error(f"WorkflowEngine: Failed to get active_modules for company {order.company_id}: {e}")
        return []

    @classmethod
    def get_next_step(cls, active_modules, current_step=None):
        """
        Given the active_modules and the current step (e.g. 'inventory'),
        returns the name of the next module to trigger, or None if pipeline is finished.
        """
        # Filter pipeline to only active modules
        active_pipeline = [m for m in cls.PIPELINE if m in active_modules]
        
        if current_step is None:
            # Starting point (from payment/approval)
            return active_pipeline[0] if active_pipeline else None
            
        try:
            current_idx = active_pipeline.index(current_step)
            if current_idx + 1 < len(active_pipeline):
                return active_pipeline[current_idx + 1]
        except ValueError:
            # If current_step is not in active pipeline, maybe it was disabled? 
            pass
            
        return None

    @classmethod
    def trigger_next_step(cls, order, current_step=None, **kwargs):
        """
        Calculates and triggers the next step in the order lifecycle.
        current_step: None (start), "inventory", "production", "delivery"
        """
        active_modules = cls.get_active_modules(order)
        
        logger.info(f"WorkflowEngine [Order {order.order_number}]: Current step '{current_step}'. Active modules: {active_modules}")
        
        if current_step is None:
            # Bắt đầu duyệt đơn: Chạy SONG SONG cả Xuất kho và Sản xuất
            if "inventory" in active_modules:
                cls._trigger_inventory(order, **kwargs)
            if "production" in active_modules:
                cls._trigger_production(order, **kwargs)
            
            # Kiểm tra xem có đủ điều kiện đi tiếp ngay không (VD: cả 2 luồng đều trống/không cần)
            cls._check_and_trigger_delivery(order, active_modules, **kwargs)
            
        elif current_step in ["inventory", "production"]:
            # Một trong hai nhánh hoàn thành -> Kiểm tra xem nhánh kia xong chưa
            cls._check_and_trigger_delivery(order, active_modules, **kwargs)
            
        elif current_step == "delivery":
            cls._trigger_completion(order, **kwargs)

    @classmethod
    def _check_and_trigger_delivery(cls, order, active_modules, **kwargs):
        if "delivery" not in active_modules:
            cls._trigger_completion(order, **kwargs)
            return

        inventory_done = True
        if "inventory" in active_modules and getattr(order, 'requires_inventory_export', True):
            try:
                from inventory.models import InventoryTransaction
                pending_exports = InventoryTransaction.objects.filter(
                    reference_order=order, 
                    type=InventoryTransaction.TYPE_EXPORT
                ).exclude(status__in=[InventoryTransaction.STATUS_COMPLETED, InventoryTransaction.STATUS_REJECTED]).exists()
                if pending_exports:
                    inventory_done = False
            except Exception:
                pass

        production_done = True
        if "production" in active_modules:
            try:
                from production.models import ProductionOrder
                pending_pos = ProductionOrder.objects.filter(
                    order=order
                ).exclude(status__in=[ProductionOrder.STATUS_COMPLETED, ProductionOrder.STATUS_CANCELLED]).exists()
                if pending_pos:
                    production_done = False
            except Exception:
                pass

        if inventory_done and production_done:
            from delivery.models import DeliveryOrder
            if not DeliveryOrder.objects.filter(order=order).exists():
                cls._trigger_delivery(order, **kwargs)

    @classmethod
    def _trigger_inventory(cls, order, **kwargs):
        if not getattr(order, 'requires_inventory_export', True):
            logger.info(f"WorkflowEngine: Order {order.order_number} does not require inventory. Skipping to next step.")
            cls.trigger_next_step(order, current_step="inventory", **kwargs)
            return

        logger.info(f"WorkflowEngine: Triggering INVENTORY for Order {order.order_number}")
        try:
            from orders.signals import _create_pending_inventory_export
            _create_pending_inventory_export(order)
        except Exception as e:
            logger.error(f"Error triggering inventory for order {order.id}: {e}")

    @classmethod
    def _trigger_production(cls, order, **kwargs):
        logger.info(f"WorkflowEngine: Triggering PRODUCTION for Order {order.order_number}")
        try:
            from orders.signals import _create_production_order
            factory_id = kwargs.get("factory_id")
            _create_production_order(order, factory_id=factory_id)
        except Exception as e:
            logger.error(f"Error triggering production for order {order.id}: {e}")

    @classmethod
    def _trigger_delivery(cls, order, **kwargs):
        logger.info(f"WorkflowEngine: Triggering DELIVERY for Order {order.order_number}")
        try:
            from delivery.models import DeliveryOrder
            from core.numbering import derive_code_from_order
            delivery, created = DeliveryOrder.objects.get_or_create(
                company=order.company,
                order=order,
                defaults={
                    "status": DeliveryOrder.STATUS_PENDING,
                    "shipping_address": getattr(order.customer, "address", "") if order and order.customer else "",
                }
            )
            if created:
                delivery.delivery_code = derive_code_from_order(order.order_number, order.company, "gh")
                delivery.save(update_fields=["delivery_code"])
                logger.info(f"WorkflowEngine: Auto-created DeliveryOrder {delivery.delivery_code} for Order {order.order_number}")
        except Exception as e:
            logger.error(f"Error triggering delivery for order {order.id}: {e}")

    @classmethod
    def _trigger_completion(cls, order, **kwargs):
        logger.info(f"WorkflowEngine: Pipeline completed for Order {order.order_number}. Triggering warranty and marking as complete.")
        try:
            # Create warranty cards first
            try:
                from delivery.signals import create_warranty_cards_for_order
                create_warranty_cards_for_order(order)
            except ImportError:
                pass
                
            # Then mark order as completed if it's not already
            if order.status != order.STATUS_COMPLETED:
                order.status = order.STATUS_COMPLETED
                order.save(update_fields=["status"])
                logger.info(f"WorkflowEngine: Order {order.order_number} marked as COMPLETED.")
        except Exception as e:
            logger.error(f"Error triggering completion for order {order.id}: {e}")
