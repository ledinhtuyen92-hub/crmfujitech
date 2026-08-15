from rest_framework import serializers

from .models import Quotation, QuotationItem, QuotationTemplate, SavedTemplateBlock


def get_company_info_dict(serializer_instance, obj):
    request = serializer_instance.context.get("request")
    company = None
    if hasattr(obj, "company") and obj.company:
        company = obj.company
    elif request and hasattr(request, "user") and hasattr(request.user, "company"):
        company = request.user.company

    if not company:
        return None

    logo_url = None
    if company.logo:
        try:
            logo_url = request.build_absolute_uri(company.logo.url) if request else company.logo.url
        except Exception:
            logo_url = company.logo.url

    stamp_url = None
    if getattr(company, "stamp_image", None):
        try:
            stamp_url = request.build_absolute_uri(company.stamp_image.url) if request else company.stamp_image.url
        except Exception:
            stamp_url = company.stamp_image.url

    signature_url = None
    if getattr(company, "director_signature", None):
        try:
            signature_url = request.build_absolute_uri(company.director_signature.url) if request else company.director_signature.url
        except Exception:
            signature_url = company.director_signature.url

    custom_quotation_title = ""
    custom_order_title = ""
    if hasattr(company, "settings") and company.settings:
        custom_quotation_title = company.settings.custom_quotation_title or ""
        custom_order_title = company.settings.custom_order_title or ""

    return {
        "name": company.name,
        "tax_code": company.tax_code,
        "phone": company.phone,
        "address": company.address,
        "logo": logo_url,
        "stamp": stamp_url,
        "stamp_image": stamp_url,
        "signature": signature_url,
        "director_signature": signature_url,
        "director_name": getattr(company, "director_name", "") or "",
        "director_title": getattr(company, "director_title", "") or "Giám đốc",
        "custom_quotation_title": custom_quotation_title,
        "custom_order_title": custom_order_title,
    }


class QuotationTemplateSerializer(serializers.ModelSerializer):
    company_info = serializers.SerializerMethodField()
    company_default_terms = serializers.SerializerMethodField()

    class Meta:
        model = QuotationTemplate
        fields = [
            "id",
            "name",
            "code",
            "description",
            "header_content",
            "footer_content",
            "layout_style",
            "layout_config",
            "is_default",
            "is_active",
            "created_at",
            "updated_at",
            "company_info",
            "company_default_terms",
        ]
        read_only_fields = ["id", "created_at", "updated_at", "company_info", "company_default_terms"]

    def get_company_info(self, obj):
        return get_company_info_dict(self, obj)

    def get_company_default_terms(self, obj):
        request = self.context.get("request")
        if request and hasattr(request, "user") and hasattr(request.user, "company"):
            company = request.user.company
            if company and hasattr(company, "settings") and company.settings:
                return company.settings.default_quotation_terms
        return ""


class QuotationItemSerializer(serializers.ModelSerializer):
    class Meta:
        model = QuotationItem
        fields = [
            "id",
            "quotation",
            "product",
            "item_type",
            "product_name",
            "unit_price",
            "width",
            "height",
            "length",
            "thickness",
            "area",
            "spec",
            "warranty",
            "product_image",
            "custom_data",
            "quantity",
            "discount_percent",
            "line_total",
            "note",
        ]
        read_only_fields = ["id", "line_total"]

    def to_representation(self, instance):
        data = super().to_representation(instance)
        for field in ['width', 'height', 'length', 'area', 'thickness']:
            if field in data and data[field] is not None:
                try:
                    f_val = float(data[field])
                    if f_val.is_integer():
                        data[field] = str(int(f_val))
                except (ValueError, TypeError):
                    pass
        return data


class QuotationSerializer(serializers.ModelSerializer):
    items = QuotationItemSerializer(many=True, read_only=True)
    status_display = serializers.CharField(source="get_status_display", read_only=True)
    customer_name = serializers.CharField(source="customer.name", read_only=True)
    customer_phone = serializers.CharField(source="customer.phone", read_only=True)
    customer_address = serializers.CharField(source="customer.address", read_only=True)
    customer_email = serializers.CharField(source="customer.email", read_only=True)
    customer_city = serializers.CharField(source="customer.city", read_only=True)
    created_by_name = serializers.CharField(source="created_by.full_name", read_only=True)
    company_info = serializers.SerializerMethodField()
    order_status = serializers.SerializerMethodField()

    class Meta:
        model = Quotation
        fields = [
            "id",
            "company",
            "quotation_number",
            "template",
            "customer",
            "customer_name",
            "customer_phone",
            "customer_address",
            "customer_email",
            "customer_city",
            "created_by",
            "created_by_name",
            "status",
            "status_display",
            "installation_date",
            "notes",
            "shipping_fee",
            "installation_fee",
            "delivery_time",
            "warranty_months",
            "payment_terms",
            "payment_terms_schedule",
            "validity_days",
            "custom_data",
            "subtotal",
            "vat_rate",
            "vat_amount",
            "discount_total",
            "total_amount",
            "items",
            "created_at",
            "updated_at",
            "company_info",
            "public_token",
            "public_link_expires_at",
            "signature_image",
            "signed_at",
            "customer_name_signed",
            "order_status",
        ]
        read_only_fields = [
            "id", "company", "quotation_number", "items", "status_display",
            "customer_name", "customer_phone", "customer_address", "customer_email", "customer_city",
            "created_by_name", "created_at", "updated_at", "company_info",
            "public_token", "public_link_expires_at", "signature_image", "signed_at", "customer_name_signed", "order_status",
        ]

    def get_company_info(self, obj):
        return get_company_info_dict(self, obj)

    def get_order_status(self, obj):
        from orders.models import Order
        latest_order = Order.objects.filter(quotation=obj).order_by("-id").first()
        if latest_order:
            return latest_order.status
        return None


class SavedTemplateBlockSerializer(serializers.ModelSerializer):
    class Meta:
        model = SavedTemplateBlock
        fields = [
            "id",
            "company",
            "name",
            "block_type",
            "props",
            "created_at",
            "updated_at",
        ]
        read_only_fields = ["id", "company", "created_at", "updated_at"]
