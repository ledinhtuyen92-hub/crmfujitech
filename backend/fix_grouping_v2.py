from orders.models import OrderItem, Order
from sales.models import QuotationItem, Quotation

def fix_items_v2(model, parent_model):
    fixed_count = 0
    # Process order by order
    for parent_obj in parent_model.objects.all():
        items = list(model.objects.filter(**{'order_id' if model == OrderItem else 'quotation_id': parent_obj.id}).order_by('id'))
        
        current_parent_product = None
        current_parent_name = None
        
        for item in items:
            is_accessory = item.custom_data.get('is_custom_size') is True
            actual_id = item.custom_data.get('actual_product_id')
            
            if not is_accessory:
                # This is a main product, update our current parent tracking
                current_parent_product = item.product_id
                current_parent_name = item.product_name or (item.product.name if item.product else "")
            else:
                # This is an accessory. It should inherit the parent's product_id
                # Wait, what if it's a standalone accessory? 
                # A standalone accessory has product_name == product.name and NO parent?
                # Actually, in the UI, if you add a standalone accessory, it acts as its own parent.
                # But if it was added UNDER a parent, it shares the parent's product_name (or effective name).
                
                eff_name = item.product_name or ""
                
                # If this accessory has an actual_product_id, and its product_id was overwritten to it:
                if actual_id and item.product_id == int(actual_id):
                    # Check if it should belong to the current_parent
                    # It belongs to the current parent if its product_name matches the parent's effective name
                    # OR if its product_name is empty (which shouldn't happen for accessories, but just in case)
                    if current_parent_name and eff_name == current_parent_name:
                        if item.product_id != current_parent_product:
                            item.product_id = current_parent_product
                            item.save(update_fields=['product_id'])
                            fixed_count += 1
                    else:
                        # What if eff_name doesn't match? Maybe it's standalone, or the parent was different.
                        # If the effective name is different from the actual product's name, it's definitely corrupted.
                        if item.product and item.product.name != eff_name:
                            # It's a custom product accessory!
                            item.product_id = None
                            item.save(update_fields=['product_id'])
                            fixed_count += 1
                            
    print(f"Fixed {fixed_count} records in {model.__name__}")

fix_items_v2(OrderItem, Order)
fix_items_v2(QuotationItem, Quotation)
