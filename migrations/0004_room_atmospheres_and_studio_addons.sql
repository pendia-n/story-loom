ALTER TABLE chapters ADD COLUMN background_mode TEXT NOT NULL DEFAULT 'night' CHECK (background_mode IN ('morning', 'night', 'twilight', 'afternoon', 'sunrise'));
ALTER TABLE chapters ADD COLUMN background_object_key TEXT;

CREATE INDEX IF NOT EXISTS idx_purchases_user_product ON purchases(user_id, product_code, status);
