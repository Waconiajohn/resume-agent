-- Phase 3 of Approach C — drop the legacy application_pipeline table.
--
-- Pre-flight executed 2026-04-22 confirmed:
--  - application_pipeline had 0 rows (Phase 0.4 data migrate completed)
--  - No FKs point INTO application_pipeline (Phase 0.5 re-pointed
--    networking_contacts.job_application_id and interview_debriefs)
--  - No remaining code references the table:
--      - Frontend useApplicationPipeline hook deleted
--      - Server application-pipeline.ts route deleted + unmounted
--      - Server extension.ts swapped to job_applications
--      - Server networking-contacts.ts already reads job_applications
--      - Server tests migrated
--
-- Destructive but reversible via point-in-time restore on the Supabase side
-- if needed. Safe to run — no user data at risk.

DROP TABLE IF EXISTS public.application_pipeline;
