import os
import sys
import time
import platform
import subprocess
try:
    import psutil
except ImportError:
    psutil = None
import datetime
from typing import Optional, Dict, Any

class DeviceTelemetry:
    """
    Singleton class managing local hardware specs, runtime telemetry,
    encoder state, and diagnostic generation for Customer Support.
    """
    _instance = None

    def __new__(cls):
        if cls._instance is None:
            cls._instance = super(DeviceTelemetry, cls).__new__(cls)
            cls._instance._init_state()
        return cls._instance

    def _init_state(self):
        self.os_info = f"{platform.system()} {platform.release()} (Build {platform.version()})"
        self.cpu_model = platform.processor() or "Unknown CPU"
        self.gpu_model = self._detect_gpu()
        try:
            self.total_ram_gb = round(psutil.virtual_memory().total / (1024**3), 1) if psutil else 0.0
        except Exception:
            self.total_ram_gb = 0.0
        
        self.encoder_name = "Chưa phát hiện"
        self.encoder_label = "Chờ khởi chạy..."
        self.available_encoders = []
        
        self.stream_state = "idle"  # idle, starting, running, error, stopped
        self.fps = 0
        self.last_error: Optional[str] = None
        self.last_error_time: Optional[str] = None
        self.session_id: Optional[str] = None
        self.device_id: Optional[str] = None
        self.server_url: Optional[str] = None

    def _detect_gpu(self) -> str:
        if sys.platform == 'win32':
            try:
                flags = 0x08000000
                startupinfo = subprocess.STARTUPINFO()
                startupinfo.dwFlags |= subprocess.STARTF_USESHOWWINDOW
                startupinfo.wShowWindow = 0
                out = subprocess.check_output(
                    ['wmic', 'path', 'win32_VideoController', 'get', 'name'],
                    creationflags=flags,
                    startupinfo=startupinfo
                ).decode('utf-8', errors='ignore')
                lines = [line.strip() for line in out.split('\n') if line.strip() and 'Name' not in line]
                if lines:
                    return " / ".join(lines)
            except Exception:
                pass
        return "Unknown GPU"

    def set_encoder(self, encoder: str, available: list = None):
        self.encoder_name = encoder
        if available is not None:
            self.available_encoders = available

        labels = {
            "h264_nvenc": "⚡ Tăng tốc phần cứng NVIDIA NVENC",
            "h264_qsv": "⚡ Tăng tốc phần cứng Intel QuickSync (QSV)",
            "h264_mf": "⚡ Tăng tốc phần cứng Windows Media Foundation",
            "h264_amf": "⚡ Tăng tốc phần cứng AMD AMF",
            "libx264": "🖥️ Bộ xử lý CPU (Phần mềm - Tiết kiệm điện)"
        }
        self.encoder_label = labels.get(encoder, f"Mã hóa: {encoder}")

    def record_error(self, error_msg: str):
        self.last_error = error_msg
        self.last_error_time = datetime.datetime.now().strftime("%H:%M:%S")
        self.stream_state = "error"

    def clear_error(self):
        self.last_error = None
        self.last_error_time = None

    def get_metrics_snapshot(self) -> Dict[str, Any]:
        try:
            cpu_usage = int(psutil.cpu_percent(interval=None))
            ram = psutil.virtual_memory()
            ram_usage = int(ram.percent)
            ram_used_gb = round(ram.used / (1024**3), 1)
        except Exception:
            cpu_usage = 0
            ram_usage = 0
            ram_used_gb = 0

        return {
            "os": self.os_info,
            "cpu_model": self.cpu_model,
            "gpu_model": self.gpu_model,
            "total_ram_gb": self.total_ram_gb,
            "cpu_percent": cpu_usage,
            "ram_percent": ram_usage,
            "ram_used_gb": ram_used_gb,
            "encoder": self.encoder_name,
            "encoder_label": self.encoder_label,
            "available_encoders": self.available_encoders,
            "stream_state": self.stream_state,
            "last_error": self.last_error,
            "last_error_time": self.last_error_time
        }

    def generate_diagnostic_report(self) -> str:
        """
        Creates a friendly, detailed diagnostic text to be copied to clipboard
        and sent to Technical Support via Zalo / Telegram.
        """
        snap = self.get_metrics_snapshot()
        log_path = os.path.join(os.path.expanduser("~"), "fujitech_live_studio.log")
        
        recent_logs = "Không tìm thấy file nhật ký."
        if os.path.exists(log_path):
            try:
                with open(log_path, "r", encoding="utf-8", errors="ignore") as f:
                    lines = f.readlines()
                    recent_logs = "".join(lines[-35:])
            except Exception as e:
                recent_logs = f"Lỗi đọc file nhật ký: {e}"

        now_str = datetime.datetime.now().strftime("%Y-%m-%d %H:%M:%S")
        
        report = f"""======================================================
📋 BÁO CÁO CHẨN ĐOÁN HỆ THỐNG - AUTOTECH LIVE STUDIO
Thời gian tạo: {now_str}
======================================================
[1] THÔNG TIN PHẦN CỨNG MÁY TRẠM:
- Hệ điều hành: {snap['os']}
- Bộ vi xử lý (CPU): {snap['cpu_model']}
- Card đồ họa (GPU): {snap['gpu_model']}
- Bộ nhớ RAM: {snap['total_ram_gb']} GB (Đang dùng: {snap['ram_used_gb']} GB - {snap['ram_percent']}%)
- Tải CPU hiện tại: {snap['cpu_percent']}%

[2] CHẾ ĐỘ MÃ HÓA VIDEO:
- Encoder đang dùng: {snap['encoder']} ({snap['encoder_label']})
- Các encoder hỗ trợ: {', '.join(snap['available_encoders']) or 'Chưa kiểm tra'}
- Trạng thái luồng: {snap['stream_state']}
- Lỗi gần nhất: {snap['last_error'] or 'Không có lỗi'} ({snap['last_error_time'] or 'N/A'})

[3] THÔNG TIN KẾT NỐI:
- Server URL: {self.server_url or 'N/A'}
- Device ID: {self.device_id or 'N/A'}
- Session ID: {self.session_id or 'N/A'}

[4] 35 DÒNG NHẬT KÝ GẦN NHẤT (LOGS):
------------------------------------------------------
{recent_logs.strip()}
======================================================
(Vui lòng gửi toàn bộ nội dung này cho kỹ thuật viên hỗ trợ)
"""
        return report

telemetry = DeviceTelemetry()
