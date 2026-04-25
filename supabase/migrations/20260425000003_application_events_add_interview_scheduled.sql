-- Phase 3 (Pursuit Timeline) — extend application_events with interview_scheduled.
--
-- Phase 1 shipped applied / interview_happened / offer_received. Phase 3 adds:
--   * interview_scheduled — user attests an interview is on the calendar.
--                           Distinct from interview_happened (which fires after
--                           the interview occurs). Required for the N5 "prep
--                           for your interview" Next-rule.
--
-- Multi-round interviews are real: a single application can accumulate multiple
-- interview_scheduled rows (one per round). Idempotency dedup is enforced
-- application-side via (application_id, type, scheduled_date) within a 60s
-- window — see server/src/routes/application-events.ts.
--
-- The metadata payload for this type carries:
--   { scheduled_date: ISO datetime,
--     interview_type: 'phone' | 'video' | 'onsite',
--     round?: string,
--     with_whom?: string[] }

ALTER TABLE public.application_events
  DROP CONSTRAINT IF EXISTS application_events_type_check;

ALTER TABLE public.application_events
  ADD CONSTRAINT application_events_type_check CHECK (type IN (
    'applied',
    'interview_happened',
    'offer_received',
    'interview_scheduled'
  ));
