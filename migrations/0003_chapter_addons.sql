ALTER TABLE purchases ADD COLUMN chapter_id TEXT REFERENCES chapters(id) ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS idx_purchases_chapter ON purchases(chapter_id, status);
