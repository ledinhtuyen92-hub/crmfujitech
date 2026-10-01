import customtkinter as ctk
import requests
import asyncio
import threading
import socket
import logging

logger = logging.getLogger(__name__)

class StudioLauncher(ctk.CTk):
    def __init__(self, on_connect_callback):
        super().__init__()
        self.on_connect_callback = on_connect_callback
        
        self.title("Fujitech Live Studio")
        self.geometry("500x600")
        self.resizable(False, False)
        
        ctk.set_appearance_mode("dark")
        ctk.set_default_color_theme("blue")
        
        self.api_token = None
        self.devices = []
        self.sessions = []
        
        self._build_ui()
        
    def _build_ui(self):
        # Title
        self.title_label = ctk.CTkLabel(self, text="Fujitech Live Studio", font=ctk.CTkFont(size=24, weight="bold"))
        self.title_label.pack(pady=(40, 20))
        
        self.frame = ctk.CTkFrame(self, width=400)
        self.frame.pack(pady=20, padx=50, fill="both", expand=True)
        
        # Login Form
        self.server_entry = ctk.CTkEntry(self.frame, placeholder_text="Server URL (e.g. http://localhost:8000)")
        self.server_entry.pack(pady=10, padx=20, fill="x")
        self.server_entry.insert(0, "http://localhost:8000")
        
        self.username_entry = ctk.CTkEntry(self.frame, placeholder_text="Tài khoản CRM")
        self.username_entry.pack(pady=10, padx=20, fill="x")
        
        self.password_entry = ctk.CTkEntry(self.frame, placeholder_text="Mật khẩu", show="*")
        self.password_entry.pack(pady=10, padx=20, fill="x")
        
        self.login_btn = ctk.CTkButton(self.frame, text="Đăng Nhập", command=self.do_login)
        self.login_btn.pack(pady=20, padx=20, fill="x")
        
        self.status_label = ctk.CTkLabel(self.frame, text="", text_color="red")
        self.status_label.pack(pady=5)
        
        # Selection Form (Hidden initially)
        self.selection_frame = ctk.CTkFrame(self.frame, fg_color="transparent")
        
        self.device_combo = ctk.CTkComboBox(self.selection_frame, values=["Đang tải thiết bị..."])
        self.device_combo.pack(pady=10, fill="x")
        
        self.session_combo = ctk.CTkComboBox(self.selection_frame, values=["Đang tải phiên Live..."])
        self.session_combo.pack(pady=10, fill="x")
        
        self.connect_btn = ctk.CTkButton(self.selection_frame, text="Kết Nối & Bắt Đầu", command=self.do_connect, fg_color="#28a745", hover_color="#218838")
        self.connect_btn.pack(pady=20, fill="x")

    def show_error(self, msg):
        self.status_label.configure(text=msg, text_color="red")
        
    def show_success(self, msg):
        self.status_label.configure(text=msg, text_color="#28a745")
        
    def do_login(self):
        server = self.server_entry.get().strip("/")
        username = self.username_entry.get()
        password = self.password_entry.get()
        
        if not server or not username or not password:
            self.show_error("Vui lòng điền đủ thông tin")
            return
            
        self.login_btn.configure(state="disabled", text="Đang đăng nhập...")
        
        # Run in thread
        threading.Thread(target=self._api_login, args=(server, username, password), daemon=True).start()

    def _api_login(self, server, username, password):
        try:
            res = requests.post(f"{server}/api/users/login/", json={"username": username, "password": password}, timeout=5)
            if res.status_code == 200:
                self.api_token = res.json().get("access")
                self.server_url = server
                self.after(0, self.on_login_success)
            else:
                self.after(0, lambda: self.show_error("Sai tài khoản hoặc mật khẩu"))
                self.after(0, lambda: self.login_btn.configure(state="normal", text="Đăng Nhập"))
        except Exception as e:
            self.after(0, lambda: self.show_error(f"Lỗi kết nối: {str(e)}"))
            self.after(0, lambda: self.login_btn.configure(state="normal", text="Đăng Nhập"))

    def on_login_success(self):
        self.show_success("Đăng nhập thành công!")
        self.server_entry.configure(state="disabled")
        self.username_entry.configure(state="disabled")
        self.password_entry.configure(state="disabled")
        self.login_btn.pack_forget()
        
        self.selection_frame.pack(fill="both", expand=True, padx=20, pady=10)
        
        threading.Thread(target=self._fetch_data, daemon=True).start()

    def _fetch_data(self):
        headers = {"Authorization": f"Bearer {self.api_token}"}
        try:
            # Get Devices
            d_res = requests.get(f"{self.server_url}/api/live_sessions/devices/", headers=headers, timeout=5)
            if d_res.status_code == 200:
                self.devices = d_res.json()
            else:
                self.devices = []
                
            # If no device, create one automatically
            if not self.devices:
                hostname = socket.gethostname()
                create_res = requests.post(f"{self.server_url}/api/live_sessions/devices/", json={"name": hostname, "is_active": True}, headers=headers)
                if create_res.status_code in [201, 200]:
                    self.devices = [create_res.json()]
            
            # Get Sessions
            s_res = requests.get(f"{self.server_url}/api/live_sessions/sessions/", headers=headers, timeout=5)
            if s_res.status_code == 200:
                self.sessions = s_res.json()
            else:
                self.sessions = []
                
            self.after(0, self._update_combos)
        except Exception as e:
            self.after(0, lambda: self.show_error(f"Lỗi tải dữ liệu: {e}"))

    def _update_combos(self):
        if not self.devices:
            self.device_combo.configure(values=["Không tìm thấy máy chủ"])
        else:
            self.device_combo.configure(values=[d['name'] for d in self.devices])
            self.device_combo.set(self.devices[0]['name'])
            
        if not self.sessions:
            self.session_combo.configure(values=["Không có phiên Live nào"])
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
        self.withdraw() # Hide GUI
        # Start async engine
        def run_async():
            asyncio.run(self.on_connect_callback(config))
        threading.Thread(target=run_async, daemon=True).start()
