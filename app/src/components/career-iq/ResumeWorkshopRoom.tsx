import { useEffect, useMemo, useState } from 'react';
import { Plus } from 'lucide-react';
import { GlassCard } from '@/components/GlassCard';
import { GlassButton } from '@/components/GlassButton';
import { SessionHistoryTab } from '@/components/dashboard/SessionHistoryTab';
import { MasterResumeTab } from '@/components/dashboard/MasterResumeTab';
import { CoverLetterScreen } from '@/components/cover-letter/CoverLetterScreen';
import { useApplicationPipeline } from '@/hooks/useApplicationPipeline';
import type { CoachSession } from '@/types/session';
import type { FinalResume, MasterResume, MasterResumeListItem } from '@/types/resume';

type ResumeWorkspaceTab = 'sessions' | 'master_resume' | 'cover_letter';

interface ResumeWorkshopRoomProps {
  sessions: CoachSession[];
  resumes: MasterResumeListItem[];
  loading: boolean;
  accessToken?: string | null;
  initialFocus?: string;
  resumesLoading?: boolean;
  onNewSession: () => void;
  onResumeSession: (sessionId: string) => void;
  onNavigate?: (route: string) => void;
  onLoadSessions?: (filters?: { limit?: number; status?: string }) => void;
  onLoadResumes?: () => void;
  onDeleteSession?: (sessionId: string) => Promise<boolean>;
  onGetSessionResume?: (sessionId: string) => Promise<FinalResume | null>;
  onGetSessionCoverLetter?: (sessionId: string) => Promise<{ letter: string; quality_score?: number | null } | null>;
  onGetDefaultResume?: () => Promise<MasterResume | null>;
  onGetResumeById?: (resumeId: string) => Promise<MasterResume | null>;
  onUpdateMasterResume?: (resumeId: string, changes: Record<string, unknown>) => Promise<MasterResume | null>;
  onGetResumeHistory?: (resumeId: string) => Promise<Array<{ id: string; changes_summary: string; created_at: string }>>;
  onSetDefaultResume?: (resumeId: string) => Promise<boolean>;
  onDeleteResume?: (resumeId: string) => Promise<boolean>;
}

