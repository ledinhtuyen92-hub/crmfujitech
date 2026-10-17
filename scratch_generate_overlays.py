import os
import sys
import numpy as np
from PIL import Image, ImageDraw, ImageFont, ImageFilter

if sys.stdout.encoding != 'utf-8':
    sys.stdout.reconfigure(encoding='utf-8')

OUTPUT_DIR = r"d:\LẬP TRÌNH\fujitech\backend\media\live_assets\2026\10"
os.makedirs(OUTPUT_DIR, exist_ok=True)

IMAGE_1_PATH = r"C:\Users\Admin\.gemini\antigravity-ide\brain\bdb173de-ad4e-464a-b607-b39bf4bfdb1b\empty_live_desk_1792210198315.jpg"
IMAGE_2_PATH = r"C:\Users\Admin\.gemini\antigravity-ide\brain\bdb173de-ad4e-464a-b607-b39bf4bfdb1b\empty_tech_desk_1792210221794.jpg"

def remove_greenscreen(img: Image.Image, desk_min_y_ratio=0.45) -> Image.Image:
    """
    Chroma-keys green background with soft alpha feathering.
    Ensures anything above the desk is 100% transparent.
    """
    img = img.convert("RGBA")
    arr = np.array(img, dtype=np.float32)
    
    r, g, b, a = arr[:, :, 0], arr[:, :, 1], arr[:, :, 2], arr[:, :, 3]
    h, w = r.shape
    
    # Green screen detection metric
    # Green dominates both red and blue significantly
    greenness = g - np.maximum(r, b)
    
    # Above desk_min_y_ratio, if greenness > 20, make it transparent
    min_y = int(h * desk_min_y_ratio)
    
    # Calculate alpha mask: 0 (transparent) where green is high, 255 (opaque) where not green
    # Soft transition between greenness 25 and 65
    alpha = np.ones((h, w), dtype=np.float32) * 255.0
    
    # Green pixels: smoothly decrease alpha
    green_mask = (greenness > 25) & (g > 80)
    alpha[green_mask] = np.clip(255.0 - (greenness[green_mask] - 25) * 6.5, 0.0, 255.0)
    
    # In top half, force completely transparent if it's the green backdrop
    top_area = np.zeros((h, w), dtype=bool)
    top_area[:min_y, :] = True
    alpha[top_area & (greenness > 15)] = 0.0
    
    # Spill suppression: remove green tint on edges
    spill = greenness > 10
    g[spill] = np.maximum(r[spill], b[spill]) * 1.02
    
    arr[:, :, 0] = np.clip(r, 0, 255)
    arr[:, :, 1] = np.clip(g, 0, 255)
    arr[:, :, 2] = np.clip(b, 0, 255)
    arr[:, :, 3] = np.clip(alpha, 0, 255)
    
    return Image.fromarray(arr.astype(np.uint8), mode="RGBA")

def get_font(size: int, bold=False):
    # Try standard Windows fonts
    font_paths = [
        r"C:\Windows\Fonts\arialbd.ttf" if bold else r"C:\Windows\Fonts\arial.ttf",
        r"C:\Windows\Fonts\segoeuib.ttf" if bold else r"C:\Windows\Fonts\segoeui.ttf",
        r"C:\Windows\Fonts\tahomabd.ttf" if bold else r"C:\Windows\Fonts\tahoma.ttf",
    ]
    for p in font_paths:
        if os.path.exists(p):
            try:
                return ImageFont.truetype(p, size)
            except Exception:
                pass
    return ImageFont.load_default()

