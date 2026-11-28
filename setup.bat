@echo off
setlocal enabledelayedexpansion
title Sage X3 Desk — Automated Hybrid Machine Setup
color 0B

cd /d "%~dp0"

echo.
echo ======================================================================
echo   Sage X3 Desk — Automated Machine Setup & Architecture Configuration
echo   Components: Frontend, Backend API, Local MongoDB, Local Ollama AI, Tailscale
echo ======================================================================
echo.

:: ── 1. Check / Install Node.js LTS ─────────────────────────────────────────
where node >nul 2>&1
if errorlevel 1 (
    echo [1/8] Installing Node.js LTS via winget...
    winget install -e --id OpenJS.NodeJS.LTS --accept-source-agreements --accept-package-agreements
    set "PATH=%ProgramFiles%\nodejs;%PATH%"
) else (
    for /f "delims=" %%V in ('node -v') do echo [1/8] Node.js found: %%V
)

:: ── 2. Check / Install MongoDB Server & Start Service ──────────────────────
sc query MongoDB >nul 2>&1
if errorlevel 1 (
    echo [2/8] Installing MongoDB Community Server via winget...
    winget install -e --id MongoDB.Server --accept-source-agreements --accept-package-agreements
)
net start MongoDB >nul 2>&1
echo [2/8] MongoDB service checked & active (port 27017).

:: ── 3. Check / Install Ollama AI & Model ───────────────────────────────────
set "OLLAMA_BIN=ollama"
if exist "%LOCALAPPDATA%\Programs\Ollama\ollama.exe" set "OLLAMA_BIN=%LOCALAPPDATA%\Programs\Ollama\ollama.exe"
where ollama >nul 2>&1
if errorlevel 1 if not exist "%LOCALAPPDATA%\Programs\Ollama\ollama.exe" (
    echo [3/8] Installing Ollama AI via winget...
    winget install -e --id Ollama.Ollama --accept-source-agreements --accept-package-agreements
    if exist "%LOCALAPPDATA%\Programs\Ollama\ollama.exe" set "OLLAMA_BIN=%LOCALAPPDATA%\Programs\Ollama\ollama.exe"
) else (
    echo [3/8] Ollama found.
)

:: Start Ollama & pull model
echo [3/8] Warming up Ollama daemon and checking qwen2.5-coder:1.5b model...
node "%~dp0start-ai.cjs"
"%OLLAMA_BIN%" pull qwen2.5-coder:1.5b

:: ── 4. Check / Install Tailscale & Configure Funnel ─────────────────────────
echo [4/8] Checking Tailscale VPN & Funnel infrastructure...
set "PATH=%ProgramFiles%\Tailscale;%PATH%"
where tailscale >nul 2>&1
if errorlevel 1 (
    echo [+] Installing Tailscale via winget...
    winget install -e --id Tailscale.Tailscale --accept-source-agreements --accept-package-agreements
    set "PATH=%ProgramFiles%\Tailscale;%PATH%"
)
net start TailscaleIPN >nul 2>&1
node "%~dp0tailscale-setup.cjs"

:: ── 5. Install NPM Dependencies across All 4 Architectural Folders ──────────
echo [5/8] Installing NPM dependencies across all architecture workspaces...
call npm install
if errorlevel 1 goto :err

echo [+] Installing backend dependencies...
call npm --prefix backend install
if errorlevel 1 goto :err

echo [+] Installing frontend dependencies...
call npm --prefix frontend install
if errorlevel 1 goto :err

echo [+] Installing db module dependencies...
call npm --prefix db install
if errorlevel 1 goto :err

echo [+] Installing ai module dependencies...
call npm --prefix ai install
if errorlevel 1 goto :err

:: ── 6. Create backend\.env if missing ───────────────────────────────────────
set "FRESH_ENV=0"
if not exist "%~dp0backend\.env" (
    echo [6/8] Creating default backend\.env...
    (
        echo PORT=5001
        echo NODE_ENV=development
        echo MONGO_URI=mongodb://127.0.0.1:27017/sage_x3_desk
        echo JWT_SECRET=sage_x3_desk_dev_secret_change_in_production_2026
        echo JWT_EXPIRES_IN=7d
        echo CLIENT_URL=https://sage-x3-desk.vercel.app,http://localhost:5174,http://localhost:5173
        echo SMTP_HOST=
        echo SMTP_PORT=587
        echo SMTP_USER=
        echo SMTP_PASS=
        echo SMTP_FROM="Sage X3 Desk <noreply@sagex3desk.local>"
        echo UPLOAD_DIR=uploads
        echo OLLAMA_BASE_URL=http://localhost:11434
        echo OLLAMA_MODEL=qwen2.5-coder:1.5b
        echo OLLAMA_TIMEOUT_MS=180000
        echo GATEWAY_SECRET=sage_x3_desk_gateway_secret_2026
    ) > "%~dp0backend\.env"
    set "FRESH_ENV=1"
) else (
    echo [6/8] Existing backend\.env preserved.
)

:: Re-sync Tailscale URLs into environment
node "%~dp0tailscale-setup.cjs" >nul 2>&1

:: ── 7. Seed Database on fresh setup or --seed ───────────────────────────────
if "%FRESH_ENV%"=="1" (
    echo [7/8] Fresh setup detected — seeding initial database & counters...
    call npm run seed
) else if /i "%~1"=="--seed" (
    echo [7/8] Seeding database & counters (--seed requested)...
    call npm run seed
) else (
    echo [7/8] Database initialization checked.
)

:: ── 8. Launch Background Infrastructure ─────────────────────────────────────
echo [8/8] Starting Backend API (5001) & Gateways in background...
call "%~dp0start-bg.bat"

echo.
echo ======================================================================
echo   Setup Complete! Sage X3 Desk infrastructure is live.
echo.
echo   Local Backend API + Gateways : http://localhost:5001
echo   Local MongoDB Database       : mongodb://127.0.0.1:27017/sage_x3_desk
echo   Local Ollama AI Server       : http://localhost:11434 (qwen2.5-coder:1.5b)
echo   Cloud Frontend               : https://sage-x3-desk.vercel.app
echo   Logs Directory               : .\logs\backend.log
echo.
echo   Commands:
echo     - Restart background services : restart.bat
echo     - Seed database               : npm run seed
echo     - Run local frontend (dev)    : npm --prefix frontend run dev
echo ======================================================================
echo.
pause
exit /b 0

:err
echo.
echo [ERROR] Setup encountered an error during npm package installation.
echo Check your Node.js version and network connection, then re-run setup.bat.
pause
exit /b 1
