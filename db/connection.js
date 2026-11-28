import mongoose from 'mongoose';
import net from 'net';
import WebSocket, { createWebSocketStream } from 'ws';

// Global cache for Vercel serverless warm-invocation reuse
const cache = (globalThis.__x3MongoCache ??= {
  conn: null,
  promise: null,
  tunnelServer: null,
  tunnelPort: null,
  mode: 'direct',
  lastError: null,
});

function buildGatewaySocketUrl(baseUrl) {
  const clean = String(baseUrl || '').trim().replace(/\/+$/, '');
  if (clean.startsWith('https://')) return `wss://${clean.slice(8)}`;
  if (clean.startsWith('http://')) return `ws://${clean.slice(7)}`;
  return clean;
}

/**
 * Starts a local loopback TCP bridge inside the serverless runtime that tunnels
 * MongoDB wire-protocol traffic over an authenticated WebSocket (Tailscale Funnel)
 * to the local mini PC DB gateway. Supports multiple failover gateway endpoints.
 */
async function ensureGatewayTunnel() {
  if (cache.tunnelServer && cache.tunnelPort) {
    return cache.tunnelPort;
  }

  const rawGateways = [process.env.MONGO_GATEWAY_URL, process.env.MONGO_GATEWAY_URLS]
    .filter(Boolean)
    .flatMap((s) => String(s).split(','))
    .map((u) => u.trim())
    .filter(Boolean);

  const gatewaySecret = process.env.GATEWAY_SECRET || process.env.DB_GATEWAY_SECRET || '';
  if (!rawGateways.length || !gatewaySecret) {
    throw new Error('MONGO_GATEWAY_URL and GATEWAY_SECRET must be set when using DB gateway mode');
  }

  let lastConnectError = null;

  for (const rawUrl of rawGateways) {
    const gatewayUrl = buildGatewaySocketUrl(rawUrl);
    try {
      const port = await new Promise((resolve, reject) => {
        const server = net.createServer((tcpSocket) => {
          const ws = new WebSocket(gatewayUrl, {
            headers: { 'x-gateway-token': gatewaySecret },
            handshakeTimeout: 6000,
          });

          let wsStream = null;
          const cleanup = () => {
            try { tcpSocket.destroy(); } catch {}
            try { wsStream?.destroy(); } catch {}
            try { if (ws.readyState === WebSocket.OPEN || ws.readyState === WebSocket.CONNECTING) ws.terminate(); } catch {}
          };

          ws.on('open', () => {
            wsStream = createWebSocketStream(ws, { decodeStrings: false });
            tcpSocket.pipe(wsStream).pipe(tcpSocket);
            wsStream.on('error', cleanup);
          });

          ws.on('error', (err) => {
            cache.lastError = `DB tunnel error: ${err.message}`;
            cleanup();
          });
          ws.on('close', cleanup);
          tcpSocket.on('error', cleanup);
          tcpSocket.on('close', cleanup);
        });

        server.once('error', reject);
        server.listen(0, '127.0.0.1', () => {
          const addr = server.address();
          cache.tunnelServer = server;
          cache.tunnelPort = addr.port;
          resolve(addr.port);
        });
      });

      cache.tunnelServer.unref();
      return port;
    } catch (err) {
      lastConnectError = err;
      // Continue to next failover gateway URL
    }
  }

  const err = new Error(`All database gateway servers are down. ${lastConnectError?.message || ''}`);
  err.code = 'ALL_SERVERS_DOWN';
  throw err;
}

/**
 * Connects (or reuses cached Mongoose connection) to local MongoDB directly
 * or through the authenticated Tailscale DB Gateway on Vercel.
 */
export async function connectDB() {
  if (mongoose.connection.readyState === 1 && cache.conn) {
    return cache.conn;
  }

  if (!cache.promise) {
    cache.promise = (async () => {
      let uri = process.env.MONGO_URI || 'mongodb://127.0.0.1:27017/sage_x3_desk';

      if (process.env.MONGO_GATEWAY_URL) {
        cache.mode = 'gateway';
        const tunnelPort = await ensureGatewayTunnel();
        const dbName = process.env.MONGO_DB_NAME || 'sage_x3_desk';
        uri = `mongodb://127.0.0.1:${tunnelPort}/${dbName}?directConnection=true`;
      } else {
        cache.mode = 'direct';
      }

      const isVercel = Boolean(process.env.VERCEL);
      const conn = await mongoose.connect(uri, {
        serverSelectionTimeoutMS: Number(process.env.MONGO_TIMEOUT_MS) || (isVercel ? 6000 : 3000),
        connectTimeoutMS: Number(process.env.MONGO_TIMEOUT_MS) || (isVercel ? 6000 : 3000),
        maxPoolSize: isVercel ? 5 : 10,
        minPoolSize: 0,
        bufferCommands: false,
      });

      cache.conn = conn;
      cache.lastError = null;
      if (!isVercel) {
        console.log(`MongoDB Connected (${cache.mode}): ${conn.connection.host}/${conn.connection.name}`);
      }
      return conn;
    })().catch((err) => {
      cache.promise = null;
      cache.conn = null;
      cache.lastError = err.message;
      throw err;
    });
  }

  return cache.promise;
}

export function isMongoConnected() {
  return mongoose.connection.readyState === 1;
}

export function getDbHealth() {
  const states = { 0: 'disconnected', 1: 'connected', 2: 'connecting', 3: 'disconnecting' };
  return {
    connected: isMongoConnected(),
    readyState: mongoose.connection.readyState,
    state: states[mongoose.connection.readyState] || 'unknown',
    mode: cache.mode,
    database: mongoose.connection.name || process.env.MONGO_DB_NAME || 'sage_x3_desk',
    lastError: cache.lastError,
  };
}

export default connectDB;
