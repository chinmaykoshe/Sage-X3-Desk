import http from 'http';
import crypto from 'crypto';
import path from 'path';
import { fileURLToPath } from 'url';
import dotenv from 'dotenv';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
dotenv.config({ path: path.resolve(__dirname, '..', 'backend', '.env') });

function verifyGatewayToken(provided, expected) {
  if (!expected || !provided) return false;
  const a = Buffer.from(String(provided));
  const b = Buffer.from(String(expected));
  if (a.length !== b.length) return false;
  return crypto.timingSafeEqual(a, b);
}

/**
 * Middleware-style request handler that proxies authenticated AI requests
 * from the Vercel backend (over Tailscale Funnel) to local Ollama (127.0.0.1:11434).
 */
export async function handleAiGatewayRequest(req, res, prefix = '/_gateway/ai') {
  const secret = process.env.GATEWAY_SECRET || process.env.AI_GATEWAY_SECRET || '';
  const token = req.headers['x-gateway-token'];
  if (!verifyGatewayToken(token, secret)) {
    res.writeHead(401, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ success: false, message: 'Unauthorized AI gateway token' }));
    return;
  }

  const ollamaBase = (process.env.OLLAMA_BASE_URL || 'http://127.0.0.1:11434').replace('localhost', '127.0.0.1').replace(/\/+$/, '');
  const subPath = (req.url || '').slice(prefix.length) || '/api/tags';

  // Restrict to safe Ollama endpoints only
  if (!['/api/tags', '/api/chat', '/api/generate'].includes(subPath.split('?')[0])) {
    res.writeHead(403, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ success: false, message: 'Forbidden Ollama endpoint' }));
    return;
  }

  try {
    const chunks = [];
    for await (const chunk of req) chunks.push(chunk);
    const bodyBuf = Buffer.concat(chunks);

    const upstream = await fetch(`${ollamaBase}${subPath}`, {
      method: req.method,
      headers: { 'Content-Type': 'application/json' },
      body: ['GET', 'HEAD'].includes(req.method) ? undefined : bodyBuf,
    });

    res.writeHead(upstream.status, {
      'Content-Type': upstream.headers.get('content-type') || 'application/json',
    });

    if (upstream.body) {
      const reader = upstream.body.getReader();
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        res.write(value);
      }
    }
    res.end();
  } catch (err) {
    res.writeHead(502, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ success: false, message: `Local Ollama unavailable: ${err.message}` }));
  }
}

// Standalone runner: `node ai/gateway.js`
if (process.argv[1] && path.resolve(process.argv[1]) === __filename) {
  const PORT = Number(process.env.AI_GATEWAY_PORT || 5003);
  const server = http.createServer((req, res) => {
    if ((req.url || '').startsWith('/_gateway/ai')) {
      handleAiGatewayRequest(req, res, '/_gateway/ai');
      return;
    }
    if (req.url === '/health') {
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ ok: true, service: 'x3desk-ai-gateway', target: process.env.OLLAMA_BASE_URL || 'http://127.0.0.1:11434' }));
      return;
    }
    res.writeHead(404);
    res.end();
  });

  server.listen(PORT, '127.0.0.1', () => {
    console.log(`X3 Desk AI Gateway listening on 127.0.0.1:${PORT}/_gateway/ai -> 127.0.0.1:11434`);
  });
}
