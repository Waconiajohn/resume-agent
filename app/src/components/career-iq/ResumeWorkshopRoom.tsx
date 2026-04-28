import { useEffect, useMemo, useState } from 'react';
import { BriefcaseBusiness, FilePlus2, FileText, LibraryBig } from 'lucide-react';
import { GlassCard } from '@/components/GlassCard';
import { GlassButton } from '@/components/GlassButton';
import { SessionHistoryTab } from '@/components/dashboard/SessionHistoryTab';
import { MasterResumeTab } from '@/components/dashboard/MasterResumeTab';
import { CoverLetterScreen } from '@/components/cover-letter/CoverLetterScreen';
import { useApplicationPipeline } from '@/hooks/useJobApplications';
import { useV3Master } from '@/hooks/useV3Master';
import { buildResumeWorkspaceRoute } from '@/lib/app-routing';
import { useTailorPicker } from '@/components/applications/TailorPickerProvider';
import type { CoachSession } from '@/types/session';
import type { FinalResume, MasterResume, MasterResumeListItem } from '@/types/resume';

type ResumeWorkspaceTab = 'tools' | 'sessions' | 'master_resume' | 'cover_letter';

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
    initialFocus === 'cover-letter'
      ? 'cover_letter'
      : initialFocus === 'master-resume'
      ? 'master_resume'
      : initialFocus === 'job-workspaces'
      ? 'sessions'
      : 'tools',
  );
  const applicationPipeline = useApplicationPipeline();
  const { applications: jobApplications, moveToStage, fetchApplications } = applicationPipeline;
  const { openPicker } = useTailorPicker();
  // Phase 2 (pursuit timeline) — the "New Role-Specific Resume" CTA always
  // opens the picker. The legacy onNewSession prop is kept on the
  // signature for back-compat with mocks/tests but unused at runtime.
  const handleStartTailor = () => openPicker({ source: 'workshop_landing' });
  const defaultResume = useMemo(() => resumes.find((item) => item.is_default), [resumes]);
  // Sprint B5 — the v3 pipeline keeps its own master (the "knowledge base")
  // at /api/v3-pipeline/master, which is what the resume intake form reads.
  // Before this fix the landing only checked the legacy v2 master_resumes
  // table for is_default=true and said "Missing" even when a v3 knowledge
  // base existed. Show the v3 master when the legacy default is absent.
  const v3Master = useV3Master(accessToken);
  const masterLabel = defaultResume
    ? `v${defaultResume.version}`
    : v3Master.summary
      ? `v${v3Master.summary.version}`
      : v3Master.loading
        ? '…'
        : 'Missing';
  const masterDetail = defaultResume
    ? `Default version: v${defaultResume.version}`
    : v3Master.summary
      ? `Knowledge base v${v3Master.summary.version} · ${v3Master.summary.positionCount ?? 0} positions`
      : v3Master.loading
        ? 'Loading…'
        : 'No source resume yet';
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
    if (initialFocus === 'job-workspaces') {
      setActiveTab('sessions');
      return;
    }
    if (!initialFocus) {
      setActiveTab('tools');
    }
  }, [initialFocus]);

  const openTools = () => {
    setActiveTab('tools');
    onNavigate?.(buildResumeWorkspaceRoute());
  };

  const openJobWorkspaces = () => {
    setActiveTab('sessions');
    onNavigate?.(buildResumeWorkspaceRoute('job-workspaces'));
  };

  const openMasterResume = () => {
    setActiveTab('master_resume');
    onNavigate?.(buildResumeWorkspaceRoute('master-resume'));
  };

  const openCoverLetter = () => {
    setActiveTab('cover_letter');
    onNavigate?.(buildResumeWorkspaceRoute('cover-letter'));
  };

  return (
    <div className="room-shell">
      <GlassCard className="p-7">
        <div className="room-header">
          <div className="room-header-copy">
            <div className="eyebrow-label">Tailor Resume</div>
            <h1 className="room-title">Tailor your resume to a job you actually want</h1>
            <p className="room-subtitle">
              Choose a saved job or add a job description. CareerIQ compares the role to your Benchmark Profile, strengthens the match, and helps you export a resume built for that opportunity.
            </p>
            <div className="room-meta-strip mt-5">
              <div className="room-meta-item">
                Saved tailored resumes
                <strong>{tailoredCount}</strong>
              </div>
              <div className="room-meta-item">
                Source material
                <strong>{masterLabel}</strong>
              </div>
            </div>
          </div>
        </div>

      </GlassCard>

      {activeTab === 'tools' && (
        <div className="grid gap-4 xl:grid-cols-2">
          <ResumeToolCard
            eyebrow="Primary"
            title="Tailor Resume to a Job"
            description="Select a saved job and build a resume that mirrors the role, proves your fit, and positions you as the benchmark candidate."
            meta="Best after you have found or saved a real role"
            icon={FilePlus2}
            actionLabel="Tailor My Resume"
            onAction={handleStartTailor}
            accent="primary"
          />
          <ResumeToolCard
            eyebrow="Source Material"
            title="Base Resume & Proof"
            description="Keep your base resume, trophies, proof points, and positioning clean so every tailored resume starts from accurate source material."
            meta={masterDetail}
            icon={LibraryBig}
            actionLabel="Open Source Material"
            onAction={openMasterResume}
          />
          <ResumeToolCard
            eyebrow="Optional Asset"
            title="Cover Letter"
            description="Draft a cover letter for a saved job when the application actually asks for one."
            meta="Use when a real application actually needs one"
            icon={FileText}
            actionLabel="Write Cover Letter"
            onAction={openCoverLetter}
          />
          <ResumeToolCard
            eyebrow="Saved Work"
            title="Saved Tailored Resumes"
            description="Reopen resumes and related assets you already created for specific jobs."
            meta={`${tailoredCount} saved tailored resume${tailoredCount === 1 ? '' : 's'}`}
            icon={BriefcaseBusiness}
            actionLabel="Browse Saved Resumes"
            onAction={openJobWorkspaces}
          />
        </div>
      )}

      {activeTab === 'sessions' && (
        <GlassCard className="p-6">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
            <div className="max-w-3xl">
              <div className="eyebrow-label">Saved Tailored Resumes</div>
              <h2 className="mt-2 text-2xl text-[var(--text-strong)]">Reopen resumes built for specific jobs</h2>
              <p className="mt-3 text-sm leading-relaxed text-[var(--text-muted)]">
                This is the archive of job-specific resumes and linked assets. Use it when you need to revisit previous work by company, role, and date.
              </p>
            </div>
            <div className="flex flex-col items-start gap-2">
              <GlassButton variant="ghost" onClick={openTools}>
                Back to Tailor Resume
              </GlassButton>
            </div>
          </div>

          <div className="mt-6">
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
          </div>
        </GlassCard>
      )}

      {activeTab === 'cover_letter' && (
        <div className="space-y-5">
          <GlassCard className="p-6">
            <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
              <div className="max-w-3xl">
                <div className="eyebrow-label">
                  Cover Letter
                </div>
                <h2 className="mt-2 text-2xl text-[var(--text-strong)]">Write the cover letter in the same workflow</h2>
                <p className="mt-3 text-sm leading-relaxed text-[var(--text-muted)]">
                  Start from your resume, target the current role, and keep the letter tied to the same job workspace.
                </p>
              </div>
              <div className="flex flex-col items-start gap-2">
                <GlassButton variant="ghost" onClick={openTools}>
                  Back to Tailor Resume
                </GlassButton>
              </div>
            </div>
          </GlassCard>

          <CoverLetterScreen
            accessToken={accessToken}
            onNavigate={onNavigate ?? (() => undefined)}
            onGetDefaultResume={onGetDefaultResume}
            embedded
            backTarget={buildResumeWorkspaceRoute()}
            backLabel="Back to Tailor Resume"
          />
        </div>
      )}

      {activeTab === 'master_resume' && (
        <div className="space-y-5">
          <GlassCard className="p-6">
            <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
              <div className="max-w-3xl">
                <div className="eyebrow-label">
                  Source Material
                </div>
                <h2 className="mt-2 text-2xl text-[var(--text-strong)]">Keep your base resume and proof points clean, current, and reusable</h2>
                <p className="mt-3 text-sm leading-relaxed text-[var(--text-muted)]">
                  Use this as the durable base you promote strong edits into after job-specific work proves worth keeping.
                </p>
              </div>
              <div className="flex flex-col items-start gap-2">
                <GlassButton variant="ghost" onClick={openTools}>
                  Back to Tailor Resume
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
  );
}

function ResumeToolCard({
  eyebrow,
  title,
  description,
  meta,
  icon: Icon,
  actionLabel,
  onAction,
  accent = 'default',
}: {
  eyebrow: string;
  title: string;
  description: string;
  meta: string;
  icon: typeof FilePlus2;
  actionLabel: string;
  onAction: () => void;
  accent?: 'default' | 'primary';
}) {
  return (
    <GlassCard className="p-6">
      <div className="flex h-full flex-col justify-between gap-6">
        <div>
          <div className="flex items-start justify-between gap-3">
            <div className="space-y-3">
              <div className="eyebrow-label">{eyebrow}</div>
              <div className={`inline-flex rounded-xl border px-3 py-3 ${accent === 'primary' ? 'border-[var(--link)]/26 bg-[var(--badge-blue-bg)]' : 'border-[var(--line-soft)] bg-[var(--accent-muted)]'}`}>
                <Icon size={18} className={accent === 'primary' ? 'text-[var(--link)]' : 'text-[var(--text-muted)]'} />
              </div>
            </div>
          </div>

          <h2 className="mt-5 text-2xl text-[var(--text-strong)]">{title}</h2>
          <p className="mt-3 text-base leading-7 text-[var(--text-soft)]">{description}</p>
        </div>

        <div className="space-y-4">
          <div className="support-callout px-4 py-3">
            <p className="text-[13px] uppercase tracking-[0.18em] text-[var(--text-soft)]">Context</p>
            <p className="mt-2 text-sm leading-6 text-[var(--text-muted)]">{meta}</p>
          </div>
          <GlassButton variant={accent === 'primary' ? 'primary' : 'secondary'} onClick={onAction}>
            {actionLabel}
          </GlassButton>
        </div>
      </div>
    </GlassCard>
  );
}
