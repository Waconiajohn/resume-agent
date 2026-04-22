-- Approach C, Phase 0.5 — Add canonical job_application_id FKs to
-- networking_contacts and interview_debriefs.
--
-- Both of these tables previously referenced application_pipeline (the
-- parallel kanban table). Consolidating onto job_applications as the single
-- application parent.
--
-- Strategy: add the new job_application_id column FK'ing job_applications(id).
-- Leave any pre-existing application_id / application_pipeline reference
-- columns alone — Phase 3 drops application_pipeline and those columns
-- together after a soak period.

-- networking_contacts — the local repo's 20260308310000 migration would add
-- application_id FK'ing application_pipeline. That migration wasn't applied
-- to production; we skip it and go straight to the canonical column.
alter table if exists public.networking_contacts
  add column if not exists job_application_id uuid
    references public.job_applications(id) on delete set null,
  add column if not exists contact_role text
    check (contact_role is null or contact_role in ('hiring_manager', 'team_leader', 'peer', 'hr_recruiter'));

create index if not exists idx_networking_contacts_job_application_id
  on public.networking_contacts(job_application_id)
  where job_application_id is not null;

comment on column public.networking_contacts.job_application_id is
  'Canonical FK linking a networking contact to the job application they are relevant to. Added 2026-04-21 (Approach C Phase 0.5). Supersedes the unapplied application_id column from the 20260308310000 migration.';
comment on column public.networking_contacts.contact_role is
  'Role category for Rule of Four tracking: hiring_manager, team_leader, peer, hr_recruiter. Added 2026-04-21.';

-- interview_debriefs — already has a nullable job_application_id uuid column
-- (since 20260308213215) but no FK enforcement. Add the FK now pointing at
-- job_applications. Pre-existing NULL values and any values that happen to
-- match a job_applications row stay valid; non-matching values would violate
-- the FK — acceptable with 0 production users.
do $$
begin
  if exists (
    select 1 from information_schema.columns
    where table_schema='public' and table_name='interview_debriefs' and column_name='job_application_id'
  ) and not exists (
    select 1 from information_schema.table_constraints
    where table_schema='public' and table_name='interview_debriefs' and constraint_type='FOREIGN KEY'
      and constraint_name='interview_debriefs_job_application_id_fkey'
  ) then
    alter table public.interview_debriefs
      add constraint interview_debriefs_job_application_id_fkey
      foreign key (job_application_id) references public.job_applications(id) on delete set null;
  end if;
end $$;

comment on column public.interview_debriefs.job_application_id is
  'Canonical FK to the job application this debrief pertains to. FK enforcement added 2026-04-21 (Approach C Phase 0.5). Column itself dates to 20260308213215.';
