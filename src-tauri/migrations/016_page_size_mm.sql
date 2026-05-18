-- Per-project paper size in millimeters. Replaces page_aspect (which only
-- offered A4 landscape/portrait/square) with explicit width × height so
-- online print services' standard sizes (20×20cm, 30×30cm, 8×10in, etc.)
-- can be matched. Old page_aspect column kept for safe rollback; readers
-- migrate to the new columns.
ALTER TABLE project ADD COLUMN page_size_w_mm INTEGER NOT NULL DEFAULT 297;
ALTER TABLE project ADD COLUMN page_size_h_mm INTEGER NOT NULL DEFAULT 210;

-- Backfill from page_aspect for existing rows.
UPDATE project SET page_size_w_mm = 210, page_size_h_mm = 297 WHERE page_aspect = 'portrait';
UPDATE project SET page_size_w_mm = 210, page_size_h_mm = 210 WHERE page_aspect = 'square';
-- 'landscape' and NULL stay at the column defaults (297, 210).
