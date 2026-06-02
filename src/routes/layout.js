const express = require('express');
const router = express.Router();
const multer = require('multer');
const path = require('path');
const crypto = require('crypto');
const pool = require('../db');
const { requireAuth } = require('../auth');
const {
  LAYOUT_UPLOAD_DIR,
  MAX_FOOTER_LOGOS,
  ensureLayoutUploadDir,
  parseFooterLogos,
  getLayoutFromSettings,
  safeUnlink,
  upsertSetting,
  isTruthy,
} = require('../layout');

ensureLayoutUploadDir();

const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    ensureLayoutUploadDir();
    cb(null, LAYOUT_UPLOAD_DIR);
  },
  filename: (req, file, cb) => {
    const ext = path.extname(file.originalname).toLowerCase() || '.png';
    cb(null, `${Date.now()}-${crypto.randomBytes(8).toString('hex')}${ext}`);
  },
});

const upload = multer({
  storage,
  limits: { fileSize: 10 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    if (file.mimetype.startsWith('image/')) cb(null, true);
    else cb(new Error('Nur Bilddateien erlaubt'));
  },
});

async function loadSettingsMap() {
  const { rows } = await pool.query('SELECT key, value FROM settings');
  return Object.fromEntries(rows.map((r) => [r.key, r.value]));
}

router.get('/', requireAuth, async (req, res) => {
  try {
    const map = await loadSettingsMap();
    res.json(getLayoutFromSettings(map));
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.post('/', requireAuth, upload.fields([
  { name: 'header_logo', maxCount: 1 },
  { name: 'footer_add', maxCount: MAX_FOOTER_LOGOS },
]), async (req, res) => {
  try {
    const map = await loadSettingsMap();
    const layout = getLayoutFromSettings(map);

    const header_enabled = req.body.header_enabled !== undefined
      ? isTruthy(req.body.header_enabled) : layout.header_enabled;
    const footer_enabled = req.body.footer_enabled !== undefined
      ? isTruthy(req.body.footer_enabled) : layout.footer_enabled;
    const header_title = req.body.header_title !== undefined
      ? String(req.body.header_title).trim() : layout.header_title;

    await upsertSetting(pool, 'header_enabled', header_enabled ? 'true' : 'false');
    await upsertSetting(pool, 'footer_enabled', footer_enabled ? 'true' : 'false');
    await upsertSetting(pool, 'header_title', header_title);

    let header_logo = layout.header_logo;
    if (isTruthy(req.body.remove_header_logo)) {
      safeUnlink(header_logo);
      header_logo = '';
    }
    if (req.files?.header_logo?.[0]) {
      safeUnlink(header_logo);
      header_logo = `/uploads/layout/${req.files.header_logo[0].filename}`;
    }
    await upsertSetting(pool, 'header_logo', header_logo);

    let footerLogos = [...layout.footer_logos];
    if (req.body.footer_keep) {
      try {
        const keep = JSON.parse(req.body.footer_keep);
        if (Array.isArray(keep)) {
          const keepValid = keep.filter((p) => typeof p === 'string' && p.startsWith('/uploads/'));
          layout.footer_logos.forEach((p) => {
            if (!keepValid.includes(p)) safeUnlink(p);
          });
          footerLogos = keepValid;
        }
      } catch { /* keep current */ }
    }

    if (req.body.footer_remove) {
      try {
        const remove = JSON.parse(req.body.footer_remove);
        if (Array.isArray(remove)) {
          remove.forEach((p) => {
            safeUnlink(p);
            footerLogos = footerLogos.filter((x) => x !== p);
          });
        }
      } catch { /* ignore */ }
    }

    const newFiles = req.files?.footer_add || [];
    for (const file of newFiles) {
      if (footerLogos.length >= MAX_FOOTER_LOGOS) {
        safeUnlink(`/uploads/layout/${file.filename}`);
        continue;
      }
      footerLogos.push(`/uploads/layout/${file.filename}`);
    }

    await upsertSetting(pool, 'footer_logos', JSON.stringify(footerLogos.slice(0, MAX_FOOTER_LOGOS)));

    const updated = await loadSettingsMap();
    res.json(getLayoutFromSettings(updated));
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
