import { Router, Request, Response } from 'express';
import jwt from 'jsonwebtoken';
import bcrypt from 'bcryptjs';
import { loadConfig } from '../config';
import {
  getStats,
  getChatHistory,
  getWhitelist,
  addToWhitelist,
  removeFromWhitelist,
  getVideoTasksByWxid,
  getDb,
  clearContext,
  getUserModel,
  setUserModel,
  upsertUser,
  logCommand,
} from '../config/database';
import { authMiddleware, AuthenticatedRequest } from '../middlewares/auth.middleware';
import logger from '../config/logger';

const router = Router();
const config = loadConfig();

// In-memory user store for API auth (simple demo)
const users: Array<{ wxid: string; username: string; passwordHash: string }> = [
  {
    wxid: 'admin',
    username: 'admin',
    passwordHash: bcrypt.hashSync('admin123', 10),
  },
];

// Login
router.post('/auth/login', async (req: Request, res: Response) => {
  try {
    const { username, password } = req.body;
    const user = users.find((u) => u.username === username);

    if (!user || !bcrypt.compareSync(password, user.passwordHash)) {
      return res.status(401).json({ error: 'Invalid credentials' });
    }

    const token = jwt.sign(
      { userId: user.wxid, username: user.username },
      config.jwtSecret,
      { expiresIn: config.jwtExpiresIn },
    );

    res.json({ token, username: user.username });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// --- Protected Routes ---

// Stats
router.get('/stats', authMiddleware, (req: AuthenticatedRequest, res: Response) => {
  const stats = getStats();
  res.json(stats);
});

// Chat History
router.get('/chats', authMiddleware, (req: AuthenticatedRequest, res: Response) => {
  const wxid = req.query.wxid as string;
  const limit = parseInt((req.query.limit as string) || '50', 10);

  if (!wxid) {
    return res.status(400).json({ error: 'wxid parameter required' });
  }

  const chats = getChatHistory(wxid, limit);
  res.json(chats);
});

// Context
router.delete('/context', authMiddleware, (req: AuthenticatedRequest, res: Response) => {
  const { wxid, roomId } = req.body;

  if (!wxid) {
    return res.status(400).json({ error: 'wxid required' });
  }

  clearContext(wxid, roomId || '');
  res.json({ success: true });
});

// Model
router.get('/model', authMiddleware, (req: AuthenticatedRequest, res: Response) => {
  const { wxid } = req.query;
  if (!wxid) return res.status(400).json({ error: 'wxid required' });

  const model = getUserModel(wxid as string);
  res.json({ wxid, model });
});

router.post('/model', authMiddleware, (req: AuthenticatedRequest, res: Response) => {
  const { wxid, model } = req.body;
  if (!wxid || !model) return res.status(400).json({ error: 'wxid and model required' });

  setUserModel(wxid, model);
  res.json({ success: true, model });
});

// Users
router.get('/users', authMiddleware, (req: AuthenticatedRequest, res: Response) => {
  const db = getDb();
  const users = db.prepare('SELECT * FROM users ORDER BY updated_at DESC').all();
  res.json(users);
});

// Whitelist
router.get('/whitelist', authMiddleware, (req: AuthenticatedRequest, res: Response) => {
  const list = getWhitelist();
  res.json(list);
});

router.post('/whitelist', authMiddleware, (req: AuthenticatedRequest, res: Response) => {
  const { wxid, name, addedBy } = req.body;
  if (!wxid) return res.status(400).json({ error: 'wxid required' });

  addToWhitelist(wxid, name || '', addedBy || 'api');
  res.json({ success: true });
});

router.delete('/whitelist/:wxid', authMiddleware, (req: AuthenticatedRequest, res: Response) => {
  const removed = removeFromWhitelist(req.params.wxid);
  res.json({ success: removed });
});

// Video Tasks
router.get('/videos', authMiddleware, (req: AuthenticatedRequest, res: Response) => {
  const { wxid } = req.query;
  if (!wxid) return res.status(400).json({ error: 'wxid required' });

  const tasks = getVideoTasksByWxid(wxid as string);
  res.json(tasks);
});

// Commands
router.post('/command', authMiddleware, (req: AuthenticatedRequest, res: Response) => {
  const { wxid, command, params } = req.body;
  if (!wxid || !command) return res.status(400).json({ error: 'wxid and command required' });

  logCommand(wxid, command, params || '');
  res.json({ success: true });
});

// System Info
router.get('/system', authMiddleware, (req: AuthenticatedRequest, res: Response) => {
  const uptime = process.uptime();
  const memUsage = process.memoryUsage();

  res.json({
    uptime: ${Math.floor(uptime / 3600)}h m s,
    memory: {
      rss: ${(memUsage.rss / 1024 / 1024).toFixed(1)}MB,
      heapUsed: ${(memUsage.heapUsed / 1024 / 1024).toFixed(1)}MB,
      heapTotal: ${(memUsage.heapTotal / 1024 / 1024).toFixed(1)}MB,
    },
    nodeVersion: process.version,
    platform: process.platform,
    pid: process.pid,
  });
});

export default router;
