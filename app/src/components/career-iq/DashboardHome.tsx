import { useMemo } from 'react';
import { ArrowRight, ChevronRight, Plus } from 'lucide-react';
import { GlassCard } from '@/components/GlassCard';
import { GlassButton } from '@/components/GlassButton';
import type { CareerIQRoom } from './Sidebar';
import type { DashboardState } from './useWhyMeStory';
import type { JobApplication } from '@/hooks/useJobApplications';
import type { CoachSession } from '@/types/session';
import { buildApplicationWorkspaceRoute } from '@/lib/app-routing';
import { useTailorPicker } from '@/components/applications/TailorPickerProvider';

interface DashboardHomeProps {
  dashboardState: DashboardState;
  onNavigateRoom?: (room: CareerIQRoom) => void;
  onRefineWhyMe?: () => void;
  hasMasterResume?: boolean;
  sessions?: CoachSession[];
  applications?: JobApplication[];
  onNavigateRoute?: (route: string) => void;
}

type HealthState = 'done' | 'in-progress' | 'not-started';

interface HealthItem {
  key: string;
  label: string;
  state: HealthState;
  stateLabel: string;
  onOpen: () => void;
}

const STAGE_RANK: Record<JobApplication['stage'], number> = {
  saved: 0,
  researching: 1,
  applied: 2,
  screening: 3,
  interviewing: 4,
  offer: 5,
  closed_won: 6,
  closed_lost: 6,
};

const STAGE_LABELS: Record<JobApplication['stage'], string> = {
  saved: 'Saved',
  researching: 'Researching',
  applied: 'Applied',
  screening: 'Screening',
  interviewing: 'Interviewing',
  offer: 'Offer',
  closed_won: 'Accepted',
  closed_lost: 'Closed',
};

function stateClasses(state: HealthState): string {
  if (state === 'done') return 'text-[var(--badge-green-text)]';
  if (state === 'in-progress') return 'text-[var(--badge-amber-text)]';
  return 'text-[var(--text-soft)]';
}

function formatRelativeTime(isoString: string): string {
  const then = new Date(isoString).getTime();
  if (!Number.isFinite(then)) return '';
  const diffMs = Date.now() - then;
  const diffMins = Math.floor(diffMs / 60_000);
  if (diffMins < 1) return 'just now';
  if (diffMins < 60) return `${diffMins}m ago`;
  const diffHours = Math.floor(diffMins / 60);
  if (diffHours < 24) return `${diffHours}h ago`;
  const diffDays = Math.floor(diffHours / 24);
  return diffDays === 1 ? 'yesterday' : `${diffDays}d ago`;
}

// ─────────────────────────────────────────────────────────────
// Section 1 — Career Vault Health
// ─────────────────────────────────────────────────────────────

function CareerVaultHealth({
  dashboardState,
  hasMasterResume,
  onOpenCareerProfile,
  onOpenCareerVaultSection,
}: {
  dashboardState: DashboardState;
  hasMasterResume: boolean;
  onOpenCareerProfile: () => void;
  /**
   * Phase 3.1 — deep-link into a specific Career Vault section from the
   * Section 1 home strip. Falls back to opening the top of Career Vault
   * if no handler is wired.
   */
  onOpenCareerVaultSection: (section: 'positioning' | 'career-evidence' | 'benchmark-linkedin-brand') => void;
}) {
  const whyMeItem: HealthItem = (() => {
    const base = { key: 'why-me', label: 'Why-Me', onOpen: () => onOpenCareerVaultSection('positioning') };
    if (dashboardState === 'strong') return { ...base, state: 'done', stateLabel: 'Strong' };
    if (dashboardState === 'refining') return { ...base, state: 'in-progress', stateLabel: 'Building' };
    return { ...base, state: 'not-started', stateLabel: 'Not started' };
  })();

  // TODO Phase 3+: replace with persisted LinkedIn-brand state once a real
  // signal exists. Today nothing persists whether the user has audited
  // their LinkedIn profile, so every user ships as "Not started".
  const linkedInItem: HealthItem = {
    key: 'linkedin-brand',
    label: 'Benchmark LinkedIn Brand',
    state: 'not-started',
    stateLabel: 'Not started',
    onOpen: () => onOpenCareerVaultSection('benchmark-linkedin-brand'),
  };

  const careerRecordItem: HealthItem = hasMasterResume
    ? { key: 'career-record', label: 'Career Evidence', state: 'done', stateLabel: 'Strong', onOpen: () => onOpenCareerVaultSection('career-evidence') }
    : { key: 'career-record', label: 'Career Evidence', state: 'not-started', stateLabel: 'Not started', onOpen: () => onOpenCareerVaultSection('career-evidence') };

  const items: HealthItem[] = [whyMeItem, linkedInItem, careerRecordItem];
  const allStrong = items.every((item) => item.state === 'done');

  if (allStrong) {
    return (
      <GlassCard className="px-5 py-4">
        <button
          type="button"
          onClick={onOpenCareerProfile}
          className="flex w-full items-center justify-between gap-3 text-left text-[13px] text-[var(--text-muted)] transition-colors hover:text-[var(--text-strong)]"
        >
          <span>Your Career Vault is in good shape.</span>
          <ChevronRight size={14} className="text-[var(--text-soft)]" aria-hidden="true" />
        </button>
      </GlassCard>
    );
  }

  return (
    <GlassCard className="p-2">
      <div className="grid grid-cols-1 gap-1 sm:grid-cols-3">
        {items.map((item) => (
          <button
            key={item.key}
            type="button"
            onClick={item.onOpen}
            className="flex items-center justify-between gap-3 rounded-[10px] px-4 py-3 text-left transition-colors hover:bg-[var(--rail-tab-hover-bg)]"
          >
            <div className="min-w-0">
              <div className="text-[11px] font-medium uppercase tracking-widest text-[var(--text-soft)]">
                {item.label}
              </div>
              <div className={`mt-0.5 text-[14px] font-semibold ${stateClasses(item.state)}`}>
                {item.stateLabel}
              </div>
            </div>
            <ChevronRight size={14} className="flex-shrink-0 text-[var(--text-soft)]" aria-hidden="true" />
          </button>
        ))}
      </div>
    </GlassCard>
  );
}

