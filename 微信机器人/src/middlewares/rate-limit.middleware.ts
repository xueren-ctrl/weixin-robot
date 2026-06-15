import { Request, Response, NextFunction } from 'express';
import { loadConfig } from '../config';
import logger from '../config/logger';
import { checkRateLimit } from '../config/database';

export function apiRateLimiter(req: Request, res: Response, next: NextFunction) {
  const config = loadConfig();
  const wxid = req.headers['x-user-id'] as string || 'anonymous';

  if (!checkRateLimit(wxid, config.rateLimitMaxRequests * 5, config.rateLimitWindowMs)) {
    logger.warn(API rate limit exceeded: );
    return res.status(429).json({ error: 'Rate limit exceeded. Please try again later.' });
  }

  next();
}
