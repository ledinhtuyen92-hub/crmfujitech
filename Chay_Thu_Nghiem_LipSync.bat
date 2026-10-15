@echo off
title Fujitech Live Studio - Phong Thi Nghiem Lip-Sync
echo ========================================================
echo   KHOI DONG PHONG THI NGHIEM LIP-SYNC (AUDIO-DRIVEN)
echo   Che do A: Nguoi mau that (Photorealistic)
echo   Che do B: Avatar Mascot / 2D / Chibi
echo ========================================================
cd /d "%~dp0"
.\live_studio\.venv\Scripts\python.exe live_studio\sandbox_lip_sync.py
if errorlevel 1 (
    echo.
    echo Co loi khi chay ung dung. Vui long kiem tra lai!
    pause
)
