-- Performance indexes for scale (1000+ users)

-- coach_sessions: user_id used by RLS policies and session listing
create index if not exists idx_coach_sessions_user_id on coach_sessions(user_id);

-- coach_sessions: updated_at used for session ordering
create index if not exists idx_coach_sessions_updated_at on coach_sessions(updated_at desc);

-- coach_sessions: composite for common query pattern (list user sessions by status)
create index if not exists idx_coach_sessions_user_status on coach_sessions(user_id, status, updated_at desc);

-- master_resumes: user_id used by RLS policies
create index if not exists idx_master_resumes_user_id on master_resumes(user_id);

-- job_applications: user_id used by RLS policies
create index if not exists idx_job_applications_user_id on job_applications(user_id);

-- session_locks: expires_at used for expired lock cleanup queries
create index if not exists idx_session_locks_expires_at on session_locks(expires_at);
