# Fujitech Live Studio Pilot Build

## Build Machine Requirements
- Windows 10/11 64-bit
- Python 3.13.15
- PyInstaller 6.22.3

## End User Runtime Requirements
- Windows 10/11 64-bit
- Internet connection
- `ffmpeg.exe` placed in the `bin/` directory next to the application
- `config.json` containing the device credentials (session_id, token, ws_url)

## Build Process
To build the application:
1. Open PowerShell in the `live_studio/` directory.
2. Execute `.\build.ps1`
3. The standalone Windows application directory will be generated at `dist/FujitechLiveStudio/`.

The build script will:
- Create a local virtual environment.
- Install dependencies from `live_studio/requirements.txt`.
- Run PyInstaller in `--onedir` mode to create the standalone application.

## Configuration & Launch
To configure a device for a Live Session:
1. Create a `config.json` file in the same directory as `FujitechLiveStudio.exe`.
2. Format:
```json
{
    "ws_url": "ws://<server>/ws/live_sessions/<session_id>/device/",
    "token": "ldt_...",
    "session_id": "<session_id>"
}
```
3. Copy `ffmpeg.exe` and `mediamtx.exe` (if testing local stream) into the `bin/` folder next to the executable.
4. Launch `FujitechLiveStudio.exe`.

## Validated Capabilities
- **WebSocket Connection**: The device successfully connects and synchronizes using the provided token.
- **Heartbeat**: Successfully sends status updates.
- **FFmpeg Integration**: The application resolves the bundled `bin/ffmpeg.exe` using PyInstaller `sys.executable` relative paths.
- **Stream Control**: Reacts correctly to `stream_start` and `stream_stop` commands from the server.
- **Reconnection**: Automatically attempts reconnection if the network is interrupted. Will receive a 403/4004 rejection if the session is permanently stopped.
