import logging
from .lip_sync import MOUTH_STATE_CLOSED

logger = logging.getLogger(__name__)

class BaseAvatarRenderer:
    """
    Abstract interface for 2D Avatar Rendering.
    """
    def initialize(self):
        raise NotImplementedError

    def render(self, is_speaking: bool, mouth_state: str, is_blinking: bool):
        raise NotImplementedError

    def shutdown(self):
        raise NotImplementedError


class DummyAvatarRenderer(BaseAvatarRenderer):
    """
    Renderer used for unit tests. Records rendering states.
    """
    def __init__(self):
        self.last_state = None
        self.is_initialized = False

    def initialize(self):
        self.is_initialized = True

    def render(self, is_speaking: bool, mouth_state: str, is_blinking: bool):
        self.last_state = {
            "speaking": is_speaking,
            "mouth": mouth_state,
            "blinking": is_blinking
        }

    def shutdown(self):
        self.is_initialized = False


class PygameAvatarRenderer(BaseAvatarRenderer):
    """
    2D Scene Composition Renderer using Pygame.
    Outputs a 9:16 (720x1280) frame with Product Area, CTA, and Avatar.
    """
    def __init__(self):
        self.screen = None
        self.clock = None
        self.width = 720
        self.height = 1280
        
        try:
            import pygame
            self.pygame = pygame
            self.available = True
        except ImportError:
            self.pygame = None
            self.available = False
            logger.error("Pygame not available. PygameAvatarRenderer disabled.")

    def initialize(self):
        if not self.available:
            return
            
        self.pygame.init()
        self.pygame.font.init()
        try:
            self.font_title = self.pygame.font.SysFont("Arial", 40, bold=True)
            self.font_subtitle = self.pygame.font.SysFont("Arial", 32)
            self.font_cta = self.pygame.font.SysFont("Arial", 48, bold=True)
        except Exception:
            self.font_title = None
            self.font_subtitle = None
            self.font_cta = None
            
        # Use an off-screen surface for internal frame extraction (rendering without a window)
        self.screen = self.pygame.Surface((self.width, self.height))
        self.clock = self.pygame.time.Clock()
        
    def render(self, is_speaking: bool, mouth_state: str, is_blinking: bool):
        if not self.available or not self.screen:
            return
            
        # Process Pygame events to keep the window responsive
        for event in self.pygame.event.get():
            if event.type == self.pygame.QUIT:
                pass 
                
        # 1. Background (Warm pastel)
        self.screen.fill((250, 240, 245))
        
        # 2. Product Box (Top)
        self.pygame.draw.rect(self.screen, (255, 255, 255), (40, 80, 640, 250), border_radius=15)
        self.pygame.draw.rect(self.screen, (220, 220, 220), (40, 80, 640, 250), width=2, border_radius=15)
        # Product Image Placeholder
        self.pygame.draw.rect(self.screen, (230, 230, 230), (60, 100, 210, 210), border_radius=10)
        
        if self.font_title:
            prod_text = self.font_title.render("Sản phẩm nổi bật", True, (40, 40, 40))
            self.screen.blit(prod_text, (290, 120))
            
            price_text = self.font_subtitle.render("Giá Flash Sale: 99.000đ", True, (230, 40, 40))
            self.screen.blit(price_text, (290, 180))
            
            feat_text = self.font_subtitle.render("Giao hàng miễn phí", True, (40, 160, 80))
            self.screen.blit(feat_text, (290, 240))

        # 3. Avatar (Center/Bottom)
        avatar_cx = 360
        avatar_cy = 700
        
        # Body
        self.pygame.draw.rect(self.screen, (100, 140, 250), (avatar_cx - 150, avatar_cy + 150, 300, 450)) 
        # Head
        self.pygame.draw.circle(self.screen, (255, 220, 200), (avatar_cx, avatar_cy), 180)    
        
        # Eyes
        eye_y = avatar_cy - 40
        if not is_blinking:
            self.pygame.draw.circle(self.screen, (255, 255, 255), (avatar_cx - 60, eye_y), 25)
            self.pygame.draw.circle(self.screen, (255, 255, 255), (avatar_cx + 60, eye_y), 25)
            self.pygame.draw.circle(self.screen, (0, 0, 0), (avatar_cx - 60, eye_y), 12)
            self.pygame.draw.circle(self.screen, (0, 0, 0), (avatar_cx + 60, eye_y), 12)
        else:
            self.pygame.draw.line(self.screen, (0, 0, 0), (avatar_cx - 85, eye_y), (avatar_cx - 35, eye_y), 5)
            self.pygame.draw.line(self.screen, (0, 0, 0), (avatar_cx + 35, eye_y), (avatar_cx + 85, eye_y), 5)
            
        # Mouth
        mouth_y = avatar_cy + 80
        if mouth_state == "CLOSED":
            self.pygame.draw.line(self.screen, (0, 0, 0), (avatar_cx - 40, mouth_y), (avatar_cx + 40, mouth_y), 5)
        elif mouth_state == "SMALL":
            self.pygame.draw.ellipse(self.screen, (0, 0, 0), (avatar_cx - 20, mouth_y - 10, 40, 20))
        elif mouth_state == "MEDIUM":
            self.pygame.draw.ellipse(self.screen, (0, 0, 0), (avatar_cx - 30, mouth_y - 15, 60, 30))
        elif mouth_state == "OPEN":
            self.pygame.draw.ellipse(self.screen, (0, 0, 0), (avatar_cx - 40, mouth_y - 30, 80, 60))
            
        # 4. CTA Box (Bottom)
        cta_y = 1100
        self.pygame.draw.rect(self.screen, (238, 77, 45), (40, cta_y, 640, 100), border_radius=50) # Shopee orange
        if self.font_cta:
            cta_surf = self.font_cta.render("MUA NGAY TẠI GIỎ HÀNG!", True, (255, 255, 255))
            cta_rect = cta_surf.get_rect(center=(360, cta_y + 50))
            self.screen.blit(cta_surf, cta_rect)

        # self.pygame.display.flip() # Not needed for off-screen surface

    def shutdown(self):
        if self.available:
            self.pygame.quit()
