// Added two endpoints at the last for liveness and readiness probes

const express = require('express');
const path = require('path');
const { Pool } = require('pg');

const PORT = process.env.PORT || 3000;

// DB config from env (Docker Compose)
const pool = new Pool({
  host: process.env.DB_HOST || 'localhost',
  port: process.env.DB_PORT ? parseInt(process.env.DB_PORT) : 5432,
  user: process.env.DB_USER || 'appuser',
  password: process.env.DB_PASSWORD || 'apppass',
  database: process.env.DB_NAME || 'appdb',
});

// Retry DB initialization until DB is ready
async function initDbWithRetry(retries = 30, delayMs = 2000) {
  for (let i = 1; i <= retries; i++) {
    try {
      await pool.query(`CREATE TABLE IF NOT EXISTS messages (
        id SERIAL PRIMARY KEY,
        name TEXT NOT NULL,
        message TEXT NOT NULL,
        created_at TIMESTAMP DEFAULT NOW()
      )`);
      console.log('DB ready');
      return;
    } catch (err) {
      console.log(`DB not ready yet (attempt ${i}/${retries}):`, err.message);
      await new Promise(r => setTimeout(r, delayMs));
    }
  }
  throw new Error('Could not connect to the database in time.');
}

const app = express();
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

app.get('/api/list', async (req, res) => {
  try {
    const { rows } = await pool.query('SELECT id, name, message, created_at FROM messages ORDER BY created_at DESC LIMIT 20');
    res.json(rows);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'DB error' });
  }
});

app.post('/api/submit', async (req, res) => {
  const { name, message } = req.body || {};
  if (!name || !message) return res.status(400).json({ error: 'name and message are required' });
  try {
    const { rows } = await pool.query(
      'INSERT INTO messages (name, message) VALUES ($1, $2) RETURNING id, name, message, created_at',
      [name, message]
    );
    res.status(201).json(rows[0]);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'DB insert error' });
  }
});

(async () => {
  await initDbWithRetry();
  app.listen(PORT, () => console.log(`Server listening on port ${PORT}`));
})();


// Liveness: is the process up? (No DB work here; keep it cheap.)
app.get('/livez', (_req, res) => {
  res.status(200).send('ok');
});

// Readiness: can we serve traffic? (Quick DB check.)
app.get('/healthy', async (_req, res) => {
  try {
    await pool.query('SELECT 1');
    res.status(200).send('ready');
  } catch (e) {
    res.status(503).send('db not ready');
  }
});

