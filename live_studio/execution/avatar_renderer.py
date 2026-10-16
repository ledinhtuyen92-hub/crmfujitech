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

    def load_avatar_assets(self, idle_path: str = None, speaking_path: str = None, ffmpeg_bin: str = None, actions_map: dict = None):
        self.idle_path = idle_path
        self.speaking_path = speaking_path
        self.actions_map = actions_map

    def play_action(self, action_id: str) -> bool:
        self.last_action = action_id
        return True

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
    Loads and manages a sequence of frames for Idle, Speaking, or Action video loops.
    Supports both image files (.png, .jpg, etc.) and video files (.mp4, .webm, etc.).
    Uses JPEG byte buffer in memory with dynamic single-surface cache for ultra-low RAM footprint (~35MB for 60s).
    """
    def __init__(self, file_path: Optional[str], target_width: int = 720, target_height: int = 1280, ffmpeg_bin: Optional[str] = None, fps: int = 25, max_duration: int = 120):
        self.static_surf = None
        self.frame_bytes = []
        self.fps = fps
        self.target_width = target_width
        self.target_height = target_height
        self._cached_idx = -1
        self._cached_surf = None
        
        if not file_path or not os.path.exists(file_path):
            return

        import pygame
        import io
        self.pygame = pygame
        self.io = io
        ext = os.path.splitext(file_path)[1].lower()
        
        # 1. Image Asset (Static)
        if ext in ['.png', '.jpg', '.jpeg', '.webp', '.bmp']:
            try:
                surf = pygame.image.load(file_path)
                if surf.get_size() != (target_width, target_height):
                    surf = pygame.transform.smoothscale(surf, (target_width, target_height))
                self.static_surf = surf
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
                    "-t", str(max_duration),
                    "-r", str(fps),
                    "-vf", f"scale={target_width}:{target_height}",
                    "-q:v", "3",
                    os.path.join(temp_dir, "frame_%04d.jpg")
                ]
                flags = 0x08000000 if os.name == 'nt' else 0
                res = subprocess.run(cmd, capture_output=True, creationflags=flags)
                if res.returncode == 0:
                    frame_files = sorted([os.path.join(temp_dir, f) for f in os.listdir(temp_dir) if f.endswith('.jpg')])
                    for f in frame_files:
                        with open(f, "rb") as fp:
                            self.frame_bytes.append(fp.read())
                    logger.info(f"[VideoFrameSequence] Loaded {len(self.frame_bytes)} frames (~{self.duration:.1f}s) into compressed memory cache from: {file_path}")
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

    @property
    def duration(self) -> float:
        if self.static_surf:
            return 1.0
        if not self.frame_bytes:
            return 0.0
        return len(self.frame_bytes) / float(self.fps)

    def get_frame(self, elapsed_seconds: float):
        if self.static_surf:
            return self.static_surf
        if not self.frame_bytes:
            return None
        idx = int(elapsed_seconds * self.fps) % len(self.frame_bytes)
        if idx == self._cached_idx and self._cached_surf:
            return self._cached_surf
        try:
            surf = self.pygame.image.load(self.io.BytesIO(self.frame_bytes[idx]))
            self._cached_idx = idx
            self._cached_surf = surf
            return surf
        except Exception as e:
            logger.error(f"Failed to decode frame {idx}: {e}")
            return self._cached_surf

    def __len__(self):
        return 1 if self.static_surf else len(self.frame_bytes)

    def cleanup(self):
        self.frame_bytes.clear()
        self.static_surf = None
        self._cached_surf = None
        self._cached_idx = -1


class PygameAvatarRenderer(BaseAvatarRenderer):
    """
    Dual-Loop Video & 2D Scene Composition Renderer using Pygame.
    Outputs a 9:16 (720x1280) frame.
    Supports real-time switching between Idle, Speaking, and specialized Action gesture loops.
    Implements Resume Playback: idle and speaking positions resume from where they paused.
    """
    def __init__(self):
        self.screen = None
        self.clock = None
        self.width = 720
        self.height = 1280
        
        self.idle_sequence: Optional[VideoFrameSequence] = None
        self.speaking_sequence: Optional[VideoFrameSequence] = None
        self.action_sequences: dict = {}
        
        # Resume Playback time accumulators
        self._idle_playback_time = 0.0
        self._speaking_playback_time = 0.0
        # Synchronized Master Clock for Pose-Matched Twin Loops
        self._master_timeline = 0.0
        
        # Action gesture state
        self._current_action_id: Optional[str] = None
        self._current_action_seq: Optional[VideoFrameSequence] = None
        self._current_action_time = 0.0
        
        self._is_speaking_state = False
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

    def load_avatar_assets(self, idle_path: Optional[str] = None, speaking_path: Optional[str] = None, ffmpeg_bin: Optional[str] = None, actions_map: Optional[dict] = None):
        if not self.available:
            return
            
        logger.info(f"[PygameAvatarRenderer] Loading assets idle={idle_path}, speaking={speaking_path}, actions_count={len(actions_map or {})}")
        if self.idle_sequence:
            self.idle_sequence.cleanup()
        if self.speaking_sequence:
            self.speaking_sequence.cleanup()
        for seq in self.action_sequences.values():
            seq.cleanup()
        self.action_sequences.clear()
            
        self.idle_sequence = VideoFrameSequence(idle_path, self.width, self.height, ffmpeg_bin, fps=25, max_duration=120) if idle_path else None
        self.speaking_sequence = VideoFrameSequence(speaking_path, self.width, self.height, ffmpeg_bin, fps=25, max_duration=120) if speaking_path else None
        
        # Load action library
        if actions_map and isinstance(actions_map, dict):
            for act_id, act_info in actions_map.items():
                act_path = act_info.get('path') if isinstance(act_info, dict) else act_info
                if act_path and os.path.exists(act_path):
                    self.action_sequences[act_id] = VideoFrameSequence(act_path, self.width, self.height, ffmpeg_bin, fps=25, max_duration=30)
                    logger.info(f"[PygameAvatarRenderer] Loaded action gesture '{act_id}' from {act_path}")

        self._idle_playback_time = 0.0
        self._speaking_playback_time = 0.0
        self._current_action_seq = None
        self._current_action_id = None
        self._current_action_time = 0.0

    def play_action(self, action_id: str) -> bool:
        """Triggers a specialized action gesture (e.g. point_cart, welcome)."""
        if not action_id or action_id not in self.action_sequences:
            logger.info(f"Action '{action_id}' not found in action library.")
            return False
        self._current_action_id = action_id
        self._current_action_seq = self.action_sequences[action_id]
        self._current_action_time = 0.0
        logger.info(f"[PygameAvatarRenderer] Started action '{action_id}' (duration={self._current_action_seq.duration:.1f}s)")
        return True

    def notify_speech_start(self):
        self._is_speaking_state = True
        self._last_render_time = time.monotonic()
        # Resume Playback: We do NOT reset _idle_playback_time or _speaking_playback_time

    def notify_speech_stop(self):
        self._is_speaking_state = False
        self._last_render_time = time.monotonic()
        # Resume Playback: We do NOT reset _idle_playback_time

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

        has_custom_avatar = (
            (self.idle_sequence and len(self.idle_sequence) > 0) or 
            (self.speaking_sequence and len(self.speaking_sequence) > 0) or
            bool(self._current_action_seq)
        )
        
        # Avatar Rendering with Action Support & Resume Playback
        if has_custom_avatar:
            surf = None
            
            # Determine if idle and speaking are twin-loop matched (within 3s duration)
            is_twin_loop = bool(
                self.idle_sequence and self.speaking_sequence and
                len(self.idle_sequence) > 1 and len(self.speaking_sequence) > 1 and
                abs(self.idle_sequence.duration - self.speaking_sequence.duration) < 3.0
            )

            # 1. Action Gesture (Highest visual priority: plays to completion)
            if self._current_action_seq and len(self._current_action_seq) > 0:
                surf = self._current_action_seq.get_frame(self._current_action_time)
                self._current_action_time += dt
                if self._current_action_time >= self._current_action_seq.duration:
                    logger.info(f"Action '{self._current_action_id}' finished. Returning to baseline sequence.")
                    self._current_action_seq = None
                    self._current_action_id = None
                    self._current_action_time = 0.0
                    
            # 2. Speaking State
            elif is_speaking:
                if is_twin_loop:
                    # Synchronized Twin Loop: Samples frame at exact same timeline as idle!
                    surf = self.speaking_sequence.get_frame(self._master_timeline)
                    self._master_timeline += dt
                # If speaking asset is a single static image (len == 1), gate mouth by audio energy
                elif self.speaking_sequence and len(self.speaking_sequence) == 1:
                    if mouth_state != MOUTH_STATE_CLOSED:
                        surf = self.speaking_sequence.get_frame(0.0)
                    elif self.idle_sequence and len(self.idle_sequence) > 0:
                        surf = self.idle_sequence.get_frame(self._idle_playback_time)
                    else:
                        surf = self.speaking_sequence.get_frame(0.0)
                # If speaking asset is an independent video sequence (len > 1), resume playback
                elif self.speaking_sequence and len(self.speaking_sequence) > 1:
                    surf = self.speaking_sequence.get_frame(self._speaking_playback_time)
                    self._speaking_playback_time += dt
                elif self.idle_sequence and len(self.idle_sequence) > 0:
                    surf = self.idle_sequence.get_frame(self._idle_playback_time)
                    self._idle_playback_time += dt
                    
            # 3. Idle State
            else:
                if is_twin_loop:
                    # Synchronized Twin Loop: Samples frame at exact same timeline as speaking!
                    surf = self.idle_sequence.get_frame(self._master_timeline)
                    self._master_timeline += dt
                elif self.idle_sequence and len(self.idle_sequence) > 0:
                    surf = self.idle_sequence.get_frame(self._idle_playback_time)
                    self._idle_playback_time += dt
                elif self.speaking_sequence and len(self.speaking_sequence) > 0:
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
