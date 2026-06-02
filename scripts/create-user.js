#!/usr/bin/env node
require('dotenv').config();
const pool = require('../src/db');
const { createUser } = require('../src/auth');

async function main() {
  const username = process.argv[2];
  const password = process.argv[3];

  if (!username || !password) {
    console.error('Verwendung: npm run create-user -- <benutzername> <passwort>');
    process.exit(1);
  }

  if (password.length < 8) {
    console.error('Passwort muss mindestens 8 Zeichen lang sein.');
    process.exit(1);
  }

  try {
    const user = await createUser(username, password);
    console.log(`Benutzer "${user.username}" (id ${user.id}) wurde angelegt.`);
  } catch (err) {
    if (err.code === '23505') {
      console.error(`Benutzer "${username}" existiert bereits.`);
    } else {
      console.error(err.message);
    }
    process.exit(1);
  } finally {
    await pool.end();
  }
}

main();
