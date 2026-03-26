const express = require('express');
const router = express.Router();
const pool = require('../db');

router.get('/', async (req, res) => {
  try {
    const { rows: screens } = await pool.query(
      'SELECT * FROM screens ORDER BY sort_order ASC'
    );
    const { rows: settings } = await pool.query('SELECT key, value FROM settings');
    const settingsMap = Object.fromEntries(settings.map(s => [s.key, s.value]));
    res.render('admin', { screens, settings: settingsMap });
  } catch (err) {
    console.error(err);
    res.status(500).send('Server error');
  }
});

module.exports = router;
