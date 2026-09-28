from rest_framework.views import APIView
from rest_framework.response import Response
from rest_framework.permissions import IsAuthenticated
from rest_framework import status
from django.shortcuts import get_object_or_404
from .models import PlatformAccount, LivePlatformProduct
from .platforms.shopee import ShopeeAdapter
from inventory.models import Product

class ShopeeProductListView(APIView):
    """
    List products from Shopee API.
    """
    permission_classes = [IsAuthenticated]
    
    def get(self, request):
        company_id = request.user.company_id
        
        try:
            adapter = ShopeeAdapter(company_id=company_id)
            products = adapter.get_products()
            return Response(products)
        except Exception as e:
            return Response({"error": str(e)}, status=status.HTTP_400_BAD_REQUEST)


class ShopeeProductMappingView(APIView):
    """
    Create a mapping between a Fujitech Product and a Shopee Product.
    """
    permission_classes = [IsAuthenticated]
    
    def post(self, request):
        company_id = request.user.company_id
        fujitech_product_id = request.data.get("fujitech_product_id")
        shopee_item_id = request.data.get("shopee_item_id")
        
        if not fujitech_product_id or not shopee_item_id:
            return Response({"error": "Missing required fields"}, status=status.HTTP_400_BAD_REQUEST)
            
        # Validate Fujitech product exists and belongs to company
        fuji_product = get_object_or_404(Product, id=fujitech_product_id, company_id=company_id)
        
        # We should ideally validate if the Shopee product exists via API here,
        # but since this is an MVP, we will trust the provided shopee_item_id 
        # (which should come from the ShopeeProductListView)
        
        mapping, created = LivePlatformProduct.objects.update_or_create(
            company_id=company_id,
            platform=LivePlatformProduct.PLATFORM_SHOPEE,
            platform_product_id=str(shopee_item_id),
            defaults={
                "product": fuji_product,
                "is_active": True
            }
        )
        
        return Response({
            "message": "Mapped successfully",
            "mapping_id": mapping.id,
            "created": created
        })
