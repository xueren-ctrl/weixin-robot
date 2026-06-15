import express, { Application } from 'express';
import cors from 'cors';
import helmet from 'helmet';
import compression from 'compression';
import { loadConfig } from '../config';
import apiRoutes from './api.routes';
import { requestLogger, errorHandler } from '../middlewares/auth.middleware';
import { apiRateLimiter } from '../middlewares/rate-limit.middleware';
import logger from '../config/logger';

const config = loadConfig();

export function createApp(): Application {
  const app = express();

  // Security middleware
  app.use(helmet({
    contentSecurityPolicy: false,
    crossOriginEmbedderPolicy: false,
  }));
  app.use(cors());
  app.use(compression());
  app.use(express.json({ limit: '10mb' }));
  app.use(express.urlencoded({ extended: true }));
  app.use(requestLogger);

  // Rate limiting for API
  app.use('/api', apiRateLimiter);

  // API routes
  app.use('/api', apiRoutes);

  // Health check
  app.get('/health', (_req, res) => {
    res.json({ status: 'ok', timestamp: new Date().toISOString() });
  });

  // Serve static files (admin dashboard)
  app.use('/static', express.static('../dist/static'));

  // Admin dashboard SPA fallback
  app.get('*', (req, res) => {
    if (!req.path.startsWith('/api') && !req.path.startsWith('/static')) {
      res.sendFile('../dist/static/index.html');
    }
  });

  // Error handler
  app.use(errorHandler);

  return app;
}

export { logger };
