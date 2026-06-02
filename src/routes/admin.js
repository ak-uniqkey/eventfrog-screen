const express = require('express');
const router = express.Router();
const pool = require('../db');
const { requireAuth, maskSettings, API_KEY_MASK } = require('../auth');
const { getLayoutFromSettings } = require('../layout');

router.get('/login', (req, res) => {
  if (req.session && req.session.userId) {
    const next = req.query.next || '/admin';
    return res.redirect(next.startsWith('/admin') ? next : '/admin');
  }
  res.render('login', { next: req.query.next || '/admin', error: null });
});

router.use(requireAuth);

router.get('/', async (req, res) => {
  try {
    const { rows: screens } = await pool.query(
      'SELECT * FROM screens ORDER BY sort_order ASC'
    );
    const { rows: settings } = await pool.query('SELECT key, value FROM settings');
    const rawMap = Object.fromEntries(settings.map(s => [s.key, s.value]));
    const settingsMap = maskSettings(rawMap);
    res.render('admin', {
      screens,
      settings: settingsMap,
      layout: getLayoutFromSettings(rawMap),
      username: req.session.username,
      apiKeyMask: API_KEY_MASK,
    });
  } catch (err) {
    console.error(err);
    res.status(500).send('Server error');
  }
});

module.exports = router;
