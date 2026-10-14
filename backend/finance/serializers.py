from rest_framework import serializers
from .models import OrderPaymentMilestone, PaymentReceipt


class PaymentReceiptSerializer(serializers.ModelSerializer):
    created_by_name = serializers.CharField(source="created_by.full_name", read_only=True)
    payment_method_display = serializers.CharField(source="get_payment_method_display", read_only=True)

    class Meta:
        model = PaymentReceipt
        fields = [
            "id",
            "company",
            "receipt_code",
            "order",
            "milestone",
            "amount",
            "payment_method",
            "payment_method_display",
            "payment_date",
            "reference_code",
            "note",
            "is_over_payment",
            "over_payment_amount",
            "over_payment_reason",
            "created_by",
            "created_by_name",
            "attachments",
            "created_at",
        ]
        read_only_fields = [
            "id",
            "company",
            "receipt_code",
            "is_over_payment",
            "over_payment_amount",
            "created_by",
            "created_by_name",
            "created_at",
        ]

    def validate(self, attrs):
        order = attrs.get('order') or (self.instance.order if self.instance else None)
        amount = attrs.get('amount') if 'amount' in attrs else (self.instance.amount if self.instance else None)
        over_payment_reason = attrs.get('over_payment_reason') if 'over_payment_reason' in attrs else (self.instance.over_payment_reason if self.instance else '')
        if over_payment_reason is None:
            over_payment_reason = ''

        if not self.instance and order and amount:
            remaining = float(order.remaining_debt)
            amt = float(amount)
            if amt > remaining:
                diff = amt - remaining
                attrs['is_over_payment'] = True
                attrs['over_payment_amount'] = diff
                if not str(over_payment_reason).strip():
                    raise serializers.ValidationError({
                        "over_payment_reason": f"Số tiền thu ({amt:,.0f} đ) vượt quá số tiền còn nợ của đơn hàng ({remaining:,.0f} đ) là {diff:,.0f} đ. Vui lòng nhập lý do / ghi chú thu vượt mức."
                    })
            else:
                attrs['is_over_payment'] = False
                attrs['over_payment_amount'] = 0
        elif self.instance and order and (attrs.get('amount') is not None or attrs.get('over_payment_reason') is not None):
            amt = float(attrs.get('amount', self.instance.amount))
            remaining_without_this = float(order.remaining_debt) + float(self.instance.amount)
            if amt > remaining_without_this:
                diff = amt - remaining_without_this
                attrs['is_over_payment'] = True
                attrs['over_payment_amount'] = diff
            else:
                attrs['is_over_payment'] = False
                attrs['over_payment_amount'] = 0
        return attrs


class OrderPaymentMilestoneSerializer(serializers.ModelSerializer):
    status_display = serializers.CharField(source="get_status_display", read_only=True)
    milestone_type_display = serializers.CharField(source="get_milestone_type_display", read_only=True)
    receipts = PaymentReceiptSerializer(many=True, read_only=True)

    class Meta:
        model = OrderPaymentMilestone
        fields = [
            "id",
            "company",
            "order",
            "milestone_type",
            "milestone_type_display",
            "title",
            "percentage",
            "amount",
            "paid_amount",
            "status",
            "status_display",
            "due_date",
            "note",
            "receipts",
            "created_at",
        ]
        read_only_fields = ["id", "company", "order", "paid_amount", "status", "status_display", "created_at"]
