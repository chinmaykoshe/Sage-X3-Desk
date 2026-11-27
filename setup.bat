@echo off
setlocal enabledelayedexpansion
title Sage X3 Desk — Automated Machine Setup
color 0B

cd /d "%~dp0"

echo.
echo ========================================================
echo   Sage X3 Desk — Automated Setup & Startup
echo ========================================================
echo.

:: ── 1. Check / Install Node.js LTS ─────────────────────────────────────────
where node >nul 2>&1
if errorlevel 1 (
    echo [1/7] Installing Node.js LTS via winget...
    winget install -e --id OpenJS.NodeJS.LTS --accept-source-agreements --accept-package-agreements
    set "PATH=%ProgramFiles%\nodejs;%PATH%"
) else (
    for /f "delims=" %%V in ('node -v') do echo [1/7] Node.js found: %%V
)

:: ── 2. Check / Install MongoDB Server & Start Service ──────────────────────
sc query MongoDB >nul 2>&1
if errorlevel 1 (
    echo [2/7] Installing MongoDB Community Server via winget...
    winget install -e --id MongoDB.Server --accept-source-agreements --accept-package-agreements
)
net start MongoDB >nul 2>&1
echo [2/7] MongoDB service checked/started (port 27017).

:: ── 3. Check / Install Ollama ──────────────────────────────────────────────
set "OLLAMA_BIN=ollama"
if exist "%LOCALAPPDATA%\Programs\Ollama\ollama.exe" set "OLLAMA_BIN=%LOCALAPPDATA%\Programs\Ollama\ollama.exe"
where ollama >nul 2>&1
if errorlevel 1 if not exist "%LOCALAPPDATA%\Programs\Ollama\ollama.exe" (
    echo [3/7] Installing Ollama via winget...
    winget install -e --id Ollama.Ollama --accept-source-agreements --accept-package-agreements
    if exist "%LOCALAPPDATA%\Programs\Ollama\ollama.exe" set "OLLAMA_BIN=%LOCALAPPDATA%\Programs\Ollama\ollama.exe"
) else (
    echo [3/7] Ollama found.
)

:: ── 4. Optional Tailscale (--with-tailscale) ───────────────────────────────
if /i "%~1"=="--with-tailscale" (
    where tailscale >nul 2>&1
    if errorlevel 1 (
        echo [+] Installing Tailscale via winget...
        winget install -e --id Tailscale.Tailscale --accept-source-agreements --accept-package-agreements
    ) else (
        echo [+] Tailscale already installed.
    )
)

:: ── 5. Install NPM Dependencies (Root, Server, Client) ─────────────────────
echo [4/7] Installing npm packages (root, server, client)...
call npm install
if errorlevel 1 goto :err
call npm --prefix server install
if errorlevel 1 goto :err
call npm --prefix client install
if errorlevel 1 goto :err

:: ── 6. Create server\.env if missing ───────────────────────────────────────
set "FRESH_ENV=0"
if not exist "%~dp0server\.env" (
    echo [5/7] Creating default server\.env...
    (
        echo PORT=5001
        echo NODE_ENV=development
        echo MONGO_URI=mongodb://127.0.0.1:27017/sage_x3_desk
        echo JWT_SECRET=sage_x3_desk_dev_secret_change_in_production_2026
        echo JWT_EXPIRES_IN=7d
        echo CLIENT_URL=http://localhost:5174,http://localhost:5173
        echo SMTP_HOST=
        echo SMTP_PORT=587
        echo SMTP_USER=
        echo SMTP_PASS=
        echo SMTP_FROM="Sage X3 Desk <noreply@sagex3desk.local>"
        echo UPLOAD_DIR=uploads
        echo OLLAMA_BASE_URL=http://localhost:11434
        echo OLLAMA_MODEL=qwen2.5-coder:1.5b
        echo OLLAMA_TIMEOUT_MS=180000
    ) > "%~dp0server\.env"
    set "FRESH_ENV=1"
) else (
    echo [5/7] Existing server\.env preserved.
)

:: ── 7. Start Ollama silently + Pull qwen2.5-coder:1.5b ─────────────────────
echo [6/7] Ensuring Ollama is running and pulling qwen2.5-coder:1.5b...
node "%~dp0start-ai.cjs"
"%OLLAMA_BIN%" pull qwen2.5-coder:1.5b

:: ── Optional Seed on fresh setup or --seed ─────────────────────────────────
if "%FRESH_ENV%"=="1" (
    echo [+] Fresh setup detected — seeding initial database...
    call npm run seed
) else if /i "%~1"=="--seed" (
    echo [+] Seeding database...
    call npm run seed
)

:: ── 8. Launch everything silently in background ────────────────────────────
echo [7/7] Starting X3 AI, Backend (5001), and Frontend (5174) in background...
node "%~dp0kill-ports.cjs"
node "%~dp0start-ai.cjs"
node "%~dp0start-bg.cjs"

echo.
echo ========================================================
echo   Setup Complete! Sage X3 Desk is running in background.
echo   Frontend : http://localhost:5174
echo   Backend  : http://localhost:5001
echo   X3 AI    : http://localhost:11434
echo   Logs     : .\logs\backend.log ^& .\logs\frontend.log
echo ========================================================
echo.
pause
exit /b 0

:err
echo.
echo [ERROR] Setup failed during npm install. Check Node.js / internet and retry.
pause
exit /b 1
