-- Job workspace asset linkage
-- Adds stable session and job-application references to later-stage report tables
-- so saved assets can be reopened from a specific job workspace.

alter table if exists public.interview_prep_reports
  add column if not exists session_id uuid references public.coach_sessions(id) on delete set null;

create index if not exists idx_interview_prep_reports_session_id
  on public.interview_prep_reports(session_id)
  where session_id is not null;

alter table if exists public.thank_you_note_reports
  add column if not exists session_id uuid references public.coach_sessions(id) on delete set null,
  add column if not exists job_application_id uuid references public.job_applications(id) on delete set null;

create index if not exists idx_thank_you_note_reports_session_id
  on public.thank_you_note_reports(session_id)
  where session_id is not null;

create index if not exists idx_thank_you_note_reports_job_application_id
  on public.thank_you_note_reports(job_application_id)
  where job_application_id is not null;

alter table if exists public.ninety_day_plan_reports
  add column if not exists session_id uuid references public.coach_sessions(id) on delete set null,
  add column if not exists job_application_id uuid references public.job_applications(id) on delete set null;

create index if not exists idx_ninety_day_plan_reports_session_id
  on public.ninety_day_plan_reports(session_id)
  where session_id is not null;

create index if not exists idx_ninety_day_plan_reports_job_application_id
  on public.ninety_day_plan_reports(job_application_id)
  where job_application_id is not null;

alter table if exists public.salary_negotiation_reports
  add column if not exists session_id uuid references public.coach_sessions(id) on delete set null,
  add column if not exists job_application_id uuid references public.job_applications(id) on delete set null;

create index if not exists idx_salary_negotiation_reports_session_id
  on public.salary_negotiation_reports(session_id)
  where session_id is not null;

create index if not exists idx_salary_negotiation_reports_job_application_id
  on public.salary_negotiation_reports(job_application_id)
  where job_application_id is not null;
