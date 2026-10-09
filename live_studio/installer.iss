[Setup]
AppName=Autotech Live Studio
AppVersion=1.0.0
DefaultDirName={autopf}\AutotechLiveStudio
DefaultGroupName=Autotech Live Studio
OutputDir=d:\LẬP TRÌNH\fujitech\live_studio\dist
OutputBaseFilename=AutotechLiveStudio_Setup
Compression=lzma
SolidCompression=yes
ArchitecturesAllowed=x64
ArchitecturesInstallIn64BitMode=x64
PrivilegesRequired=lowest

[Tasks]
Name: "desktopicon"; Description: "{cm:CreateDesktopIcon}"; GroupDescription: "{cm:AdditionalIcons}"; Flags: unchecked

[Files]
Source: "d:\LẬP TRÌNH\fujitech\live_studio\dist\AutotechLiveStudio\AutotechLiveStudio.exe"; DestDir: "{app}"; Flags: ignoreversion
Source: "d:\LẬP TRÌNH\fujitech\live_studio\dist\AutotechLiveStudio\*"; DestDir: "{app}"; Flags: ignoreversion recursesubdirs createallsubdirs

[Icons]
Name: "{group}\Autotech Live Studio"; Filename: "{app}\AutotechLiveStudio.exe"
Name: "{autodesktop}\Autotech Live Studio"; Filename: "{app}\AutotechLiveStudio.exe"; Tasks: desktopicon

[Run]
Filename: "{app}\AutotechLiveStudio.exe"; Description: "{cm:LaunchProgram,Autotech Live Studio}"; Flags: nowait postinstall skipifsilent
