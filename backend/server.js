import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';
import http from 'http';
import crypto from 'crypto';
import { Server as SocketIOServer } from 'socket.io';
import jwt from 'jsonwebtoken';
import connectDB from '../db/connection.js';
import { attachDbGateway } from '../db/gateway.js';
import { handleAiGatewayRequest } from '../ai/gateway.js';
import app, { corsOptions } from './app.js';
import { startEmailBackgroundScheduler } from './services/email/emailScheduler.js';
import {
  setSocketIO,
  registerUserSocket,
  unregisterUserSocket,
  emitToUser,
  emitBroadcast,
} from './services/notificationService.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
dotenv.config({ path: path.resolve(__dirname, '.env') });

const PORT = process.env.PORT || 5001;

function verifyGatewayToken(provided, expected) {
  if (!expected || !provided) return false;
  const a = Buffer.from(String(provided));
  const b = Buffer.from(String(expected));
  if (a.length !== b.length) return false;
  return crypto.timingSafeEqual(a, b);
}

async function handleRealtimeEmitGateway(req, res) {
  const secret = process.env.GATEWAY_SECRET || '';
  if (!verifyGatewayToken(req.headers['x-gateway-token'], secret)) {
    res.writeHead(401, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ success: false, message: 'Unauthorized gateway token' }));
    return;
  }
  const chunks = [];
  for await (const chunk of req) chunks.push(chunk);
  try {
    const { userId, broadcast, event, payload } = JSON.parse(Buffer.concat(chunks).toString('utf8') || '{}');
    if (!event) {
      res.writeHead(400, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ success: false, message: 'Missing event name' }));
      return;
    }
    if (broadcast) emitBroadcast(event, payload);
    else if (userId) emitToUser(userId, event, payload);
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ success: true }));
  } catch (err) {
    res.writeHead(400, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ success: false, message: err.message }));
  }
}

async function startServer() {
  await connectDB();

  const server = http.createServer((req, res) => {
    if ((req.url || '').startsWith('/_gateway/ai')) {
      handleAiGatewayRequest(req, res, '/_gateway/ai');
      return;
    }
    if ((req.url || '').split('?')[0] === '/_gateway/realtime/emit' && req.method === 'POST') {
      handleRealtimeEmitGateway(req, res);
      return;
    }
    app(req, res);
  });
  const io = new SocketIOServer(server, {
    cors: corsOptions,
  });

  // Attach authenticated MongoDB WebSocket-to-TCP gateway on /_gateway/db
  const { handleUpgrade: handleDbUpgrade } = attachDbGateway(server, { routePath: '/_gateway/db' });
  server.on('upgrade', (req, socket, head) => {
    if ((req.url || '').split('?')[0] === '/_gateway/db') {
      handleDbUpgrade(req, socket, head);
    }
  });

  io.use((socket, next) => {
    const token = socket.handshake.auth?.token;
    if (!token) return next();
    try {
      const decoded = jwt.verify(token, process.env.JWT_SECRET);
      socket.userId = decoded.id;
    } catch {
      // Allow anonymous socket connect without joining user room
    }
    next();
  });

  io.on('connection', (socket) => {
    if (socket.userId) {
      socket.join(`user:${socket.userId}`);
      registerUserSocket(socket.userId, socket.id);
    }

    socket.on('disconnect', () => {
      if (socket.userId) {
        unregisterUserSocket(socket.userId, socket.id);
      }
    });
  });

  setSocketIO(io);

  server.listen(PORT, () => {
    console.log(`Sage X3 Desk server + Local Gateways listening on http://localhost:${PORT}`);
    startEmailBackgroundScheduler();
  });
}

startServer().catch((err) => {
  console.error('Failed to start server:', err);
  process.exit(1);
});
