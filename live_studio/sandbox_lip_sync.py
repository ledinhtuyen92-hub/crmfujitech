import os
import sys
import time
import threading
import tkinter as tk
from tkinter import filedialog
import customtkinter as ctk
from PIL import Image, ImageTk
import pygame

# Ensure python path includes current directory
_current_dir = os.path.dirname(os.path.abspath(__file__))
_parent_dir = os.path.dirname(_current_dir)
if _current_dir not in sys.path:
    sys.path.insert(0, _current_dir)
if _parent_dir not in sys.path:
    sys.path.insert(0, _parent_dir)

from live_studio.execution.lip_sync import LipSyncAnalyzer, MOUTH_STATE_CLOSED
from live_studio.execution.experimental_lip_sync_renderer import (
    ExperimentalLipSyncRenderer, MODE_HUMAN, MODE_MASCOT
)

class LipSyncSandboxApp(ctk.CTk):
    def __init__(self):
        super().__init__()
        
        self.title("🧪 Fujitech Live Studio - Phòng Thí Nghiệm Lip-Sync Thời Gian Thực")
        self.geometry("1060x780")
        self.minsize(980, 720)
        
        ctk.set_appearance_mode("dark")
        ctk.set_default_color_theme("blue")
        
        # Paths
        base_assets = os.path.join(_current_dir, "assets")
        self.demo_audio_path = os.path.join(base_assets, "demo_speech.mp3")
        self.demo_idle_path = os.path.join(base_assets, "demo_model.jpg")
        self.demo_speak_path = os.path.join(base_assets, "demo_model_speak.jpg")
        
        # Audio & Renderer engines (Low latency, snappy attack)
        self.audio_analyzer = LipSyncAnalyzer(sensitivity=1.2, smoothing=0.15, noise_gate=0.010)
        self.renderer = ExperimentalLipSyncRenderer()
        
        # Pre-load demo assets if available
        if os.path.exists(self.demo_idle_path):
            self.renderer.load_human_assets(
                self.demo_idle_path,
                self.demo_speak_path if os.path.exists(self.demo_speak_path) else None
            )

        # State
        self.current_mode = MODE_HUMAN
        self.current_audio_file = self.demo_audio_path if os.path.exists(self.demo_audio_path) else ""
        self.is_playing = False
        self.is_looping = True
        self.playback_start_time = 0.0
        self.pause_offset_ms = 0
        self.audio_duration_ms = 0
        self._preview_ctk_image = None
        
        # Pygame mixer init with small 512 buffer for low latency (<12ms)
        try:
            pygame.mixer.init(frequency=44100, size=-16, channels=2, buffer=512)
        except Exception:
            pass
        
        self._build_ui()
        
        # Load initial audio
        if self.current_audio_file and os.path.exists(self.current_audio_file):
            self._load_audio(self.current_audio_file)
            
        # Start 30 FPS render loop
        self.after(30, self._render_loop)

    def _build_ui(self):
        self.grid_columnconfigure(0, weight=0) # Left preview
        self.grid_columnconfigure(1, weight=1) # Right controls
        self.grid_rowconfigure(0, weight=1)
        
        # ==========================================
        # LEFT PANEL: LIVE PREVIEW (360x640)
        # ==========================================
        self.left_frame = ctk.CTkFrame(self, width=380, corner_radius=12, fg_color="#18181f")
        self.left_frame.grid(row=0, column=0, padx=(15, 10), pady=15, sticky="nsew")
        self.left_frame.pack_propagate(False)
        
        # Preview Header
        header_frame = ctk.CTkFrame(self.left_frame, fg_color="transparent")
        header_frame.pack(fill="x", padx=15, pady=(12, 6))
        
        self.status_dot = ctk.CTkLabel(header_frame, text="●", text_color="#28a745", font=ctk.CTkFont(size=18))
        self.status_dot.pack(side="left", padx=(0, 6))
        
        self.preview_title = ctk.CTkLabel(
            header_frame, text="LIVE AVATAR PREVIEW (9:16)",
            font=ctk.CTkFont(size=14, weight="bold"), text_color="#ffffff"
        )
        self.preview_title.pack(side="left")
        
        self.fps_badge = ctk.CTkLabel(
            header_frame, text="30 FPS | 0.8ms",
            font=ctk.CTkFont(size=11), text_color="#888899"
        )
        self.fps_badge.pack(side="right")
        
        # Preview Canvas / Label (360x640)
        self.preview_label = ctk.CTkLabel(self.left_frame, text="", fg_color="#000000", corner_radius=8)
        self.preview_label.pack(padx=10, pady=5)
        self.preview_label.bind("<Button-1>", self._on_preview_clicked)
        
        # Preview Overlay Bar (Bottom of preview)
        overlay_box = ctk.CTkFrame(self.left_frame, fg_color="#22222d", corner_radius=8)
        overlay_box.pack(fill="x", padx=12, pady=(6, 10))
        
        self.mouth_state_label = ctk.CTkLabel(
            overlay_box, text="KHẨU HÌNH: CLOSED",
            font=ctk.CTkFont(size=12, weight="bold"), text_color="#00d2ff"
        )
        self.mouth_state_label.pack(side="left", padx=10, pady=4)
        
        self.open_pct_label = ctk.CTkLabel(
            overlay_box, text="Mở: 0%",
            font=ctk.CTkFont(size=12, weight="bold"), text_color="#ffcc00"
        )
        self.open_pct_label.pack(side="right", padx=10, pady=4)

        # ==========================================
        # RIGHT PANEL: CONTROLS & TUNING
        # ==========================================
        self.right_frame = ctk.CTkScrollableFrame(self, corner_radius=12, fg_color="#1e1e26")
        self.right_frame.grid(row=0, column=1, padx=(10, 15), pady=15, sticky="nsew")
        
        # Title
        title_box = ctk.CTkLabel(
            self.right_frame, text="BẢNG ĐIỀU KHIỂN & TINH CHỈNH LIP-SYNC",
            font=ctk.CTkFont(size=17, weight="bold"), text_color="#ffffff"
        )
        title_box.pack(anchor="w", padx=10, pady=(5, 12))
        
        # 1. MODE SELECTION
        mode_box = ctk.CTkFrame(self.right_frame, fg_color="#262633", corner_radius=10)
        mode_box.pack(fill="x", padx=5, pady=6)
        
        ctk.CTkLabel(
            mode_box, text="CHỌN CHẾ ĐỘ THỬ NGHIỆM:",
            font=ctk.CTkFont(size=12, weight="bold"), text_color="#a0a5b5"
        ).pack(anchor="w", padx=15, pady=(10, 5))
        
        self.mode_selector = ctk.CTkSegmentedButton(
            mode_box,
            values=["👤 Hướng A: Người Mẫu Thật (Photorealistic)", "🤖 Hướng B: Avatar Mascot / 2D / Chibi"],
            command=self._on_mode_changed,
            height=36,
            font=ctk.CTkFont(size=12, weight="bold"),
            selected_color="#0066ff",
            selected_hover_color="#0052cc"
        )
        self.mode_selector.set("👤 Hướng A: Người Mẫu Thật (Photorealistic)")
        self.mode_selector.pack(fill="x", padx=15, pady=(0, 12))

        # 2. AUDIO TRANSPORT & VU METER
        audio_frame = ctk.CTkFrame(self.right_frame, fg_color="#262633", corner_radius=10)
        audio_frame.pack(fill="x", padx=5, pady=6)
        
        ctk.CTkLabel(
            audio_frame, text="NGUỒN ÂM THANH TTS (AUDIO INPUT):",
            font=ctk.CTkFont(size=12, weight="bold"), text_color="#a0a5b5"
        ).pack(anchor="w", padx=15, pady=(10, 5))
        
        # File selector row
        file_row = ctk.CTkFrame(audio_frame, fg_color="transparent")
        file_row.pack(fill="x", padx=15, pady=4)
        
        self.audio_path_entry = ctk.CTkEntry(file_row, placeholder_text="Chưa chọn file âm thanh", height=32, font=ctk.CTkFont(size=11))
        self.audio_path_entry.pack(side="left", fill="x", expand=True, padx=(0, 6))
        if self.current_audio_file:
            self.audio_path_entry.insert(0, os.path.basename(self.current_audio_file))
            
        self.btn_browse_audio = ctk.CTkButton(
            file_row, text="📁 Chọn File", width=85, height=32, command=self._browse_audio,
            fg_color="#333344", hover_color="#444455"
        )
        self.btn_browse_audio.pack(side="left", padx=(0, 6))
        
        self.btn_demo_audio = ctk.CTkButton(
            file_row, text="🎵 Audio Mẫu", width=95, height=32, command=self._load_demo_audio,
            fg_color="#007799", hover_color="#006688"
        )
        self.btn_demo_audio.pack(side="left")

        # Transport Buttons
        transport_row = ctk.CTkFrame(audio_frame, fg_color="transparent")
        transport_row.pack(fill="x", padx=15, pady=8)
        
        self.btn_play = ctk.CTkButton(
            transport_row, text="▶ PHÁT AUDIO", command=self._toggle_playback,
            height=36, font=ctk.CTkFont(size=12, weight="bold"), fg_color="#28a745", hover_color="#218838"
        )
        self.btn_play.pack(side="left", fill="x", expand=True, padx=(0, 6))
        
        self.btn_stop = ctk.CTkButton(
            transport_row, text="⏹ DỪNG", command=self._stop_playback,
            width=80, height=36, font=ctk.CTkFont(size=12, weight="bold"), fg_color="#dc3545", hover_color="#c82333"
        )
        self.btn_stop.pack(side="left", padx=(0, 10))
        
        self.loop_var = ctk.BooleanVar(value=True)
        self.loop_check = ctk.CTkCheckBox(
            transport_row, text="Lặp vô tận", variable=self.loop_var,
            font=ctk.CTkFont(size=12), width=20
        )
        self.loop_check.pack(side="left")

        # VU METER CANVAS
        ctk.CTkLabel(
            audio_frame, text="Dải Tần & Âm Lượng Sóng Âm (VU Meter):",
            font=ctk.CTkFont(size=11), text_color="#888899"
        ).pack(anchor="w", padx=15, pady=(4, 2))
        
        self.vu_canvas = tk.Canvas(audio_frame, height=34, bg="#14141a", highlightthickness=0)
        self.vu_canvas.pack(fill="x", padx=15, pady=(2, 6))
        
        # Mouth Aperture Gauge
        gauge_row = ctk.CTkFrame(audio_frame, fg_color="transparent")
        gauge_row.pack(fill="x", padx=15, pady=(2, 10))
        
        ctk.CTkLabel(gauge_row, text="Độ Mở Miệng:", font=ctk.CTkFont(size=11), text_color="#888899").pack(side="left", padx=(0, 8))
        self.aperture_progress = ctk.CTkProgressBar(gauge_row, height=12, progress_color="#ffcc00", fg_color="#333344")
        self.aperture_progress.pack(side="left", fill="x", expand=True)
        self.aperture_progress.set(0.0)

        # 3. REAL-TIME TUNING SLIDERS
        tuning_frame = ctk.CTkFrame(self.right_frame, fg_color="#262633", corner_radius=10)
        tuning_frame.pack(fill="x", padx=5, pady=6)
        
        ctk.CTkLabel(
            tuning_frame, text="THAM SỐ ĐIỀU KHIỂN ÂM THANH (AUDIO TUNING):",
            font=ctk.CTkFont(size=12, weight="bold"), text_color="#a0a5b5"
        ).pack(anchor="w", padx=15, pady=(10, 5))

        # Slider 1: Sensitivity
        s1_frame = ctk.CTkFrame(tuning_frame, fg_color="transparent")
        s1_frame.pack(fill="x", padx=15, pady=4)
        ctk.CTkLabel(s1_frame, text="Độ nhạy âm thanh (Sensitivity):", font=ctk.CTkFont(size=12)).pack(side="left")
        self.lbl_sens_val = ctk.CTkLabel(s1_frame, text="1.2x", font=ctk.CTkFont(size=12, weight="bold"), text_color="#00d2ff")
        self.lbl_sens_val.pack(side="right")
        
        self.slider_sens = ctk.CTkSlider(tuning_frame, from_=0.5, to=2.5, number_of_steps=40, command=self._on_param_changed)
        self.slider_sens.set(1.2)
        self.slider_sens.pack(fill="x", padx=15, pady=(0, 6))

        # Slider 2: EMA Smoothing
        s2_frame = ctk.CTkFrame(tuning_frame, fg_color="transparent")
        s2_frame.pack(fill="x", padx=15, pady=4)
        ctk.CTkLabel(s2_frame, text="Độ mượt phản hồi (Smoothing - Thấp là khớp nhanh):", font=ctk.CTkFont(size=12)).pack(side="left")
        self.lbl_smooth_val = ctk.CTkLabel(s2_frame, text="0.15 (Khớp tức thì)", font=ctk.CTkFont(size=12, weight="bold"), text_color="#00d2ff")
        self.lbl_smooth_val.pack(side="right")
        
        self.slider_smooth = ctk.CTkSlider(tuning_frame, from_=0.05, to=0.50, number_of_steps=45, command=self._on_param_changed)
        self.slider_smooth.set(0.15)
        self.slider_smooth.pack(fill="x", padx=15, pady=(0, 6))

        # Slider 3: Noise Gate
        s3_frame = ctk.CTkFrame(tuning_frame, fg_color="transparent")
        s3_frame.pack(fill="x", padx=15, pady=4)
        ctk.CTkLabel(s3_frame, text="Lọc nhiễu / Hơi thở (Noise Gate):", font=ctk.CTkFont(size=12)).pack(side="left")
        self.lbl_gate_val = ctk.CTkLabel(s3_frame, text="0.010", font=ctk.CTkFont(size=12, weight="bold"), text_color="#00d2ff")
        self.lbl_gate_val.pack(side="right")
        
        self.slider_gate = ctk.CTkSlider(tuning_frame, from_=0.005, to=0.040, number_of_steps=35, command=self._on_param_changed)
        self.slider_gate.set(0.010)
        self.slider_gate.pack(fill="x", padx=15, pady=(0, 10))

        # 4. MODE SPECIFIC SETTINGS
        self.mode_specific_frame = ctk.CTkFrame(self.right_frame, fg_color="#262633", corner_radius=10)
        self.mode_specific_frame.pack(fill="x", padx=5, pady=6)
        
        self._build_mode_specific_controls()

    def _build_mode_specific_controls(self):
        # Clear existing controls
        for child in self.mode_specific_frame.winfo_children():
            child.destroy()
            
        if self.current_mode == MODE_HUMAN:
            # Mode A controls
            ctk.CTkLabel(
                self.mode_specific_frame, text="THIẾT LẬP VÙNG MIỆNG NGƯỜI MẪU THẬT:",
                font=ctk.CTkFont(size=12, weight="bold"), text_color="#a0a5b5"
            ).pack(anchor="w", padx=15, pady=(10, 5))

            # Asset selection row
            asset_row = ctk.CTkFrame(self.mode_specific_frame, fg_color="transparent")
            asset_row.pack(fill="x", padx=15, pady=4)
            
            btn_idle = ctk.CTkButton(
                asset_row, text="📷 Chọn Ảnh Lúc Nghỉ", width=140, height=32,
                command=lambda: self._browse_image(is_idle=True), fg_color="#3b3b4f"
            )
            btn_idle.pack(side="left", padx=(0, 8))
            
            btn_speak = ctk.CTkButton(
                asset_row, text="👄 Chọn Ảnh Lúc Nói", width=140, height=32,
                command=lambda: self._browse_image(is_idle=False), fg_color="#3b3b4f"
            )
            btn_speak.pack(side="left")

            # Guide Checkbox
            self.guide_check_var = ctk.BooleanVar(value=self.renderer.show_mouth_guide)
            self.guide_check = ctk.CTkCheckBox(
                self.mode_specific_frame, text="🎯 Hiện vòng căn chỉnh (Hoặc click trực tiếp lên môi trên ảnh)",
                variable=self.guide_check_var, command=self._on_guide_toggle,
                font=ctk.CTkFont(size=12)
            )
            self.guide_check.pack(padx=15, pady=(6, 6), anchor="w")

            # Center Y Slider
            cy_frame = ctk.CTkFrame(self.mode_specific_frame, fg_color="transparent")
            cy_frame.pack(fill="x", padx=15, pady=4)
            ctk.CTkLabel(cy_frame, text="Tọa độ tâm miệng Y (Vertical):", font=ctk.CTkFont(size=12)).pack(side="left")
            self.lbl_cy_val = ctk.CTkLabel(cy_frame, text=f"{self.renderer.mouth_center_y} px", font=ctk.CTkFont(size=12, weight="bold"), text_color="#ffcc00")
            self.lbl_cy_val.pack(side="right")
            
            self.slider_cy = ctk.CTkSlider(
                self.mode_specific_frame, from_=350, to=650, number_of_steps=60,
                command=self._on_human_param_changed
            )
            self.slider_cy.set(self.renderer.mouth_center_y)
            self.slider_cy.pack(fill="x", padx=15, pady=(0, 6))

            # Mouth Radius Slider
            r_frame = ctk.CTkFrame(self.mode_specific_frame, fg_color="transparent")
            r_frame.pack(fill="x", padx=15, pady=4)
            ctk.CTkLabel(r_frame, text="Bán kính vùng hòa trộn miệng:", font=ctk.CTkFont(size=12)).pack(side="left")
            self.lbl_r_val = ctk.CTkLabel(r_frame, text=f"{self.renderer.mouth_radius} px", font=ctk.CTkFont(size=12, weight="bold"), text_color="#ffcc00")
            self.lbl_r_val.pack(side="right")
            
            self.slider_r = ctk.CTkSlider(
                self.mode_specific_frame, from_=40, to=130, number_of_steps=90,
                command=self._on_human_param_changed
            )
            self.slider_r.set(self.renderer.mouth_radius)
            self.slider_r.pack(fill="x", padx=15, pady=(0, 10))

        else:
            # Mode B controls
            ctk.CTkLabel(
                self.mode_specific_frame, text="THIẾT LẬP AVATAR MASCOT / 2D / CHIBI:",
                font=ctk.CTkFont(size=12, weight="bold"), text_color="#a0a5b5"
            ).pack(anchor="w", padx=15, pady=(10, 5))

            # Bounce intensity slider
            b_frame = ctk.CTkFrame(self.mode_specific_frame, fg_color="transparent")
            b_frame.pack(fill="x", padx=15, pady=4)
            ctk.CTkLabel(b_frame, text="Độ nhún nhảy theo nhịp nói (Body Bounce):", font=ctk.CTkFont(size=12)).pack(side="left")
            self.lbl_bounce_val = ctk.CTkLabel(b_frame, text=f"{self.renderer.mascot_bounce_intensity:.0f} px", font=ctk.CTkFont(size=12, weight="bold"), text_color="#ffcc00")
            self.lbl_bounce_val.pack(side="right")
            
            self.slider_bounce = ctk.CTkSlider(
                self.mode_specific_frame, from_=0, to=20, number_of_steps=20,
                command=self._on_mascot_param_changed
            )
            self.slider_bounce.set(self.renderer.mascot_bounce_intensity)
            self.slider_bounce.pack(fill="x", padx=15, pady=(0, 8))

            # Color Picker row
            color_row = ctk.CTkFrame(self.mode_specific_frame, fg_color="transparent")
            color_row.pack(fill="x", padx=15, pady=(4, 10))
            ctk.CTkLabel(color_row, text="Màu chủ đạo Mascot:", font=ctk.CTkFont(size=12)).pack(side="left", padx=(0, 10))
            
            colors = [
                ("Xanh Dương", (66, 133, 244)),
                ("Xanh Lá", (52, 168, 83)),
                ("Đỏ Cam", (234, 67, 53)),
                ("Tím Pastel", (142, 68, 173)),
                ("Hồng Cute", (233, 30, 99))
            ]
            for name, rgb in colors:
                btn = ctk.CTkButton(
                    color_row, text=name, width=65, height=28,
                    fg_color=f"#{rgb[0]:02x}{rgb[1]:02x}{rgb[2]:02x}",
                    command=lambda c=rgb: self._set_mascot_color(c)
                )
                btn.pack(side="left", padx=3)

    def _on_mode_changed(self, value):
        if "Người Mẫu Thật" in value:
            self.current_mode = MODE_HUMAN
        else:
            self.current_mode = MODE_MASCOT
        self._build_mode_specific_controls()

    def _on_param_changed(self, _=None):
        sens = round(self.slider_sens.get(), 2)
        smooth = round(self.slider_smooth.get(), 2)
        gate = round(self.slider_gate.get(), 3)
        
        self.lbl_sens_val.configure(text=f"{sens}x")
        self.lbl_smooth_val.configure(text=f"{smooth:.2f}")
        self.lbl_gate_val.configure(text=f"{gate:.3f}")
        
        self.audio_analyzer.sensitivity = sens
        self.audio_analyzer.smoothing = smooth
        self.audio_analyzer.noise_gate = gate

    def _on_human_param_changed(self, _=None):
        cy = int(self.slider_cy.get())
        r = int(self.slider_r.get())
        self.lbl_cy_val.configure(text=f"{cy} px")
        self.lbl_r_val.configure(text=f"{r} px")
        self.renderer.set_mouth_coordinates(self.renderer.mouth_center_x, cy, r)

    def _on_guide_toggle(self):
        self.renderer.show_mouth_guide = self.guide_check_var.get()

    def _on_preview_clicked(self, event):
        """Click anywhere on preview image to center mouth region."""
        if self.current_mode == MODE_HUMAN:
            # Scale from 360x640 preview coordinates to 720x1280 render coordinates
            cx = max(50, min(self.renderer.width - 50, int(event.x * 2.0)))
            cy = max(50, min(self.renderer.height - 50, int(event.y * 2.0)))
            self.renderer.mouth_center_x = cx
            self.renderer.mouth_center_y = cy
            if hasattr(self, 'slider_cy'):
                self.slider_cy.set(cy)
                self.lbl_cy_val.configure(text=f"{cy} px")
            logger.info(f"Mouth center set to ({cx}, {cy})")

    def _on_mascot_param_changed(self, _=None):
        bounce = round(self.slider_bounce.get(), 1)
        self.lbl_bounce_val.configure(text=f"{bounce:.0f} px")
        self.renderer.mascot_bounce_intensity = bounce

    def _set_mascot_color(self, rgb):
        self.renderer.mascot_color = rgb

    def _browse_audio(self):
        f = filedialog.askopenfilename(filetypes=[("Audio files", "*.mp3 *.wav *.ogg *.m4a")])
        if f:
            self._load_audio(f)

    def _load_demo_audio(self):
        if os.path.exists(self.demo_audio_path):
            self._load_audio(self.demo_audio_path)

    def _load_audio(self, filepath):
        self.current_audio_file = filepath
        self.audio_path_entry.delete(0, "end")
        self.audio_path_entry.insert(0, os.path.basename(filepath))
        
        # Prepare analyzer
        self.audio_analyzer.prepare(filepath, "Test Speech")
        
        # Load into pygame mixer
        try:
            pygame.mixer.music.load(filepath)
            # Use exact PCM duration from analyzer to prevent loop drift
            if hasattr(self.audio_analyzer, 'duration_ms') and self.audio_analyzer.duration_ms > 0:
                self.audio_duration_ms = self.audio_analyzer.duration_ms
            else:
                sound = pygame.mixer.Sound(filepath)
                self.audio_duration_ms = int(sound.get_length() * 1000)
        except Exception as e:
            logger.error(f"Failed to load audio into pygame: {e}")
            self.audio_duration_ms = 10000

    def _browse_image(self, is_idle: bool):
        f = filedialog.askopenfilename(filetypes=[("Image files", "*.jpg *.jpeg *.png *.webp")])
        if f:
            if is_idle:
                self.demo_idle_path = f
                self.renderer.load_human_assets(self.demo_idle_path, self.demo_speak_path if os.path.exists(self.demo_speak_path) else None)
            else:
                self.demo_speak_path = f
                self.renderer.load_human_assets(self.demo_idle_path, self.demo_speak_path)

    def _toggle_playback(self):
        if self.is_playing:
            # Pause
            pygame.mixer.music.pause()
            self.is_playing = False
            self.btn_play.configure(text="▶ TIẾP TỤC", fg_color="#28a745")
            self.status_dot.configure(text_color="#888899")
        else:
            if not self.current_audio_file or not os.path.exists(self.current_audio_file):
                return
            # Play or Unpause
            if self.pause_offset_ms > 0:
                pygame.mixer.music.unpause()
            else:
                pygame.mixer.music.play(-1 if self.loop_var.get() else 0)
                
            self.is_playing = True
            self.btn_play.configure(text="⏸ TẠM DỪNG", fg_color="#ffc107", hover_color="#e0a800")
            self.status_dot.configure(text_color="#28a745")

    def _stop_playback(self):
        pygame.mixer.music.stop()
        self.is_playing = False
        self.pause_offset_ms = 0
        self.btn_play.configure(text="▶ PHÁT AUDIO", fg_color="#28a745")
        self.status_dot.configure(text_color="#888899")
        self.audio_analyzer.stop()
        self.aperture_progress.set(0.0)
        self.mouth_state_label.configure(text="KHẨU HÌNH: CLOSED", text_color="#888899")
        self.open_pct_label.configure(text="Mở: 0%")

    def _render_loop(self):
        """Runs at ~30 FPS to update audio analysis, visualizer, and preview image."""
        t_start = time.perf_counter()
        
        pos_ms = 0
        if self.is_playing:
            # Check if music has ended (when not looping)
            if not pygame.mixer.music.get_busy() and not self.loop_var.get():
                self._stop_playback()
            else:
                raw_pos = pygame.mixer.music.get_pos()
                if raw_pos >= 0:
                    pos_ms = raw_pos
                    if self.audio_duration_ms > 0:
                        pos_ms = pos_ms % self.audio_duration_ms

        # Extract continuous amplitude and discrete mouth state
        amp = self.audio_analyzer.get_amplitude(pos_ms) if self.is_playing else 0.0
        mouth_state = self.audio_analyzer.get_mouth_state(pos_ms) if self.is_playing else MOUTH_STATE_CLOSED
        
        # Render frame to PIL Image (360x640)
        pil_img = self.renderer.get_preview_pil_image(self.current_mode, amp, mouth_state, preview_w=360, preview_h=640)
        
        # Update CTkImage
        self._preview_ctk_image = ctk.CTkImage(light_image=pil_img, dark_image=pil_img, size=(360, 640))
        self.preview_label.configure(image=self._preview_ctk_image)
        
        # Update UI feedback
        pct = int(amp * 100)
        self.aperture_progress.set(amp)
        self.open_pct_label.configure(text=f"Mở: {pct}%")
        
        state_colors = {
            "CLOSED": "#888899",
            "SMALL": "#00d2ff",
            "MEDIUM": "#28a745",
            "OPEN": "#ff5500",
            "ROUND": "#e040fb"
        }
        self.mouth_state_label.configure(
            text=f"KHẨU HÌNH: {mouth_state}",
            text_color=state_colors.get(mouth_state, "#ffffff")
        )

        # Update VU Meter Canvas
        self._draw_vu_meter(pos_ms)

        # Measure FPS and Latency
        dt = (time.perf_counter() - t_start) * 1000
        fps = min(60, int(1000 / max(1.0, dt)))
        self.fps_badge.configure(text=f"{fps} FPS | {dt:.1f}ms")

        # Schedule next frame in ~33ms (30 FPS)
        self.after(33, self._render_loop)

    def _draw_vu_meter(self, pos_ms):
        self.vu_canvas.delete("all")
        w = self.vu_canvas.winfo_width()
        h = self.vu_canvas.winfo_height()
        if w <= 1:
            return

        bars = self.audio_analyzer.get_waveform_bars(pos_ms, num_bars=24) if self.is_playing else [0.0] * 24
        bar_w = (w - 10) / len(bars)
        
        for i, val in enumerate(bars):
            bar_h = max(2, int(val * (h - 6)))
            x0 = 5 + i * bar_w + 1
            x1 = x0 + bar_w - 2
            y1 = h - 3
            y0 = y1 - bar_h
            
            # Color gradient: Green -> Yellow -> Red
            if val < 0.4:
                color = "#28a745"
            elif val < 0.75:
                color = "#ffc107"
            else:
                color = "#ff4444"
                
            self.vu_canvas.create_rectangle(x0, y0, x1, y1, fill=color, outline="")

def main():
    app = LipSyncSandboxApp()
    app.mainloop()

if __name__ == "__main__":
    main()
