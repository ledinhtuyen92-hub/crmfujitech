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
    Simple 2D Avatar Renderer using Pygame.
    Suitable for OBS Window Capture.
    """
    def __init__(self):
        self.screen = None
        self.clock = None
        self.width = 800
        self.height = 600
        
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
        # Create a window suitable for OBS capture
        self.screen = self.pygame.display.set_mode((self.width, self.height))
        self.pygame.display.set_caption("Fujitech AI Live Avatar (OBS Capture)")
        self.clock = self.pygame.time.Clock()
        
    def render(self, is_speaking: bool, mouth_state: str, is_blinking: bool):
        if not self.available or not self.screen:
            return
            
        # Process Pygame events to keep the window responsive
        for event in self.pygame.event.get():
            if event.type == self.pygame.QUIT:
                pass # Usually we don't quit from the X button in automated livestream, but could handle it
                
        # Clear screen with transparent/chroma-key green
        self.screen.fill((0, 255, 0)) # Green screen
        
        # Draw placeholder avatar body
        self.pygame.draw.rect(self.screen, (100, 100, 250), (300, 300, 200, 300)) # Body
        self.pygame.draw.circle(self.screen, (255, 220, 200), (400, 250), 100)    # Head
        
        # Draw eyes (Blinking)
        if not is_blinking:
            self.pygame.draw.circle(self.screen, (255, 255, 255), (360, 220), 15)
            self.pygame.draw.circle(self.screen, (255, 255, 255), (440, 220), 15)
            self.pygame.draw.circle(self.screen, (0, 0, 0), (360, 220), 5)
            self.pygame.draw.circle(self.screen, (0, 0, 0), (440, 220), 5)
        else:
            self.pygame.draw.line(self.screen, (0, 0, 0), (345, 220), (375, 220), 3)
            self.pygame.draw.line(self.screen, (0, 0, 0), (425, 220), (455, 220), 3)
            
        # Draw mouth based on state
        if mouth_state == "CLOSED":
            self.pygame.draw.line(self.screen, (0, 0, 0), (370, 300), (430, 300), 3)
        elif mouth_state == "SMALL":
            self.pygame.draw.ellipse(self.screen, (0, 0, 0), (380, 295, 40, 10))
        elif mouth_state == "MEDIUM":
            self.pygame.draw.ellipse(self.screen, (0, 0, 0), (375, 290, 50, 20))
        elif mouth_state == "OPEN":
            self.pygame.draw.ellipse(self.screen, (0, 0, 0), (370, 280, 60, 40))
            
        self.pygame.display.flip()

    def shutdown(self):
        if self.available:
            self.pygame.quit()
