/**
 * kill-ports.cjs
 * Kills any process listening on the ports used by Sage X3 Desk
 * before the server starts. Works on Windows (netstat) and Unix (lsof).
 * Run directly: node kill-ports.cjs
 */
const { execSync } = require('child_process');

const PORTS = [5000, 5001, 5174, 5175, 3000];
const isWin = process.platform === 'win32';

function killPort(port) {
  try {
    if (isWin) {
      // find PIDs listening on the port
      const out = execSync(
        `netstat -ano | findstr ":${port} "`,
        { encoding: 'utf8', stdio: ['pipe', 'pipe', 'ignore'] }
      );
      const pids = new Set();
      for (const line of out.split('\n')) {
        const m = line.trim().match(/(\d+)\s*$/);
        if (m && m[1] !== '0') pids.add(m[1]);
      }
      for (const pid of pids) {
        try {
          execSync(`taskkill /PID ${pid} /F`, { stdio: 'ignore' });
          console.log(`  ✓ Killed PID ${pid} on port ${port}`);
        } catch { /* already gone */ }
      }
    } else {
      // macOS / Linux
      const out = execSync(
        `lsof -ti tcp:${port}`,
        { encoding: 'utf8', stdio: ['pipe', 'pipe', 'ignore'] }
      );
      for (const pid of out.split('\n').map(s => s.trim()).filter(Boolean)) {
        try {
          execSync(`kill -9 ${pid}`, { stdio: 'ignore' });
          console.log(`  ✓ Killed PID ${pid} on port ${port}`);
        } catch { /* already gone */ }
      }
    }
  } catch {
    // port was not in use — that's fine
  }
}

console.log('\n🔄  Clearing ports before startup...');
for (const port of PORTS) killPort(port);

// give the OS 1 second to fully release the ports
const start = Date.now();
while (Date.now() - start < 1000) { /* spin */ }

console.log('✅  Ports cleared. Starting server...\n');
