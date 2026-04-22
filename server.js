const express = require('express');
const path = require('path');
const fs = require('fs');
const crypto = require('crypto');
const bcrypt = require('bcryptjs');
const cookieParser = require('cookie-parser');
const Database = require('better-sqlite3');

const PORT = process.env.PORT || 3000;
const DB_PATH = process.env.DB_PATH || path.join(__dirname, 'data', 'scores.db');
const SESSION_DURATION = 30 * 24 * 3600; // 30 ימים

// ודא שתיקיית הנתונים קיימת
const dataDir = path.dirname(DB_PATH);
if (!fs.existsSync(dataDir)) fs.mkdirSync(dataDir, { recursive: true });

// === DB Setup ===
const db = new Database(DB_PATH);
db.pragma('journal_mode = WAL');
db.exec(`
  CREATE TABLE IF NOT EXISTS scores (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    time INTEGER NOT NULL,
    moves INTEGER NOT NULL,
    date TEXT NOT NULL,
    created_at INTEGER DEFAULT (strftime('%s', 'now'))
  );
  CREATE INDEX IF NOT EXISTS idx_time ON scores(time);

  CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    username TEXT UNIQUE NOT NULL COLLATE NOCASE,
    password_hash TEXT NOT NULL,
    created_at INTEGER DEFAULT (strftime('%s', 'now')),
    streak INTEGER DEFAULT 0,
    best_streak INTEGER DEFAULT 0,
    coins INTEGER DEFAULT 0,
    hints INTEGER DEFAULT 0,
    owned_skins TEXT DEFAULT '["default"]',
    active_skin TEXT DEFAULT 'default'
  );

  CREATE TABLE IF NOT EXISTS sessions (
    token TEXT PRIMARY KEY,
    user_id INTEGER NOT NULL,
    expires_at INTEGER NOT NULL,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
  );
  CREATE INDEX IF NOT EXISTS idx_sessions_expires ON sessions(expires_at);
`);

// מיגרציה: הוסף עמודת user_id לטבלת scores אם אינה קיימת
try { db.exec('ALTER TABLE scores ADD COLUMN user_id INTEGER DEFAULT NULL'); } catch {}

// ניקוי sessions פגות תוקף
setInterval(() => {
  const now = Math.floor(Date.now() / 1000);
  db.prepare('DELETE FROM sessions WHERE expires_at < ?').run(now);
}, 3600_000); // אחת לשעה

// === App Setup ===
const app = express();
app.use(express.json({ limit: '16kb' }));
app.use(cookieParser());

// Rate limit בסיסי
const rateMap = new Map();
app.use((req, res, next) => {
  const ip = req.ip || req.socket.remoteAddress || 'unknown';
  const now = Date.now();
  const entry = rateMap.get(ip) || { count: 0, reset: now + 60_000 };
  if (now > entry.reset) { entry.count = 0; entry.reset = now + 60_000; }
  entry.count++;
  rateMap.set(ip, entry);
  if (entry.count > 120) return res.status(429).json({ error: 'Too many requests' });
  next();
});

// === Helper Functions ===
function createSession(userId) {
  const token = crypto.randomBytes(32).toString('hex');
  const expiresAt = Math.floor(Date.now() / 1000) + SESSION_DURATION;
  db.prepare('INSERT INTO sessions (token, user_id, expires_at) VALUES (?, ?, ?)').run(token, userId, expiresAt);
  return { token, expiresAt };
}

function cookieOptions() {
  return {
    httpOnly: true,
    sameSite: 'lax',
    maxAge: SESSION_DURATION * 1000,
    path: '/'
  };
}

function getUserFromRequest(req) {
  const token = req.cookies && req.cookies.session;
  if (!token) return null;
  const session = db.prepare('SELECT user_id, expires_at FROM sessions WHERE token = ?').get(token);
  if (!session || session.expires_at < Math.floor(Date.now() / 1000)) return null;
  return db.prepare('SELECT id, username, streak, best_streak, coins, hints, owned_skins, active_skin FROM users WHERE id = ?').get(session.user_id);
}

function requireAuth(req, res, next) {
  const user = getUserFromRequest(req);
  if (!user) return res.status(401).json({ error: 'Unauthorized' });
  req.user = user;
  next();
}

function formatUser(row) {
  return {
    id: row.id,
    username: row.username,
    streak: row.streak || 0,
    bestStreak: row.best_streak || 0,
    coins: row.coins || 0,
    hints: row.hints || 0,
    ownedSkins: safeJsonParse(row.owned_skins) || ['default'],
    activeSkin: row.active_skin || 'default'
  };
}
function safeJsonParse(str) { try { return JSON.parse(str); } catch { return null; } }

