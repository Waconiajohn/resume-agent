-- Add product_type column to coach_sessions
ALTER TABLE coach_sessions ADD COLUMN IF NOT EXISTS product_type TEXT DEFAULT 'resume';

-- Backfill from last_panel_data if available
UPDATE coach_sessions
SET product_type = COALESCE(last_panel_data->>'product_type', 'resume')
WHERE product_type IS NULL OR product_type = 'resume';

-- Index for filtering
CREATE INDEX IF NOT EXISTS idx_coach_sessions_product_type ON coach_sessions(product_type);
