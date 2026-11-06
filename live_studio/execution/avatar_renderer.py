import os
import io
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

    def render(self, is_speaking: bool, mouth_state: str, is_blinking: bool, audio_energy: float = 0.0):
        raise NotImplementedError

    def shutdown(self):
        raise NotImplementedError

    def set_pinned_product(self, product_data: dict):
        pass

    def clear_pinned_product(self):
        pass


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

    def set_pinned_product(self, product_data: dict):
        self.pinned_product = product_data

    def clear_pinned_product(self):
        self.pinned_product = None

    def notify_speech_start(self):
        pass

    def notify_speech_stop(self):
        pass

    def render(self, is_speaking: bool, mouth_state: str, is_blinking: bool, audio_energy: float = 0.0):
        self.last_state = {
            "speaking": is_speaking,
            "mouth": mouth_state,
            "blinking": is_blinking,
            "audio_energy": audio_energy
        }

    def shutdown(self):
        self.is_initialized = False


import collections

class VideoFrameSequence:
    """
    Loads and manages a sequence of frames for Idle, Speaking, or Action video loops.
    Supports both image files (.png, .jpg, etc.) and video files (.mp4, .webm, etc.).
    Uses JPEG byte buffer in memory with an active surface ring cache to eliminate repeated CPU JPEG decompression.
    """
    def __init__(self, file_path: Optional[str], target_width: int = 720, target_height: int = 1280, ffmpeg_bin: Optional[str] = None, fps: int = 25, max_duration: int = 120):
        self.static_surf = None
        self.frame_bytes = []
        self.fps = fps
        self.target_width = target_width
        self.target_height = target_height
        self._surface_cache = {}
        self._cache_keys = collections.deque()
        self._max_cache = 75  # Cache up to 75 decoded surfaces (~270MB RAM), saves massive CPU
        
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
            from live_studio.execution.media_pipeline import get_ffmpeg_binary
            ffmpeg_exe = ffmpeg_bin or get_ffmpeg_binary()
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
                startupinfo = None
                if os.name == 'nt':
                    startupinfo = subprocess.STARTUPINFO()
                    startupinfo.dwFlags |= subprocess.STARTF_USESHOWWINDOW
                    startupinfo.wShowWindow = 0
                res = subprocess.run(cmd, capture_output=True, creationflags=flags, startupinfo=startupinfo)
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
        cached = self._surface_cache.get(idx)
        if cached is not None:
            return cached
        try:
            surf = self.pygame.image.load(self.io.BytesIO(self.frame_bytes[idx]))
            self._surface_cache[idx] = surf
            self._cache_keys.append(idx)
            if len(self._cache_keys) > self._max_cache:
                oldest = self._cache_keys.popleft()
                self._surface_cache.pop(oldest, None)
            return surf
        except Exception as e:
            logger.error(f"Failed to decode frame {idx}: {e}")
            return None

    def get_frame_by_index(self, idx: int):
        if self.static_surf:
            return self.static_surf
        if not self.frame_bytes:
            return None
        idx = idx % len(self.frame_bytes)
        cached = self._surface_cache.get(idx)
        if cached is not None:
            return cached
        try:
            surf = self.pygame.image.load(self.io.BytesIO(self.frame_bytes[idx]))
            self._surface_cache[idx] = surf
            self._cache_keys.append(idx)
            if len(self._cache_keys) > self._max_cache:
                oldest = self._cache_keys.popleft()
                self._surface_cache.pop(oldest, None)
            return surf
        except Exception as e:
            logger.error(f"Failed to decode frame {idx}: {e}")
            return None

    def __len__(self):
        return 1 if self.static_surf else len(self.frame_bytes)

    def cleanup(self):
        self.frame_bytes.clear()
        self.static_surf = None
        self._surface_cache.clear()
        self._cache_keys.clear()


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
        
        # Pinned Product Overlay
        self._pinned_product: Optional[dict] = None
        self._pinned_product_image_surf = None
        self._last_pinned_product_id: Optional[str] = None
        
        # Resume Playback time accumulators
        self._idle_playback_time = 0.0
        self._speaking_playback_time = 0.0
        # Synchronized Master Clock for Pose-Matched Twin Loops
        self._master_timeline = 0.0
        self._speech_blend_weight = 0.0  # 0.0 = Idle, 1.0 = Speaking (for smooth cross-fade)
        
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
            self.font_overlay_title = self.pygame.font.SysFont("Arial", 22, bold=True)
            self.font_overlay_price = self.pygame.font.SysFont("Arial", 26, bold=True)
            self.font_overlay_sub = self.pygame.font.SysFont("Arial", 16)
            self.font_overlay_badge = self.pygame.font.SysFont("Arial", 16, bold=True)
        except Exception:
            self.font_title = None
            self.font_subtitle = None
            self.font_cta = None
            self.font_overlay_title = None
            self.font_overlay_price = None
            self.font_overlay_sub = None
            self.font_overlay_badge = None
            
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
        self._master_timeline = 0.0
        self._speech_blend_weight = 0.0
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

    def set_pinned_product(self, product_data: dict):
        self._pinned_product = product_data
        pid = product_data.get('product_id')
        if pid != getattr(self, '_last_pinned_product_id', None):
            self._last_pinned_product_id = pid
            self._pinned_product_image_surf = None
            img_url = product_data.get('image_url')
            if img_url:
                import threading
                threading.Thread(target=self._load_pinned_image, args=(img_url,), daemon=True).start()

    def clear_pinned_product(self):
        self._pinned_product = None
        self._pinned_product_image_surf = None
        self._last_pinned_product_id = None

    def _load_pinned_image(self, url: str):
        try:
            import urllib.request
            import io
            req = urllib.request.Request(url, headers={'User-Agent': 'LiveStudio/1.0'})
            with urllib.request.urlopen(req, timeout=3) as resp:
                data = resp.read()
            surf = self.pygame.image.load(io.BytesIO(data))
            surf = self.pygame.transform.smoothscale(surf, (76, 76))
            self._pinned_product_image_surf = surf
        except Exception as e:
            logger.warning(f"Could not load pinned product image from {url}: {e}")

    def _render_pinned_product_overlay(self):
        if not self._pinned_product or not self.available or not self.screen:
            return

        p = self._pinned_product
        card_w, card_h = 660, 130
        card_x, card_y = 30, 90

        # Semi-transparent sleek card surface
        card_surf = self.pygame.Surface((card_w, card_h), self.pygame.SRCALPHA)
        # Background: Dark glass with alpha
        self.pygame.draw.rect(card_surf, (20, 24, 33, 235), (0, 0, card_w, card_h), border_radius=14)
        # Shopee vibrant border
        self.pygame.draw.rect(card_surf, (238, 77, 45, 255), (0, 0, card_w, card_h), width=2, border_radius=14)

        # Badge index: MÃ 01
        idx = p.get('item_index', 1)
        idx_str = f"MÃ {idx:02d}" if isinstance(idx, int) else f"MÃ {idx}"
        badge_w, badge_h = 75, 24
        self.pygame.draw.rect(card_surf, (238, 77, 45), (12, 12, badge_w, badge_h), border_radius=6)
        if hasattr(self, 'font_overlay_badge') and self.font_overlay_badge:
            b_txt = self.font_overlay_badge.render(idx_str, True, (255, 255, 255))
            card_surf.blit(b_txt, (18, 15))

        # Thumbnail
        thumb_x, thumb_y, thumb_size = 12, 42, 76
        if getattr(self, '_pinned_product_image_surf', None):
            card_surf.blit(self._pinned_product_image_surf, (thumb_x, thumb_y))
        else:
            self.pygame.draw.rect(card_surf, (45, 52, 68), (thumb_x, thumb_y, thumb_size, thumb_size), border_radius=8)
            if hasattr(self, 'font_overlay_badge') and self.font_overlay_badge:
                p_txt = self.font_overlay_badge.render(f"#{idx}", True, (238, 77, 45))
                card_surf.blit(p_txt, (thumb_x + 22, thumb_y + 28))

        # Text column (X = 100)
        text_x = 100
        # Product Name
        name = p.get('name', 'Sản phẩm đang ghim')
        if len(name) > 36:
            name = name[:34] + "..."
        if hasattr(self, 'font_overlay_title') and self.font_overlay_title:
            name_txt = self.font_overlay_title.render(name, True, (255, 255, 255))
            card_surf.blit(name_txt, (text_x, 14))

        # Prices
        live_price = p.get('live_price')
        orig_price = p.get('original_price')
        price_y = 48
        price_offset = 0
        if live_price:
            try:
                lp_val = f"{int(float(live_price)):,}đ".replace(',', '.')
            except Exception:
                lp_val = str(live_price)
            if hasattr(self, 'font_overlay_price') and self.font_overlay_price:
                lp_txt = self.font_overlay_price.render(lp_val, True, (255, 77, 79))
                card_surf.blit(lp_txt, (text_x, price_y))
                price_offset = lp_txt.get_width() + 12
            else:
                price_offset = 120

        if orig_price:
            try:
                op_val = f"{int(float(orig_price)):,}đ".replace(',', '.')
            except Exception:
                op_val = str(orig_price)
            if hasattr(self, 'font_overlay_sub') and self.font_overlay_sub:
                op_txt = self.font_overlay_sub.render(op_val, True, (160, 160, 160))
                card_surf.blit(op_txt, (text_x + price_offset, price_y + 6))
                # Strikethrough line
                strike_y = price_y + 6 + op_txt.get_height() // 2
                self.pygame.draw.line(card_surf, (160, 160, 160), (text_x + price_offset, strike_y), (text_x + price_offset + op_txt.get_width(), strike_y), 1)

        # Selling points or CTA
        usp = p.get('selling_points')
        if usp:
            if len(usp) > 42:
                usp = usp[:40] + "..."
            footer_str = f"⭐ {usp}"
        else:
            footer_str = "🔥 Đang ghim trên live • Bấm giỏ hàng góc trái!"

        if hasattr(self, 'font_overlay_sub') and self.font_overlay_sub:
            usp_txt = self.font_overlay_sub.render(footer_str, True, (82, 196, 26))
            card_surf.blit(usp_txt, (text_x, 88))

        # Blit overlay card onto screen
        self.screen.blit(card_surf, (card_x, card_y))

    def notify_speech_start(self):
        self._is_speaking_state = True
        self._last_render_time = time.monotonic()
        # Resume Playback: We do NOT reset _idle_playback_time or _speaking_playback_time

    def notify_speech_stop(self):
        self._is_speaking_state = False
        self._voice_active_hold_timer = 0.0
        self._last_render_time = time.monotonic()
        # Unified timeline continues advancing naturally (NEVER reset timeline)

    def render(self, is_speaking: bool, mouth_state: str, is_blinking: bool, audio_energy: float = 0.0):
        if not self.available or not self.screen:
            return
            
        # Process Pygame events to keep the window responsive
        for event in self.pygame.event.get():
            if event.type == self.pygame.QUIT:
                pass 
                
        now = time.monotonic()
        dt = max(0.0, min(0.1, now - getattr(self, '_last_render_time', now)))
        self._last_render_time = now

        # Determine real-time voice activity via Audio Energy Gating & Hold Buffer
        # - When audio amplitude exceeds threshold: voice is active -> dynamic speaking video
        # - When audio drops (pause, comma, breathing): hold buffer bridges minor consonant gaps (120ms)
        #   before cleanly returning to closed-mouth idle pose!
        VOICE_ENERGY_THRESHOLD = 0.03
        VOICE_HOLD_SEC = 0.12

        if is_speaking:
            if audio_energy >= VOICE_ENERGY_THRESHOLD or mouth_state != MOUTH_STATE_CLOSED:
                self._voice_active_hold_timer = VOICE_HOLD_SEC
                is_actively_voicing = True
            else:
                self._voice_active_hold_timer = max(0.0, getattr(self, '_voice_active_hold_timer', 0.0) - dt)
                is_actively_voicing = (self._voice_active_hold_timer > 0.0)
        else:
            self._voice_active_hold_timer = 0.0
            is_actively_voicing = False

        has_custom_avatar = (
            (self.idle_sequence and len(self.idle_sequence) > 0) or 
            (self.speaking_sequence and len(self.speaking_sequence) > 0) or
            bool(self._current_action_seq)
        )
        
        # Avatar Rendering with Action Support & Unified-Timeline Dynamic/Static Sequence Switching
        if has_custom_avatar:
            surf = None

            # 1. Action Gesture (Highest visual priority: plays to completion)
            if self._current_action_seq and len(self._current_action_seq) > 0:
                surf = self._current_action_seq.get_frame(self._current_action_time)
                self._current_action_time += dt
                if self._current_action_time >= self._current_action_seq.duration:
                    logger.info(f"Action '{self._current_action_id}' finished. Returning to baseline sequence.")
                    self._current_action_seq = None
                    self._current_action_id = None
                    self._current_action_time = 0.0

            # 2. Both Idle and Speaking sequences are available (Phase-Locked Dual-Sequence Avatar)
            # Idle and speaking share the exact same gestures and pose at every second t.
            # When voice frequency is detected -> sample speaking_sequence at frame_idx
            # When silent/paused/resting -> sample idle_sequence at that exact same frame_idx!
            # The master timeline advances continuously without ever resetting to 0.
            # Gestures, posture, hands, and scene remain 100% continuous and coherent!
            elif self.idle_sequence and len(self.idle_sequence) > 0 and self.speaking_sequence and len(self.speaking_sequence) > 0:
                common_frames = min(len(self.idle_sequence.frame_bytes), len(self.speaking_sequence.frame_bytes))
                if common_frames <= 0:
                    common_frames = max(len(self.idle_sequence.frame_bytes), len(self.speaking_sequence.frame_bytes), 1)

                fps = self.idle_sequence.fps if self.idle_sequence.fps > 0 else 25
                frame_idx = int(self._master_timeline * fps) % common_frames
                self._master_timeline += dt

                if is_actively_voicing:
                    # Voice frequency detected -> Instantly switch to speaking sequence at current frame_idx!
                    surf = self.speaking_sequence.get_frame_by_index(frame_idx)
                else:
                    # Silence / Resting -> Instantly display idle sequence at current frame_idx!
                    surf = self.idle_sequence.get_frame_by_index(frame_idx)

            # 3. Only Speaking sequence available
            elif self.speaking_sequence and len(self.speaking_sequence) > 0:
                dur = self.speaking_sequence.duration if self.speaking_sequence.duration > 0 else 1.0
                loop_time = self._master_timeline % dur
                self._master_timeline += dt
                if is_actively_voicing:
                    surf = self.speaking_sequence.get_frame(loop_time)
                else:
                    surf = self.speaking_sequence.get_frame(0.0)

            # 4. Only Idle sequence available
            elif self.idle_sequence and len(self.idle_sequence) > 0:
                dur = self.idle_sequence.duration if self.idle_sequence.duration > 0 else 1.0
                loop_time = self._master_timeline % dur
                self._master_timeline += dt
                surf = self.idle_sequence.get_frame(loop_time)

            if surf:
                self.screen.blit(surf, (0, 0))
                if self._pinned_product:
                    self._render_pinned_product_overlay()
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

        if self._pinned_product:
            self._render_pinned_product_overlay()

    def shutdown(self):
        if self.idle_sequence:
            self.idle_sequence.cleanup()
            self.idle_sequence = None
        if self.speaking_sequence:
            self.speaking_sequence.cleanup()
            self.speaking_sequence = None
        if self.available and self.pygame:
            self.pygame.quit()
