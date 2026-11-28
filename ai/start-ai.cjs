/**
 * start-ai.cjs
 * Ensures local Ollama (port 11434) is running and warms up the configured X3 AI model
 * before the backend/frontend servers start.
 */
const { spawn } = require('child_process');
const fs = require('fs');
const path = require('path');

function loadEnvValue(key, fallback) {
  if (process.env[key]) return process.env[key];
  try {
    const envPath = path.join(__dirname, '..', 'backend', '.env');
    if (fs.existsSync(envPath)) {
      const lines = fs.readFileSync(envPath, 'utf8').split(/\r?\n/);
      for (const line of lines) {
        const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
        if (m && m[1] === key) {
          return m[2].replace(/^['"]|['"]$/g, '').trim() || fallback;
        }
      }
    }
  } catch {
    // ignore
  }
  return fallback;
}

const BASE_URL = loadEnvValue('OLLAMA_BASE_URL', 'http://127.0.0.1:11434').replace('localhost', '127.0.0.1');
const MODEL = loadEnvValue('OLLAMA_MODEL', 'qwen2.5-coder:1.5b');

async function fetchTags(timeoutMs = 1500) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(`${BASE_URL}/api/tags`, { signal: controller.signal });
    if (!res.ok) return null;
    return await res.json();
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

function getOllamaExecutable() {
  if (process.platform === 'win32') {
    const localAppData = process.env.LOCALAPPDATA || '';
    const candidate = path.join(localAppData, 'Programs', 'Ollama', 'ollama.exe');
    if (fs.existsSync(candidate)) return candidate;
  }
  return 'ollama';
}

async function warmUpModel() {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 15000);
  try {
    await fetch(`${BASE_URL}/api/generate`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ model: MODEL, prompt: '', keep_alive: '30m', stream: false }),
      signal: controller.signal,
    });
    console.log(`  ✓ X3 AI model "${MODEL}" loaded & ready`);
  } catch {
    console.log(`  ℹ Ollama is online (model "${MODEL}" will load on first AI message)`);
  } finally {
    clearTimeout(timer);
  }
}

async function main() {
  console.log('🤖  Checking local X3 AI (Ollama)...');
  let tags = await fetchTags(1500);

  if (!tags) {
    const exe = getOllamaExecutable();
    console.log(`  ⏳ Starting Ollama service (${exe} serve)...`);
    try {
      const child = spawn(exe, ['serve'], {
        detached: true,
        stdio: 'ignore',
        windowsHide: true,
      });
      child.unref();
    } catch (err) {
      console.log(`  ⚠ Could not start Ollama automatically: ${err.message}`);
      return;
    }

    const deadline = Date.now() + 30000;
    while (Date.now() < deadline) {
      await new Promise((r) => setTimeout(r, 800));
      tags = await fetchTags(2000);
      if (tags) break;
    }
  }

  if (!tags) {
    console.log('  ⚠ Ollama did not respond within 30s (AI features will run in offline fallback mode).');
    return;
  }

  const models = tags.models || [];
  const hasModel = models.some((m) => m.name === MODEL || m.model === MODEL || m.name?.startsWith(`${MODEL}:`));
  if (!hasModel) {
    console.log(`  ⚠ Ollama is running, but "${MODEL}" is not installed. Run: ollama pull ${MODEL}`);
    return;
  }

  console.log(`  ✓ Ollama is running at ${BASE_URL}`);
  await warmUpModel();
}

main().catch((err) => {
  console.log(`  ⚠ X3 AI startup check skipped: ${err.message}`);
});
