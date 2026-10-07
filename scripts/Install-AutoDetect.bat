@echo off
REM One-time setup: starts a hidden background watcher at every Windows login so
REM assets\js\pages-manifest.js is always current. MAIN.HTML then auto-detects files with ZERO clicks.
set "DIR=%~dp0"
set "STARTUP=%APPDATA%\Microsoft\Windows\Start Menu\Programs\Startup"
set "VBS=%STARTUP%\CalcPagesWatcher.vbs"
> "%VBS%" echo Set sh = CreateObject("WScript.Shell")
>> "%VBS%" echo sh.Run "powershell -NoProfile -WindowStyle Hidden -ExecutionPolicy Bypass -File ""%DIR%scan-pages.ps1"" -Watch", 0, False
powershell -NoProfile -ExecutionPolicy Bypass -File "%DIR%scan-pages.ps1"
wscript "%VBS%"
echo.
echo Done. Auto-detection is installed and running in the background.
echo New .html files dropped in the tools folder will appear in MAIN.HTML automatically.
pause
