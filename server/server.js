import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';
import http from 'http';
import { Server as SocketIOServer } from 'socket.io';
import jwt from 'jsonwebtoken';
import connectDB from './config/db.js';
import app from './app.js';
import { getSupabaseBackupStatus } from './services/backupSyncService.js';
import {
  setSocketIO,
  registerUserSocket,
  unregisterUserSocket,
} from './services/notificationService.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
dotenv.config({ path: path.resolve(__dirname, '.env') });

const PORT = process.env.PORT || 5001;

async function startServer() {
  await connectDB();

  const server = http.createServer(app);
  const io = new SocketIOServer(server, {
    cors: {
      origin: process.env.CLIENT_URL ? process.env.CLIENT_URL.split(',') : ['http://localhost:5173', 'http://127.0.0.1:5173'],
      credentials: true,
    },
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
    console.log(`Sage X3 Desk server listening on http://localhost:${PORT}`);
  });
}

let dbReadyPromise = null;
function ensureDbConnected() {
  if (!dbReadyPromise) {
    dbReadyPromise = connectDB().catch((err) => {
      dbReadyPromise = null;
      throw err;
    });
  }
  return dbReadyPromise;
}

if (!process.env.VERCEL) {
  startServer().catch((err) => {
    console.error('Failed to start server:', err);
    process.exit(1);
  });
}

export default async function handler(req, res) {
  try {
    await ensureDbConnected();
    return app(req, res);
  } catch (err) {
    const supa = getSupabaseBackupStatus();
    if (supa.supabaseConfigured) {
      console.warn('MongoDB unavailable on Vercel, falling back to Supabase-only mode:', err.message);
      return app(req, res);
    }
    console.error('Serverless invocation error:', err);
    return res.status(503).json({
      success: false,
      message: `Database/server initialization failed: ${err.message}`,
    });
  }
}
