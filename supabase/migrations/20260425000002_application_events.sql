-- Phase 1 (Pursuit Timeline) — application_events table.
--
-- Discrete moments in a pursuit that aren't stage transitions:
--   * applied              — user submitted the application (manual button,
--                            cover-letter complete CTA, V3 complete CTA, or
--                            Chrome extension fire)
--   * interview_happened   — user attests an interview took place. Distinct
--                            from interview_debriefs (a debrief is optional;
--                            this event is the canonical "it happened" signal)
--   * offer_received       — user got an offer (manual button — explicit
--                            event so the timeline can react before the user
--                            moves the kanban card)
--
-- Distinct from job_applications.stage_history (stage transitions only) and
-- distinct from interview_debriefs (which is the optional rich post-interview
-- artifact). Events are the spine the pursuit timeline reads from.

CREATE TABLE IF NOT EXISTS public.application_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  job_application_id uuid NOT NULL REFERENCES public.job_applications(id) ON DELETE CASCADE,

  type text NOT NULL CHECK (type IN (
    'applied',
    'interview_happened',
    'offer_received'
  )),

  occurred_at timestamptz NOT NULL DEFAULT now(),
  metadata jsonb,

  created_at timestamptz NOT NULL DEFAULT now()
);

-- Per-application timeline lookup (Phase 3's main query) — sorted descending.
CREATE INDEX IF NOT EXISTS idx_application_events_app_type_occurred
  ON public.application_events(job_application_id, type, occurred_at DESC);

-- Cross-pursuit aggregation (Phase 5's "Today" view).
CREATE INDEX IF NOT EXISTS idx_application_events_user_type_occurred
  ON public.application_events(user_id, type, occurred_at DESC);

-- RLS — same shape as the other reports tables (user-scoped select + insert).
-- Updates and deletes intentionally not exposed; events are an append-only
-- ledger. Edits live on the parent artifacts (debriefs, notes), not here.
ALTER TABLE public.application_events ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own application_events"
  ON public.application_events
  FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Authenticated users can insert application_events"
  ON public.application_events
  FOR INSERT
  WITH CHECK (auth.uid() = user_id);

COMMENT ON TABLE public.application_events IS
  'Phase 1 of pursuit timeline — discrete moments per pursuit (applied / interview_happened / offer_received). Append-only. Distinct from job_applications.stage_history (stage transitions) and interview_debriefs (optional rich post-interview artifact).';
