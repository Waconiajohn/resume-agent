import { Navigate, useParams } from 'react-router-dom';
import { JobWorkspaceScreen } from '@/components/career-iq/JobWorkspaceScreen';
import { RESUME_BUILDER_SESSION_ROUTE } from '@/lib/app-routing';
import type { FinalResume } from '@/types/resume';
import type { CoachSession } from '@/types/session';

interface JobWorkspaceRouteProps {
  sessions: CoachSession[];
  loading: boolean;
  onLoadSessions: (filters?: { limit?: number; status?: string }) => void;
  onResumeSession: (sessionId: string) => void;
  onNavigate: (route: string) => void;
  onGetSessionResume: (sessionId: string) => Promise<FinalResume | null>;
  onGetSessionCoverLetter: (sessionId: string) => Promise<{ letter: string; quality_score?: number | null } | null>;
}

export function JobWorkspaceRoute({
  sessions,
  loading,
  onLoadSessions,
  onResumeSession,
  onNavigate,
  onGetSessionResume,
  onGetSessionCoverLetter,
}: JobWorkspaceRouteProps) {
  const { jobId = '' } = useParams();

  if (!jobId) {
    return <Navigate to={RESUME_BUILDER_SESSION_ROUTE} replace />;
  }

  return (
    <JobWorkspaceScreen
      jobApplicationId={jobId}
      sessions={sessions}
      loading={loading}
      onLoadSessions={onLoadSessions}
      onResumeSession={onResumeSession}
      onNavigate={onNavigate}
      onGetSessionResume={onGetSessionResume}
      onGetSessionCoverLetter={onGetSessionCoverLetter}
    />
  );
}
