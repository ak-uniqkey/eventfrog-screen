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

INSERT INTO settings (key, value) VALUES
  ('api_key', ''),
  ('event_id', ''),
  ('show_title', 'Event Information Screen'),
  ('currency', 'CHF')
ON CONFLICT (key) DO NOTHING;
