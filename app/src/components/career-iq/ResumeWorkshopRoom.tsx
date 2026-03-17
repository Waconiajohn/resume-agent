import { useMemo, useState } from 'react';
import { FileText, LibraryBig, Plus, Sparkles } from 'lucide-react';
import { GlassCard } from '@/components/GlassCard';
import { GlassButton } from '@/components/GlassButton';
import { DashboardTabs } from '@/components/dashboard/DashboardTabs';
import { SessionHistoryTab } from '@/components/dashboard/SessionHistoryTab';
import { MasterResumeTab } from '@/components/dashboard/MasterResumeTab';
import type { CoachSession } from '@/types/session';
import type { FinalResume, MasterResume, MasterResumeListItem } from '@/types/resume';

const TABS = [
  { id: 'sessions', label: 'Tailored Resumes' },
  { id: 'master_resume', label: 'Master Resume' },
];

interface ResumeWorkshopRoomProps {
  sessions: CoachSession[];
  resumes: MasterResumeListItem[];
  loading: boolean;
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
  const [activeTab, setActiveTab] = useState('sessions');
  const defaultResume = useMemo(() => resumes.find((item) => item.is_default), [resumes]);
  const tailoredCount = sessions.filter((session) => {
    const type = session.product_type ?? 'resume';
    return type === 'resume' || type === 'resume_v2' || type === 'cover_letter';
  }).length;

  return (
    <div className="mx-auto flex max-w-[1400px] flex-col gap-6 p-6">
      <GlassCard className="p-6">
        <div className="flex flex-col gap-5 lg:flex-row lg:items-start lg:justify-between">
          <div className="max-w-2xl">
            <div className="text-[11px] font-medium uppercase tracking-widest text-[#98b3ff]/70">
              Resume Builder
            </div>
            <h1 className="mt-2 text-xl font-semibold text-white/90">One home for tailored resumes and your master resume</h1>
            <p className="mt-2 text-sm leading-relaxed text-white/50">
              Each tailored application is saved by company, job title, and date so you can reopen the exact version you used. Strong edits can then be promoted into your master resume when they deserve to live on.
            </p>
          </div>

          <div className="flex flex-wrap gap-2">
            <GlassButton variant="ghost" onClick={() => onNavigate?.('/workspace?room=career-profile')}>
              Review Career Profile
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
            title="Tailored work"
            value={`${tailoredCount}`}
            description="Saved by company, job title, and date."
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
          <DashboardTabs tabs={TABS} activeTab={activeTab} onTabChange={setActiveTab} />
        </div>

        <div className="mt-5">
          {activeTab === 'sessions' && (
            <SessionHistoryTab
              sessions={sessions}
              loading={loading}
              onLoadSessions={onLoadSessions}
              onResumeSession={onResumeSession}
              onDeleteSession={onDeleteSession}
              onGetSessionResume={onGetSessionResume}
              onGetSessionCoverLetter={onGetSessionCoverLetter}
            />
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
