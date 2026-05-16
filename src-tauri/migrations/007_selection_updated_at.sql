ALTER TABLE selection ADD COLUMN updated_at INTEGER;
UPDATE selection SET updated_at = generated_at WHERE updated_at IS NULL;
