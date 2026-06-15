import Database from 'better-sqlite3';
import path from 'path';
import fs from 'fs';
import { v4 as uuidv4 } from 'uuid';
import { loadConfig } from './index';
import logger from '../config/logger';

const config = loadConfig();

// Ensure data directory exists
const dbDir = path.dirname(config.dbPath);
if (!fs.existsSync(dbDir)) {
  fs.mkdirSync(dbDir, { recursive: true });
}

const db = new Database(config.dbPath);

// Enable WAL mode for better concurrent access
db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');

// Initialize database schema
function initializeDatabase() {
  db.exec(
    CREATE TABLE IF NOT EXISTS users (
      wxid TEXT PRIMARY KEY,
      name TEXT DEFAULT '',
      room_id TEXT DEFAULT '',
      is_admin INTEGER DEFAULT 0,
      current_model TEXT DEFAULT 'default',
      created_at TEXT DEFAULT (datetime('now')),
      updated_at TEXT DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS message_context (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      wxid TEXT NOT NULL,
      room_id TEXT DEFAULT '',
      role TEXT NOT NULL,
      content TEXT NOT NULL,
      timestamp REAL DEFAULT (unixepoch()),
      FOREIGN KEY (wxid) REFERENCES users(wxid)
    );

    CREATE INDEX IF NOT EXISTS idx_context_wxid ON message_context(wxid, room_id);
    CREATE INDEX IF NOT EXISTS idx_context_timestamp ON message_context(timestamp);

    CREATE TABLE IF NOT EXISTS chat_history (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      sender_wxid TEXT NOT NULL,
      receiver_wxid TEXT NOT NULL,
      content TEXT NOT NULL,
      msg_type TEXT DEFAULT 'text',
      room_id TEXT DEFAULT '',
      timestamp REAL DEFAULT (unixepoch())
    );

    CREATE INDEX IF NOT EXISTS idx_history_sender ON chat_history(sender_wxid);
    CREATE INDEX IF NOT EXISTS idx_history_receiver ON chat_history(receiver_wxid);

    CREATE TABLE IF NOT EXISTS whitelist (
      wxid TEXT PRIMARY KEY,
      name TEXT DEFAULT '',
      added_by TEXT DEFAULT 'system',
      added_at TEXT DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS command_logs (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      wxid TEXT NOT NULL,
      command TEXT NOT NULL,
      params TEXT DEFAULT '',
      timestamp REAL DEFAULT (unixepoch())
    );

    CREATE TABLE IF NOT EXISTS video_tasks (
      id TEXT PRIMARY KEY,
      wxid TEXT NOT NULL,
      prompt TEXT NOT NULL,
      status TEXT DEFAULT 'pending',
      result_url TEXT DEFAULT '',
      error_message TEXT DEFAULT '',
      created_at TEXT DEFAULT (datetime('now')),
      updated_at TEXT DEFAULT (datetime('now')),
      expires_at TEXT
    );

    CREATE INDEX IF NOT EXISTS idx_video_tasks_wxid ON video_tasks(wxid);
    CREATE INDEX IF NOT EXISTS idx_video_tasks_status ON video_tasks(status);

    CREATE TABLE IF NOT EXISTS rate_limits (
      wxid TEXT PRIMARY KEY,
      window_start REAL NOT NULL,
      request_count INTEGER DEFAULT 0,
      last_request REAL DEFAULT (unixepoch())
    );

    INSERT OR IGNORE INTO whitelist (wxid, name) VALUES ('system', 'System Admin');
  );

  logger.info('Database initialized successfully');
}

initializeDatabase();

// --- User Methods ---

export function upsertUser(wxid: string, name?: string, roomId?: string): void {
  const stmt = db.prepare(
    INSERT INTO users (wxid, name, room_id, updated_at)
    VALUES (?, ?, ?, datetime('now'))
    ON CONFLICT(wxid) DO UPDATE SET
      name = excluded.name,
      room_id = excluded.room_id,
      updated_at = datetime('now')
  );
  stmt.run(wxid, name || '', roomId || '');
}

export function getUser(wxid: string): any {
  return db.prepare('SELECT * FROM users WHERE wxid = ?').get(wxid) as any;
}

export function isAdmin(wxid: string): boolean {
  const config = loadConfig();
  return wxid === config.adminWxid || wxid === config.selfWxid;
}

export function setUserModel(wxid: string, model: string): void {
  db.prepare('UPDATE users SET current_model = ?, updated_at = datetime(\'now\') WHERE wxid = ?').run(model, wxid);
}

export function getUserModel(wxid: string): string {
  const user = db.prepare('SELECT current_model FROM users WHERE wxid = ?').get(wxid);
  return user?.current_model || 'default';
}

// --- Context Methods ---

export function addContextMessage(wxid: string, roomId: string, role: string, content: string): void {
  db.prepare(
    INSERT INTO message_context (wxid, room_id, role, content, timestamp)
    VALUES (?, ?, ?, ?, unixepoch())
  ).run(wxid, roomId, role, content);
}

export function getContextMessages(wxid: string, roomId: string, rounds: number): any[] {
  const config = loadConfig();
  const limit = rounds * 2;
  const rows = db.prepare(
    SELECT role, content, timestamp FROM message_context
    WHERE wxid = ? AND room_id = ?
    ORDER BY timestamp DESC
    LIMIT ?
  ).all(wxid, roomId || '', limit) as any[];

  return rows.reverse();
}

export function clearContext(wxid: string, roomId: string): void {
  db.prepare('DELETE FROM message_context WHERE wxid = ? AND room_id = ?').run(wxid, roomId || '');
}

export function getContextCount(wxid: string, roomId: string): number {
  const row = db.prepare(
    'SELECT COUNT(*) as count FROM message_context WHERE wxid = ? AND room_id = ?'
  ).get(wxid, roomId || '') as { count: number };
  return row.count;
}

// --- Chat History Methods ---

export function saveChatMessage(
  senderWxid: string,
  receiverWxid: string,
  content: string,
  msgType: string,
  roomId: string,
): void {
  db.prepare(
    INSERT INTO chat_history (sender_wxid, receiver_wxid, content, msg_type, room_id, timestamp)
    VALUES (?, ?, ?, ?, ?, unixepoch())
  ).run(senderWxid, receiverWxid, content, msgType, roomId);
}

export function getChatHistory(wxid: string, limit: number = 50): any[] {
  return db.prepare(
    SELECT * FROM chat_history
    WHERE sender_wxid = ? OR receiver_wxid = ?
    ORDER BY timestamp DESC
    LIMIT ?
  ).all(wxid, wxid, limit) as any[];
}

// --- Whitelist Methods ---

export function addToWhitelist(wxid: string, name: string, addedBy: string): void {
  db.prepare(
    INSERT OR REPLACE INTO whitelist (wxid, name, added_by)
    VALUES (?, ?, ?)
  ).run(wxid, name, addedBy);
}

export function removeFromWhitelist(wxid: string): boolean {
  const stmt = db.prepare('DELETE FROM whitelist WHERE wxid = ?');
  const result = stmt.run(wxid);
  return result.changes > 0;
}

export function getWhitelist(): any[] {
  return db.prepare('SELECT * FROM whitelist ORDER BY added_at DESC').all() as any[];
}

export function isInWhitelist(wxid: string): boolean {
  const row = db.prepare('SELECT 1 FROM whitelist WHERE wxid = ?').get(wxid);
  return !!row;
}

// --- Command Logs ---

export function logCommand(wxid: string, command: string, params: string): void {
  db.prepare(
    INSERT INTO command_logs (wxid, command, params, timestamp)
    VALUES (?, ?, ?, unixepoch())
  ).run(wxid, command, params);
}

// --- Video Tasks ---

export function createVideoTask(
  wxid: string,
  prompt: string,
): { id: string } {
  const id = uuidv4();
  const config = loadConfig();
  const expiresAt = new Date(Date.now() + config.tempFileTtlHours * 3600000)
    .toISOString()
    .replace('T', ' ')
    .slice(0, 19);

  db.prepare(
    INSERT INTO video_tasks (id, wxid, prompt, status, expires_at)
    VALUES (?, ?, ?, 'pending', ?, ?)
  ).run(id, wxid, prompt, expiresAt, expiresAt);

  return { id };
}

export function updateVideoTask(
  id: string,
  updates: { status?: string; resultUrl?: string; errorMessage?: string },
): void {
  const fields: string[] = [];
  const values: any[] = [];

  if (updates.status !== undefined) {
    fields.push("status = ?");
    values.push(updates.status);
  }
  if (updates.resultUrl !== undefined) {
    fields.push("result_url = ?");
    values.push(updates.resultUrl);
  }
  if (updates.errorMessage !== undefined) {
    fields.push("error_message = ?");
    values.push(updates.errorMessage);
  }

  fields.push("updated_at = datetime('now')");
  values.push(id);

  db.prepare(UPDATE video_tasks SET  WHERE id = ?).run(...values);
}

export function getVideoTask(id: string): any {
  return db.prepare('SELECT * FROM video_tasks WHERE id = ?').get(id) as any;
}

export function getVideoTasksByWxid(wxid: string): any[] {
  return db.prepare(
    "SELECT * FROM video_tasks WHERE wxid = ? ORDER BY created_at DESC"
  ).all(wxid) as any[];
}

export function cleanupExpiredTasks(): number {
  const now = new Date().toISOString().replace('T', ' ').slice(0, 19);
  const stmt = db.prepare("DELETE FROM video_tasks WHERE expires_at < ?");
  const result = stmt.run(now);
  return result.changes;
}

// --- Rate Limits ---

export function checkRateLimit(wxid: string, maxRequests: number, windowMs: number): boolean {
  const now = Date.now() / 1000;
  const windowStart = now - windowMs / 1000;

  const row = db.prepare('SELECT * FROM rate_limits WHERE wxid = ?').get(wxid) as any;

  if (!row || row.window_start < windowStart) {
    db.prepare(
      INSERT OR REPLACE INTO rate_limits (wxid, window_start, request_count, last_request)
      VALUES (?, ?, 1, ?)
    ).run(wxid, now, now);
    return true;
  }

  if (row.request_count >= maxRequests) {
    return false;
  }

  db.prepare('UPDATE rate_limits SET request_count = request_count + 1, last_request = ? WHERE wxid = ?').run(now, wxid);
  return true;
}

export function incrementRateLimit(wxid: string): void {
  db.prepare('UPDATE rate_limits SET request_count = request_count + 1, last_request = ? WHERE wxid = ?').run(
    Date.now() / 1000,
    wxid,
  );
}

// --- Stats ---

export function getStats(): any {
  const totalUsers = db.prepare('SELECT COUNT(*) as count FROM users').get() as { count: number };
  const totalChats = db.prepare('SELECT COUNT(*) as count FROM chat_history').get() as { count: number };
  const pendingTasks = db.prepare("SELECT COUNT(*) as count FROM video_tasks WHERE status = 'pending'").get() as { count: number };
  const todayChats = db.prepare(
    SELECT COUNT(*) as count FROM chat_history
    WHERE timestamp > unixepoch('-1 day')
  ).get() as { count: number };

  return {
    totalUsers: totalUsers.count,
    totalChats: totalChats.count,
    pendingTasks: pendingTasks.count,
    todayChats: todayChats.count,
  };
}

export function getDb(): Database.Database {
  return db;
}

// Graceful shutdown
process.on('SIGINT', () => {
  db.close();
  logger.info('Database connection closed');
  process.exit(0);
});

process.on('SIGTERM', () => {
  db.close();
  logger.info('Database connection closed');
  process.exit(0);
});

export default db;
