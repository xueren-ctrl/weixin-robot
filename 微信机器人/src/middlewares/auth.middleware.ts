import { Request, Response, NextFunction } from 'express';
import logger from '../config/logger';

export interface AuthenticatedRequest extends Request {
  userId?: string;
  username?: string;
}

export function authMiddleware(req: AuthenticatedRequest, res: Response, next: NextFunction) {
  const token = req.headers.authorization?.replace('Bearer ', '');

  if (!token) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  try {
    const jwt = require('jsonwebtoken');
    const { loadConfig } = require('../config');
    const config = loadConfig();

    const decoded = jwt.verify(token, config.jwtSecret) as {
      userId: string;
      username: string;
      iat: number;
    };

    req.userId = decoded.userId;
    req.username = decoded.username;
    next();
  } catch (error: any) {
    logger.warn(Auth failed: );
    return res.status(401).json({ error: 'Invalid token' });
  }
}

export function errorHandler(err: any, req: Request, res: Response, next: NextFunction) {
  logger.error(HTTP Error: );
  logger.error(err.stack);

  res.status(err.status || 500).json({
    error: err.message || 'Internal Server Error',
  });
}

export function requestLogger(req: Request, res: Response, next: NextFunction) {
  const start = Date.now();
  res.on('finish', () => {
    const duration = Date.now() - start;
    logger.info(${req.method}   - ms);
  });
  next();
}
