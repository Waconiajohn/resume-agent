-- Product telemetry events
-- Launch-readiness instrumentation sink for the client-side core hiring funnel.

CREATE TABLE IF NOT EXISTS product_telemetry_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  client_event_id TEXT NOT NULL,
  schema_version INTEGER NOT NULL DEFAULT 1,
  event_name TEXT NOT NULL,
  occurred_at TIMESTAMPTZ NOT NULL,
  path TEXT NOT NULL,
  payload JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT product_telemetry_events_user_client_event_unique UNIQUE (user_id, client_event_id)
);

CREATE INDEX IF NOT EXISTS idx_product_telemetry_events_user_occurred_at
  ON product_telemetry_events (user_id, occurred_at DESC);

CREATE INDEX IF NOT EXISTS idx_product_telemetry_events_event_name_occurred_at
  ON product_telemetry_events (event_name, occurred_at DESC);

ALTER TABLE product_telemetry_events ENABLE ROW LEVEL SECURITY;

-- No direct client access yet. Reads and writes flow through the server using service-role auth.
