-- Per-project calendar grid font family. NULL = use the app's default
-- monospace (IBM Plex Mono); any value matching FONT_CATALOG triggers a
-- Google Fonts <link> injection at render time.
ALTER TABLE project ADD COLUMN calendar_font_family TEXT;
