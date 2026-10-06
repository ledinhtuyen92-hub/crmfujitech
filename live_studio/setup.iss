[Setup]
AppName=Autotech Live Studio
AppVersion=1.0.0
AppPublisher=Fujitech Group
AppPublisherURL=https://fujitechgroup.com
DefaultDirName={autopf}\Autotech Live Studio
DefaultGroupName=Autotech Live Studio
OutputDir=.\installer
OutputBaseFilename=AutotechLiveStudio_Setup
Compression=lzma
SolidCompression=yes
WizardStyle=modern
DisableDirPage=yes
DisableProgramGroupPage=yes
PrivilegesRequired=lowest
UninstallDisplayIcon={app}\AutotechLiveStudio.exe

[Tasks]
Name: "desktopicon"; Description: "Tạo biểu tượng trên màn hình (Desktop Icon)"; GroupDescription: "Additional icons:"; Flags: checkedonce

[Files]
Source: "dist\AutotechLiveStudio\*"; DestDir: "{app}"; Flags: ignoreversion recursesubdirs createallsubdirs
; LƯU Ý: Nếu có MediaMTX và FFmpeg thì chép vào mục bin
; Source: "bin\*"; DestDir: "{app}\bin"; Flags: ignoreversion recursesubdirs createallsubdirs skipifsourcedoesntexist

[Icons]
Name: "{autoprograms}\Autotech Live Studio"; Filename: "{app}\AutotechLiveStudio.exe"
Name: "{autodesktop}\Autotech Live Studio"; Filename: "{app}\AutotechLiveStudio.exe"; Tasks: desktopicon

[Run]
Filename: "{app}\AutotechLiveStudio.exe"; Description: "Khởi động Autotech Live Studio"; Flags: nowait postinstall skipifsilent
