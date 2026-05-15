-- Per-photo computer-vision outputs. Phase 2a stores blur, face count,
-- and perceptual hash. Phase 2b will extend with embeddings + tags;
-- those go in separate tables, not new columns here.
CREATE TABLE cv_score (
  photo_id INTEGER PRIMARY KEY REFERENCES photo(id) ON DELETE CASCADE,
  blur REAL,             -- Laplacian variance, normalized by image area (higher = sharper)
  faces_count INTEGER,   -- Haar cascade detection count
  faces_json TEXT,       -- bounding boxes as JSON array: [{x,y,w,h}, ...]
  phash TEXT,            -- 64-bit perceptual hash, hex-encoded
  computed_at INTEGER NOT NULL
);

CREATE INDEX idx_cv_score_phash ON cv_score (phash);

-- Duplicate groups. The representative is the highest-blur (sharpest)
-- member; others are demoted in selection scoring (Phase 3).
CREATE TABLE duplicate_group (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  project_id INTEGER NOT NULL REFERENCES project(id) ON DELETE CASCADE,
  representative_photo_id INTEGER NOT NULL REFERENCES photo(id) ON DELETE CASCADE,
  created_at INTEGER NOT NULL
);

CREATE TABLE duplicate_group_member (
  group_id INTEGER NOT NULL REFERENCES duplicate_group(id) ON DELETE CASCADE,
  photo_id INTEGER NOT NULL REFERENCES photo(id) ON DELETE CASCADE,
  PRIMARY KEY (group_id, photo_id)
);

CREATE INDEX idx_dup_member_photo ON duplicate_group_member (photo_id);
