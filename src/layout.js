const path = require('path');
const fs = require('fs');

const LAYOUT_UPLOAD_DIR = path.join(__dirname, 'public', 'uploads', 'layout');
const MAX_FOOTER_LOGOS = 8;

function ensureLayoutUploadDir() {
  if (!fs.existsSync(LAYOUT_UPLOAD_DIR)) {
    fs.mkdirSync(LAYOUT_UPLOAD_DIR, { recursive: true });
  }
}

function parseFooterLogos(value) {
  if (!value) return [];
  try {
    const arr = JSON.parse(value);
    if (!Array.isArray(arr)) return [];
    return arr.filter((p) => typeof p === 'string' && p.startsWith('/uploads/')).slice(0, MAX_FOOTER_LOGOS);
  } catch {
    return [];
  }
}

function isTruthy(value) {
  return value === true || value === 'true' || value === '1';
}

function parseTickerTexts(value) {
  if (!value) return [];
  return String(value)
    .split(/\s*\*\*\*\s*/)
    .map((s) => s.trim())
    .filter(Boolean);
}

function getLayoutFromSettings(map) {
  return {
    header_enabled: isTruthy(map.header_enabled !== undefined ? map.header_enabled : 'true'),
    header_title: map.header_title || '',
    header_logo: map.header_logo || '',
    footer_enabled: isTruthy(map.footer_enabled !== undefined ? map.footer_enabled : 'true'),
    footer_logos: parseFooterLogos(map.footer_logos),
    ticker_enabled: isTruthy(map.ticker_enabled),
    ticker_texts: map.ticker_texts || '',
    ticker_text_list: parseTickerTexts(map.ticker_texts),
  };
}

function safeUnlink(publicPath) {
  if (!publicPath || !publicPath.startsWith('/uploads/')) return;
  const fullPath = path.join(__dirname, 'public', publicPath.replace(/^\//, ''));
  if (fs.existsSync(fullPath)) fs.unlinkSync(fullPath);
}

async function upsertSetting(pool, key, value) {
  await pool.query(
    'INSERT INTO settings (key, value) VALUES ($1, $2) ON CONFLICT (key) DO UPDATE SET value = $2, updated_at = NOW()',
    [key, value]
  );
}

module.exports = {
  LAYOUT_UPLOAD_DIR,
  MAX_FOOTER_LOGOS,
  ensureLayoutUploadDir,
  parseFooterLogos,
  parseTickerTexts,
  getLayoutFromSettings,
  safeUnlink,
  upsertSetting,
  isTruthy,
};
