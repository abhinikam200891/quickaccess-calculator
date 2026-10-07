@echo off
del "%APPDATA%\Microsoft\Windows\Start Menu\Programs\Startup\CalcPagesWatcher.vbs" 2>nul
echo Auto-start removed. (Restart Windows or end the hidden powershell process to stop it now.)
pause
