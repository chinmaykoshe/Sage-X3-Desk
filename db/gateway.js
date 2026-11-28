import net from 'net';
import crypto from 'crypto';
import http from 'http';
import path from 'path';
import { fileURLToPath } from 'url';
import dotenv from 'dotenv';
import { WebSocketServer, createWebSocketStream } from 'ws';

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
 * Attaches the authenticated MongoDB WebSocket-to-TCP gateway to an existing HTTP server.
 * Only forwards connections that present a valid `x-gateway-token` matching GATEWAY_SECRET.
 */
export function attachDbGateway(httpServer, { routePath = '/_gateway/db' } = {}) {
  const wss = new WebSocketServer({ noServer: true });
  const mongoHost = process.env.LOCAL_MONGO_HOST || '127.0.0.1';
  const mongoPort = Number(process.env.LOCAL_MONGO_PORT || 27017);

  wss.on('connection', (ws) => {
    const mongoSocket = net.connect({ host: mongoHost, port: mongoPort });
    const wsStream = createWebSocketStream(ws, { decodeStrings: false });

    const cleanup = () => {
      try { mongoSocket.destroy(); } catch {}
      try { wsStream.destroy(); } catch {}
      try { ws.terminate(); } catch {}
    };

    mongoSocket.on('connect', () => {
      wsStream.pipe(mongoSocket).pipe(wsStream);
    });
    mongoSocket.on('error', cleanup);
    mongoSocket.on('close', cleanup);
    wsStream.on('error', cleanup);
    ws.on('error', cleanup);
    ws.on('close', cleanup);
  });

  const handleUpgrade = (req, socket, head) => {
    const reqPath = (req.url || '').split('?')[0];
    if (reqPath !== routePath) return false;

    const secret = process.env.GATEWAY_SECRET || process.env.DB_GATEWAY_SECRET || '';
    const token = req.headers['x-gateway-token'];

    if (!verifyGatewayToken(token, secret)) {
      socket.write('HTTP/1.1 401 Unauthorized\r\nContent-Type: text/plain\r\nConnection: close\r\n\r\nUnauthorized DB gateway token');
      socket.destroy();
      return true;
    }

    wss.handleUpgrade(req, socket, head, (ws) => {
      wss.emit('connection', ws, req);
    });
    return true;
  };

  return { wss, handleUpgrade };
}

// Standalone runner when executed directly: `node db/gateway.js`
if (process.argv[1] && path.resolve(process.argv[1]) === __filename) {
  const PORT = Number(process.env.DB_GATEWAY_PORT || 5002);
  const server = http.createServer((req, res) => {
    if (req.url === '/health') {
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ ok: true, service: 'x3desk-db-gateway', target: '127.0.0.1:27017' }));
      return;
    }
    res.writeHead(404);
    res.end();
  });

  const { handleUpgrade } = attachDbGateway(server, { routePath: '/_gateway/db' });
  server.on('upgrade', (req, socket, head) => {
    if (!handleUpgrade(req, socket, head)) {
      socket.destroy();
    }
  });

  server.listen(PORT, '127.0.0.1', () => {
    console.log(`X3 Desk DB Gateway listening on 127.0.0.1:${PORT}/_gateway/db -> 127.0.0.1:27017`);
  });
}
