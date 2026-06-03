const express = require('express');
const router = express.Router();
const pool = require('../db');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const crypto = require('crypto');
const { fetchCategoriesForEvent, getEvent, mapEventSummary } = require('../eventfrog');
const QRCode = require('qrcode');
const { requireAuth, maskSettings, publicSettings, shouldUpdateApiKey } = require('../auth');

const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, path.join(__dirname, '..', 'public', 'uploads'));
  },
  filename: (req, file, cb) => {
    const ext = path.extname(file.originalname);
    cb(null, `${Date.now()}-${crypto.randomBytes(16).toString('hex')}${ext}`);
  },
});
const upload = multer({
  storage,
  limits: { fileSize: 10 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    if (file.mimetype.startsWith('image/')) {
      cb(null, true);
    } else {
      cb(new Error('Only image files allowed'));
    }
  },
});

async function loadEventfrogSettings(eventIdFromQuery) {
  const eventId = (eventIdFromQuery || '').trim();
  if (!eventId) {
    return { error: 'event_id query parameter required' };
  }
  const { rows: settingRows } = await pool.query(
    "SELECT key, value FROM settings WHERE key = 'api_key'"
  );
  const apiKey = settingRows[0]?.value;
  if (!apiKey || !String(apiKey).trim()) {
    return { error: 'API-Key nicht konfiguriert (Organizer API Read)' };
  }
  return { apiKey: String(apiKey).trim(), eventId };
}

// ---- Öffentlich (Slideshow) ----

