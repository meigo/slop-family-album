-- Per-project events for the calendar grid. Either yearly-recurring
-- (year = NULL) or one-off (year set). month is 1..12, day is 1..31.
CREATE TABLE calendar_event (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  project_id INTEGER NOT NULL REFERENCES project(id) ON DELETE CASCADE,
  month INTEGER NOT NULL CHECK (month BETWEEN 1 AND 12),
  day INTEGER NOT NULL CHECK (day BETWEEN 1 AND 31),
  year INTEGER,
  kind TEXT NOT NULL CHECK (kind IN ('birthday','anniversary','event','holiday')),
  label TEXT NOT NULL,
  created_at INTEGER NOT NULL
);

CREATE INDEX idx_calendar_event_project_month ON calendar_event (project_id, month);

-- Week start: 0 = Sunday, 1 = Monday. Default Monday (Estonian / ISO 8601).
ALTER TABLE project ADD COLUMN week_start INTEGER NOT NULL DEFAULT 1
  CHECK (week_start IN (0, 1));
