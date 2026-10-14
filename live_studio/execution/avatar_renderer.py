import os
import time
import logging
import tempfile
import subprocess
from typing import Optional, List
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
        self.idle_path = None
        self.speaking_path = None

    def initialize(self):
        self.is_initialized = True

    def load_avatar_assets(self, idle_path: str = None, speaking_path: str = None, ffmpeg_bin: str = None):
        self.idle_path = idle_path
        self.speaking_path = speaking_path

    def notify_speech_start(self):
        pass

    def notify_speech_stop(self):
        pass

    def render(self, is_speaking: bool, mouth_state: str, is_blinking: bool):
        self.last_state = {
            "speaking": is_speaking,
            "mouth": mouth_state,
            "blinking": is_blinking
        }

    def shutdown(self):
        self.is_initialized = False


class VideoFrameSequence:
    """
    Loads and manages a sequence of frames for Idle or Speaking video loops.
    Supports both image files (.png, .jpg, etc.) and video files (.mp4, .webm, etc.).
    Uses bundled FFmpeg for ultra-fast frame extraction.
    """
    def __init__(self, file_path: Optional[str], target_width: int = 720, target_height: int = 1280, ffmpeg_bin: Optional[str] = None, fps: int = 25):
        self.frames = []
        self.fps = fps
        self.target_width = target_width
        self.target_height = target_height
        
        if not file_path or not os.path.exists(file_path):
            return

        import pygame
        ext = os.path.splitext(file_path)[1].lower()
        
        # 1. Image Asset (Static)
        if ext in ['.png', '.jpg', '.jpeg', '.webp', '.bmp']:
            try:
                surf = pygame.image.load(file_path)
                if surf.get_size() != (target_width, target_height):
                    surf = pygame.transform.smoothscale(surf, (target_width, target_height))
                self.frames.append(surf)
                logger.info(f"[VideoFrameSequence] Loaded static image: {file_path}")
            except Exception as e:
                logger.error(f"[VideoFrameSequence] Failed to load image {file_path}: {e}")

        # 2. Video Asset (Dynamic Sequence)
        elif ext in ['.mp4', '.mov', '.webm', '.mkv', '.avi']:
            ffmpeg_exe = ffmpeg_bin or "ffmpeg"
            temp_dir = tempfile.mkdtemp(prefix="avatar_frames_")
            try:
                cmd = [
                    ffmpeg_exe,
                    "-y",
                    "-i", file_path,
                    "-t", "10",  # Max 10s loop
                    "-r", str(fps),
                    "-vf", f"scale={target_width}:{target_height}",
                    "-q:v", "2",
                    os.path.join(temp_dir, "frame_%04d.jpg")
                ]
                flags = 0x08000000 if os.name == 'nt' else 0
                res = subprocess.run(cmd, capture_output=True, creationflags=flags)
                if res.returncode == 0:
                    frame_files = sorted([os.path.join(temp_dir, f) for f in os.listdir(temp_dir) if f.endswith('.jpg')])
                    for f in frame_files:
                        surf = pygame.image.load(f)
                        self.frames.append(surf)
                    logger.info(f"[VideoFrameSequence] Extracted & loaded {len(self.frames)} frames from video: {file_path}")
                else:
                    logger.error(f"[VideoFrameSequence] FFmpeg extraction failed: {res.stderr.decode('utf-8', errors='ignore')[-300:]}")
            except Exception as e:
                logger.error(f"[VideoFrameSequence] Exception extracting video {file_path}: {e}")
            finally:
                # Cleanup temporary disk files
                for f in os.listdir(temp_dir):
                    try:
                        os.remove(os.path.join(temp_dir, f))
                    except Exception:
                        pass
                try:
                    os.rmdir(temp_dir)
                except Exception:
                    pass

    def get_frame(self, elapsed_seconds: float):
        if not self.frames:
            return None
        if len(self.frames) == 1:
            return self.frames[0]
        idx = int(elapsed_seconds * self.fps) % len(self.frames)
        return self.frames[idx]

    def __len__(self):
        return len(self.frames)

    def cleanup(self):
        self.frames.clear()


