/**
 * start-bg.cjs
 * Launches Sage X3 Desk components silently in background without terminal popups.
 * Ensures MongoDB, Ollama AI, and Tailscale services are active before launching.
 */

const { spawn, execSync } = require('child_process');
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
  console.log(`  ✓ ${name} running in background (PID ${child.pid}) -> logs/${logFile}`);
}

function ensureWindowsService(serviceName) {
  if (process.platform !== 'win32') return;
  try {
    execSync(`net start ${serviceName}`, { stdio: 'ignore' });
  } catch {
    // service already running or not registered
  }
}

async function main() {
  console.log('🚀  Starting Sage X3 Desk infrastructure in background...');

  // 1. Ensure Windows background services (MongoDB & Tailscale)
  ensureWindowsService('MongoDB');
  ensureWindowsService('TailscaleIPN');

  // 2. Ensure Ollama AI is active
  try {
    const res = await fetch('http://127.0.0.1:11434/api/tags', { signal: AbortSignal.timeout(1200) });
    if (res.ok) {
      console.log('  ✓ Local Ollama AI active on port 11434');
    }
  } catch {
    console.log('  ⏳ Starting local Ollama AI daemon...');
    try {
      require('./ai/start-ai.cjs');
    } catch {
      // ignore
    }
  }

  // 3. Start Backend API + Gateways + Socket.IO (port 5001)
  spawnBackground('Backend API + Gateways (5001)', process.execPath, ['server.js'], path.join(rootDir, 'backend'), 'backend.log');

  // 4. Check Tailscale Funnel status
  try {
    const tsOut = execSync('tailscale funnel status', { encoding: 'utf8', stdio: ['pipe', 'pipe', 'ignore'] });
    const match = tsOut.match(/https:\/\/[^\s\)\/]+/);
    if (match) {
      console.log(`  ✓ Tailscale Funnel active: ${match[0]} -> port 5001`);
    }
  } catch {
    // ignore
  }

  // 5. Optional: start local frontend if requested via argument
  if (process.argv.includes('--with-frontend') || process.argv.includes('--all')) {
    const npmCmd = process.platform === 'win32' ? 'npm.cmd' : 'npm';
    spawnBackground('Frontend Vite Dev (5174)', npmCmd, ['run', 'dev', '--', '--port', '5174'], path.join(rootDir, 'frontend'), 'frontend.log');
  }

  console.log('✅  Sage X3 Desk running silently in background.\n');
}

main().catch((err) => {
  console.error('Startup error:', err);
});
