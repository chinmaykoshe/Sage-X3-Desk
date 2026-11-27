import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import morgan from 'morgan';
import rateLimit from 'express-rate-limit';
import path from 'path';
import { fileURLToPath } from 'url';
import apiRoutes from './routes/index.js';
import { notFoundHandler, errorHandler } from './middleware/errorHandler.js';
import { uploadRoot } from './middleware/upload.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();

// CORS must be first — before Helmet — so OPTIONS preflights pass cleanly (supports hosted Vercel frontend + local dev)
const allowedOrigins = process.env.CLIENT_URL
  ? process.env.CLIENT_URL.split(',').map((o) => o.trim()).filter(Boolean)
  : ['http://localhost:5174', 'http://localhost:5173', 'http://127.0.0.1:5174', 'http://127.0.0.1:5173'];

export const corsOptions = {
  origin(origin, callback) {
    if (
      !origin ||
      allowedOrigins.includes(origin) ||
      /^https:\/\/[a-zA-Z0-9-]+\.vercel\.app$/.test(origin) ||
      /^https:\/\/[a-zA-Z0-9-]+-chinmaykoshes-projects\.vercel\.app$/.test(origin)
    ) {
      return callback(null, true);
    }
    return callback(new Error(`CORS blocked for origin: ${origin}`));
  },
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'x-requested-with'],
  optionsSuccessStatus: 200, // Some browsers (Safari) choke on 204
};

// Allow Chrome/Edge Private Network Access preflight when HTTPS Vercel frontend talks to local backend
app.use((req, res, next) => {
  if (req.headers['access-control-request-private-network'] === 'true') {
    res.setHeader('Access-Control-Allow-Private-Network', 'true');
  }
  next();
});

// Handle ALL OPTIONS preflights immediately — before Helmet, rate-limiters, and body-parsers
app.options('*', cors(corsOptions));

app.use(cors(corsOptions));
app.use(
  helmet({
    crossOriginResourcePolicy: { policy: 'cross-origin' },
  })
);
app.use(express.json({ limit: '5mb' }));
app.use(express.urlencoded({ extended: true }));

if (process.env.NODE_ENV !== 'test') {
  app.use(morgan('dev'));
}

const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 100,
  standardHeaders: true,
  legacyHeaders: false,
});
app.use('/api/auth', authLimiter);

app.get('/', (req, res) => {
  res.json({ success: true, service: 'Sage X3 Desk API', status: 'running' });
});
app.use('/uploads', express.static(uploadRoot));
app.use('/api', apiRoutes);

// Serve production frontend if built
const clientDist = path.resolve(__dirname, '..', 'client', 'dist');
if (process.env.NODE_ENV === 'production') {
  app.use(express.static(clientDist));
  app.get('*', (req, res, next) => {
    if (req.path.startsWith('/api')) return next();
    res.sendFile(path.join(clientDist, 'index.html'));
  });
}

app.use(notFoundHandler);
app.use(errorHandler);

export default app;
