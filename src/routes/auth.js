const express = require('express');
const router = express.Router();
const { verifyUser, requireAuth } = require('../auth');

router.post('/login', async (req, res) => {
  try {
    const { username, password } = req.body;
    if (!username || !password) {
      return res.status(400).json({ error: 'Benutzername und Passwort erforderlich' });
    }
    const user = await verifyUser(username.trim(), password);
    if (!user) {
      return res.status(401).json({ error: 'Ungültige Anmeldedaten' });
    }
    req.session.userId = user.id;
    req.session.username = user.username;
    res.json({ success: true, username: user.username });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: err.message });
  }
});

router.post('/logout', requireAuth, (req, res) => {
  req.session.destroy((err) => {
    if (err) return res.status(500).json({ error: 'Abmeldung fehlgeschlagen' });
    res.clearCookie('connect.sid');
    res.json({ success: true });
  });
});

router.get('/me', requireAuth, (req, res) => {
  res.json({ username: req.session.username });
});

module.exports = router;
