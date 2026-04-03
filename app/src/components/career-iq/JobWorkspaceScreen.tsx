import { useEffect, useMemo, useState } from 'react';
import { ArrowLeft, BriefcaseBusiness } from 'lucide-react';
import { GlassCard } from '@/components/GlassCard';
import { GlassButton } from '@/components/GlassButton';
import { SessionResumeModal } from '@/components/dashboard/SessionResumeModal';
import { SessionCoverLetterModal } from '@/components/dashboard/SessionCoverLetterModal';
import { JobWorkspaceView } from '@/components/dashboard/JobWorkspaceView';
import { RESUME_BUILDER_SESSION_ROUTE } from '@/lib/app-routing';
import { useApplicationPipeline, type PipelineStage } from '@/hooks/useApplicationPipeline';
import {
  buildJobRecords,
  isWorkspaceProductType,
  productTypeForSession,
} from '@/lib/job-workspace';
import type { CoachSession } from '@/types/session';
import type { FinalResume } from '@/types/resume';

interface JobWorkspaceScreenProps {
  jobApplicationId: string;
  sessions: CoachSession[];
  loading?: boolean;
  onLoadSessions?: (filters?: { limit?: number; status?: string }) => void;
  onResumeSession: (sessionId: string) => void;
  onNavigate?: (route: string) => void;
  onGetSessionResume: (sessionId: string) => Promise<FinalResume | null>;
  onGetSessionCoverLetter: (sessionId: string) => Promise<{ letter: string; quality_score?: number | null } | null>;
}

export function JobWorkspaceScreen({
  jobApplicationId,
  sessions,
  loading = false,
  onLoadSessions,
  onResumeSession,
  onNavigate,
  onGetSessionResume,
  onGetSessionCoverLetter,
}: JobWorkspaceScreenProps) {
  const [viewingResumeSessionId, setViewingResumeSessionId] = useState<string | null>(null);
  const [viewingCoverLetterSessionId, setViewingCoverLetterSessionId] = useState<string | null>(null);
  const [savingStage, setSavingStage] = useState<PipelineStage | null>(null);
  const { applications, fetchApplications, moveToStage } = useApplicationPipeline();

  useEffect(() => {
    onLoadSessions?.();
    void fetchApplications();
  }, [fetchApplications, onLoadSessions]);

  const workspaceSessions = useMemo(
    () => sessions.filter((session) => isWorkspaceProductType(productTypeForSession(session))),
    [sessions],
  );
  const jobRecords = useMemo(() => buildJobRecords(workspaceSessions), [workspaceSessions]);
  const record = useMemo(
    () => jobRecords.find((item) => item.jobApplicationId === jobApplicationId) ?? null,
    [jobApplicationId, jobRecords],
  );
  const application = useMemo(
    () => applications.find((item) => item.id === jobApplicationId),
    [applications, jobApplicationId],
  );

  const handleMoveJobStage = async (stage: PipelineStage) => {
    if (!record) return false;
    setSavingStage(stage);
    try {
      return await moveToStage(jobApplicationId, stage);
    } finally {
      setSavingStage(null);
    }
  };

  if (loading && !record) {
    return (
      <div className="mx-auto flex max-w-[1200px] flex-col gap-6 p-6">
        <GlassCard className="p-8 text-sm text-[var(--text-soft)]">Loading job workspace...</GlassCard>
      </div>
    );
  }

  if (!record) {
    return (
      <div className="mx-auto flex max-w-[1200px] flex-col gap-6 p-6">
        <GlassCard className="p-8">
          <div className="text-[13px] font-medium uppercase tracking-widest text-[var(--link)]/70">Job Workspace</div>
          <h1 className="mt-2 text-xl font-semibold text-[var(--text-strong)]">Workspace not found</h1>
          <p className="mt-3 max-w-2xl text-sm leading-relaxed text-[var(--text-soft)]">
            We could not find saved assets linked to this job yet. Open Resume Builder to review recent tailored work or attach new assets to the application.
          </p>
          <GlassButton variant="ghost" className="mt-5" onClick={() => onNavigate?.(RESUME_BUILDER_SESSION_ROUTE)}>
            <ArrowLeft size={14} className="mr-1.5" />
            Back to Resume Builder
          </GlassButton>
        </GlassCard>
      </div>
    );
  }

  return (
    <div className="mx-auto flex max-w-[1280px] flex-col gap-6 p-6">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <button
            type="button"
            onClick={() => onNavigate?.(RESUME_BUILDER_SESSION_ROUTE)}
            className="inline-flex items-center gap-1.5 text-[13px] font-medium text-[var(--link)]"
          >
            <ArrowLeft size={14} />
            Back to Resume Builder
          </button>
          <div className="mt-4 text-[13px] font-medium uppercase tracking-widest text-[var(--link)]/70">Job Workspace</div>
          <h1 className="mt-2 text-2xl font-semibold text-[var(--text-strong)]">{record.company}</h1>
          <p className="mt-2 text-sm text-[var(--text-soft)]">
            {record.role}. This view keeps the exact saved assets, stage history, and next moves for a single application in one place.
          </p>
        </div>

        <div className="rounded-2xl border border-[var(--line-soft)] bg-[var(--accent-muted)] px-4 py-3 text-sm text-[var(--text-soft)]">
          <div className="flex items-center gap-2">
            <BriefcaseBusiness size={14} className="text-[var(--link)]" />
            Exact assets reopen from here, not just the latest output for the tool.
          </div>
        </div>
      </div>

      <JobWorkspaceView
        record={record}
        application={application}
        onMoveJobStage={async (_record, stage) => handleMoveJobStage(stage)}
        savingStage={savingStage}
        onResumeSession={onResumeSession}
        onNavigate={onNavigate}
        onViewResume={(sessionId) => setViewingResumeSessionId(sessionId)}
        onViewCoverLetter={(sessionId) => setViewingCoverLetterSessionId(sessionId)}
      />

      {viewingResumeSessionId ? (
        <SessionResumeModal
          sessionId={viewingResumeSessionId}
          onClose={() => setViewingResumeSessionId(null)}
          onGetSessionResume={onGetSessionResume}
        />
      ) : null}

      {viewingCoverLetterSessionId ? (
        <SessionCoverLetterModal
          sessionId={viewingCoverLetterSessionId}
          onClose={() => setViewingCoverLetterSessionId(null)}
          onGetSessionCoverLetter={onGetSessionCoverLetter}
        />
      ) : null}
    </div>
  );
}
