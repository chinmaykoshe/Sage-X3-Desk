const { spawn } = require('child_process');
const fs = require('fs');
const path = require('path');

const rootDir = __dirname;
const logsDir = path.join(rootDir, 'logs');
if (!fs.existsSync(logsDir)) fs.mkdirSync(logsDir, { recursive: true });

function spawnBackground(name, command, args, cwd, logFile) {
  const outFd = fs.openSync(path.join(logsDir, logFile), 'a');
  const child = spawn(command, args, {
    cwd,
    detached: true,
    windowsHide: true,
    shell: false,
    stdio: ['ignore', outFd, outFd],
  });
  child.unref();
  console.log(`  ✓ ${name} started in background (PID ${child.pid}) -> logs/${logFile}`);
}

console.log('🚀  Starting Sage X3 Desk in background...');
spawnBackground('Backend API (5001)', process.execPath, ['server.js'], path.join(rootDir, 'backend'), 'backend.log');
console.log('✅  Backend running silently in background.\n');
