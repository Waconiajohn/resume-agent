import { useEffect, useMemo, useState } from 'react';
import { FileText, LibraryBig, Plus, Sparkles } from 'lucide-react';
import { GlassCard } from '@/components/GlassCard';
import { GlassButton } from '@/components/GlassButton';
import { DashboardTabs } from '@/components/dashboard/DashboardTabs';
import { SessionHistoryTab } from '@/components/dashboard/SessionHistoryTab';
import { MasterResumeTab } from '@/components/dashboard/MasterResumeTab';
import { CoverLetterScreen } from '@/components/cover-letter/CoverLetterScreen';
import { useApplicationPipeline } from '@/hooks/useApplicationPipeline';
import { CareerProfileSummaryCard } from './CareerProfileSummaryCard';
import type { CareerProfileSummary } from './career-profile-summary';
import type { CoachSession } from '@/types/session';
import type { FinalResume, MasterResume, MasterResumeListItem } from '@/types/resume';

const TABS: Array<{ id: 'sessions' | 'cover_letter' | 'master_resume'; label: string }> = [
  { id: 'sessions', label: 'Job Workspaces' },
  { id: 'cover_letter', label: 'Cover Letter' },
  { id: 'master_resume', label: 'Master Resume' },
] ;

type ResumeWorkspaceTab = typeof TABS[number]['id'];

interface ResumeWorkshopRoomProps {
  careerProfileSummary?: CareerProfileSummary;
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
  careerProfileSummary,
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
  const [activeTab, setActiveTab] = useState<ResumeWorkspaceTab>(initialFocus === 'cover-letter' ? 'cover_letter' : 'sessions');
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
      {careerProfileSummary && (
        <CareerProfileSummaryCard
          summary={careerProfileSummary}
          title="Career Profile is shaping every tailored resume"
          description="Resume Builder uses the profile story to decide what to emphasize, what evidence to ask for, and what is worth promoting into the master resume."
          usagePoints={[
            'Your core story determines what the rewrite queue prioritizes first.',
            'Strengths and differentiators influence how AI reframes adjacent experience.',
            'Only strong, reusable edits should be promoted back into the master resume.',
          ]}
          onOpenProfile={() => onNavigate?.('/workspace?room=career-profile')}
        />
      )}

      <GlassCard className="p-6">
        <div className="flex flex-col gap-5 lg:flex-row lg:items-start lg:justify-between">
          <div className="max-w-2xl">
            <div className="text-[11px] font-medium uppercase tracking-widest text-[#98b3ff]/70">
              Resume Builder
            </div>
            <h1 className="mt-2 text-xl font-semibold text-white/90">One home for stage-aware job workspaces and your master resume</h1>
            <p className="mt-2 text-sm leading-relaxed text-white/50">
              Each target role stays grouped by company, job title, and date. Early-stage work stays lean, and interview or offer assets only surface when the application actually reaches those stages.
            </p>
          </div>

          <div className="flex flex-wrap gap-2">
            <GlassButton variant="ghost" onClick={() => onNavigate?.('/workspace?room=career-profile')}>
              Review Career Profile
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

        <div className="mt-5 grid gap-3 lg:grid-cols-3">
          <SummaryCard
            icon={FileText}
            title="Job workspaces"
            value={`${tailoredCount}`}
            description="Saved by company, job title, date, and current application stage."
          />
          <SummaryCard
            icon={LibraryBig}
            title="Master resume"
            value={defaultResume ? `v${defaultResume.version}` : 'Not set'}
            description={defaultResume ? 'Your default resume is ready for promotion-ready updates.' : 'Create or save a default resume to build a stronger base over time.'}
          />
          <SummaryCard
            icon={Sparkles}
            title="How to use this"
            value="Profile -> Tailor -> Promote"
            description="Start with Career Profile, tailor for the target role, then keep only the edits worth preserving."
          />
        </div>
      </GlassCard>

      <GlassCard className="p-5">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
          <div>
            <h2 className="text-sm font-semibold text-white/85">Resume management</h2>
            <p className="mt-1 text-xs text-white/45">
              Tailored resumes stay job-specific. Your master resume stays clean and reusable.
            </p>
          </div>
          <DashboardTabs tabs={TABS} activeTab={activeTab} onTabChange={(id) => setActiveTab(id as ResumeWorkspaceTab)} />
        </div>

        <div className="mt-5">
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
                <div className="max-w-3xl">
                  <div className="text-[11px] font-medium uppercase tracking-widest text-[#98b3ff]/70">
                    Cover Letter
                  </div>
                  <h2 className="mt-2 text-lg font-semibold text-white/88">Write the letter inside the same job-specific workflow</h2>
                  <p className="mt-2 text-sm leading-relaxed text-white/54">
                    Keep the resume and cover letter in one place. Pull from your default resume, target the current role, and avoid treating the letter like a separate product.
                  </p>
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
          )}
        </div>
      </GlassCard>
    </div>
  );
}

function SummaryCard({
  icon: Icon,
  title,
  value,
  description,
}: {
  icon: typeof FileText;
  title: string;
  value: string;
  description: string;
}) {
  return (
    <div className="rounded-xl border border-white/[0.08] bg-white/[0.03] p-4">
      <div className="flex items-center gap-2">
        <div className="rounded-lg bg-white/[0.05] p-2">
          <Icon size={16} className="text-[#98b3ff]" />
        </div>
        <div className="text-xs font-medium uppercase tracking-wider text-white/45">{title}</div>
      </div>
      <div className="mt-3 text-lg font-semibold text-white/85">{value}</div>
      <div className="mt-1 text-xs leading-relaxed text-white/45">{description}</div>
    </div>
  );
}
