CREATE TABLE page_text (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  page_id INTEGER NOT NULL REFERENCES page(id) ON DELETE CASCADE,
  -- All positions/sizes normalized to 0..1 of the page bounds.
  position_x REAL NOT NULL,
  position_y REAL NOT NULL,
  width REAL NOT NULL,
  height REAL NOT NULL,
  content TEXT NOT NULL,
  style_json TEXT NOT NULL,
  z_order INTEGER NOT NULL DEFAULT 0,
  created_at INTEGER NOT NULL
);
CREATE INDEX idx_page_text_page ON page_text (page_id);