// === Auth Endpoints ===
app.post('/api/auth/register', (req, res) => {
  try {
    const { username, password } = req.body || {};
    if (typeof username !== 'string') return res.status(400).json({ error: 'Username required' });
    const uname = username.trim();
    if (uname.length < 3 || uname.length > 20) return res.status(400).json({ error: 'Username must be 3-20 characters' });
    if (!/^[a-zA-Z0-9_\u0590-\u05FF-]+$/.test(uname)) return res.status(400).json({ error: 'Invalid username characters' });
    if (typeof password !== 'string' || password.length < 4 || password.length > 100) {
      return res.status(400).json({ error: 'Password must be 4-100 characters' });
    }

    const hash = bcrypt.hashSync(password, 10);
    let result;
    try {
      result = db.prepare('INSERT INTO users (username, password_hash) VALUES (?, ?)').run(uname, hash);
    } catch (e) {
      if (String(e.message).includes('UNIQUE')) return res.status(409).json({ error: 'Username already taken' });
      throw e;
    }
    const session = createSession(result.lastInsertRowid);
    res.cookie('session', session.token, cookieOptions());
    const user = db.prepare('SELECT * FROM users WHERE id = ?').get(result.lastInsertRowid);
    res.json({ user: formatUser(user) });
  } catch (err) {
    console.error('register error:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

app.post('/api/auth/login', (req, res) => {
  try {
    const { username, password } = req.body || {};
    if (typeof username !== 'string' || typeof password !== 'string') {
      return res.status(400).json({ error: 'Invalid credentials' });
    }
    const user = db.prepare('SELECT * FROM users WHERE username = ?').get(username.trim());
    if (!user || !bcrypt.compareSync(password, user.password_hash)) {
      return res.status(401).json({ error: 'Invalid credentials' });
    }
    const session = createSession(user.id);
    res.cookie('session', session.token, cookieOptions());
    res.json({ user: formatUser(user) });
  } catch (err) {
    console.error('login error:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

app.post('/api/auth/logout', (req, res) => {
  const token = req.cookies && req.cookies.session;
  if (token) db.prepare('DELETE FROM sessions WHERE token = ?').run(token);
  res.clearCookie('session', { path: '/' });
  res.json({ ok: true });
});

app.get('/api/auth/me', (req, res) => {
  const user = getUserFromRequest(req);
  if (!user) return res.status(401).json({ error: 'Not logged in' });
  res.json({ user: formatUser(user) });
});

// === User Data Endpoint ===
app.post('/api/user/data', requireAuth, (req, res) => {
  try {
    const { streak, bestStreak, coins, hints, ownedSkins, activeSkin } = req.body || {};
    const updates = [];
    const values = [];
    if (typeof streak === 'number' && streak >= 0) { updates.push('streak = ?'); values.push(Math.floor(streak)); }
    if (typeof bestStreak === 'number' && bestStreak >= 0) { updates.push('best_streak = ?'); values.push(Math.floor(bestStreak)); }
    if (typeof coins === 'number' && coins >= 0) { updates.push('coins = ?'); values.push(Math.floor(coins)); }
    if (typeof hints === 'number' && hints >= 0) { updates.push('hints = ?'); values.push(Math.floor(hints)); }
    if (Array.isArray(ownedSkins)) { updates.push('owned_skins = ?'); values.push(JSON.stringify(ownedSkins.slice(0, 50))); }
    if (typeof activeSkin === 'string') { updates.push('active_skin = ?'); values.push(activeSkin.slice(0, 40)); }
    if (updates.length === 0) return res.status(400).json({ error: 'No valid fields' });
    values.push(req.user.id);
    db.prepare(`UPDATE users SET ${updates.join(', ')} WHERE id = ?`).run(...values);
    res.json({ ok: true });
  } catch (err) {
    console.error('user/data error:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

// === Scores Endpoints ===
app.get('/api/scores', (_req, res) => {
  try {
    const rows = db.prepare(
      'SELECT name, time, moves, date FROM scores ORDER BY time ASC LIMIT 100'
    ).all();
    res.json(rows);
  } catch (err) {
    console.error('GET /api/scores error:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

app.post('/api/scores', (req, res) => {
  try {
    const authUser = getUserFromRequest(req);
    const { name, time, moves, date } = req.body || {};
    if (typeof time !== 'number' || time < 0 || time > 86400) return res.status(400).json({ error: 'Invalid time' });
    if (typeof moves !== 'number' || moves < 0 || moves > 10000) return res.status(400).json({ error: 'Invalid moves' });
    if (typeof date !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(date)) return res.status(400).json({ error: 'Invalid date' });

    // אם מחובר — השם נלקח מהמשתמש. אחרת, name מה-body.
    const safeName = authUser ? authUser.username : (typeof name === 'string' && name.trim() ? name.trim().slice(0, 30) : 'Anonymous');

    db.prepare(
      'INSERT INTO scores (name, time, moves, date, user_id) VALUES (?, ?, ?, ?, ?)'
    ).run(safeName, Math.floor(time), Math.floor(moves), date, authUser ? authUser.id : null);
    res.json({ ok: true });
  } catch (err) {
    console.error('POST /api/scores error:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

// === Static Files ===
app.get('/', (_req, res) => {
  res.setHeader('Cache-Control', 'no-cache');
  res.sendFile(path.join(__dirname, 'escape-room.html'));
});
app.get('/fred.jpg', (_req, res) => {
  res.setHeader('Cache-Control', 'public, max-age=3600');
  res.sendFile(path.join(__dirname, 'fred.jpg'));
});

app.listen(PORT, '0.0.0.0', () => {
  console.log(`🎮 Escape Room running on http://0.0.0.0:${PORT}`);
  console.log(`📊 Database: ${DB_PATH}`);
});
