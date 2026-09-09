from orders.models import OrderItem
from sales.models import QuotationItem

def fix_items(model):
    items = model.objects.filter(custom_data__is_custom_size=True).select_related('product', 'order' if model == OrderItem else 'quotation')
    fixed_count = 0
    for item in items:
        # Check if product was overwritten by actual_product_id
        actual_id = item.custom_data.get('actual_product_id')
        if actual_id and item.product_id == int(actual_id):
            # This item was overwritten!
            # We need to find its parent to restore the correct product_id
            # The parent has the same product_name, and is NOT an accessory (or is the first one)
            parent = model.objects.filter(
                **{'order_id' if model == OrderItem else 'quotation_id': getattr(item, 'order_id' if model == OrderItem else 'quotation_id')},
                product_name=item.product_name
            ).exclude(id=item.id).first()
            
            if parent:
                if item.product_id != parent.product_id:
                    item.product_id = parent.product_id
                    item.save(update_fields=['product_id'])
                    fixed_count += 1
            else:
                # If no parent found, maybe it was a custom product with no parent? (rare)
                # But if product_name doesn't match product.name, it's definitely a custom parent.
                if item.product and item.product.name != item.product_name:
                    item.product_id = None
                    item.save(update_fields=['product_id'])
                    fixed_count += 1
    print(f"Fixed {fixed_count} records in {model.__name__}")

fix_items(OrderItem)
fix_items(QuotationItem)
