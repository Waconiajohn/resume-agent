import { useMemo, useState } from 'react';
import { ArrowRight, FileText, Search, Target } from 'lucide-react';
import { ZoneYourPipeline, type PipelineCard } from './ZoneYourPipeline';
import { CoachingNudgeBar } from './CoachingNudgeBar';
import { GlassCard } from '@/components/GlassCard';
import type { CareerIQRoom } from './Sidebar';
import type { WhyMeSignals, DashboardState } from './useWhyMeStory';
import type { CoachingNudge } from '@/hooks/useMomentum';
import type { CoachRecommendation } from '@/hooks/useCoachRecommendation';
import { CoachSpotlight } from './CoachSpotlight';
import { deriveWorkspaceHomeGuidance } from './workspaceHomeGuidance';

interface DashboardHomeProps {
  userName: string;
  signals: WhyMeSignals;
  dashboardState: DashboardState;
  onNavigateRoom?: (room: CareerIQRoom) => void;
  onRefineWhyMe?: () => void;
  hasResumeSessions?: boolean;
  sessionCount?: number;
  nudges?: CoachingNudge[];
  onDismissNudge?: (nudgeId: string) => void;
  onOpenCoach?: () => void;
  coachRecommendation?: CoachRecommendation | null;
  coachLoading?: boolean;
  onInterviewPrepClick?: (card: PipelineCard) => void;
  onNegotiationPrepClick?: (card: PipelineCard) => void;
}

const NUDGE_DISMISS_KEY = 'workspace_home_nudge_dismissed';

function loadDismissed(): Record<string, boolean> {
  try {
    const saved = localStorage.getItem(NUDGE_DISMISS_KEY);
    if (saved) return JSON.parse(saved);
  } catch {
    // ignore localStorage errors
  }
  return {};
}

function saveDismissed(dismissed: Record<string, boolean>) {
  try {
    localStorage.setItem(NUDGE_DISMISS_KEY, JSON.stringify(dismissed));
  } catch {
    // ignore localStorage errors
  }
}

function HomeGuideCard({
  hasResumeSessions,
  sessionCount,
  dashboardState,
  signals,
  coachRecommendation,
  onNavigateRoom,
  onRefineWhyMe,
}: {
  hasResumeSessions: boolean;
  sessionCount: number;
  dashboardState: DashboardState;
  signals: WhyMeSignals;
  coachRecommendation?: CoachRecommendation | null;
  onNavigateRoom?: (room: CareerIQRoom) => void;
  onRefineWhyMe?: () => void;
}) {
  const guidance = deriveWorkspaceHomeGuidance({
    dashboardState,
    hasResumeSessions,
    sessionCount,
    coachRecommendation,
  });

  const signalSummary = [
    `Clarity: ${signals.clarity}`,
    `Alignment: ${signals.alignment}`,
    `Differentiation: ${signals.differentiation}`,
  ];
  const secondaryAction = guidance.secondary;

  return (
    <GlassCard className="overflow-hidden border-[#98b3ff]/16 bg-[radial-gradient(circle_at_top_left,rgba(152,179,255,0.2),transparent_42%),linear-gradient(180deg,rgba(255,255,255,0.08),rgba(255,255,255,0.03))] p-0">
      <div className="p-6 sm:p-7">
        <div className="text-[13px] font-medium uppercase tracking-widest text-[#c9d7ff]/78">
          {guidance.eyebrow}
        </div>
        <h1 className="mt-3 max-w-3xl text-2xl font-semibold leading-tight text-[var(--text-strong)] sm:text-[2rem]">
          {guidance.title}
        </h1>
        <p className="mt-3 max-w-2xl text-sm leading-7 text-[var(--text-soft)] sm:text-[15px]">
          {guidance.description}
        </p>
        <div className="mt-4 flex flex-wrap gap-2 text-[13px] text-[var(--text-soft)]">
          {signalSummary.map((item) => (
            <span key={item} className="rounded-md border border-[var(--line-soft)] bg-[var(--accent-muted)] px-3 py-1.5 uppercase tracking-[0.08em]">
              {item}
            </span>
          ))}
        </div>
        {guidance.coachLine && (
          <p className="mt-4 text-xs leading-relaxed text-[var(--text-soft)]">
            Coach says: {guidance.coachLine}
          </p>
        )}
        <div className="mt-6 flex flex-wrap gap-3">
          <button
            type="button"
            onClick={() => (guidance.primary.room === 'career-profile' ? onRefineWhyMe?.() : onNavigateRoom?.(guidance.primary.room))}
            className="rounded-md border border-[#4a6bbf] bg-[#4a6bbf] px-4 py-3 text-sm font-medium uppercase tracking-[0.12em] text-white transition-colors hover:bg-[#3b5aa8]"
          >
            {guidance.primary.label}
          </button>
          {secondaryAction && (
            <button
              type="button"
              onClick={() => (secondaryAction.room === 'career-profile' ? onRefineWhyMe?.() : onNavigateRoom?.(secondaryAction.room))}
              className="rounded-md border border-[var(--line-soft)] bg-[var(--accent-muted)] px-4 py-3 text-sm font-medium uppercase tracking-[0.12em] text-[var(--text-strong)] transition-colors hover:border-[#98b3ff]/35 hover:text-white"
            >
              {secondaryAction.label}
            </button>
          )}
        </div>
      </div>

      <div className="grid gap-3 border-t border-[var(--line-soft)] bg-[var(--bg-1)]/10 p-5 lg:grid-cols-[1.2fr_0.8fr_0.8fr]">
        <StepCard
          icon={Target}
          title="Career Profile backbone"
          description="Set the shared story every other tool reads, then revisit it whenever your positioning gets stronger."
          actionLabel="Review Career Profile"
          onClick={onRefineWhyMe}
          className="border-[#98b3ff]/18 bg-[#98b3ff]/[0.08]"
        />
        <StepCard
          icon={FileText}
          title="Resume Builder"
          description={hasResumeSessions
            ? `You have ${sessionCount} saved application${sessionCount === 1 ? '' : 's'} ready to reopen by company, role, and date.`
            : 'Create a tailored resume for a target job and keep the strongest additions for future use.'}
          actionLabel={hasResumeSessions ? 'Open saved work' : 'Start a tailored resume'}
          onClick={() => onNavigateRoom?.('resume')}
          className="border-[var(--line-soft)] bg-[var(--accent-muted)]"
        />
        <StepCard
          icon={Search}
          title="Job Search"
          description="Track active roles, discover new ones, and keep your next moves moving in one place."
          actionLabel="Open Job Board"
          onClick={() => onNavigateRoom?.('jobs')}
          className="border-[#b5dec2]/18 bg-[#b5dec2]/[0.06]"
        />
      </div>
    </GlassCard>
  );
}

