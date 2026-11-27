@echo off
title Sage X3 Desk — Restart Server
color 0A

echo.
echo ==========================================
echo   Sage X3 Desk — Full Server Restart
echo ==========================================
echo.

:: ── Kill processes on the ports we care about (via kill-ports.cjs) ─────────
echo [1/4] Killing processes on ports 5000, 5001, 5174, 5175, 3000...
node "%~dp0kill-ports.cjs"

echo [2/4] Ports cleared.

:: ── Start the backend server in a new window ───────────────────────────────
echo [3/4] Starting backend server (port 5001)...
start "X3 Backend" cmd /k "cd /d "%~dp0server" && node server.js"

:: ── Wait for backend to initialise, then start Vite dev server ─────────────
timeout /t 3 /nobreak >nul
echo [4/4] Starting Vite frontend dev server (port 5174)...
start "X3 Frontend" cmd /k "cd /d "%~dp0client" && npm run dev"

echo.
echo ==========================================
echo   Done! Backend + Frontend are starting.
echo   Backend : http://localhost:5001
echo   Frontend: http://localhost:5174
echo ==========================================
echo.
pause
