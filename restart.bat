@echo off
if "%~1"=="--bg" goto run_bg
powershell -NoProfile -WindowStyle Hidden -Command "Start-Process -FilePath 'cmd.exe' -ArgumentList '/c \"\"%~f0\" --bg\"' -WindowStyle Hidden"
exit /b 0

:run_bg
cd /d "%~dp0"
node "%~dp0kill-ports.cjs"
node "%~dp0tailscale-setup.cjs"
node "%~dp0start-ai.cjs"
node "%~dp0start-bg.cjs"
exit /b 0
