const express = require('express');
const router = express.Router();
const pool = require('../db');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const crypto = require('crypto');
const { getEvent, getEventCategories } = require('../eventfrog');
const QRCode = require('qrcode');
const { requireAuth, maskSettings, shouldUpdateApiKey } = require('../auth');

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

function parseCategories(data) {
  if (!data) return [];
  return data.categories || data.ticketCategories || data.ticketcategories
    || (Array.isArray(data) ? data : []);
}

async function loadEventfrogSettings(eventIdOverride) {
  const { rows: settingRows } = await pool.query(
    "SELECT key, value FROM settings WHERE key IN ('api_key','event_id')"
  );
  const settings = Object.fromEntries(settingRows.map(r => [r.key, r.value]));
  const eventId = eventIdOverride || settings.event_id;
  return { apiKey: settings.api_key, eventId };
}

// ---- Öffentlich (Slideshow) ----

router.get('/eventfrog/event', async (req, res) => {
  try {
    const { apiKey, eventId } = await loadEventfrogSettings(req.query.event_id);
    if (!apiKey || !eventId) {
      return res.status(400).json({ error: 'API key or Event ID not configured' });
    }
    const data = await getEvent(apiKey, eventId);
    res.json(data);
  } catch (err) {
    console.error(err.message);
    res.status(500).json({ error: err.message });
  }
});

router.get('/eventfrog/categories', async (req, res) => {
  try {
    const { apiKey, eventId } = await loadEventfrogSettings(req.query.event_id);
    if (!apiKey || !eventId) {
      return res.status(400).json({ error: 'API key or Event ID not configured' });
    }
    const data = await getEventCategories(apiKey, eventId);
    res.json(data);
  } catch (err) {
    console.error(err.message);
    res.status(500).json({ error: err.message });
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
    const { api_key, event_id, show_title, currency, refresh_interval } = req.body;
    const updates = { event_id, show_title, currency, refresh_interval };
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
