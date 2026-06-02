INSERT INTO settings (key, value) VALUES
  ('header_enabled', 'true'),
  ('header_title', ''),
  ('header_logo', ''),
  ('footer_enabled', 'true'),
  ('footer_logos', '[]')
ON CONFLICT (key) DO NOTHING;
