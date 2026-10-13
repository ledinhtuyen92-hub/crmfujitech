/**
 * Chuyển đổi URL ảnh media thành URL an toàn, độc lập với tên miền.
 * - Nếu URL chứa '/media/', hàm sẽ trích xuất đường dẫn tương đối '/media/...'.
 * - Trong môi trường VPS/production, đường dẫn '/media/...' sẽ tự động tải theo tên miền hiện tại của trình duyệt.
 * - Trong môi trường local dev (nếu frontend port khác backend port), hàm sẽ tự động prefix origin của VITE_API_URL.
 * - Nếu là ảnh blob, data base64 hoặc URL bên thứ 3 (không chứa /media/), giữ nguyên.
 */
export function getSafeMediaUrl(url) {
  if (!url || typeof url !== 'string') return '';
  if (url.startsWith('blob:') || url.startsWith('data:')) return url;

  const mediaIdx = url.indexOf('/media/');
  if (mediaIdx !== -1) {
    const relMedia = url.substring(mediaIdx);
    try {
      const apiBase = import.meta.env?.VITE_API_URL;
      if (apiBase && typeof window !== 'undefined' && window.location) {
        const origin = new URL(apiBase, window.location.origin).origin;
        if (origin !== window.location.origin) {
          return `${origin}${relMedia}`;
        }
      }
    } catch (e) {
      // Fallback relative path
    }
    return relMedia;
  }

  return url;
}
