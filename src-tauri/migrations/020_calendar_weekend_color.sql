-- Color applied to Sunday's column header + Sunday date cells in the
-- calendar grid. Default red (rose-600) matches the common printed-
-- calendar convention. Set to the same value as calendar_color to
-- effectively disable weekend tinting.
ALTER TABLE project ADD COLUMN calendar_weekend_color TEXT NOT NULL DEFAULT '#dc2626';
