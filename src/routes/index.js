const express = require('express');
const router = express.Router();
const pool = require('../db');
const { publicSettings } = require('../auth');

router.get('/', async (req, res) => {
  try {
    const { rows: screens } = await pool.query(
      "SELECT * FROM screens WHERE active = true AND type <> 'ticker' ORDER BY sort_order ASC"
    );
    const { rows: settings } = await pool.query('SELECT key, value FROM settings');
    const settingsMap = publicSettings(Object.fromEntries(settings.map(s => [s.key, s.value])));
    res.render('index', { screens, settings: settingsMap });
  } catch (err) {
    console.error(err);
    res.status(500).send('Server error');
  }
});

module.exports = router;