// ─────────────────────────────────────────────────────────────
// Section 2 — Applications
// ─────────────────────────────────────────────────────────────

interface ProgressStep {
  key: string;
  label: string;
  shortLabel: string;
  lit: boolean;
}

function buildProgressSteps(app: JobApplication, hasResumeForApp: boolean): ProgressStep[] {
  const rank = STAGE_RANK[app.stage] ?? 0;
  return [
    { key: 'resume', label: 'Resume', shortLabel: 'R', lit: hasResumeForApp },
    // TODO Phase 3+: detect cover-letter presence from sessions rather than stage proxy.
    { key: 'cover', label: 'Cover', shortLabel: 'C', lit: rank >= STAGE_RANK.applied },
    { key: 'applied', label: 'Applied', shortLabel: 'A', lit: rank >= STAGE_RANK.applied },
    { key: 'interview', label: 'Interview', shortLabel: 'I', lit: rank >= STAGE_RANK.screening },
    { key: 'thank-you', label: 'Thank-you', shortLabel: 'T', lit: rank >= STAGE_RANK.interviewing },
    { key: 'offer', label: 'Offer', shortLabel: 'O', lit: rank >= STAGE_RANK.offer },
  ];
}

function ApplicationCard({
  app,
  hasResumeForApp,
  onOpen,
}: {
  app: JobApplication;
  hasResumeForApp: boolean;
  onOpen: (id: string) => void;
}) {
  const steps = buildProgressSteps(app, hasResumeForApp);

  return (
    <button
      type="button"
      onClick={() => onOpen(app.id)}
      aria-label={`Open application: ${app.role_title} at ${app.company_name}`}
      className="group flex w-full flex-col gap-2 rounded-2xl border border-[var(--line-soft)] bg-[var(--bg-1)] p-4 text-left transition-all duration-150 hover:border-[var(--link)]/40 hover:bg-[var(--rail-tab-hover-bg)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--link)]/60"
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="truncate text-[14px] font-semibold text-[var(--text-strong)]">
            {app.company_name}
          </div>
          <div className="truncate text-[13px] text-[var(--text-soft)]">
            {app.role_title}
          </div>
        </div>
        <span className="flex-shrink-0 text-[11px] text-[var(--text-muted)]">
          {formatRelativeTime(app.updated_at)}
        </span>
      </div>

      <div className="text-[12px] text-[var(--text-muted)]">
        Stage: <span className="text-[var(--text-soft)]">{STAGE_LABELS[app.stage]}</span>
      </div>

      <div className="mt-1 flex items-center gap-2" aria-label="Application progress">
        {steps.map((step) => (
          <span
            key={step.key}
            title={step.label}
            aria-label={`${step.label}: ${step.lit ? 'done' : 'not started'}`}
            className={`inline-block h-2 w-2 rounded-full ${
              step.lit ? 'bg-[var(--link)]' : 'bg-[var(--line-strong)]'
            }`}
          />
        ))}
      </div>

      <div className="mt-1 flex items-center justify-end text-[12px] text-[var(--link)] opacity-0 transition-opacity group-hover:opacity-100">
        Open <ArrowRight size={12} className="ml-1" aria-hidden="true" />
      </div>
    </button>
  );
}

