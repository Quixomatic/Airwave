; Inno Setup script for Airwave Desktop.
;
; electrobun 1.18.1 ships only a bare self-extracting stub (a console window with DEBUG spew). This wraps
; electrobun's *fully-extracted* app bundle into a real branded Windows installer + uninstaller:
;   - a proper wizard (welcome / progress / install location),
;   - Start-menu + optional desktop shortcuts to the launcher,
;   - an entry in Apps & Features with a clean uninstaller,
;   - an optional "also remove my data" prompt on uninstall.
;
; Per-user install (no UAC) into %LOCALAPPDATA%\Programs\Airwave — the app is a per-user tray app that keeps its
; data in %APPDATA%\Airwave, so it never needs admin. Build it via `scripts/build-win-installer.ts`, which
; extracts the electrobun tarball to {#SrcDir} and passes the version in — DON'T run this .iss by hand.
;
; Required defines (passed by the build script via ISCC /D...):
;   MyAppVersion  e.g. 0.10.5
;   SrcDir        path to the extracted "Airwave" bundle folder (contains bin\, Resources\, lib\)
;   OutputDir     where to write Airwave-Setup.exe
;   IconFile      path to icon.ico

#ifndef MyAppVersion
  #define MyAppVersion "0.0.0"
#endif
#ifndef SrcDir
  #define SrcDir "..\build\inno-src\Airwave"
#endif
#ifndef OutputDir
  #define OutputDir "..\build\inno"
#endif
#ifndef IconFile
  #define IconFile "..\assets\icon.ico"
#endif

#define MyAppName "Airwave"
#define MyAppPublisher "Airwave"
#define MyAppURL "https://getairwave.tv"
#define MyAppExeName "launcher.exe"

[Setup]
; A stable AppId (GUID) so upgrades + uninstall are recognized across versions. Do not change it.
AppId={{7E9C4A2F-1B6D-4E3A-9F52-8A1C6D0B3E77}
AppName={#MyAppName}
AppVersion={#MyAppVersion}
AppPublisher={#MyAppPublisher}
AppPublisherURL={#MyAppURL}
AppSupportURL={#MyAppURL}
VersionInfoVersion={#MyAppVersion}
DefaultDirName={localappdata}\Programs\Airwave
DefaultGroupName={#MyAppName}
DisableProgramGroupPage=yes
; Per-user, no admin/UAC.
PrivilegesRequired=lowest
OutputDir={#OutputDir}
; Descriptive, versioned name so the release asset clearly reads as the Windows installer (mirrors the mac
; DMG's Airwave-<version>-macos-arm64.dmg). e.g. Airwave-0.10.15-windows-x64-Setup.exe
OutputBaseFilename=Airwave-{#MyAppVersion}-windows-x64-Setup
SetupIconFile={#IconFile}
UninstallDisplayIcon={app}\bin\{#MyAppExeName}
UninstallDisplayName={#MyAppName}
Compression=lzma2/max
SolidCompression=yes
WizardStyle=modern
ArchitecturesInstallIn64BitMode=x64compatible
ArchitecturesAllowed=x64compatible
; Close a running Airwave (or restart it) so files aren't locked on upgrade.
CloseApplications=yes
RestartApplications=no

[Languages]
Name: "english"; MessagesFile: "compiler:Default.isl"

[Tasks]
Name: "desktopicon"; Description: "{cm:CreateDesktopIcon}"; GroupDescription: "{cm:AdditionalIcons}"; Flags: unchecked

[Files]
; The whole extracted electrobun bundle → {app}. `recursesubdirs createallsubdirs` preserves bin\, lib\,
; Resources\main.js and Resources\app\{bun,pg,server,views}\… exactly (the launcher resolves them relatively).
Source: "{#SrcDir}\*"; DestDir: "{app}"; Flags: ignoreversion recursesubdirs createallsubdirs

[Icons]
Name: "{group}\{#MyAppName}"; Filename: "{app}\bin\{#MyAppExeName}"; IconFilename: "{app}\Resources\app.ico"
Name: "{userdesktop}\{#MyAppName}"; Filename: "{app}\bin\{#MyAppExeName}"; IconFilename: "{app}\Resources\app.ico"; Tasks: desktopicon

[Run]
; Offer to launch Airwave when the wizard finishes.
Filename: "{app}\bin\{#MyAppExeName}"; Description: "{cm:LaunchProgram,{#MyAppName}}"; Flags: nowait postinstall skipifsilent

[Code]
// On uninstall, offer to also delete the user-data directory (%APPDATA%\Airwave: the embedded Postgres
// database, config, capability media, logs). Default No — user data is kept unless they opt in.
procedure CurUninstallStepChanged(CurUninstallStep: TUninstallStep);
begin
  if CurUninstallStep = usUninstall then
  begin
    if DirExists(ExpandConstant('{userappdata}\Airwave')) then
    begin
      if MsgBox('Also remove your Airwave data (channels, database, settings, and downloaded media) in ' +
        ExpandConstant('{userappdata}\Airwave') + '?' + #13#10#13#10 +
        'Choose No to keep it for a future reinstall.', mbConfirmation, MB_YESNO or MB_DEFBUTTON2) = IDYES then
      begin
        DelTree(ExpandConstant('{userappdata}\Airwave'), True, True, True);
      end;
    end;
  end;
end;
