const express = require('express');
const path = require('path');
const fs = require('fs');
const Database = require('better-sqlite3');

const PORT = process.env.PORT || 3000;
const DB_PATH = process.env.DB_PATH || path.join(__dirname, 'data', 'scores.db');

// ודא שתיקיית הנתונים קיימת
const dataDir = path.dirname(DB_PATH);
if (!fs.existsSync(dataDir)) fs.mkdirSync(dataDir, { recursive: true });

// הגדרת מסד הנתונים
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
`);

const app = express();
app.use(express.json({ limit: '16kb' }));

// Rate limit — עד 60 בקשות לדקה לכל IP
const rateMap = new Map();
app.use((req, res, next) => {
  const ip = req.ip || req.socket.remoteAddress || 'unknown';
  const now = Date.now();
  const entry = rateMap.get(ip) || { count: 0, reset: now + 60_000 };
  if (now > entry.reset) { entry.count = 0; entry.reset = now + 60_000; }
  entry.count++;
  rateMap.set(ip, entry);
  if (entry.count > 60) return res.status(429).json({ error: 'Too many requests' });
  next();
});

// === API ===
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
    const { name, time, moves, date } = req.body || {};
    if (typeof name !== 'string' || !name.trim()) return res.status(400).json({ error: 'Invalid name' });
    if (typeof time !== 'number' || time < 0 || time > 86400) return res.status(400).json({ error: 'Invalid time' });
    if (typeof moves !== 'number' || moves < 0 || moves > 10000) return res.status(400).json({ error: 'Invalid moves' });
    if (typeof date !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(date)) return res.status(400).json({ error: 'Invalid date' });

    const safeName = name.trim().slice(0, 30);
    db.prepare(
      'INSERT INTO scores (name, time, moves, date) VALUES (?, ?, ?, ?)'
    ).run(safeName, Math.floor(time), Math.floor(moves), date);
    res.json({ ok: true });
  } catch (err) {
    console.error('POST /api/scores error:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

// === קבצים סטטיים ===
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