function StepCard({
  icon: Icon,
  title,
  description,
  actionLabel,
  onClick,
  className,
}: {
  icon: typeof Target;
  title: string;
  description: string;
  actionLabel: string;
  onClick?: () => void;
  className?: string;
}) {
  return (
    <div className={`rounded-2xl border p-4 ${className ?? 'border-[var(--line-soft)] bg-[var(--accent-muted)]'}`}>
      <div className="flex items-center gap-2">
        <div className="rounded-xl bg-black/20 p-2.5">
          <Icon size={16} className="text-[#98b3ff]" />
        </div>
        <div className="text-sm font-semibold text-[var(--text-strong)]">{title}</div>
      </div>
      <p className="mt-3 text-xs leading-relaxed text-[var(--text-soft)]">{description}</p>
      <button
        type="button"
        onClick={onClick}
        className="mt-4 inline-flex items-center gap-1.5 text-xs font-medium text-[#98b3ff] transition-colors hover:text-[#c9d7ff]"
      >
        {actionLabel}
        <ArrowRight size={12} />
      </button>
    </div>
  );
}

export function DashboardHome({
  userName,
  signals,
  dashboardState,
  onNavigateRoom,
  onRefineWhyMe,
  hasResumeSessions = false,
  sessionCount = 0,
  nudges = [],
  onDismissNudge,
  onOpenCoach,
  coachRecommendation,
  coachLoading = false,
  onInterviewPrepClick,
  onNegotiationPrepClick,
}: DashboardHomeProps) {
  const [dismissed, setDismissed] = useState<Record<string, boolean>>(loadDismissed);
  const firstMomentumNudge = nudges.length > 0 ? nudges[0] : null;
  const showMomentumNudge = Boolean(firstMomentumNudge && !dismissed[firstMomentumNudge.id]);
  const handleDismiss = (key: string) => {
    const updated = { ...dismissed, [key]: true };
    setDismissed(updated);
    saveDismissed(updated);
  };
  const supportSurface = useMemo(() => {
    if (showMomentumNudge && firstMomentumNudge) {
      return (
        <CoachingNudgeBar
          nudges={[firstMomentumNudge]}
          onDismiss={(nudgeId) => {
            handleDismiss(nudgeId);
            onDismissNudge?.(nudgeId);
          }}
        />
      );
    }

    return (
      <CoachSpotlight
        userName={userName}
        recommendation={coachRecommendation ?? null}
        loading={coachLoading}
        onNavigateRoom={onNavigateRoom}
        onOpenCoach={onOpenCoach}
      />
    );
  }, [
    coachLoading,
    coachRecommendation,
    firstMomentumNudge,
    handleDismiss,
    onDismissNudge,
    onNavigateRoom,
    onOpenCoach,
    showMomentumNudge,
    userName,
  ]);

  return (
    <div className="mx-auto flex max-w-[1400px] flex-col gap-6 p-6">
      <HomeGuideCard
        hasResumeSessions={hasResumeSessions}
        sessionCount={sessionCount}
        dashboardState={dashboardState}
        signals={signals}
        coachRecommendation={coachRecommendation}
        onNavigateRoom={onNavigateRoom}
        onRefineWhyMe={onRefineWhyMe}
      />

      <div className="grid gap-6 xl:grid-cols-[0.95fr_1.05fr]">
        <div className="space-y-4">
          {supportSurface}
        </div>

        <div className="space-y-4">
          <ZoneYourPipeline
            onNavigateRoom={onNavigateRoom}
            onInterviewPrepClick={onInterviewPrepClick}
            onNegotiationPrepClick={onNegotiationPrepClick}
          />
        </div>
      </div>
    </div>
  );
}