function ApplicationsSection({
  applications,
  sessions,
  onNavigateRoute,
}: {
  applications: JobApplication[];
  sessions: CoachSession[];
  onNavigateRoute?: (route: string) => void;
}) {
  const { openPicker } = useTailorPicker();
  const activeApplications = useMemo(
    () => applications.filter((app) => !app.archived_at),
    [applications],
  );

  const applicationsWithResume = useMemo(() => {
    const set = new Set<string>();
    for (const session of sessions) {
      if (session.job_application_id && session.product_type === 'resume_v2') {
        set.add(session.job_application_id);
      }
    }
    return set;
  }, [sessions]);

  const sortedByRecent = useMemo(
    () =>
      [...activeApplications].sort(
        (a, b) => new Date(b.updated_at).getTime() - new Date(a.updated_at).getTime(),
      ),
    [activeApplications],
  );
  const visible = sortedByRecent.slice(0, 5);
  const totalActive = activeApplications.length;
  const hasApplications = totalActive > 0;

  const openApplication = (id: string) => {
    onNavigateRoute?.(buildApplicationWorkspaceRoute(id, 'resume'));
  };

  const openApplicationsList = () => {
    onNavigateRoute?.('/workspace/applications');
  };

  // Phase 2 (pursuit timeline) — opens the tailor-picker modal so the
  // user picks (or creates) an application before tailoring.
  const openTailoredResume = () => {
    openPicker({ source: 'dashboard_home' });
  };

  return (
    <section className="flex flex-col gap-4">
      <div className="flex items-baseline justify-between">
        <h2 className="text-[15px] font-semibold text-[var(--text-strong)]">Your Applications</h2>
        {hasApplications && (
          <div className="flex items-center gap-3 text-[12px] text-[var(--text-muted)]">
            <span>{totalActive} active</span>
            {totalActive > 5 && (
              <button
                type="button"
                onClick={openApplicationsList}
                className="text-[var(--link)] transition-colors hover:underline"
              >
                See all
              </button>
            )}
          </div>
        )}
      </div>

      {hasApplications ? (
        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
          {visible.map((app) => (
            <ApplicationCard
              key={app.id}
              app={app}
              hasResumeForApp={applicationsWithResume.has(app.id)}
              onOpen={openApplication}
            />
          ))}
        </div>
      ) : (
        <GlassCard className="px-5 py-4">
          <p className="text-[13px] text-[var(--text-soft)]">No active applications yet.</p>
        </GlassCard>
      )}

      <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
        <GlassButton variant="primary" size="sm" onClick={openApplicationsList}>
          <Plus size={14} aria-hidden="true" />
          New Application
        </GlassButton>
        <GlassButton variant="ghost" size="sm" onClick={openTailoredResume}>
          Tailor a Resume
        </GlassButton>
      </div>
    </section>
  );
}

// ─────────────────────────────────────────────────────────────
// Section 3 — This Week (Live Webinars placeholder)
// ─────────────────────────────────────────────────────────────

function ThisWeekSection({
  onNavigateRoom,
}: {
  onNavigateRoom?: (room: CareerIQRoom) => void;
}) {
  // TODO Phase 6: replace placeholder with the real schedule source
  // (see Phase 6 backlog / Live Webinars product).
  return (
    <section className="flex flex-col gap-3">
      <h2 className="text-[15px] font-semibold text-[var(--text-strong)]">Live Webinars this week</h2>
      <GlassCard className="px-5 py-4">
        <p className="text-[13px] text-[var(--text-soft)]">
          Upcoming sessions will appear here once the schedule goes live.
        </p>
        <button
          type="button"
          onClick={() => onNavigateRoom?.('live-webinars')}
          className="mt-3 inline-flex items-center gap-1 text-[13px] text-[var(--link)] transition-colors hover:underline"
        >
          See Live Webinars
          <ArrowRight size={12} aria-hidden="true" />
        </button>
      </GlassCard>
    </section>
  );
}

// ─────────────────────────────────────────────────────────────
// Home
// ─────────────────────────────────────────────────────────────

export function DashboardHome({
  dashboardState,
  onNavigateRoom,
  onRefineWhyMe,
  hasMasterResume = false,
  sessions = [],
  applications = [],
  onNavigateRoute,
}: DashboardHomeProps) {
  const openCareerProfile = () => {
    if (onRefineWhyMe) onRefineWhyMe();
    else onNavigateRoom?.('career-profile');
  };

  return (
    <div className="mx-auto flex max-w-[1400px] flex-col gap-6 p-6">
      <CareerVaultHealth
        dashboardState={dashboardState}
        hasMasterResume={hasMasterResume}
        onOpenCareerProfile={openCareerProfile}
        onOpenCareerVaultSection={(section) =>
          onNavigateRoute?.(`/workspace?room=career-profile&focus=${section}`)
        }
      />

      <ApplicationsSection
        applications={applications}
        sessions={sessions}
        onNavigateRoute={onNavigateRoute}
      />

      <ThisWeekSection onNavigateRoom={onNavigateRoom} />
    </div>
  );
}
