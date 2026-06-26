import express from 'express';
import mongoose from 'mongoose';
import cors from 'cors';
import dotenv from 'dotenv';
import helmet from 'helmet';
import timeout from 'connect-timeout';
import rateLimit from 'express-rate-limit';
import cluster from 'node:cluster';
import os from 'node:os';
import { csrfProtection } from './middleware/auth.js';

dotenv.config();

const PORT = process.env.PORT || 5001;
const GLOBAL_RATE_LIMIT_WINDOW_MS = Number(process.env.GLOBAL_RATE_LIMIT_WINDOW_MS || 15 * 60 * 1000);
const GLOBAL_RATE_LIMIT_MAX = Number(process.env.GLOBAL_RATE_LIMIT_MAX || 1200);
const AUTH_RATE_LIMIT_WINDOW_MS = Number(process.env.AUTH_RATE_LIMIT_WINDOW_MS || 15 * 60 * 1000);
const AUTH_RATE_LIMIT_MAX = Number(process.env.AUTH_RATE_LIMIT_MAX || 60);
const CLUSTER_ENABLED = process.env.CLUSTER_ENABLED
  ? process.env.CLUSTER_ENABLED === 'true'
  : process.env.NODE_ENV === 'production';
const WORKER_COUNT = Math.max(
  1,
  Number.parseInt(process.env.WEB_CONCURRENCY || '', 10) || os.availableParallelism?.() || os.cpus().length || 1
);
const TRUST_PROXY = process.env.TRUST_PROXY || 'loopback';

const sanitizeMongoInput = (value) => {
  if (Array.isArray(value)) {
    value.forEach((entry) => sanitizeMongoInput(entry));
    return value;
  }

  if (!value || typeof value !== 'object') {
    return value;
  }

  Object.keys(value).forEach((key) => {
    if (key.startsWith('$') || key.includes('.')) {
      delete value[key];
      return;
    }

    sanitizeMongoInput(value[key]);
  });

  return value;
};

const mongoSanitizeMiddleware = (req, _res, next) => {
  if (req.body && typeof req.body === 'object') {
    sanitizeMongoInput(req.body);
  }
  if (req.params && typeof req.params === 'object') {
    sanitizeMongoInput(req.params);
  }
  if (req.query && typeof req.query === 'object') {
    sanitizeMongoInput(req.query);
  }
  next();
};

const createApp = () => {
  const app = express();

  app.set('trust proxy', TRUST_PROXY);

  app.use(cors({
    origin: [
      'http://localhost:5173',
      'http://127.0.0.1:5173',
      'https://busked-matilde-shamefully.ngrok-free.dev'
    ],
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization', 'X-CSRF-Token'],
    credentials: true,
    optionsSuccessStatus: 200
  }));

  // Drop requests extending past 30 seconds to prevent event-loop and resource exhaustion
  app.use(timeout('30s'));

  // Security headers
  app.use(helmet({
    contentSecurityPolicy: false, // Disabled for SPA — configure per-environment if needed
    crossOriginEmbedderPolicy: false,
  }));

  // Payload size limit to prevent memory exhaustion
  app.use(express.json({ limit: '1mb' }));

  // Sanitize user input to prevent NoSQL injection
  app.use(mongoSanitizeMiddleware);

  app.use(csrfProtection);

  // Global Rate Limiting
  const globalLimiter = rateLimit({
    windowMs: GLOBAL_RATE_LIMIT_WINDOW_MS,
    max: GLOBAL_RATE_LIMIT_MAX,
    message: { message: "Too many requests from this IP, please try again after 15 minutes" },
    standardHeaders: true,
    legacyHeaders: false,
  });

  // Strict Rate Limiting for Auth Routes
  const authLimiter = rateLimit({
    windowMs: AUTH_RATE_LIMIT_WINDOW_MS,
    max: AUTH_RATE_LIMIT_MAX,
    message: { message: "Too many authentication attempts, please try again later" },
    standardHeaders: true,
    legacyHeaders: false,
  });

  app.use('/api', globalLimiter);

  app.use('/api/auth', authLimiter, authRoutes);
  app.use('/api', apiRoutes);
  app.use('/api/documents', uploadRoutes);

  // Basic route
  app.get('/', (req, res) => {
    res.send('API is running');
  });

  return app;
};

import authRoutes from './routes/authRoutes.js';
import apiRoutes from './routes/api.js';
import uploadRoutes from './routes/uploads.js';

const startWorker = async () => {
  const app = createApp();
  try {
    await mongoose.connect(process.env.MONGODB_URI || 'mongodb://127.0.0.1:27017/gtvet-wel');
    console.log(`MongoDB connected (worker ${process.pid})`);
  } catch (err) {
    console.error(`MongoDB connection error (worker ${process.pid}):`, err);
    process.exit(1);
  }

  app.listen(PORT, () => {
    console.log(`Server running on port ${PORT} (worker ${process.pid})`);
  });
};

if (CLUSTER_ENABLED && cluster.isPrimary) {
  console.log(`Primary ${process.pid} starting ${WORKER_COUNT} workers`);
  for (let i = 0; i < WORKER_COUNT; i += 1) {
    cluster.fork();
  }

  cluster.on('exit', (worker, code, signal) => {
    console.error(`Worker ${worker.process.pid} exited (code=${code}, signal=${signal}). Restarting.`);
    cluster.fork();
  });
} else {
  startWorker();
}