export function ResumeWorkshopRoom({
  sessions,
  resumes,
  loading,
  accessToken = null,
  initialFocus,
  resumesLoading = false,
  onNewSession,
  onResumeSession,
  onNavigate,
  onLoadSessions = () => undefined,
  onLoadResumes = () => undefined,
  onDeleteSession = async () => false,
  onGetSessionResume = async () => null,
  onGetSessionCoverLetter = async () => null,
  onGetDefaultResume = async () => null,
  onGetResumeById = async () => null,
  onUpdateMasterResume = async () => null,
  onGetResumeHistory = async () => [],
  onSetDefaultResume = async () => false,
  onDeleteResume = async () => false,
}: ResumeWorkshopRoomProps) {
  const [activeTab, setActiveTab] = useState<ResumeWorkspaceTab>(
    initialFocus === 'cover-letter' ? 'cover_letter' : initialFocus === 'master-resume' ? 'master_resume' : 'sessions',
  );
  const applicationPipeline = useApplicationPipeline();
  const { applications: jobApplications, moveToStage, fetchApplications } = applicationPipeline;
  const defaultResume = useMemo(() => resumes.find((item) => item.is_default), [resumes]);
  const tailoredCount = sessions.filter((session) => {
    const type = session.product_type ?? 'resume';
    return type === 'resume' || type === 'resume_v2' || type === 'cover_letter';
  }).length;

  useEffect(() => {
    void fetchApplications();
  }, [fetchApplications]);

  useEffect(() => {
    if (initialFocus === 'cover-letter') {
      setActiveTab('cover_letter');
      return;
    }
    if (initialFocus === 'master-resume') {
      setActiveTab('master_resume');
      return;
    }
    if (!initialFocus) {
      setActiveTab('sessions');
    }
  }, [initialFocus]);

  const openCoverLetter = () => {
    setActiveTab('cover_letter');
    onNavigate?.('/workspace?room=resume&focus=cover-letter');
  };

  return (
    <div className="mx-auto flex max-w-[1400px] flex-col gap-6 p-6">
      <GlassCard className="p-6">
        <div className="flex flex-col gap-5 lg:flex-row lg:items-start lg:justify-between">
          <div className="max-w-2xl">
            <div className="text-[11px] font-medium uppercase tracking-widest text-[#98b3ff]/70">
              Resume Builder
            </div>
            <h1 className="mt-2 text-xl font-semibold text-white/90">Your home for tailored resumes</h1>
            <p className="mt-2 text-sm leading-relaxed text-white/50">
              Most work should happen in job workspaces. Open Master Resume or Cover Letter when you need them, then come right back.
            </p>
            <div className="mt-4 flex flex-wrap items-center gap-2 text-xs">
              <span className="rounded-full border border-white/[0.1] bg-white/[0.04] px-3 py-1 font-medium text-white/68">
                {tailoredCount} job workspaces
              </span>
              <span className="rounded-full border border-white/[0.1] bg-white/[0.04] px-3 py-1 font-medium text-white/68">
                {defaultResume ? `Master resume v${defaultResume.version}` : 'No master resume yet'}
              </span>
            </div>
          </div>

          <div className="flex flex-wrap gap-2">
            <GlassButton variant="ghost" onClick={() => setActiveTab('master_resume')}>
              Open Master Resume
            </GlassButton>
            <GlassButton variant="ghost" onClick={openCoverLetter}>
              Write Cover Letter
            </GlassButton>
            <GlassButton variant="primary" onClick={onNewSession}>
              <Plus size={16} className="mr-1.5" />
              New Tailored Resume
            </GlassButton>
          </div>
        </div>

      </GlassCard>

      <GlassCard className="p-5">
        <div className="mb-5 flex flex-wrap items-center gap-2">
          <span className="rounded-full border border-white/[0.1] bg-white/[0.04] px-3 py-1 text-xs font-medium text-white/62">
            Job Workspaces
          </span>
          {activeTab === 'cover_letter' && (
            <span className="rounded-full border border-[#98b3ff]/20 bg-[#98b3ff]/10 px-3 py-1 text-xs font-medium text-[#d8e2ff]">
              Cover Letter
            </span>
          )}
          {activeTab === 'master_resume' && (
            <span className="rounded-full border border-[#b5dec2]/20 bg-[#b5dec2]/10 px-3 py-1 text-xs font-medium text-[#d6f0df]">
              Master Resume
            </span>
          )}
        </div>

        <div>
          {activeTab === 'sessions' && (
            <SessionHistoryTab
              sessions={sessions}
              jobApplications={jobApplications}
              loading={loading}
              onLoadSessions={onLoadSessions}
              onResumeSession={onResumeSession}
              onNavigate={onNavigate}
              onMoveJobStage={moveToStage}
              onDeleteSession={onDeleteSession}
              onGetSessionResume={onGetSessionResume}
              onGetSessionCoverLetter={onGetSessionCoverLetter}
            />
          )}

          {activeTab === 'cover_letter' && (
            <div className="space-y-5">
              <GlassCard className="p-5">
                <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
                  <div className="max-w-3xl">
                    <div className="text-[11px] font-medium uppercase tracking-widest text-[#98b3ff]/70">
                      Cover Letter
                    </div>
                    <h2 className="mt-2 text-lg font-semibold text-white/88">Write the cover letter in the same workflow</h2>
                    <p className="mt-2 text-sm leading-relaxed text-white/54">
                      Start from your resume, target the current role, and keep the letter tied to the same job workspace.
                    </p>
                  </div>
                  <div className="flex flex-col items-start gap-2">
                    <GlassButton variant="ghost" onClick={() => setActiveTab('sessions')}>
                      Back to Job Workspaces
                    </GlassButton>
                  </div>
                </div>
              </GlassCard>

              <CoverLetterScreen
                accessToken={accessToken}
                onNavigate={onNavigate ?? (() => undefined)}
                onGetDefaultResume={onGetDefaultResume}
                embedded
                backTarget="/workspace?room=resume"
                backLabel="Back to Job Workspaces"
              />
            </div>
          )}

          {activeTab === 'master_resume' && (
            <div className="space-y-5">
              <GlassCard className="p-5">
                <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
                  <div className="max-w-3xl">
                    <div className="text-[11px] font-medium uppercase tracking-widest text-[#b5dec2]/70">
                      Master Resume
                    </div>
                    <h2 className="mt-2 text-lg font-semibold text-white/88">Keep your long-term resume clean, current, and reusable</h2>
                    <p className="mt-2 text-sm leading-relaxed text-white/54">
                      Use this as the durable base you promote strong edits into after job-specific work proves worth keeping.
                    </p>
                  </div>
                  <div className="flex flex-col items-start gap-2">
                    <GlassButton variant="ghost" onClick={() => setActiveTab('sessions')}>
                      Back to Job Workspaces
                    </GlassButton>
                  </div>
                </div>
              </GlassCard>

              <MasterResumeTab
                resumes={resumes}
                loading={resumesLoading}
                onLoadResumes={onLoadResumes}
                onGetDefaultResume={onGetDefaultResume}
                onGetResumeById={onGetResumeById}
                onUpdateMasterResume={onUpdateMasterResume}
                onSetDefaultResume={onSetDefaultResume}
                onDeleteResume={onDeleteResume}
                onGetResumeHistory={onGetResumeHistory}
                sessions={sessions}
              />
            </div>
          )}
        </div>
      </GlassCard>
    </div>
  );
}
