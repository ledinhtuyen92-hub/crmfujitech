from django.contrib import admin
from .models import OrderPaymentMilestone, PaymentReceipt


@admin.register(OrderPaymentMilestone)
class OrderPaymentMilestoneAdmin(admin.ModelAdmin):
    list_display = ["title", "order", "percentage", "amount", "paid_amount", "status"]
    list_filter = ["status", "milestone_type", "company"]


@admin.register(PaymentReceipt)
class PaymentReceiptAdmin(admin.ModelAdmin):
    list_display = ["receipt_code", "order", "milestone", "amount", "is_over_payment", "over_payment_amount", "payment_method", "payment_date"]
    list_filter = ["payment_method", "is_over_payment", "company"]
