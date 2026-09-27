ALTER TABLE chapters
ADD COLUMN capacity_tier TEXT CHECK (capacity_tier IN ('standard', 'zealous'));
