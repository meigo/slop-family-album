-- Calendar grid styling — controls cell borders. Three values:
--   'boxed'  — full border around every cell (current/default)
--   'lines'  — horizontal divider above each row, no vertical lines
--   'none'   — no rules at all, just spacing
-- Day digits are larger when boxed/lines/none alike now that event
-- rendering is suspended (events still stored in calendar_event but
-- not drawn on the grid; future TODO to re-enable with a different
-- visual treatment).
ALTER TABLE project ADD COLUMN calendar_grid_style TEXT NOT NULL DEFAULT 'boxed';
