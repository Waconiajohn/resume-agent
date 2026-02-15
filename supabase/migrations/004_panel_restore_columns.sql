-- Add columns to persist last panel state for session restore on reconnect
ALTER TABLE coach_sessions
  ADD COLUMN IF NOT EXISTS last_panel_type text,
  ADD COLUMN IF NOT EXISTS last_panel_data jsonb;
