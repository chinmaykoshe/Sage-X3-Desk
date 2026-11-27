import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';
import http from 'http';
import { Server as SocketIOServer } from 'socket.io';
import jwt from 'jsonwebtoken';
import connectDB from './config/db.js';
import app, { corsOptions } from './app.js';
import { startEmailBackgroundScheduler } from './services/email/emailScheduler.js';
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
    cors: corsOptions,
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
    startEmailBackgroundScheduler();
  });
}

startServer().catch((err) => {
  console.error('Failed to start server:', err);
  process.exit(1);
});
