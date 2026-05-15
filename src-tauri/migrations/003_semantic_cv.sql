-- Add exposure scoring to cv_score (alongside blur, faces_count, phash).
ALTER TABLE cv_score ADD COLUMN exposure REAL;

-- Whole-image embeddings from OpenCLIP. Stored as float32 BLOB; 512-dim
-- for ViT-B/32. Renderer can decode via DataView when computing
-- "similar photos" queries.
CREATE TABLE image_embedding (
  photo_id INTEGER PRIMARY KEY REFERENCES photo(id) ON DELETE CASCADE,
  model TEXT NOT NULL,         -- e.g. 'ViT-B-32/openai' for cache invalidation
  vector BLOB NOT NULL,        -- float32 array, little-endian
  computed_at INTEGER NOT NULL
);

-- Zero-shot scene tags via OpenCLIP. One row per (photo, tag) pair so
-- we can WHERE-filter by tag efficiently. Score is the softmax over a
-- fixed prompt list, so all rows for one photo sum to ~1.
CREATE TABLE photo_tag (
  photo_id INTEGER NOT NULL REFERENCES photo(id) ON DELETE CASCADE,
  tag TEXT NOT NULL,
  score REAL NOT NULL,
  PRIMARY KEY (photo_id, tag)
);

CREATE INDEX idx_photo_tag_tag ON photo_tag (tag, score);

-- Per-face row with bbox + 128-dim SFace embedding. Phase 2a stored
-- faces as `faces_json` on cv_score; we now break them out into
-- individual rows so each face can carry an embedding and a cluster
-- assignment. cv_score.faces_count / faces_json remain a denormalized
-- cache for the library grid.
CREATE TABLE face (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  photo_id INTEGER NOT NULL REFERENCES photo(id) ON DELETE CASCADE,
  bbox_x INTEGER NOT NULL,
  bbox_y INTEGER NOT NULL,
  bbox_w INTEGER NOT NULL,
  bbox_h INTEGER NOT NULL,
  embedding BLOB NOT NULL,     -- 128-dim float32 (SFace)
  quality REAL,                -- detector confidence × normalized size
  cluster_id INTEGER REFERENCES person_cluster(id) ON DELETE SET NULL,
  computed_at INTEGER NOT NULL
);

CREATE INDEX idx_face_photo ON face (photo_id);
CREATE INDEX idx_face_cluster ON face (cluster_id);

-- Named groups of similar faces. The user names them via the People page;
-- pinning a cluster makes it "always include when present" in Phase 3
-- selection.
CREATE TABLE person_cluster (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  project_id INTEGER NOT NULL REFERENCES project(id) ON DELETE CASCADE,
  name TEXT,                   -- null = unnamed
  is_pinned INTEGER NOT NULL DEFAULT 0,
  created_at INTEGER NOT NULL
);

CREATE INDEX idx_person_cluster_project ON person_cluster (project_id);
