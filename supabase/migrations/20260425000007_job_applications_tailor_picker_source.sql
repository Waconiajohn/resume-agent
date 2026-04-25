-- Support Resume Builder picker clients that create job_applications with
-- source='tailor_picker'. Older DBs already have the source CHECK constraint
-- from 20260421, so widen it in-place instead of relying only on the edited
-- base migration.

ALTER TABLE public.job_applications
  DROP CONSTRAINT IF EXISTS job_applications_source_check;

ALTER TABLE public.job_applications
  ADD CONSTRAINT job_applications_source_check
  CHECK (source IS NULL OR source IN (
    'job_finder',
    'manual',
    'referral',
    'linkedin',
    'indeed',
    'tailor_picker',
    'other'
  ));
