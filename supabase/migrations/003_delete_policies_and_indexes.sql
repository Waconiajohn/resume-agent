-- Migration 003: Add missing DELETE policies, complete master_resume_history policies, indexes, and JSONB constraints

-- DELETE policies for tables that only had SELECT/INSERT/UPDATE
create policy "Users can delete own resumes"
  on master_resumes for delete
  using (auth.uid() = user_id);

create policy "Users can delete own applications"
  on job_applications for delete
  using (auth.uid() = user_id);

create policy "Users can delete own sessions"
  on coach_sessions for delete
  using (auth.uid() = user_id);

-- master_resume_history only had SELECT — add INSERT, UPDATE, DELETE via owning resume
create policy "Users can insert own history"
  on master_resume_history for insert
  with check (
    exists (
      select 1 from master_resumes
      where master_resumes.id = master_resume_history.master_resume_id
        and master_resumes.user_id = auth.uid()
    )
  );

create policy "Users can update own history"
  on master_resume_history for update
  using (
    exists (
      select 1 from master_resumes
      where master_resumes.id = master_resume_history.master_resume_id
        and master_resumes.user_id = auth.uid()
    )
  );

create policy "Users can delete own history"
  on master_resume_history for delete
  using (
    exists (
      select 1 from master_resumes
      where master_resumes.id = master_resume_history.master_resume_id
        and master_resumes.user_id = auth.uid()
    )
  );

-- Indexes on user_id foreign keys for faster RLS checks
create index if not exists idx_master_resumes_user_id on master_resumes(user_id);
create index if not exists idx_job_applications_user_id on job_applications(user_id);
create index if not exists idx_coach_sessions_user_id on coach_sessions(user_id);

-- Indexes on updated_at for ordering queries
create index if not exists idx_master_resumes_updated_at on master_resumes(updated_at);
create index if not exists idx_job_applications_updated_at on job_applications(updated_at);
create index if not exists idx_coach_sessions_updated_at on coach_sessions(updated_at);

-- Index on master_resume_history foreign keys
create index if not exists idx_master_resume_history_resume_id on master_resume_history(master_resume_id);
create index if not exists idx_master_resume_history_application_id on master_resume_history(job_application_id);

-- JSONB array constraints: ensure messages and interview_responses are always arrays
alter table coach_sessions
  add constraint chk_messages_is_array
    check (jsonb_typeof(messages) = 'array');

alter table coach_sessions
  add constraint chk_interview_responses_is_array
    check (jsonb_typeof(interview_responses) = 'array');
