import customtkinter as ctk
import requests
import asyncio
import threading
import socket
import logging
import json
import os
import time
import psutil
import platform
import subprocess
import sys
from PIL import Image

# Setup file logging
log_path = os.path.join(os.path.expanduser("~"), "fujitech_live_studio.log")
logging.basicConfig(
    filename=log_path,
    level=logging.DEBUG,
    format='%(asctime)s - %(levelname)s - %(message)s'
)
logger = logging.getLogger(__name__)

class StudioLauncher(ctk.CTk):
    def __init__(self, on_connect_callback):
        super().__init__()
        self.on_connect_callback = on_connect_callback
        
        self.title("Autotech Live Studio")
        self.geometry("500x600")
        self.resizable(False, False)
        
        self.config_path = os.path.join(os.path.expanduser("~"), ".fujitech_live_studio.json")
        self.config_data = {}
        if os.path.exists(self.config_path):
            try:
                with open(self.config_path, "r") as f:
                    self.config_data = json.load(f)
            except:
                pass
        
        ctk.set_appearance_mode("dark")
        ctk.set_default_color_theme("blue")
        
        self.api_token = None
        self.devices = []
        self.sessions = []
        
        # Load Server URL dynamically
        if getattr(sys, 'frozen', False):
            base_dir = os.path.dirname(sys.executable)
        else:
            base_dir = os.path.dirname(os.path.abspath(__file__))
            
        self.server_config_path = os.path.join(base_dir, "server_config.txt")
        self.server_url = "http://localhost:8000"
        if os.path.exists(self.server_config_path):
            try:
                with open(self.server_config_path, "r") as f:
                    content = f.read().strip()
                    if content:
                        self.server_url = content
            except Exception as e:
                logger.error(f"Error reading server config: {e}")
                
        self._build_ui(base_dir)
        
    def _build_ui(self, base_dir):
        # Background Image
        bg_path = os.path.join(base_dir, "assets", "bg.jpg")
        master_widget = self
        if os.path.exists(bg_path):
            self.bg_image = ctk.CTkImage(Image.open(bg_path), size=(500, 600))
            self.bg_label = ctk.CTkLabel(self, text="", image=self.bg_image)
            self.bg_label.place(x=0, y=0, relwidth=1, relheight=1)
            
        # Glass-like Frame
        self.frame = ctk.CTkFrame(master_widget, width=380, corner_radius=15, fg_color="#1e1e24", border_width=1, border_color="#3b3b4f", bg_color="transparent")
        self.frame.pack(pady=40, padx=40, fill="both", expand=True)
        
        # Logo
        logo_path = os.path.join(base_dir, "assets", "logo.jpg")
        if os.path.exists(logo_path):
            self.logo_image = ctk.CTkImage(Image.open(logo_path), size=(100, 100))
            self.logo_label = ctk.CTkLabel(self.frame, text="", image=self.logo_image)
            self.logo_label.pack(pady=(20, 5))
            
        # Title
        self.title_label = ctk.CTkLabel(self.frame, text="Autotech Live Studio", font=ctk.CTkFont(family="Segoe UI", size=22, weight="bold"), text_color="#ffffff")
        self.title_label.pack(pady=(0, 20))
        
        # Login Form
        self.workspace_entry = ctk.CTkEntry(self.frame, placeholder_text="Mã Công ty (Workspace ID)", height=40, font=ctk.CTkFont(size=13), corner_radius=8)
        self.workspace_entry.pack(pady=(30, 10), padx=30, fill="x")
        
        self.username_entry = ctk.CTkEntry(self.frame, placeholder_text="Tài khoản CRM", height=40, font=ctk.CTkFont(size=13), corner_radius=8)
        self.username_entry.pack(pady=10, padx=30, fill="x")
        
        self.password_entry = ctk.CTkEntry(self.frame, placeholder_text="Mật khẩu", show="*", height=40, font=ctk.CTkFont(size=13), corner_radius=8)
        self.password_entry.pack(pady=10, padx=30, fill="x")
        
        self.remember_var = ctk.StringVar(value="off")
        self.remember_checkbox = ctk.CTkCheckBox(self.frame, text="Ghi nhớ tài khoản", variable=self.remember_var, onvalue="on", offvalue="off", checkbox_width=18, checkbox_height=18)
        self.remember_checkbox.pack(pady=(5, 5), padx=30, anchor="w")
        
        self.login_btn = ctk.CTkButton(self.frame, text="ĐĂNG NHẬP", command=self.do_login, height=45, font=ctk.CTkFont(size=14, weight="bold"), corner_radius=8, fg_color="#0066ff", hover_color="#0055cc")
        self.login_btn.pack(pady=(20, 10), padx=30, fill="x")
        
        self.status_label = ctk.CTkLabel(self.frame, text="", text_color="red")
        self.status_label.pack(pady=5)
        
        # Selection Form (Hidden initially)
        self.selection_frame = ctk.CTkFrame(self.frame, fg_color="transparent")
        
        self.device_combo = ctk.CTkComboBox(self.selection_frame, values=["Đang tải thiết bị..."])
        self.device_combo.pack(pady=10, fill="x")
        
        self.session_combo = ctk.CTkComboBox(self.selection_frame, values=["Đang tải phiên Live..."])
        self.session_combo.pack(pady=10, fill="x")
        
        self.refresh_btn = ctk.CTkButton(self.selection_frame, text="Làm mới danh sách", command=self.do_refresh, fg_color="transparent", border_width=1, text_color=("gray10", "#DCE4EE"))
        self.refresh_btn.pack(pady=(5, 10), fill="x")
        
        self.connect_btn = ctk.CTkButton(self.selection_frame, text="Kết Nối & Bắt Đầu", command=self.do_connect, fg_color="#28a745", hover_color="#218838")
        self.connect_btn.pack(pady=20, fill="x")
        
        # Dashboard Form (Hidden initially)
        self.dashboard_frame = ctk.CTkFrame(self.frame, fg_color="transparent")
        
        self.dashboard_title = ctk.CTkLabel(self.dashboard_frame, text="Trạm Live Đang Chạy", font=ctk.CTkFont(size=20, weight="bold"), text_color="#0066ff")
        self.dashboard_title.pack(pady=(10, 5))
        
        self.dashboard_status = ctk.CTkLabel(self.dashboard_frame, text="Hệ thống xử lý Video đang hoạt động ngầm.\nVui lòng không tắt cửa sổ này.", text_color="#cccccc")
        self.dashboard_status.pack(pady=10)
        
        self.dashboard_spinner = ctk.CTkProgressBar(self.dashboard_frame, mode="indeterminate", width=200)
        self.dashboard_spinner.pack(pady=20)
        
        self.dashboard_hide_btn = ctk.CTkButton(self.dashboard_frame, text="Thu nhỏ (Minimize)", command=self.iconify, fg_color="#333", hover_color="#222")
        self.dashboard_hide_btn.pack(pady=10)
        
        # Bind Enter key to a smart handler
        self.bind('<Return>', self.on_enter_pressed)
        
        # Auto-fill credentials
        if self.config_data.get("remember") == "on":
            self.workspace_entry.insert(0, self.config_data.get("workspace", ""))
            self.username_entry.insert(0, self.config_data.get("username", ""))
            self.password_entry.insert(0, self.config_data.get("password", ""))
            self.remember_checkbox.select()

    def on_enter_pressed(self, event):
        # If selection frame is visible, trigger connect. Else trigger login.
        if self.selection_frame.winfo_viewable():
            self.do_connect()
        else:
            self.do_login()

    def show_error(self, msg):
        self.status_label.configure(text=msg, text_color="red")
        
    def show_success(self, msg):
        self.status_label.configure(text=msg, text_color="#28a745")
        
    def do_login(self):
        server = self.server_url.strip("/")
        username = self.username_entry.get()
        password = self.password_entry.get()
        workspace = self.workspace_entry.get()
        
        if not server or not username or not password or not workspace:
            self.show_error("Vui lòng điền đủ thông tin")
            return
            
        self.login_btn.configure(state="disabled", text="Đang đăng nhập...")
        
        # Run in thread
        threading.Thread(target=self._api_login, args=(server, username, password, workspace), daemon=True).start()

    def _api_login(self, server, username, password, workspace):
        try:
            res = requests.post(f"{server}/api/users/login/", json={"username": username, "password": password, "workspace_id": workspace}, timeout=5)
            if res.status_code == 200:
                self.api_token = res.json().get("access")
                self.server_url = server
                
                # Save credentials if checked
                self.config_data["remember"] = self.remember_var.get()
                if self.remember_var.get() == "on":
                    self.config_data["workspace"] = workspace
                    self.config_data["username"] = username
                    self.config_data["password"] = password
                else:
                    self.config_data.pop("workspace", None)
                    self.config_data.pop("username", None)
                    self.config_data.pop("password", None)
                self._save_config()
                
                self.after(0, self.on_login_success)
            else:
                self.after(0, lambda: self.show_error("Sai tài khoản hoặc mật khẩu"))
                self.after(0, lambda: self.login_btn.configure(state="normal", text="Đăng Nhập"))
        except Exception as e:
            self.after(0, lambda: self.show_error(f"Lỗi kết nối: {str(e)}"))
            self.after(0, lambda: self.login_btn.configure(state="normal", text="Đăng Nhập"))

    def on_login_success(self):
        self.show_success("Đăng nhập thành công!")
        self.workspace_entry.pack_forget()
        self.username_entry.pack_forget()
        self.password_entry.pack_forget()
        self.remember_checkbox.pack_forget()
        self.login_btn.pack_forget()
        
        self.selection_frame.pack(fill="both", expand=True, padx=20, pady=10)
        
        self.local_device_id = self.config_data.get("device_id")
        threading.Thread(target=self._fetch_data, daemon=True).start()

    def _save_config(self):
        try:
            with open(self.config_path, "w") as f:
                json.dump(self.config_data, f)
        except Exception as e:
            logger.error(f"Failed to save config: {e}")

    def _save_local_config(self, device_id):
        self.config_data["device_id"] = device_id
        self.local_device_id = device_id
        self._save_config()

    def _ping_loop(self):
        while True:
            try:
                if hasattr(self, 'local_device_id') and self.local_device_id:
                    cpu_usage = int(psutil.cpu_percent(interval=None))
                    ram_usage = int(psutil.virtual_memory().percent)
                    total_ram = round(psutil.virtual_memory().total / (1024**3), 1)
                    os_version = f"{platform.system()} {platform.release()}"
                    cpu_model = platform.processor()
                    disk_total = round(psutil.disk_usage('/').total / (1024**3), 1)
                    
                    try:
                        gpu_output = subprocess.check_output(
                            ['wmic', 'path', 'win32_VideoController', 'get', 'name'], 
                            creationflags=0x08000000
                        ).decode('utf-8', errors='ignore')
                        gpu_lines = [line.strip() for line in gpu_output.split('\n') if line.strip() and 'Name' not in line]
                        gpu_model = gpu_lines[0] if gpu_lines else "Unknown GPU"
                    except:
                        gpu_model = "Unknown GPU"
                    
                    res = requests.post(
                        f"{self.server_url}/api/live_sessions/devices/{self.local_device_id}/ping/", 
                        json={
                            "cpu_usage": cpu_usage, 
                            "ram_usage": ram_usage,
                            "total_ram_gb": total_ram,
                            "os_version": os_version,
                            "cpu_model": cpu_model,
                            "gpu_model": gpu_model,
                            "disk_total_gb": disk_total
                        },
                        headers={"Authorization": f"Bearer {self.api_token}"}, 
                        timeout=5
                    )
                    if res.status_code != 200:
                        logger.error(f"Ping returned {res.status_code}: {res.text}")
                    else:
                        logger.debug("Ping success")
            except Exception as e:
                logger.error(f"Ping loop exception: {e}")
            time.sleep(15)

    def do_refresh(self):
        self.device_combo.configure(values=["Đang tải thiết bị..."])
        self.device_combo.set("Đang tải thiết bị...")
        self.session_combo.configure(values=["Đang tải phiên Live..."])
        self.session_combo.set("Đang tải phiên Live...")
        self.refresh_btn.configure(state="disabled", text="Đang làm mới...")
        threading.Thread(target=self._fetch_data, daemon=True).start()

    def _fetch_data(self):
        headers = {"Authorization": f"Bearer {self.api_token}"}
        try:
            # Get Devices
            d_res = requests.get(f"{self.server_url}/api/live_sessions/devices/", headers=headers, timeout=5)
            if d_res.status_code == 200:
                data = d_res.json()
                self.devices = data.get("results", data) if isinstance(data, dict) else data
            else:
                self.devices = []
                
            # Check if this PC is registered using local config or hostname
            hostname = socket.gethostname()
            current_device = None
            if self.local_device_id:
                current_device = next((d for d in self.devices if d["id"] == self.local_device_id), None)
            
            if not current_device:
                current_device = next((d for d in self.devices if d["name"] == hostname), None)
                if current_device:
                    self._save_local_config(current_device["id"])

            if not current_device:
                create_res = requests.post(f"{self.server_url}/api/live_sessions/devices/", json={"name": hostname, "is_active": True}, headers=headers)
                if create_res.status_code in [201, 200]:
                    new_device = create_res.json()
                    self.devices.append(new_device)
                    current_device = new_device
                    self._save_local_config(current_device["id"])
                    
            self.current_device_name = current_device["name"] if current_device else None
            
            # Start ping loop if not already started
            if not hasattr(self, '_ping_thread_started'):
                self._ping_thread_started = True
                threading.Thread(target=self._ping_loop, daemon=True).start()
            
            # Get Sessions
            s_res = requests.get(f"{self.server_url}/api/live_sessions/sessions/", headers=headers, timeout=5)
            if s_res.status_code == 200:
                s_data = s_res.json()
                self.sessions = s_data.get("results", s_data) if isinstance(s_data, dict) else s_data
            else:
                self.sessions = []
                
            self.after(0, self._update_combos)
        except Exception as e:
            self.after(0, lambda: self.show_error(f"Lỗi tải dữ liệu: {e}"))
            self.after(0, lambda: self.refresh_btn.configure(state="normal", text="Làm mới danh sách"))

    def _update_combos(self):
        self.refresh_btn.configure(state="normal", text="Làm mới danh sách")
        if not self.devices:
            self.device_combo.configure(values=["Không tìm thấy máy chủ"])
            self.device_combo.set("Không tìm thấy máy chủ")
        else:
            self.device_combo.configure(values=[d['name'] for d in self.devices])
            if hasattr(self, 'current_device_name') and self.current_device_name:
                self.device_combo.set(self.current_device_name)
            else:
                self.device_combo.set(self.devices[0]['name'])
            
        if not self.sessions:
            self.session_combo.configure(values=["Không có phiên Live nào"])
            self.session_combo.set("Không có phiên Live nào")
        else:
            self.session_combo.configure(values=[s['id'] for s in self.sessions])
            self.session_combo.set(self.sessions[0]['id'])
            
    def do_connect(self):
        device_name = self.device_combo.get()
        session_id = self.session_combo.get()
        
        device = next((d for d in self.devices if d['name'] == device_name), None)
        session = next((s for s in self.sessions if s['id'] == session_id), None)
        
        if not device or not session:
            self.show_error("Vui lòng chọn thiết bị và phiên hợp lệ")
            return
            
        self.connect_btn.configure(state="disabled", text="Đang lấy Token...")
        threading.Thread(target=self._get_token_and_connect, args=(device, session_id), daemon=True).start()

    def _get_token_and_connect(self, device, session_id):
        headers = {"Authorization": f"Bearer {self.api_token}"}
        try:
            # Need to get device token (regenerate it so we have the raw token to connect)
            res = requests.post(f"{self.server_url}/api/live_sessions/devices/{device['id']}/regenerate-token/", headers=headers)
            if res.status_code == 200:
                raw_token = res.json().get("token")
                
                # Transform HTTP URL to WS URL
                ws_url = self.server_url.replace("http://", "ws://").replace("https://", "wss://")
                ws_url = f"{ws_url}/ws/live_sessions/{session_id}/device/"
                
                config = {
                    "ws_url": ws_url,
                    "token": raw_token,
                    "session_id": session_id
                }
                
                self.after(0, lambda: self._start_engine(config))
            else:
                self.after(0, lambda: self.show_error("Lỗi xác thực thiết bị"))
                self.after(0, lambda: self.connect_btn.configure(state="normal", text="Kết Nối & Bắt Đầu"))
        except Exception as e:
            self.after(0, lambda: self.show_error(f"Lỗi: {e}"))
            self.after(0, lambda: self.connect_btn.configure(state="normal", text="Kết Nối & Bắt Đầu"))

    def _start_engine(self, config):
        self.selection_frame.pack_forget()
        self.dashboard_frame.pack(fill="both", expand=True, padx=20, pady=10)
        self.dashboard_spinner.start()
        
        # Start async engine
        def run_async():
            asyncio.run(self.on_connect_callback(config))
        threading.Thread(target=run_async, daemon=True).start()
