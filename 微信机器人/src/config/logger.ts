import winston from 'winston';
import path from 'path';
import fs from 'fs';
import { getLoggerConfig } from './index';

const config = getLoggerConfig();

// Ensure log directory exists
const logDir = path.join(__dirname, '../../logs');
if (!fs.existsSync(logDir)) {
  fs.mkdirSync(logDir, { recursive: true });
}

const logFile = path.join(logDir, 'app.log');
const errorFile = path.join(logDir, 'error.log');

const maskSensitive = (text: string): string => {
  if (!text) return text;
  return text
    .replace(/Bearer\s+\S+/g, 'Bearer [REDACTED]')
    .replace(/api[_-]?key[:=]\s*\S+/gi, 'api_key: [REDACTED]')
    .replace(/token[:=]\s*\S+/gi, 'token: [REDACTED]');
};

export const logger = winston.createLogger({
  level: config.level,
  format: winston.format.combine(
    winston.format.timestamp({ format: 'YYYY-MM-DD HH:mm:ss' }),
    winston.format.errors({ stack: true }),
    winston.format.json(),
  ),
  transports: [
    new winston.transports.File({
      filename: errorFile,
      level: 'error',
      maxsize: 5242880,
      maxFiles: 5,
      format: winston.format.combine(
        winston.format.timestamp({ format: 'YYYY-MM-DD HH:mm:ss' }),
        winston.format.printf(({ timestamp, level, message, stack, ...meta }) => {
          return JSON.stringify({
            timestamp,
            level,
            message: maskSensitive(message),
            stack,
            ...meta,
          });
        }),
      ),
    }),
    new winston.transports.File({
      filename: logFile,
      maxsize: 5242880,
      maxFiles: 5,
      format: winston.format.combine(
        winston.format.timestamp({ format: 'YYYY-MM-DD HH:mm:ss' }),
        winston.format.printf(({ timestamp, level, message, ...meta }) => {
          return JSON.stringify({
            timestamp,
            level,
            message: maskSensitive(message),
            ...meta,
          });
        }),
      ),
    }),
  ],
});

if (process.env.NODE_ENV !== 'production') {
  logger.add(
    new winston.transports.Console({
      format: winston.format.combine(
        winston.format.colorize(),
        winston.format.printf(({ timestamp, level, message }) => {
          return ${timestamp} []: ;
        }),
      ),
    }),
  );
}

export default logger;
