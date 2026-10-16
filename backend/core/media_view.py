import os
import mimetypes
import re
from django.http import HttpResponse, StreamingHttpResponse, Http404
from django.conf import settings
from django.utils.http import http_date, parse_http_date_safe

RANGE_RE = re.compile(r'bytes\s*=\s*(\d+)?\s*-\s*(\d+)?', re.I)

def ranged_file_iterator(file_path, offset=0, length=None, chunk_size=65536):
    """
    Yields chunks of the file starting at `offset` for `length` bytes.
    Keeps memory footprint minimal (64KB per chunk).
    """
    with open(file_path, 'rb') as f:
        f.seek(offset)
        remaining = length
        while True:
            bytes_to_read = chunk_size if remaining is None else min(chunk_size, remaining)
            if bytes_to_read <= 0:
                break
            data = f.read(bytes_to_read)
            if not data:
                break
            if remaining is not None:
                remaining -= len(data)
            yield data

def serve_media_with_ranges(request, path, document_root=None):
    """
    Robust media server view with full HTTP Range (RFC 7233) support.
    Essential for fast HTML5 video scrubbing and instantaneous playback.
    """
    if not document_root:
        document_root = settings.MEDIA_ROOT

    from django.utils._os import safe_join
    try:
        fullpath = safe_join(document_root, path)
    except Exception:
        raise Http404("File not found")

    if not os.path.exists(fullpath) or os.path.isdir(fullpath):
        raise Http404("File not found")

    stat_obj = os.stat(fullpath)
    file_size = stat_obj.st_size
    mtime = int(stat_obj.st_mtime)
    last_modified = http_date(mtime)

    # Check If-Modified-Since
    ims = request.META.get('HTTP_IF_MODIFIED_SINCE')
    if ims:
        ims_timestamp = parse_http_date_safe(ims)
        if ims_timestamp is not None and ims_timestamp >= mtime:
            return HttpResponse(status=304)

    content_type, _ = mimetypes.guess_type(fullpath)
    content_type = content_type or 'application/octet-stream'

    range_header = request.META.get('HTTP_RANGE', '').strip()
    if range_header:
        match = RANGE_RE.match(range_header)
        if match:
            start_str, end_str = match.groups()
            if start_str is not None:
                start = int(start_str)
                end = int(end_str) if end_str is not None else file_size - 1
            elif end_str is not None:
                length = int(end_str)
                start = max(0, file_size - length)
                end = file_size - 1
            else:
                start = 0
                end = file_size - 1

            if start < 0 or start >= file_size or end < start:
                resp = HttpResponse(status=416)
                resp['Content-Range'] = f'bytes */{file_size}'
                return resp

            end = min(end, file_size - 1)
            content_length = (end - start) + 1

            response = StreamingHttpResponse(
                ranged_file_iterator(fullpath, offset=start, length=content_length),
                status=206,
                content_type=content_type
            )
            response['Content-Range'] = f'bytes {start}-{end}/{file_size}'
            response['Content-Length'] = str(content_length)
            response['Accept-Ranges'] = 'bytes'
            response['Last-Modified'] = last_modified
            response['Cache-Control'] = 'public, max-age=86400'
            return response

    # Full content response
    response = StreamingHttpResponse(
        ranged_file_iterator(fullpath, offset=0, length=file_size),
        status=200,
        content_type=content_type
    )
    response['Content-Length'] = str(file_size)
    response['Accept-Ranges'] = 'bytes'
    response['Last-Modified'] = last_modified
    response['Cache-Control'] = 'public, max-age=86400'
    return response
