# EventFrog Screen

Webanwendung für einen Linux-Webserver mit zwei Ebenen: eine **öffentliche Vollbild-Slideshow** für Besucher vor Ort und eine **geschützte Admin-Oberfläche** zur Konfiguration. Die Slideshow zeigt Live-Daten von [Eventfrog](https://www.eventfrog.ch) (Ticketverfügbarkeit, Preise) im Wechsel mit Sponsoren-Bildern, QR-Codes und eigenen Inhalten.

## Funktionen

- **Slideshow** (`/`): Vollbild-Anzeige, automatischer Wechsel, Tastatursteuerung (Pfeiltasten, Leertaste, `F` für Fullscreen)
- **Ticket-Tabelle**: Pro Screen eine Event-ID, Anzeige als Tabelle (Kategorie, freie Plätze, Preis)
- **Auto-Refresh**: Live-Aktualisierung der Ticket-Screens (Intervall in Sekunden, konfigurierbar)
- **Multi-Event**: Jedes Event über die Event-ID am jeweiligen Screen
- **Admin** (`/admin`): Screens verwalten, Eventfrog-Anbindung, Uploads — nur nach Login
- **Auth**: Benutzer in PostgreSQL, Session-basiert, API-Key wird nicht im Klartext ausgeliefert

## Voraussetzungen

- **Node.js** 20 oder neuer
- **PostgreSQL** 16 (kann auf einem **separaten Server** laufen)
- Eventfrog **API-Key** und **Event-ID** für dein Event

## Projektstruktur

```
sql/setup_database.sql   # Einmaliges DB-Setup (externer DB-Server)
migrations/              # Automatische Schema-Updates beim App-Start
src/                     # Express-App, Routes, Views
scripts/create-user.js   # Ersten Admin-Benutzer anlegen
```

## Installation

### 1. Code bereitstellen

Repository klonen und Abhängigkeiten installieren:

```bash
git clone <repository-url>
cd eventfrog-screen
npm install
```

### 2. Datenbank einrichten

Auf dem **PostgreSQL-Server** als Superuser (z. B. `postgres`):

1. In `sql/setup_database.sql` das Passwort `HIER_DB_PASSWORT_EINTRAGEN` durch ein sicheres Passwort ersetzen (für den DB-Benutzer `eventfrog_app`).
2. Skript ausführen:

```bash
psql -U postgres -h DEIN_DB_HOST -f sql/setup_database.sql
```

Das Skript legt an: DB-Benutzer `eventfrog_app`, Datenbank `eventfrog_screen`, Tabellen (`settings`, `screens`, `users`, `session`) und Standard-Einstellungen.

In der `.env` dann `DB_USER=eventfrog_app` und `DB_PASSWORD` mit dem gleichen Passwort wie im Skript setzen.

> Beim App-Start werden zusätzlich die Dateien in `migrations/` angewendet (z. B. für Updates auf bestehenden Installationen).

### 3. Umgebungsvariablen

`.env` im Projektroot anlegen (Vorlage: `.env.example`):

| Variable | Beschreibung |
|----------|--------------|
| `DB_HOST` | Hostname des PostgreSQL-Servers |
| `DB_PORT` | Port (Standard: `5432`) |
| `DB_NAME` | Datenbankname (`eventfrog_screen`) |
| `DB_USER` | DB-Benutzer |
| `DB_PASSWORD` | DB-Passwort |
| `PORT` | HTTP-Port **nur lokal** (Standard: `3000`) |
| `SESSION_SECRET` | Langer Zufallsstring für Sessions (**Pflicht in Produktion**) |
| `NODE_ENV` | `production` auf dem Live-Server |

Auf dem **Produktionsserver** keinen `PORT` in der `.env` setzen — der App-Port kommt aus der GitHub-Variable **`APP_PORT`** (siehe Deployment).

### 4. Admin-Benutzer anlegen

Mindestens ein Benutzer für den Admin-Zugang:

```bash
npm run create-user -- admin DEIN_SICHERES_PASSWORT
```

Passwort: mindestens 8 Zeichen. Weitere Benutzer mit gleichem Befehl und anderem Benutzernamen.

### 5. Anwendung starten

Entwicklung (mit Neustart bei Dateiänderung):

```bash
npm run dev
```

Produktion:

```bash
npm start
```

Auf dem Server empfiehlt sich **PM2** (siehe Deployment). Die App lauscht auf `http://localhost:PORT`.

## URLs

| Pfad | Beschreibung |
|------|--------------|
| `/` | Öffentliche Slideshow |
| `/admin` | Admin (Redirect zu Login wenn nicht angemeldet) |
| `/admin/login` | Anmeldung |

## Admin konfigurieren

Unter **Header & Footer**:

- **Header**: Logo links, Titel Mitte, Uhrzeit rechts (24h, automatisch)
- **Footer**: 1–8 Logos, einheitliche Höhe, Seitenverhältnis bleibt erhalten

Nach dem Login unter **General Settings**:

- **Organizer API Key (Bearer)**: Schlüssel vom Typ „Organizer API (Read)“ in Eventfrog (nicht Public API / Embed). Key nur neu setzen, wenn du ihn änderst.
- **API testen**: Event-ID eingeben und „Testen“ — zeigt, ob Kategorien geladen werden.
- **Show Title**: Browser-Titel der Slideshow
- **Currency**: Währung für Preisanzeige (z. B. `CHF`)
- **Auto-Refresh**: Sekunden zwischen Live-Aktualisierungen (min. 5, Standard 15)

Unter **Screens** Slides anlegen und per Drag & Drop sortieren:

| Typ | Inhalt |
|-----|--------|
| `tickets` | Tabelle: Kategoriename, freie Plätze, Preis (**Event-ID am Screen Pflicht**) |
| `qrcode` | QR-Code zu einer Buchungs-URL |
| `sponsor` | Bild-Upload + optionaler Text |

Pro Screen: Dauer, Farben, Hintergrundbild, Reihenfolge, aktiv/inaktiv. Bei Tickets: **Eventfrog Event-ID** (ein Event pro Screen).

Uploads landen in `src/public/uploads/` (beim Deploy nicht überschreiben).

## API und Sicherheit

| Endpunkt | Zugriff |
|----------|---------|
| `GET /api/eventfrog/event` | Öffentlich (Slideshow) |
| `GET /api/eventfrog/categories` | Öffentlich (Slideshow) |
| `GET /api/qrcode` | Öffentlich (Slideshow) |
| `POST /api/auth/login` | Öffentlich |
| `POST /api/auth/logout` | Nur eingeloggt |
| `GET/POST /api/settings` | Nur eingeloggt |
| `GET/POST/PUT/DELETE /api/screens` | Nur eingeloggt |
| `POST /api/upload` | Nur eingeloggt |

Sessions werden in PostgreSQL (`session`-Tabelle) gespeichert. Rate-Limit: 120 Requests pro Minute (global).

**Hinweis:** Die öffentlichen Eventfrog-Proxys nutzen den serverseitig gespeicherten API-Key. Schütze den Server und setze `SESSION_SECRET` sowie HTTPS (z. B. über nginx) in Produktion.

## Deployment (Linux)

Typischer Ablauf:

1. Node.js 20 und PM2 auf dem App-Server
2. PostgreSQL erreichbar (Firewall: nur App-Server → DB)
3. `.env` auf dem Server mit Produktionswerten
4. `npm ci --omit=dev` und `npm start` bzw. PM2

Bei Push auf `main` deployt GitHub Actions per SSH/rsync (`.github/workflows/deploy.yml`). PM2 startet die App mit `ecosystem.config.cjs`; der Port wird aus der Repository-Variable **`APP_PORT`** gesetzt (nicht aus `PORT` in der Server-`.env`).

GitHub Variables (Settings → Actions → Variables): u. a. `APP_NAME`, `APP_PORT`, `DEPLOY_PATH`, `SERVER_HOST`, …

Dabei bleiben Server-`.env` und `src/public/uploads/` erhalten.

Reverse-Proxy (nginx) Beispiel — Port = Wert von `APP_PORT`:

```nginx
location / {
  proxy_pass http://127.0.0.1:DEIN_APP_PORT;
  proxy_http_version 1.1;
  proxy_set_header Host $host;
  proxy_set_header X-Real-IP $remote_addr;
  proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
  proxy_set_header X-Forwarded-Proto $scheme;
}
```

`NODE_ENV=production` und `trust proxy` in der App setzen sichere Session-Cookies voraus.

## Slideshow am Display

- Browser im Vollbild (`F` oder Kiosk-Modus)
- Nur aktive Screens werden angezeigt
- Bei fehlender Konfiguration: Hinweis „Keine Screens konfiguriert“ (ohne Admin-Link)

## Fehlerbehebung

| Problem | Lösung |
|---------|--------|
| „Nicht angemeldet“ im Admin | Unter `/admin/login` anmelden; `SESSION_SECRET` prüfen |
| Keine Ticketdaten | API-Key in den Settings; **Event-ID am Screen** gesetzt; Eventfrog-API erreichbar |
| DB-Verbindung schlägt fehl | `DB_*` in `.env`, Firewall, PostgreSQL `pg_hba.conf` |
| Kein Admin-Login möglich | `npm run create-user` erneut ausführen (anderer Username wenn belegt) |
| Uploads fehlen nach Deploy | `src/public/uploads/` auf dem Server persistieren (nicht löschen) |

## Lizenz / Support

Internes Event-Display-Tool für Eventfrog-Events. API-Dokumentation: [Eventfrog API](https://api.eventfrog.net).
