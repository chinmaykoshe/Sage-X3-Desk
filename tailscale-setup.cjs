/**
 * tailscale-setup.cjs
 * Detects, validates, and automatically configures Tailscale & Tailscale Funnel (port 5001)
 * for Sage X3 Desk's hybrid hosting architecture.
 * Syncs the live Tailscale Funnel URL with frontend/.env.production and backend/.env.
 */

const { execSync, spawnSync } = require('child_process');
const fs = require('fs');
const path = require('path');

const rootDir = __dirname;

function findTailscaleExe() {
  const isWin = process.platform === 'win32';
  if (isWin) {
    const defaultWinPath = path.join(process.env.ProgramFiles || 'C:\\Program Files', 'Tailscale', 'tailscale.exe');
    if (fs.existsSync(defaultWinPath)) return defaultWinPath;
  }
  try {
    const whichCmd = isWin ? 'where tailscale' : 'which tailscale';
    const out = execSync(whichCmd, { encoding: 'utf8', stdio: ['pipe', 'pipe', 'ignore'] }).trim();
    if (out) return out.split(/\r?\n/)[0];
  } catch {
    // not in path
  }
  return null;
}

function updateEnvFile(filePath, key, value) {
  if (!fs.existsSync(filePath)) return;
  let content = fs.readFileSync(filePath, 'utf8');
  const regex = new RegExp(`^${key}=.*$`, 'm');
  if (regex.test(content)) {
    content = content.replace(regex, `${key}=${value}`);
  } else {
    content += `\n${key}=${value}`;
  }
  fs.writeFileSync(filePath, content, 'utf8');
}

function appendToCommaEnv(filePath, key, valueToAppend) {
  if (!fs.existsSync(filePath)) return;
  let content = fs.readFileSync(filePath, 'utf8');
  const regex = new RegExp(`^${key}=(.*)$`, 'm');
  const match = content.match(regex);
  if (match) {
    const existing = match[1].split(',').map((s) => s.trim()).filter(Boolean);
    if (!existing.includes(valueToAppend)) {
      existing.push(valueToAppend);
      content = content.replace(regex, `${key}=${existing.join(',')}`);
      fs.writeFileSync(filePath, content, 'utf8');
    }
  }
}

async function main() {
  console.log('🌐  Checking Tailscale connectivity...');

  const tailscaleExe = findTailscaleExe();
  if (!tailscaleExe) {
    console.log('  ⚠ Tailscale CLI not found on this machine.');
    console.log('    To install: winget install -e --id Tailscale.Tailscale');
    return { ok: false, reason: 'NOT_INSTALLED' };
  }

  // 1. Check status JSON
  let statusData = null;
  try {
    const out = execSync(`"${tailscaleExe}" status --json`, { encoding: 'utf8', stdio: ['pipe', 'pipe', 'ignore'] });
    statusData = JSON.parse(out);
  } catch (err) {
    console.log('  ⚠ Tailscale daemon is not running or not responding.');
    console.log('    Try starting Tailscale: net start TailscaleIPN');
    return { ok: false, reason: 'SERVICE_STOPPED' };
  }

  const isOnline = statusData?.Self?.Online;
  const dnsName = (statusData?.Self?.DNSName || '').replace(/\.+$/, '');
  const ipv4 = statusData?.Self?.TailscaleIPs?.[0] || '';

  if (!isOnline || !dnsName) {
    console.log('  ⚠ Tailscale is installed but not authenticated/online.');
    console.log('    Run: tailscale up (to connect this machine to your Tailnet)');
    return { ok: false, reason: 'NOT_AUTHENTICATED' };
  }

  console.log(`  ✓ Tailscale Node Online: ${statusData.Self.HostName || 'Local Node'}`);
  console.log(`    IPv4: ${ipv4}`);
  console.log(`    Domain: ${dnsName}`);

  // 2. Check Funnel status for port 5001
  let funnelUrl = `https://${dnsName}`;
  let funnelActive = false;

  try {
    const fOut = execSync(`"${tailscaleExe}" funnel status`, { encoding: 'utf8', stdio: ['pipe', 'pipe', 'ignore'] });
    if (/proxy.*5001/i.test(fOut) || /Funnel on/i.test(fOut)) {
      funnelActive = true;
      const m = fOut.match(/https:\/\/[^\s\)\/]+/);
      if (m) funnelUrl = m[0];
    }
  } catch {
    // ignore
  }

  if (!funnelActive) {
    console.log('  ⏳ Activating Tailscale Funnel on port 5001...');
    try {
      execSync(`"${tailscaleExe}" funnel --bg 5001`, { stdio: 'ignore' });
      funnelActive = true;
      console.log(`  ✓ Tailscale Funnel activated: ${funnelUrl} -> http://127.0.0.1:5001`);
    } catch (err) {
      console.log(`  ℹ To enable HTTPS Funnel manually, run: tailscale funnel 5001 on`);
    }
  } else {
    console.log(`  ✓ Tailscale Funnel active: ${funnelUrl} -> port 5001`);
  }

  // 3. Automatically sync URLs into .env files
  const frontendEnvProd = path.join(rootDir, 'frontend', '.env.production');
  const backendEnv = path.join(rootDir, 'backend', '.env');

  if (fs.existsSync(frontendEnvProd)) {
    updateEnvFile(frontendEnvProd, 'VITE_API_URL', `${funnelUrl}/api,http://localhost:5001/api`);
    updateEnvFile(frontendEnvProd, 'VITE_SOCKET_URL', `${funnelUrl},http://localhost:5001`);
    console.log('  ✓ frontend/.env.production updated with Tailscale Funnel URLs');
  }

  if (fs.existsSync(backendEnv)) {
    appendToCommaEnv(backendEnv, 'CLIENT_URL', funnelUrl);
    appendToCommaEnv(backendEnv, 'CLIENT_URL', 'https://sage-x3-desk.vercel.app');
    console.log('  ✓ backend/.env CLIENT_URL allowed origins verified');
  }

  return { ok: true, ipv4, dnsName, funnelUrl };
}

main()
  .then((res) => {
    if (res.ok) {
      console.log('✅  Tailscale setup verified successfully.\n');
    }
  })
  .catch((err) => {
    console.log(`  ⚠ Tailscale check warning: ${err.message}\n`);
  });
