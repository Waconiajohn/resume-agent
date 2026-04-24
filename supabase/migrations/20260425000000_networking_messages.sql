-- Phase 2.3f — Networking Messages table.
--
-- Persistence for the thin networking-message peer tool at
-- /api/networking-message/*. One row per generated message (single-
-- recipient, single-message semantics — not a sequence).
--
-- Distinct from:
--   * networking_outreach_reports (heavier 2-agent pipeline, message
--     sequences, referral-bonus flows) — unchanged by this migration
--   * networking_contacts / contact_touchpoints (CRM side) — unchanged;
--     this product still writes a touchpoint on session completion via
--     the shared networking-crm-service

CREATE TABLE IF NOT EXISTS public.networking_messages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  session_id uuid REFERENCES public.coach_sessions(id) ON DELETE SET NULL,
  job_application_id uuid REFERENCES public.job_applications(id) ON DELETE SET NULL,

  recipient_name text NOT NULL,
  recipient_type text NOT NULL CHECK (recipient_type IN (
    'former_colleague',
    'second_degree',
    'cold',
    'referrer',
    'other'
  )),
  recipient_title text,
  recipient_company text,
  recipient_linkedin_url text,

  messaging_method text CHECK (messaging_method IN (
    'connection_request',
    'inmail',
    'group_message'
  )),

  goal text,
  context text,
  message_markdown text NOT NULL,

  created_at timestamptz NOT NULL DEFAULT now()
);

-- Indexes — user listing + per-application lookup.
CREATE INDEX IF NOT EXISTS idx_networking_messages_user_id
  ON public.networking_messages(user_id);
CREATE INDEX IF NOT EXISTS idx_networking_messages_created_at
  ON public.networking_messages(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_networking_messages_job_application_id
  ON public.networking_messages(job_application_id)
  WHERE job_application_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_networking_messages_session_id
  ON public.networking_messages(session_id)
  WHERE session_id IS NOT NULL;

-- RLS — mirrors thank_you_note_reports: user-scoped select + insert.
ALTER TABLE public.networking_messages ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own networking_messages"
  ON public.networking_messages
  FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Authenticated users can insert networking_messages"
  ON public.networking_messages
  FOR INSERT
  WITH CHECK (auth.uid() = user_id);

COMMENT ON TABLE public.networking_messages IS
  'Phase 2.3f — per-message persistence for the networking-message peer tool. Single recipient, single message per row. Distinct from networking_outreach_reports (sequences) and networking_contacts (CRM list).';
