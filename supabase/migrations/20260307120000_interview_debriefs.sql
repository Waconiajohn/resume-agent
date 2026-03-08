-- Interview Debriefs — structured post-interview capture
-- Part of Phase 4A: Interview Prep Enhancement (Sprint 46)

create table if not exists interview_debriefs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  job_application_id uuid, -- nullable FK to application_pipeline
  company_name text not null,
  role_title text not null,
  interview_date date not null default current_date,
  interview_type text not null default 'video' check (interview_type in ('phone', 'video', 'onsite')),
  overall_impression text not null default 'neutral' check (overall_impression in ('positive', 'neutral', 'negative')),
  what_went_well text not null default '',
  what_went_poorly text not null default '',
  questions_asked jsonb not null default '[]'::jsonb,
  interviewer_notes jsonb not null default '[]'::jsonb,
  company_signals text not null default '',
  follow_up_actions text not null default '',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- RLS
alter table interview_debriefs enable row level security;

create policy "Users can read own debriefs"
  on interview_debriefs for select
  using (auth.uid() = user_id);

create policy "Users can insert own debriefs"
  on interview_debriefs for insert
  with check (auth.uid() = user_id);

create policy "Users can update own debriefs"
  on interview_debriefs for update
  using (auth.uid() = user_id);

create policy "Users can delete own debriefs"
  on interview_debriefs for delete
  using (auth.uid() = user_id);

-- Indexes
create index idx_interview_debriefs_user_id on interview_debriefs(user_id);
create index idx_interview_debriefs_job_application_id on interview_debriefs(job_application_id) where job_application_id is not null;

-- Updated_at trigger
create trigger set_interview_debriefs_updated_at
  before update on interview_debriefs
  for each row
  execute function moddatetime(updated_at);
