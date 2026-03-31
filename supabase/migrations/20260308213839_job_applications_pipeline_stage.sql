-- Add pipeline_stage column to job_applications for CareerIQ pipeline tracking
-- Separates pipeline visual tracking from application lifecycle status
ALTER TABLE public.job_applications
  ADD COLUMN IF NOT EXISTS pipeline_stage TEXT NOT NULL DEFAULT 'discovered';

-- Add index for pipeline queries (filtered on active records)
CREATE INDEX IF NOT EXISTS idx_job_applications_pipeline_stage
  ON public.job_applications (user_id, pipeline_stage)
  WHERE status != 'archived';

-- ROLLBACK: ALTER TABLE public.job_applications DROP COLUMN IF EXISTS pipeline_stage;
