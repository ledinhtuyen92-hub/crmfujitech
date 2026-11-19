#!/usr/bin/env python3
"""
Script tu dong kiem tra va bo sung location /ws/ cho tat ca cac server block Nginx
tren VPS (bao gom ca block port 80 va block port 443 SSL do Certbot tao ra).
"""
import os
import re
import subprocess
import sys

WS_CONFIG = """
    # WebSocket Real-time (Chat & Thong bao)
    location /ws/ {
        proxy_pass http://127.0.0.1:8000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "upgrade";
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_read_timeout 86400s;
        proxy_send_timeout 86400s;
    }
"""

TARGET_FILES = [
    "/etc/nginx/sites-available/crm",
    "/etc/nginx/sites-enabled/crm",
    "/etc/nginx/sites-available/default",
    "/etc/nginx/sites-enabled/default",
]


def patch_file(filepath):
    if not os.path.exists(filepath):
        return False

    with open(filepath, "r", encoding="utf-8", errors="ignore") as f:
        content = f.read()

    # Kiem tra xem file co phai cau hinh cua CRM khong
    if "8000" not in content and "frontend/dist" not in content and "crm" not in filepath:
        return False

    # Phan tach cac server block
    # Tim tat ca cac vi tri server { ... }
    modified = False
    new_content = ""
    pos = 0

    server_blocks = re.split(r"(server\s*\{)", content)
    # server_blocks[0] la phan truoc server { dau tien
    # server_blocks[1] = "server {", server_blocks[2] = noi dung block, ...
    if len(server_blocks) < 3:
        return False

    result = [server_blocks[0]]
    for i in range(1, len(server_blocks), 2):
        header = server_blocks[i]
        body = server_blocks[i + 1] if i + 1 < len(server_blocks) else ""

        # Kiem tra xem block nay co phuc vu web app hoac api khong
        is_app_block = ("root " in body and "dist" in body) or ("proxy_pass http://127.0.0.1:8000" in body) or ("listen 443" in body)
        # Khong them vao block chi lam nhiem vu redirect 301
        is_redirect_only = "return 301" in body and "location / {" not in body and "proxy_pass" not in body

        if is_app_block and not is_redirect_only and "location /ws/" not in body:
            # Chen ws block ngay truoc location / hoac location ~ ^/ hoac dau ngoac } cuoi cung
            match = re.search(r"(\n\s*location\s*[/~])", body)
            if match:
                insert_idx = match.start(1)
                body = body[:insert_idx] + "\n" + WS_CONFIG + body[insert_idx:]
                modified = True
            else:
                last_brace = body.rfind("}")
                if last_brace != -1:
                    body = body[:last_brace] + "\n" + WS_CONFIG + "\n" + body[last_brace:]
                    modified = True

        result.append(header)
        result.append(body)

    if modified:
        new_text = "".join(result)
        # Sao luu file truoc khi ghi
        try:
            with open(filepath + ".bak", "w", encoding="utf-8") as bf:
                bf.write(content)
        except Exception:
            pass

        with open(filepath, "w", encoding="utf-8") as f:
            f.write(new_text)
        print(f"✅ Da cap nhat cau hinh WebSocket /ws/ vao: {filepath}")
        return True
    else:
        if "location /ws/" in content:
            print(f"ℹ  File {filepath} da co san location /ws/.")
        return False


def main():
    updated = False
    for path in TARGET_FILES:
        if patch_file(path):
            updated = True

    # Kiem tra tat ca cac file trong /etc/nginx/sites-enabled/ neu con file khac
    enabled_dir = "/etc/nginx/sites-enabled"
    if os.path.exists(enabled_dir):
        for fname in os.listdir(enabled_dir):
            fpath = os.path.join(enabled_dir, fname)
            if fpath not in TARGET_FILES:
                if patch_file(fpath):
                    updated = True

    # Test nginx va reload
    test = subprocess.run(["nginx", "-t"], capture_output=True, text=True)
    if test.returncode == 0:
        print("✅ Cau hinh Nginx hop le (nginx -t OK).")
        subprocess.run(["systemctl", "reload", "nginx"])
        print("🚀 Da reload Nginx thanh cong!")
    else:
        print("❌ Nginx test loi:")
        print(test.stderr)
        sys.exit(1)


if __name__ == "__main__":
    main()

