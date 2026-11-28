@echo off
for /f "tokens=5" %%a in ('netstat -ano ^| findstr ":5001 " ^| findstr "LISTENING"') do taskkill /F /PID %%a >nul 2>&1
node "%~dp0start-bg.cjs"
exit /b 0