router.get('/display-settings', async (req, res) => {
  try {
    const { rows } = await pool.query('SELECT key, value FROM settings');
    const map = Object.fromEntries(rows.map((r) => [r.key, r.value]));
    res.json(publicSettings(map));
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.get('/display-screens', async (req, res) => {
  try {
    const { rows } = await pool.query(
      'SELECT * FROM screens WHERE active = true ORDER BY sort_order ASC'
    );
    res.json(rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.get('/eventfrog/event', async (req, res) => {
  try {
    const cfg = await loadEventfrogSettings(req.query.event_id);
    if (cfg.error) return res.status(400).json({ error: cfg.error });
    const { apiKey, eventId } = cfg;
    const data = await getEvent(apiKey, eventId);
    res.json({ event: mapEventSummary(data), raw: data });
  } catch (err) {
    console.error('eventfrog/event:', err.message);
    res.status(err.status || 500).json({ error: err.message });
  }
});

router.get('/eventfrog/categories', async (req, res) => {
  try {
    const cfg = await loadEventfrogSettings(req.query.event_id);
    if (cfg.error) return res.status(400).json({ error: cfg.error });
    const { apiKey, eventId } = cfg;
    const { categories, raw } = await fetchCategoriesForEvent(apiKey, eventId);
    res.json({ categories, raw });
  } catch (err) {
    console.error('eventfrog/categories:', err.message);
    res.status(err.status || 500).json({ error: err.message });
  }
});

router.get('/qrcode', async (req, res) => {
  const { url } = req.query;
  if (!url) return res.status(400).json({ error: 'url required' });
  try {
    const qr = await QRCode.toDataURL(url, { width: 400, margin: 2 });
    res.json({ qr });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.use('/auth', require('./auth'));

// ---- Geschützt (Admin) ----

router.use(requireAuth);

router.get('/eventfrog/test', async (req, res) => {
  try {
    const cfg = await loadEventfrogSettings(req.query.event_id);
    if (cfg.error) return res.status(400).json({ ok: false, error: cfg.error });
    const { apiKey, eventId } = cfg;
    const { categories, raw, sold_by_category } = await fetchCategoriesForEvent(apiKey, eventId);
    res.json({
      ok: true,
      event_id: eventId,
      categories_count: categories.length,
      sold_by_category,
      categories: categories.slice(0, 5),
      raw_type: Array.isArray(raw) ? 'array' : typeof raw,
      raw_keys: raw && typeof raw === 'object' && !Array.isArray(raw) ? Object.keys(raw) : [],
      raw_preview: JSON.stringify(raw).slice(0, 800),
    });
  } catch (err) {
    res.status(err.status || 500).json({ ok: false, error: err.message });
  }
});

router.get('/settings', async (req, res) => {
  try {
    const { rows } = await pool.query('SELECT key, value FROM settings');
    const map = Object.fromEntries(rows.map(r => [r.key, r.value]));
    res.json(maskSettings(map));
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.post('/settings', async (req, res) => {
  try {
    const { api_key, show_title, refresh_interval } = req.body;
    const refreshSec = refresh_interval !== undefined
      ? Math.max(30, Math.min(300, parseInt(refresh_interval, 10) || 30))
      : undefined;
    const updates = { show_title, refresh_interval: refreshSec !== undefined ? String(refreshSec) : undefined };
    for (const [key, value] of Object.entries(updates)) {
      if (value !== undefined) {
        await pool.query(
          'INSERT INTO settings (key, value) VALUES ($1, $2) ON CONFLICT (key) DO UPDATE SET value = $2, updated_at = NOW()',
          [key, String(value)]
        );
      }
    }
    if (shouldUpdateApiKey(api_key)) {
      await pool.query(
        'INSERT INTO settings (key, value) VALUES ($1, $2) ON CONFLICT (key) DO UPDATE SET value = $2, updated_at = NOW()',
        ['api_key', String(api_key).trim()]
      );
    }
    res.json({ success: true });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: err.message });
  }
});

router.get('/screens', async (req, res) => {
  try {
    const { rows } = await pool.query('SELECT * FROM screens ORDER BY sort_order ASC');
    res.json(rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.post('/screens', upload.single('image'), async (req, res) => {
  try {
    const {
      name, type, sort_order, duration, active,
      background_color, text_content, text_color,
      event_id, qr_url
    } = req.body;
    const image_path = req.file ? `/uploads/${req.file.filename}` : null;
    const background_image = req.body.background_image || null;

    const { rows } = await pool.query(
      `INSERT INTO screens (name, type, sort_order, duration, active, background_color, background_image, text_content, text_color, image_path, event_id, qr_url)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12) RETURNING *`,
      [name, type, parseInt(sort_order) || 0, parseInt(duration) || 10, active !== 'false',
       background_color || '#000000', background_image, text_content, text_color || '#ffffff',
       image_path, event_id, qr_url]
    );
    res.json(rows[0]);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: err.message });
  }
});

router.put('/screens/:id', upload.single('image'), async (req, res) => {
  try {
    const { id } = req.params;
    const {
      name, type, sort_order, duration, active,
      background_color, background_image, text_content, text_color,
      event_id, qr_url
    } = req.body;

    const existing = await pool.query('SELECT * FROM screens WHERE id = $1', [id]);
    if (existing.rows.length === 0) return res.status(404).json({ error: 'Not found' });
    const cur = existing.rows[0];

    let image_path = cur.image_path;
    if (req.file) {
      if (cur.image_path) {
        const oldPath = path.join(__dirname, '..', 'public', cur.image_path);
        if (fs.existsSync(oldPath)) fs.unlinkSync(oldPath);
      }
      image_path = `/uploads/${req.file.filename}`;
    }

    const { rows } = await pool.query(
      `UPDATE screens SET
        name=$1, type=$2, sort_order=$3, duration=$4, active=$5,
        background_color=$6, background_image=$7, text_content=$8,
        text_color=$9, image_path=$10, event_id=$11, qr_url=$12,
        updated_at=NOW()
       WHERE id=$13 RETURNING *`,
      [name || cur.name, type || cur.type, sort_order !== undefined ? parseInt(sort_order) : cur.sort_order,
       parseInt(duration) || cur.duration, active !== undefined ? active !== 'false' : cur.active,
       background_color || cur.background_color, background_image !== undefined ? background_image : cur.background_image,
       text_content !== undefined ? text_content : cur.text_content,
       text_color || cur.text_color, image_path, event_id !== undefined ? event_id : cur.event_id,
       qr_url !== undefined ? qr_url : cur.qr_url, id]
    );
    res.json(rows[0]);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: err.message });
  }
});

router.delete('/screens/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const existing = await pool.query('SELECT image_path FROM screens WHERE id = $1', [id]);
    if (existing.rows.length === 0) return res.status(404).json({ error: 'Not found' });
    const { image_path } = existing.rows[0];
    if (image_path) {
      const fullPath = path.join(__dirname, '..', 'public', image_path);
      if (fs.existsSync(fullPath)) fs.unlinkSync(fullPath);
    }
    await pool.query('DELETE FROM screens WHERE id = $1', [id]);
    res.json({ success: true });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: err.message });
  }
});

router.post('/screens/reorder', async (req, res) => {
  try {
    const { order } = req.body;
    for (const item of order) {
      await pool.query('UPDATE screens SET sort_order=$1 WHERE id=$2', [item.sort_order, item.id]);
    }
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.post('/upload', upload.single('image'), (req, res) => {
  if (!req.file) return res.status(400).json({ error: 'No file uploaded' });
  res.json({ path: `/uploads/${req.file.filename}` });
});

module.exports = router;