class PygameAvatarRenderer(BaseAvatarRenderer):
    """
    Dual-Loop Video & 2D Scene Composition Renderer using Pygame.
    Outputs a 9:16 (720x1280) frame.
    Supports real-time switching between Idle and Speaking video loops.
    """
    def __init__(self):
        self.screen = None
        self.clock = None
        self.width = 720
        self.height = 1280
        
        self.idle_sequence: Optional[VideoFrameSequence] = None
        self.speaking_sequence: Optional[VideoFrameSequence] = None
        self._speech_start_time = 0.0
        self._idle_start_time = time.monotonic()
        self._is_speaking_state = False
        self._active_speaking_time = 0.0
        self._last_render_time = time.monotonic()
        
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

    def load_avatar_assets(self, idle_path: Optional[str] = None, speaking_path: Optional[str] = None, ffmpeg_bin: Optional[str] = None):
        if not self.available:
            return
            
        logger.info(f"[PygameAvatarRenderer] Loading assets idle={idle_path}, speaking={speaking_path}")
        if self.idle_sequence:
            self.idle_sequence.cleanup()
        if self.speaking_sequence:
            self.speaking_sequence.cleanup()
            
        self.idle_sequence = VideoFrameSequence(idle_path, self.width, self.height, ffmpeg_bin) if idle_path else None
        self.speaking_sequence = VideoFrameSequence(speaking_path, self.width, self.height, ffmpeg_bin) if speaking_path else None
        self._idle_start_time = time.monotonic()
        self._active_speaking_time = 0.0

    def notify_speech_start(self):
        self._is_speaking_state = True
        self._speech_start_time = time.monotonic()
        self._active_speaking_time = 0.0
        self._last_render_time = time.monotonic()

    def notify_speech_stop(self):
        self._is_speaking_state = False
        self._idle_start_time = time.monotonic()
        self._active_speaking_time = 0.0

    def render(self, is_speaking: bool, mouth_state: str, is_blinking: bool):
        if not self.available or not self.screen:
            return
            
        # Process Pygame events to keep the window responsive
        for event in self.pygame.event.get():
            if event.type == self.pygame.QUIT:
                pass 
                
        now = time.monotonic()
        dt = max(0.0, min(0.1, now - getattr(self, '_last_render_time', now)))
        self._last_render_time = now

        has_custom_avatar = (self.idle_sequence and len(self.idle_sequence) > 0) or (self.speaking_sequence and len(self.speaking_sequence) > 0)
        
        # Dual-Loop Video Frame Rendering with Lip-Sync Gating
        if has_custom_avatar:
            surf = None
            if is_speaking:
                # When audio is actively producing sound (mouth_state != CLOSED), advance the speaking loop
                if mouth_state != MOUTH_STATE_CLOSED:
                    self._active_speaking_time = getattr(self, '_active_speaking_time', 0.0) + dt
                    if self.speaking_sequence and len(self.speaking_sequence) > 0:
                        surf = self.speaking_sequence.get_frame(self._active_speaking_time)
                    elif self.idle_sequence and len(self.idle_sequence) > 0:
                        surf = self.idle_sequence.get_frame(now - self._idle_start_time)
                else:
                    # Speech pause / silence between words or sentences:
                    # Return to closed-mouth idle pose, or freeze on frame 0 of speaking loop
                    if self.idle_sequence and len(self.idle_sequence) > 0:
                        surf = self.idle_sequence.get_frame(now - self._idle_start_time)
                    elif self.speaking_sequence and len(self.speaking_sequence) > 0:
                        surf = self.speaking_sequence.get_frame(0.0)
            else:
                if self.idle_sequence and len(self.idle_sequence) > 0:
                    surf = self.idle_sequence.get_frame(now - self._idle_start_time)
                elif self.speaking_sequence and len(self.speaking_sequence) > 0:
                    # Freeze on first frame during idle if only speaking sequence is loaded
                    surf = self.speaking_sequence.get_frame(0.0)
                    
            if surf:
                self.screen.blit(surf, (0, 0))
                return

        # Fallback 2D Cartoon Scene (used for tests or when no video asset is selected)
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

    def shutdown(self):
        if self.idle_sequence:
            self.idle_sequence.cleanup()
            self.idle_sequence = None
        if self.speaking_sequence:
            self.speaking_sequence.cleanup()
            self.speaking_sequence = None
        if self.available and self.pygame:
            self.pygame.quit()
