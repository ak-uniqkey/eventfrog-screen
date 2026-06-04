const bcrypt = require('bcrypt');
const pool = require('./db');
const { parseFooterLogos, isTruthy } = require('./layout');

const SALT_ROUNDS = 12;
const API_KEY_MASK = '********';

function requireAuth(req, res, next) {
  if (req.session && req.session.userId) {
    return next();
  }
  if (req.originalUrl.startsWith('/api')) {
    return res.status(401).json({ error: 'Nicht angemeldet' });
  }
  const nextUrl = encodeURIComponent(req.originalUrl || '/admin');
  return res.redirect(`/admin/login?next=${nextUrl}`);
}

async function verifyUser(username, password) {
  const { rows } = await pool.query(
    'SELECT id, username, password_hash FROM users WHERE username = $1 AND active = true',
    [username]
  );
  if (rows.length === 0) return null;
  const user = rows[0];
  const ok = await bcrypt.compare(password, user.password_hash);
  if (!ok) return null;
  return { id: user.id, username: user.username };
}

async function hashPassword(password) {
  return bcrypt.hash(password, SALT_ROUNDS);
}

async function createUser(username, password) {
  const passwordHash = await hashPassword(password);
  const { rows } = await pool.query(
    'INSERT INTO users (username, password_hash) VALUES ($1, $2) RETURNING id, username',
    [username, passwordHash]
  );
  return rows[0];
}

const PUBLIC_SETTING_KEYS = [
  'show_title', 'refresh_interval',
  'header_enabled', 'header_title', 'header_logo',
  'footer_enabled', 'footer_logos',
  'ticker_enabled', 'ticker_texts',
];

function maskSettings(map) {
  const out = { ...map };
  out.api_key_set = Boolean(map.api_key && String(map.api_key).length > 0);
  out.api_key = '';
  return out;
}

function publicSettings(map) {
  const out = {};
  for (const key of PUBLIC_SETTING_KEYS) {
    if (map[key] !== undefined) out[key] = map[key];
  }
  if (!out.refresh_interval) out.refresh_interval = '30';
  out.header_enabled = isTruthy(out.header_enabled !== undefined ? out.header_enabled : 'true');
  out.footer_enabled = isTruthy(out.footer_enabled !== undefined ? out.footer_enabled : 'true');
  out.header_title = out.header_title || '';
  out.header_logo = out.header_logo || '';
  out.footer_logos = parseFooterLogos(out.footer_logos);
  out.ticker_enabled = isTruthy(out.ticker_enabled);
  out.ticker_texts = out.ticker_texts || '';
  return out;
}

function shouldUpdateApiKey(value) {
  if (value === undefined || value === null) return false;
  const s = String(value).trim();
  if (!s || s === API_KEY_MASK) return false;
  return true;
}

module.exports = {
  requireAuth,
  verifyUser,
  hashPassword,
  createUser,
  maskSettings,
  publicSettings,
  shouldUpdateApiKey,
  API_KEY_MASK,
};
