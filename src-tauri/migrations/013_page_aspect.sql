-- NULL = use the template's own aspect (back-compat); otherwise one of
-- 'landscape' | 'portrait' | 'square' overrides templates across the
-- whole project, so pages fill the printed paper without letterboxing.
ALTER TABLE project ADD COLUMN page_aspect TEXT;
