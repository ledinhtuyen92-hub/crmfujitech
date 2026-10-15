import os
import time
import math
import logging
from typing import Optional, Tuple
import pygame
from PIL import Image

logger = logging.getLogger(__name__)

MODE_HUMAN = "HUMAN"
MODE_MASCOT = "MASCOT"

class ExperimentalLipSyncRenderer:
    """
    Experimental Rendering Engine supporting both:
      - Mode A: Photorealistic Human Model (Dual-Frame Region Morphing & Adaptive Lip Warping)
      - Mode B: 2D Mascot / Chibi / VTuber (Sprite & Viseme-driven with Eye Blinking & Body Bobbing)
    Outputs high quality 720x1280 frames.
    """
    def __init__(self, width: int = 720, height: int = 1280):
        self.width = width
        self.height = height
        
        # Pygame surface & display initialization
        if not pygame.get_init():
            pygame.init()
        if not pygame.display.get_init():
            pygame.display.init()
        try:
            if not pygame.display.get_surface():
                pygame.display.set_mode((1, 1), pygame.NOFRAME | pygame.HIDDEN)
        except Exception:
            pass

        self.surface = pygame.Surface((self.width, self.height))
        
        # Mode A: Human Model Assets & Parameters (Calibrated to female model face center)
        self.human_idle_surf: Optional[pygame.Surface] = None
        self.human_speak_surf: Optional[pygame.Surface] = None
        self.mouth_center_x = 385
        self.mouth_center_y = 505
        self.mouth_radius = 80
        self.mouth_scale = 1.0
        self.show_mouth_guide = False
        
        # Mode B: Mascot & 2D Parameters
        self.mascot_bounce_intensity = 8.0
        self.mascot_color = (66, 133, 244)  # Google/Fujitech Blue
        self._last_blink_time = time.monotonic()
        self._is_blinking = False
        
        # Custom mascot sprites (if provided)
        self.custom_mascot_body: Optional[pygame.Surface] = None
        self.custom_mouth_sprites: dict = {}
        
        # Cached morph buffers for Mode A
        self._blend_cache = None

    def load_human_assets(self, idle_path: str, speak_path: Optional[str] = None):
        """Loads and scales human model images for Mode A."""
        try:
            if idle_path and os.path.exists(idle_path):
                img = pygame.image.load(idle_path)
                self.human_idle_surf = pygame.transform.smoothscale(img, (self.width, self.height))
                logger.info(f"[ExperimentalRenderer] Loaded human idle: {idle_path}")
            
            if speak_path and os.path.exists(speak_path):
                img = pygame.image.load(speak_path)
                self.human_speak_surf = pygame.transform.smoothscale(img, (self.width, self.height))
                logger.info(f"[ExperimentalRenderer] Loaded human speak: {speak_path}")
            else:
                self.human_speak_surf = None
        except Exception as e:
            logger.error(f"[ExperimentalRenderer] Error loading human assets: {e}")

    def set_mouth_coordinates(self, center_x: int, center_y: int, radius: int, scale: float = 1.0):
        self.mouth_center_x = center_x
        self.mouth_center_y = center_y
        self.mouth_radius = radius
        self.mouth_scale = scale

    def _render_human_dual_blend(self, amplitude: float):
        """
        Renders photorealistic human model by soft-morphing between idle and speak poses
        concentrated around the mouth & jaw region based on audio amplitude.
        Uses 32-bit RGBA radial feathering to eliminate any black box or corner artifacts.
        """
        # Base background: Idle surface
        self.surface.blit(self.human_idle_surf, (0, 0))
        
        cx = self.mouth_center_x
        cy = self.mouth_center_y
        r = int(self.mouth_radius * self.mouth_scale)

        if self.human_speak_surf and amplitude > 0.01:
            blend_alpha = int(min(255, max(0, amplitude * 255 * self.mouth_scale)))
            
            # Define region of interest (ROI) around mouth
            x0 = max(0, cx - r)
            y0 = max(0, cy - r)
            w = min(self.width - x0, 2 * r)
            h = min(self.height - y0, 2 * r)
            
            if w > 0 and h > 0 and blend_alpha > 0:
                # 1. Create a true 32-bit RGBA surface for the patch
                patch = pygame.Surface((w, h), pygame.SRCALPHA)
                patch.blit(self.human_speak_surf, (0, 0), (x0, y0, w, h))
                
                # 2. Create the radial alpha mask with transparent background
                mask = pygame.Surface((w, h), pygame.SRCALPHA)
                mask.fill((0, 0, 0, 0))
                for i in range(r, 0, -2):
                    dist_ratio = i / float(r)
                    falloff = 0.5 * (1.0 + math.cos(math.pi * dist_ratio))
                    ring_alpha = int(blend_alpha * falloff)
                    pygame.draw.circle(mask, (255, 255, 255, ring_alpha), (w // 2, h // 2), i)
                    
                # 3. Multiply mask into patch (corners remain alpha=0, center gets blend_alpha)
                patch.blit(mask, (0, 0), special_flags=pygame.BLEND_RGBA_MULT)
                
                # 4. Seamlessly blend onto base surface with zero black border
                self.surface.blit(patch, (x0, y0))

        # Optional: Render subtle alignment guide if enabled
        if self.show_mouth_guide:
            guide = pygame.Surface((self.width, self.height), pygame.SRCALPHA)
            pygame.draw.circle(guide, (0, 210, 255, 120), (cx, cy), r, width=2)
            pygame.draw.line(guide, (0, 210, 255, 160), (cx - 10, cy), (cx + 10, cy), width=1)
            pygame.draw.line(guide, (0, 210, 255, 160), (cx, cy - 10), (cx, cy + 10), width=1)
            self.surface.blit(guide, (0, 0))

    def _render_human_single_warp(self, amplitude: float):
        """
        Renders photorealistic human model from a SINGLE photo by procedurally
        warping the mouth aperture and separating the lower lip according to audio amplitude.
        """
        self.surface.blit(self.human_idle_surf, (0, 0))
        
        if amplitude <= 0.03:
            return

        cx = self.mouth_center_x
        cy = self.mouth_center_y
        r = int(self.mouth_radius * self.mouth_scale)
        open_pixels = int(amplitude * 16 * self.mouth_scale)
        
        if open_pixels <= 0:
            return

        # 1. Dark inner mouth cavity
        mouth_w = int(r * 0.9)
        mouth_h = int(open_pixels * 1.4)
        inner_rect = pygame.Rect(cx - mouth_w // 2, cy - mouth_h // 2, mouth_w, mouth_h)
        
        # Soft dark cavity surface
        cavity = pygame.Surface((mouth_w, mouth_h), pygame.SRCALPHA)
        pygame.draw.ellipse(cavity, (40, 15, 20, 220), (0, 0, mouth_w, mouth_h))
        # Inner teeth hint
        if open_pixels > 6:
            pygame.draw.ellipse(cavity, (240, 240, 240, 160), (mouth_w // 4, 1, mouth_w // 2, 4))
        # Inner tongue hint
        if open_pixels > 9:
            pygame.draw.ellipse(cavity, (200, 70, 80, 200), (mouth_w // 3, mouth_h - 6, mouth_w // 3, 5))
            
        self.surface.blit(cavity, inner_rect.topleft)

        # 2. Lower lip displacement patch
        lip_h = int(r * 0.5)
        lip_y = cy + 2
        if lip_y + lip_h < self.height:
            lower_lip = self.human_idle_surf.subsurface((cx - mouth_w // 2, lip_y, mouth_w, lip_h)).copy()
            # Drop lower lip downwards
            self.surface.blit(lower_lip, (cx - mouth_w // 2, lip_y + open_pixels))

    def _update_blinking(self):
        """Handles natural random eye blinking every 3-4 seconds."""
        now = time.monotonic()
        if not self._is_blinking and (now - self._last_blink_time) > 3.2:
            self._is_blinking = True
            self._last_blink_time = now
        elif self._is_blinking and (now - self._last_blink_time) > 0.16:
            self._is_blinking = False
            self._last_blink_time = now

    def _render_mascot(self, amplitude: float, mouth_state: str):
        """
        Renders the 2D Mascot / Chibi / VTuber with audio-reactive body bobbing,
        eye blinking, and viseme-driven mouth expressions.
        """
        self._update_blinking()
        
        # Body bounce offset (VTuber bouncing animation)
        bounce_y = int(amplitude * self.mascot_bounce_intensity)
        
        # 1. Background (Studio gradient / soft pastel aesthetic)
        self.surface.fill((245, 248, 255))
        # Floor shadow
        shadow_rect = pygame.Rect(self.width // 2 - 160, 1020, 320, 40)
        pygame.draw.ellipse(self.surface, (215, 225, 240), shadow_rect)
        
        center_x = self.width // 2
        center_y = 620 - bounce_y

        # 2. Mascot Body
        # Torso
        torso_rect = pygame.Rect(center_x - 120, center_y + 110, 240, 280)
        pygame.draw.rect(self.surface, self.mascot_color, torso_rect, border_radius=40)
        # Belly panel (White/Cyan glow)
        belly_rect = pygame.Rect(center_x - 75, center_y + 140, 150, 180)
        pygame.draw.rect(self.surface, (255, 255, 255), belly_rect, border_radius=30)
        # Brand logo / badge on belly
        badge_y = center_y + 180
        pygame.draw.circle(self.surface, (234, 67, 53), (center_x, badge_y), 18)
        pygame.draw.polygon(self.surface, (255, 255, 255), [
            (center_x - 6, badge_y - 8),
            (center_x + 10, badge_y),
            (center_x - 6, badge_y + 8)
        ])

        # Arms
        # Left arm
        arm_offset = int(amplitude * 6)
        pygame.draw.ellipse(self.surface, self.mascot_color, (center_x - 165, center_y + 130 - arm_offset, 55, 140))
        # Right arm (raised slightly holding mic/star)
        pygame.draw.ellipse(self.surface, self.mascot_color, (center_x + 110, center_y + 120 - arm_offset * 2, 55, 140))

        # 3. Mascot Head
        # Antenna / Ears
        pygame.draw.line(self.surface, (100, 100, 120), (center_x, center_y - 170), (center_x, center_y - 230), 8)
        antenna_glow = (255, 215, 0) if amplitude > 0.1 else (180, 180, 200)
        pygame.draw.circle(self.surface, antenna_glow, (center_x, center_y - 235), 18)
        
        # Head Outer Outline & Fill
        pygame.draw.circle(self.surface, (230, 235, 245), (center_x, center_y), 175)
        pygame.draw.circle(self.surface, (255, 255, 255), (center_x, center_y), 170)
        
        # Cute Blush Cheeks
        pygame.draw.ellipse(self.surface, (255, 182, 193, 180), (center_x - 130, center_y + 35, 45, 25))
        pygame.draw.ellipse(self.surface, (255, 182, 193, 180), (center_x + 85, center_y + 35, 45, 25))

        # 4. Eyes (Open or Blinking)
        eye_y = center_y - 15
        eye_spacing = 65
        
        if not self._is_blinking:
            # Left Eye
            pygame.draw.circle(self.surface, (40, 45, 60), (center_x - eye_spacing, eye_y), 24)
            # Highlights
            pygame.draw.circle(self.surface, (255, 255, 255), (center_x - eye_spacing - 7, eye_y - 8), 9)
            pygame.draw.circle(self.surface, (255, 255, 255), (center_x - eye_spacing + 6, eye_y + 7), 4)

            # Right Eye
            pygame.draw.circle(self.surface, (40, 45, 60), (center_x + eye_spacing, eye_y), 24)
            # Highlights
            pygame.draw.circle(self.surface, (255, 255, 255), (center_x + eye_spacing - 7, eye_y - 8), 9)
            pygame.draw.circle(self.surface, (255, 255, 255), (center_x + eye_spacing + 6, eye_y + 7), 4)
        else:
            # Blinking: cute curved smiling eyes `^ ^`
            pygame.draw.arc(self.surface, (40, 45, 60), (center_x - eye_spacing - 24, eye_y - 10, 48, 30), 0, math.pi, 6)
            pygame.draw.arc(self.surface, (40, 45, 60), (center_x + eye_spacing - 24, eye_y - 10, 48, 30), 0, math.pi, 6)

        # 5. Viseme-driven Mouth States
        mouth_y = center_y + 70
        
        if mouth_state == "CLOSED" or amplitude < 0.05:
            # Cute gentle cat smile ^‿^
            pygame.draw.arc(self.surface, (50, 50, 60), (center_x - 30, mouth_y - 15, 30, 25), math.pi, 2 * math.pi, 5)
            pygame.draw.arc(self.surface, (50, 50, 60), (center_x, mouth_y - 15, 30, 25), math.pi, 2 * math.pi, 5)
            
        elif mouth_state == "SMALL":
            # Small open mouth
            rect = pygame.Rect(center_x - 22, mouth_y - 10, 44, 22)
            pygame.draw.ellipse(self.surface, (50, 30, 40), rect)
            pygame.draw.ellipse(self.surface, (240, 100, 120), (center_x - 14, mouth_y - 2, 28, 12)) # tongue
            
        elif mouth_state == "MEDIUM":
            # Medium open smile
            rect = pygame.Rect(center_x - 36, mouth_y - 15, 72, 38)
            pygame.draw.ellipse(self.surface, (50, 20, 30), rect)
            pygame.draw.ellipse(self.surface, (255, 255, 255), (center_x - 24, mouth_y - 14, 48, 10)) # teeth
            pygame.draw.ellipse(self.surface, (240, 80, 110), (center_x - 22, mouth_y + 3, 44, 18)) # tongue
            
        elif mouth_state == "OPEN":
            # Big excited open mouth
            rect = pygame.Rect(center_x - 48, mouth_y - 25, 96, 60)
            pygame.draw.ellipse(self.surface, (40, 15, 25), rect)
            pygame.draw.ellipse(self.surface, (255, 255, 255), (center_x - 32, mouth_y - 24, 64, 14)) # upper teeth
            pygame.draw.ellipse(self.surface, (250, 70, 100), (center_x - 30, mouth_y + 5, 60, 28)) # big tongue
            
        elif mouth_state == "ROUND":
            # Round surprised mouth O
            rect = pygame.Rect(center_x - 24, mouth_y - 20, 48, 50)
            pygame.draw.ellipse(self.surface, (40, 20, 30), rect)
            pygame.draw.ellipse(self.surface, (230, 90, 120), (center_x - 15, mouth_y + 6, 30, 20))

    def render_frame(self, mode: str, amplitude: float, mouth_state: str) -> pygame.Surface:
        """
        Renders a full 720x1280 frame for the selected mode.
        """
        if mode == MODE_HUMAN:
            if self.human_idle_surf:
                if self.human_speak_surf:
                    self._render_human_dual_blend(amplitude)
                else:
                    self._render_human_single_warp(amplitude)
            else:
                # Fallback if no image loaded yet
                self._render_mascot(amplitude, mouth_state)
        else:
            self._render_mascot(amplitude, mouth_state)

        return self.surface

    def get_preview_pil_image(self, mode: str, amplitude: float, mouth_state: str, preview_w: int = 360, preview_h: int = 640) -> Image.Image:
        """
        Renders and returns a scaled PIL Image ready for CustomTkinter or Web display.
        """
        surf = self.render_frame(mode, amplitude, mouth_state)
        # Scaled down to preview resolution
        scaled_surf = pygame.transform.smoothscale(surf, (preview_w, preview_h))
        # Convert pygame surface to PIL Image
        raw_data = pygame.image.tostring(scaled_surf, "RGB")
        return Image.frombytes("RGB", (preview_w, preview_h), raw_data)
