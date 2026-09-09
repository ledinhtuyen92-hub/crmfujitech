from sales.models import Quotation
q = Quotation.objects.order_by('-id').first()
print(f'Quotation: {q.code}')
for i in q.items.all():
    print(f'Item {i.id}: product_id={i.product_id}, product_name={i.product_name}, custom_size={i.custom_data.get("custom_size_text", "")}, is_custom_size={i.custom_data.get("is_custom_size", "")}')
