INSERT INTO settings (key, value) VALUES
  ('ticker_enabled', 'false'),
  ('ticker_texts', '')
ON CONFLICT (key) DO NOTHING;
