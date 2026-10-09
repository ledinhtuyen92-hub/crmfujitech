from rest_framework.views import APIView
from rest_framework.response import Response
from rest_framework.parsers import MultiPartParser, FormParser
from django.core.files.storage import default_storage
import os
import uuid

class UploadAPIView(APIView):
    parser_classes = (MultiPartParser, FormParser)

    def post(self, request, *args, **kwargs):
        file_obj = request.FILES.get('file')
        if not file_obj:
            return Response({'error': 'No file provided'}, status=400)
            
        import os
        base_name = os.path.splitext(file_obj.name)[0]
        ext = os.path.splitext(file_obj.name)[1]
        
        # Replace spaces with hyphens to avoid URL encoding issues (%20)
        # Keep original unicode characters so Vietnamese names are not mangled
        safe_name = base_name.replace(" ", "-")
        if not safe_name:
            safe_name = "file"
            
        filename = f"{safe_name}{ext}"
        
        # default_storage.save automatically handles filename collisions by appending a random string
        path = default_storage.save(f"uploads/{filename}", file_obj)
        url = default_storage.url(path)
        absolute_url = request.build_absolute_uri(url)
        
        # Return the original file name so the frontend and AI can use the exact original name
        return Response({'url': absolute_url, 'name': file_obj.name})
