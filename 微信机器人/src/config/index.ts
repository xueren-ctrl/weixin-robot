import dotenv from 'dotenv';
import path from 'path';

// Load environment variables
dotenv.config({ path: path.join(__dirname, '../../.env') });

export interface BotConfig {
  puppet: 'hostie' | 'napcat';
  puppetToken: string;
  selfWxid: string;
  adminWxid: string;
  whitelistWxids: string[];
  jwtSecret: string;
  jwtExpiresIn: string;
  rateLimitWindowMs: number;
  rateLimitMaxRequests: number;
  replyDelayMinMs: number;
  replyDelayMaxMs: number;
  maxMessagesPerHour: number;
  dbPath: string;
  port: number;
  apiPort: number;
  logLevel: string;
  maxContextRounds: number;
  tempDir: string;
  tempFileTtlHours: number;
}

export interface AgnesConfig {
  baseUrl: string;
  apiKey: string;
  textModel: string;
  imageModel: string;
  videoModel: string;
  timeout: number;
  retries: number;
}

export interface LoggerConfig {
  level: string;
  appLogFile: string;
  errorLogFile: string;
}

let configCache: BotConfig | null = null;

export function loadConfig(): BotConfig {
  if (configCache) return configCache;

  const whitelistStr = process.env.WHITELIST_WXIDS || '';
  const whitelist = whitelistStr
    ? whitelistStr.split(',').map((id) => id.trim()).filter(Boolean)
    : [];

  configCache = {
    puppet: (process.env.BOT_PUPPET as any) || 'wechat',
    puppetToken: process.env.BOT_PUPPET_TOKEN || '',
    selfWxid: process.env.BOT_SELF_WXID || '',
    adminWxid: process.env.ADMIN_WXID || '',
    whitelistWxids: whitelist,
    jwtSecret: process.env.JWT_SECRET || 'default-secret-change-me',
    jwtExpiresIn: process.env.JWT_EXPIRES_IN || '7d',
    rateLimitWindowMs: parseInt(process.env.RATE_LIMIT_WINDOW_MS || '60000', 10),
    rateLimitMaxRequests: parseInt(process.env.RATE_LIMIT_MAX_REQUESTS || '20', 10),
    replyDelayMinMs: parseInt(process.env.REPLY_DELAY_MIN_MS || '1500', 10),
    replyDelayMaxMs: parseInt(process.env.REPLY_DELAY_MAX_MS || '4500', 10),
    maxMessagesPerHour: parseInt(process.env.MAX_MESSAGES_PER_HOUR || '200', 10),
    dbPath: process.env.DB_PATH || './data/bot.db',
    port: parseInt(process.env.PORT || '3000', 10),
    apiPort: parseInt(process.env.API_PORT || '3001', 10),
    logLevel: process.env.LOG_LEVEL || 'info',
    maxContextRounds: parseInt(process.env.MAX_CONTEXT_ROUNDS || '10', 10),
    tempDir: process.env.TEMP_DIR || './temp',
    tempFileTtlHours: parseInt(process.env.TEMP_FILE_TTL_HOURS || '24', 10),
  };

  return configCache;
}

export function getAgnesConfig(): AgnesConfig {
  return {
    baseUrl: process.env.AGNES_BASE_URL || 'https://api.agnes.ai/v1',
    apiKey: process.env.AGNES_API_KEY || '',
    textModel: process.env.AGNES_TEXT_MODEL || 'agnes-gpt-4o',
    imageModel: process.env.AGNES_IMAGE_MODEL || 'agnes-image-dall-e-3',
    videoModel: process.env.AGNES_VIDEO_MODEL || 'agnes-video-sora',
    timeout: 30000,
    retries: 3,
  };
}

export function getLoggerConfig(): LoggerConfig {
  return {
    level: process.env.LOG_LEVEL || 'info',
    appLogFile: path.join(__dirname, '../../logs/app.log'),
    errorLogFile: path.join(__dirname, '../../logs/error.log'),
  };
}

export function isWhitelisted(wxid: string): boolean {
  const config = loadConfig();
  if (config.whitelistWxids.length === 0) return true;
  return config.whitelistWxids.includes(wxid) || wxid === config.adminWxid;
}