def draw_top_badges(overlay: Image.Image, brand_title="FUJITECH OFFICIAL", sub_badge="CHÍNH HÃNG 100%"):
    draw = ImageDraw.Draw(overlay)
    W, H = overlay.size
    
    font_live = get_font(18, bold=True)
    font_brand = get_font(20, bold=True)
    font_sub = get_font(14, bold=True)
    
    # 1. LIVE Pill Badge (Top Left: x=30, y=36)
    # Background glass pill
    pill_rect = [28, 36, 175, 76]
    draw.rounded_rectangle(pill_rect, radius=20, fill=(20, 20, 20, 210), outline=(255, 255, 255, 60), width=1)
    # Red LIVE dot
    draw.ellipse([42, 49, 58, 65], fill=(235, 40, 40, 255))
    draw.text((66, 44), "LIVE", fill=(255, 255, 255, 255), font=font_live)
    draw.text((115, 47), "• 3.5k", fill=(200, 200, 200, 230), font=get_font(14, bold=True))
    
    # 2. Brand Name Center Banner (Top Center: y=34)
    brand_w = 310
    brand_x = (W - brand_w) // 2
    brand_rect = [brand_x, 34, brand_x + brand_w, 78]
    draw.rounded_rectangle(brand_rect, radius=12, fill=(15, 22, 38, 220), outline=(0, 210, 255, 120), width=1)
    
    # Brand text centered
    bbox = draw.textbbox((0, 0), brand_title, font=font_brand)
    tw = bbox[2] - bbox[0]
    draw.text((brand_x + (brand_w - tw) // 2, 44), brand_title, fill=(255, 255, 255, 255), font=font_brand)
    
    # 3. Quality Guarantee Badge (Top Right: x=510, y=36)
    badge_rect = [W - 195, 36, W - 28, 76]
    draw.rounded_rectangle(badge_rect, radius=20, fill=(250, 140, 22, 230), outline=(255, 220, 150, 180), width=1)
    draw.text((W - 180, 46), f"★ {sub_badge}", fill=(255, 255, 255, 255), font=font_sub)

def draw_bottom_table_banners(overlay: Image.Image, promo_title="DEAL ĐỘC QUYỀN HÔM NAY", discount_text="GIẢM 20% + FREESHIP"):
    draw = ImageDraw.Draw(overlay)
    W, H = overlay.size
    
    # Modern voucher ribbon right on the front edge of the desk (around y=1160 to 1240)
    ribbon_y = 1170
    ribbon_rect = [30, ribbon_y, W - 30, ribbon_y + 70]
    
    # Gradient/glow background
    draw.rounded_rectangle(ribbon_rect, radius=16, fill=(10, 14, 25, 240), outline=(238, 77, 45, 180), width=2)
    
    # Left tag: "MUA NGAY"
    tag_rect = [42, ribbon_y + 12, 170, ribbon_y + 58]
    draw.rounded_rectangle(tag_rect, radius=10, fill=(238, 77, 45, 255))
    draw.text((54, ribbon_y + 22), "🛒 MUA NGAY", fill=(255, 255, 255), font=get_font(15, bold=True))
    
    # Right promo text
    draw.text((185, ribbon_y + 15), promo_title, fill=(255, 220, 50), font=get_font(16, bold=True))
    draw.text((185, ribbon_y + 39), discount_text, fill=(220, 220, 220), font=get_font(13, bold=False))

def create_overlay_1():
    print("Generating Overlay 1: Fujitech Smart Lock & Hardware Showcase...")
    base_img = Image.open(IMAGE_1_PATH)
    keyed = remove_greenscreen(base_img, desk_min_y_ratio=0.50)
    
    # Resize to exact standard 720x1280
    keyed = keyed.resize((720, 1280), Image.Resampling.LANCZOS)
    
    # Add top badges and banners
    draw_top_badges(keyed, brand_title="FUJITECH SMART LOCK", sub_badge="BẢO HÀNH 24 THÁNG")
    draw_bottom_table_banners(keyed, promo_title="KHÓA THÔNG MINH & PHỤ KIỆN", discount_text="Bảo hành 1 đổi 1 • Lắp đặt tận nơi")
    
    out_path = os.path.join(OUTPUT_DIR, "overlay_fujitech_smartlock_desk.png")
    keyed.save(out_path, "PNG")
    print(f"Saved: {out_path} ({os.path.getsize(out_path) / 1024:.1f} KB)")
    return out_path

def create_overlay_2():
    print("Generating Overlay 2: Fujitech Luxury Neon Tech Desk...")
    base_img = Image.open(IMAGE_2_PATH)
    keyed = remove_greenscreen(base_img, desk_min_y_ratio=0.45)
    
    # Resize to 720x1280
    keyed = keyed.resize((720, 1280), Image.Resampling.LANCZOS)
    
    draw_top_badges(keyed, brand_title="FUJITECH GROUP OFFICIAL", sub_badge="CHÍNH HÃNG 100%")
    draw_bottom_table_banners(keyed, promo_title="ĐẠI TIỆC LIVESTREAM KHỦNG", discount_text="Voucher Giảm 20% Trong Giỏ Hàng")
    
    out_path = os.path.join(OUTPUT_DIR, "overlay_fujitech_luxury_neon_desk.png")
    keyed.save(out_path, "PNG")
    print(f"Saved: {out_path} ({os.path.getsize(out_path) / 1024:.1f} KB)")
    return out_path

def create_overlay_3():
    print("Generating Overlay 3: Clean Streamer Frame with Floating Podium...")
    # Pure graphic design overlay with elegant glassmorphism desk bar at bottom
    overlay = Image.new("RGBA", (720, 1280), (0, 0, 0, 0))
    draw = ImageDraw.Draw(overlay)
    
    # 1. Subtle camera border
    draw.rounded_rectangle([12, 12, 708, 1268], radius=24, outline=(0, 210, 255, 60), width=2)
    
    # 2. Modern Glassmorphism Streamer Counter at the bottom (y=920 to 1280)
    counter_rect = [0, 960, 720, 1280]
    draw.rectangle(counter_rect, fill=(12, 18, 30, 210))
    # Glowing top neon line of the counter table
    draw.line([(0, 960), (720, 960)], fill=(0, 210, 255, 230), width=4)
    draw.line([(0, 963), (720, 963)], fill=(0, 150, 255, 100), width=3)
    
    # Product display pedestals on the counter
    draw.rounded_rectangle([50, 985, 220, 1140], radius=12, fill=(25, 35, 55, 230), outline=(0, 210, 255, 100), width=1)
    draw.text((65, 1040), "📦 PHỤ KIỆN\n    CAO CẤP", fill=(255, 255, 255), font=get_font(18, bold=True))
    
    draw.rounded_rectangle([270, 985, 450, 1140], radius=12, fill=(25, 35, 55, 230), outline=(255, 180, 0, 120), width=1)
    draw.text((285, 1040), "🔐 KHÓA ĐIỆN TỬ\n     FUJITECH", fill=(255, 220, 100), font=get_font(18, bold=True))
    
    draw.rounded_rectangle([500, 985, 670, 1140], radius=12, fill=(25, 35, 55, 230), outline=(238, 77, 45, 120), width=1)
    draw.text((515, 1040), "🚪 CỬA CNC\n  CHÍNH HÃNG", fill=(255, 150, 120), font=get_font(18, bold=True))
    
    draw_top_badges(overlay, brand_title="FUJITECH LIVE SHOWROOM", sub_badge="ƯU ĐÃI ĐỘC QUYỀN")
    draw_bottom_table_banners(overlay, promo_title="HỖ TRỢ TƯ VẤN & BÁO GIÁ TRỰC TIẾP", discount_text="Để lại bình luận hoặc số điện thoại để nhận quà")
    
    out_path = os.path.join(OUTPUT_DIR, "overlay_fujitech_minimalist_frame.png")
    overlay.save(out_path, "PNG")
    print(f"Saved: {out_path} ({os.path.getsize(out_path) / 1024:.1f} KB)")
    return out_path

if __name__ == "__main__":
    p1 = create_overlay_1()
    p2 = create_overlay_2()
    p3 = create_overlay_3()
    print("All 3 overlays generated successfully!")
