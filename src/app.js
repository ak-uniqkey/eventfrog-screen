require('dotenv').config();
const express = require('express');
const path = require('path');
const pool = require('./db');
const fs = require('fs');
const rateLimit = require('express-rate-limit');

const app = express();
if (!process.env.PORT) {
  throw new Error('PORT environment variable is required. Configure PORT in deployment or .env.');
}

const portValue = process.env.PORT.trim();
if (!portValue) {
  throw new Error('PORT environment variable is required. Configure PORT in deployment or .env.');
}

const PORT = Number(portValue);
if (!Number.isInteger(PORT)) {
  throw new Error('PORT environment variable must be an integer.');
}

if (PORT < 1 || PORT > 65535) {
  throw new Error('PORT environment variable must be a valid port number (1-65535).');
}

app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));

app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(express.static(path.join(__dirname, 'public')));

// Apply rate limiting to all routes
const limiter = rateLimit({
  windowMs: 60 * 1000,
  max: 120,
  standardHeaders: true,
  legacyHeaders: false,
});
app.use(limiter);

const uploadsDir = path.join(__dirname, 'public', 'uploads');
if (!fs.existsSync(uploadsDir)) {
  fs.mkdirSync(uploadsDir, { recursive: true });
}

async function initDB() {
  try {
    const sqlPath = path.join(__dirname, '..', 'migrations', '001_init.sql');
    const sql = fs.readFileSync(sqlPath, 'utf8');
    await pool.query(sql);
    console.log('Database initialized');
  } catch (err) {
    console.error('DB init error:', err.message);
  }
}

app.use('/', require('./routes/index'));
app.use('/admin', require('./routes/admin'));
app.use('/api', require('./routes/api'));

initDB().then(() => {
  app.listen(PORT, () => {
    console.log(`Server running on http://localhost:${PORT}`);
  });
});
