# -*- mode: python ; coding: utf-8 -*-
from PyInstaller.utils.hooks import collect_all
import os

datas = []
binaries = []

# SPECPATH = directory containing this .spec file = fujitech/live_studio/
# We need fujitech/ (the parent) in sys.path so "import live_studio.xxx" resolves
spec_parent = os.path.dirname(SPECPATH)   # fujitech/

hiddenimports = [
    'pygame', 'websockets', 'requests', 'customtkinter',
    'PIL', 'PIL._tkinter_finder', 'psutil',
    # live_studio submodules – must be listed explicitly for PyInstaller
    'live_studio',
    'live_studio.core',
    'live_studio.core.dispatcher',
    'live_studio.core.state',
    'live_studio.core.ws_client',
    'live_studio.execution',
    'live_studio.execution.ack_manager',
    'live_studio.execution.audio_fetcher',
    'live_studio.execution.audio_player',
    'live_studio.execution.avatar_engine',
    'live_studio.execution.avatar_renderer',
    'live_studio.execution.dedup_registry',
    'live_studio.execution.device_sequence',
    'live_studio.execution.frame_source',
    'live_studio.execution.lip_sync',
    'live_studio.execution.mediamtx_manager',
    'live_studio.execution.media_pipeline',
    'live_studio.execution.queue_manager',
    'live_studio.execution.rtmp_target',
    'live_studio.execution.sequence_validator',
    'live_studio.execution.stream_controller',
    'live_studio.execution.stream_encoder',
    'live_studio.gui',
    'live_studio.gui.launcher',
    'live_studio.protocol',
    'live_studio.protocol.constants',
    'live_studio.protocol.envelopes',
]

tmp_ret = collect_all('customtkinter')
datas += tmp_ret[0]; binaries += tmp_ret[1]; hiddenimports += tmp_ret[2]

a = Analysis(
    ['main.py'],
    # spec_parent = fujitech/ directory, so "import live_studio.xxx" works
    pathex=[SPECPATH, spec_parent],
    binaries=binaries,
    datas=datas,
    hiddenimports=hiddenimports,
    hookspath=[],
    hooksconfig={},
    runtime_hooks=[],
    excludes=[],
    noarchive=False,
    optimize=0,
)
pyz = PYZ(a.pure)

exe = EXE(
    pyz,
    a.scripts,
    [],
    exclude_binaries=True,
    name='AutotechLiveStudio',
    debug=False,
    bootloader_ignore_signals=False,
    strip=False,
    upx=True,
    console=False,
    disable_windowed_traceback=False,
    argv_emulation=False,
    target_arch=None,
    codesign_identity=None,
    entitlements_file=None,
    icon='NONE',
)
coll = COLLECT(
    exe,
    a.binaries,
    a.datas,
    strip=False,
    upx=True,
    upx_exclude=[],
    name='AutotechLiveStudio',
)
