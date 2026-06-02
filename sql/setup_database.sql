-- =============================================================================
-- EventFrog Screen – vollständiges Datenbank-Setup
-- Auf dem PostgreSQL-Server ausführen (als Superuser, z. B. postgres).
--
-- Vor dem Ausführen anpassen:
--   HIER_DB_PASSWORT_EINTRAGEN  → Passwort für den App-Datenbankbenutzer (2×)
--
-- Aufruf:
--   psql -U postgres -h DEIN_DB_HOST -f sql/setup_database.sql
--
-- Danach in der App-.env:
--   DB_NAME=eventfrog_screen
--   DB_USER=eventfrog_app
--   DB_PASSWORD=<gleiches Passwort wie im Skript>
-- =============================================================================

\set ON_ERROR_STOP on

-- -----------------------------------------------------------------------------
-- PHASE 1: Rolle und Datenbank
-- Bei erneutem Ausführen: diese Sektion auskommentieren, falls Rolle/DB existieren.
-- -----------------------------------------------------------------------------

CREATE ROLE eventfrog_app WITH
  LOGIN
  PASSWORD 'HIER_DB_PASSWORT_EINTRAGEN'
  NOSUPERUSER
  NOCREATEDB
  NOCREATEROLE;

SELECT 'CREATE DATABASE eventfrog_screen OWNER eventfrog_app ENCODING ''UTF8'''
WHERE NOT EXISTS (SELECT 1 FROM pg_database WHERE datname = 'eventfrog_screen')\gexec

GRANT CONNECT, TEMPORARY ON DATABASE eventfrog_screen TO eventfrog_app;

-- -----------------------------------------------------------------------------
-- PHASE 2: Tabellen und Standarddaten
-- -----------------------------------------------------------------------------

\connect eventfrog_screen

GRANT USAGE, CREATE ON SCHEMA public TO eventfrog_app;

BEGIN;

CREATE TABLE IF NOT EXISTS settings (
  id SERIAL PRIMARY KEY,
  key VARCHAR(255) UNIQUE NOT NULL,
  value TEXT,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS screens (
  id SERIAL PRIMARY KEY,
  name VARCHAR(255) NOT NULL,
  type VARCHAR(50) NOT NULL,
  sort_order INTEGER DEFAULT 0,
  duration INTEGER DEFAULT 10,
  active BOOLEAN DEFAULT true,
  background_color VARCHAR(7) DEFAULT '#000000',
  background_image VARCHAR(500),
  text_content TEXT,
  text_color VARCHAR(7) DEFAULT '#ffffff',
  image_path VARCHAR(500),
  event_id VARCHAR(255),
  qr_url VARCHAR(500),
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS users (
  id SERIAL PRIMARY KEY,
  username VARCHAR(255) UNIQUE NOT NULL,
  password_hash VARCHAR(255) NOT NULL,
  active BOOLEAN DEFAULT true,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS "session" (
  sid VARCHAR NOT NULL,
  sess JSON NOT NULL,
  expire TIMESTAMP(6) NOT NULL,
  CONSTRAINT session_pkey PRIMARY KEY (sid)
);

CREATE INDEX IF NOT EXISTS idx_session_expire ON "session" (expire);

INSERT INTO settings (key, value) VALUES
  ('api_key', ''),
  ('event_id', ''),
  ('show_title', 'Event Information Screen'),
  ('currency', 'EUR'),
  ('refresh_interval', '15'),
  ('header_enabled', 'true'),
  ('header_title', ''),
  ('header_logo', ''),
  ('footer_enabled', 'true'),
  ('footer_logos', '[]')
ON CONFLICT (key) DO NOTHING;

COMMIT;

GRANT ALL PRIVILEGES ON ALL TABLES IN SCHEMA public TO eventfrog_app;
GRANT ALL PRIVILEGES ON ALL SEQUENCES IN SCHEMA public TO eventfrog_app;

ALTER DEFAULT PRIVILEGES IN SCHEMA public
  GRANT ALL ON TABLES TO eventfrog_app;
ALTER DEFAULT PRIVILEGES IN SCHEMA public
  GRANT ALL ON SEQUENCES TO eventfrog_app;

-- -----------------------------------------------------------------------------
-- PHASE 3: Admin-Login der App (auf dem App-Server):
--   npm run create-user -- admin DEIN_SICHERES_PASSWORT
-- -----------------------------------------------------------------------------
