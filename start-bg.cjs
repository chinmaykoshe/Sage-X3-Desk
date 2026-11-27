/**
 * start-bg.cjs
 * Starts Backend (port 5001) and Frontend (port 5174) silently in the background
 * with no visible CMD popup windows on Windows. Logs go to ./logs/.
 */
const { spawn } = require('child_process');
const fs = require('fs');
const path = require('path');

const rootDir = __dirname;
const logsDir = path.join(rootDir, 'logs');
if (!fs.existsSync(logsDir)) fs.mkdirSync(logsDir, { recursive: true });

function spawnBackground(name, command, args, cwd, logFile) {
  const outFd = fs.openSync(path.join(logsDir, logFile), 'w');
  const child = spawn(command, args, {
    cwd,
    detached: true,
    windowsHide: true,
    shell: process.platform === 'win32' && command.endsWith('.cmd'),
    stdio: ['ignore', outFd, outFd],
  });
  child.unref();
  console.log(`  ✓ ${name} started in background (PID ${child.pid}) -> logs/${logFile}`);
}

console.log('🚀  Starting Sage X3 Desk in background (no CMD popups)...');
spawnBackground('Backend API (5001)', process.execPath, ['server.js'], path.join(rootDir, 'server'), 'backend.log');

const npmCmd = process.platform === 'win32' ? 'npm.cmd' : 'npm';
spawnBackground('Frontend Vite (5174)', npmCmd, ['run', 'dev'], path.join(rootDir, 'client'), 'frontend.log');

console.log('✅  All services running silently in background.\n');
