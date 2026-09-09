from orders.models import OrderItem
from inventory.models import Product
from django.db.models import Q

valid_product_ids = list(Product.objects.filter(category__is_sales_target=True).values_list('id', flat=True))
is_accessory_cond = Q(custom_data__is_custom_size=True)
is_main_cond = Q(custom_data__is_custom_size=False) | ~Q(custom_data__has_key='is_custom_size')
accessory_sales_cond = is_accessory_cond & Q(custom_data__actual_product_id__in=valid_product_ids)
main_sales_cond = is_main_cond & (Q(product__category__is_sales_target=True) | Q(product__isnull=True))
sales_target_cond = accessory_sales_cond | main_sales_cond

qs = OrderItem.objects.filter(sales_target_cond)
items = OrderItem.objects.order_by('-id')[:10]
for i in items:
    is_counted = qs.filter(id=i.id).exists()
    print(f'ID: {i.id}, Counted: {is_counted}, is_custom: {i.custom_data.get("is_custom_size")}, prod: {i.product_id}')
