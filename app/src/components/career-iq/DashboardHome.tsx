import { useMemo, useState } from 'react';
import { ArrowRight, FileText, Search, Target } from 'lucide-react';
import { ZoneYourDay } from './ZoneYourDay';
import { ZoneYourPipeline, type PipelineCard } from './ZoneYourPipeline';
import { CoachingNudgeBar } from './CoachingNudgeBar';
import { GlassCard } from '@/components/GlassCard';
import type { CareerIQRoom } from './Sidebar';
import type { WhyMeSignals, DashboardState } from './useWhyMeStory';
import type { CoachingNudge } from '@/hooks/useMomentum';
import type { CoachRecommendation } from '@/hooks/useCoachRecommendation';
import { CoachSpotlight } from './CoachSpotlight';

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
  mockPipelineCards?: PipelineCard[];
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
  coachRecommendationTitle,
  onNavigateRoom,
  onRefineWhyMe,
}: {
  hasResumeSessions: boolean;
  sessionCount: number;
  dashboardState: DashboardState;
  signals: WhyMeSignals;
  coachRecommendationTitle?: string;
  onNavigateRoom?: (room: CareerIQRoom) => void;
  onRefineWhyMe?: () => void;
}) {
  const primaryAction = dashboardState === 'new-user'
    ? {
        eyebrow: 'Start here',
        title: 'Finish your Career Profile first',
        description: 'This is the shared story every agent reads. The stronger it is, the sharper Resume Builder, Job Search, LinkedIn, and Interview Lab become.',
        label: 'Open Career Profile',
        onClick: onRefineWhyMe,
      }
    : !hasResumeSessions
      ? {
          eyebrow: 'Next best move',
          title: 'Build the first tailored resume for a live job',
          description: 'Your Career Profile is strong enough to stop starting from scratch. Turn it into a job-specific resume you can reopen later by company, role, and date.',
          label: 'Open Resume Builder',
          onClick: () => onNavigateRoom?.('resume'),
        }
      : {
          eyebrow: 'Daily workspace',
          title: 'Reopen active work and move one application forward',
          description: `You already have ${sessionCount} saved application${sessionCount === 1 ? '' : 's'}. Resume Builder and Job Command Center should now be the main places you work from day to day.`,
          label: 'Open Resume Builder',
          onClick: () => onNavigateRoom?.('resume'),
        };

  const secondaryAction = dashboardState === 'new-user'
    ? {
        label: 'Open Job Command Center',
        onClick: () => onNavigateRoom?.('jobs'),
      }
    : {
        label: 'Open Job Command Center',
        onClick: () => onNavigateRoom?.('jobs'),
      };

  const signalSummary = [
    `Clarity: ${signals.clarity}`,
    `Alignment: ${signals.alignment}`,
    `Differentiation: ${signals.differentiation}`,
  ];

  return (
    <GlassCard className="p-5">
      <div className="flex flex-col gap-5 lg:flex-row lg:items-end lg:justify-between">
        <div className="max-w-3xl">
          <div className="text-[11px] font-medium uppercase tracking-widest text-[#98b3ff]/70">
            {primaryAction.eyebrow}
          </div>
          <h1 className="mt-2 text-xl font-semibold text-white/90">{primaryAction.title}</h1>
          <p className="mt-2 text-sm leading-relaxed text-white/50">
            {primaryAction.description}
          </p>
          {coachRecommendationTitle && (
            <p className="mt-3 text-xs leading-relaxed text-white/42">
              Coach recommendation: {coachRecommendationTitle}
            </p>
          )}
        </div>

        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            onClick={primaryAction.onClick}
            className="rounded-lg border border-[#98b3ff]/25 bg-[#98b3ff]/12 px-3 py-2 text-xs font-medium text-[#c9d7ff] transition-colors hover:bg-[#98b3ff]/18"
          >
            {primaryAction.label}
          </button>
          <button
            type="button"
            onClick={secondaryAction.onClick}
            className="rounded-lg border border-white/[0.08] bg-white/[0.04] px-3 py-2 text-xs font-medium text-white/70 transition-colors hover:bg-white/[0.08] hover:text-white/90"
          >
            {secondaryAction.label}
          </button>
        </div>
      </div>

      <div className="mt-5 grid gap-3 lg:grid-cols-[1.2fr_0.8fr_0.8fr]">
        <StepCard
          icon={Target}
          title="Career Profile backbone"
          description={`Signals right now: ${signalSummary.join(' · ')}`}
          actionLabel="Review Career Profile"
          onClick={onRefineWhyMe}
        />
        <StepCard
          icon={FileText}
          title="Resume Builder"
          description={hasResumeSessions
            ? `You have ${sessionCount} saved application${sessionCount === 1 ? '' : 's'} ready to reopen by company, role, and date.`
            : 'Create a tailored resume for a target job and keep the strongest additions for future use.'}
          actionLabel={hasResumeSessions ? 'Open saved work' : 'Start a tailored resume'}
          onClick={() => onNavigateRoom?.('resume')}
        />
        <StepCard
          icon={Search}
          title="Job Command Center"
          description="Track active roles, interview stages, and what should happen next in your search."
          actionLabel="Open job tracker"
          onClick={() => onNavigateRoom?.('jobs')}
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
}: {
  icon: typeof Target;
  title: string;
  description: string;
  actionLabel: string;
  onClick?: () => void;
}) {
  return (
    <div className="rounded-xl border border-white/[0.08] bg-white/[0.03] p-4">
      <div className="flex items-center gap-2">
        <div className="rounded-lg bg-white/[0.05] p-2">
          <Icon size={16} className="text-[#98b3ff]" />
        </div>
        <div className="text-sm font-semibold text-white/85">{title}</div>
      </div>
      <p className="mt-3 text-xs leading-relaxed text-white/45">{description}</p>
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
  mockPipelineCards,
  onInterviewPrepClick,
  onNegotiationPrepClick,
}: DashboardHomeProps) {
  const [dismissed, setDismissed] = useState<Record<string, boolean>>(loadDismissed);
  const firstMomentumNudge = nudges.length > 0 ? nudges[0] : null;
  const showMomentumNudge = Boolean(firstMomentumNudge && !dismissed[firstMomentumNudge.id]);
  const spotlightFirst = useMemo(
    () => Boolean(coachRecommendation && dashboardState === 'new-user' && !showMomentumNudge),
    [coachRecommendation, dashboardState, showMomentumNudge],
  );

  const handleDismiss = (key: string) => {
    const updated = { ...dismissed, [key]: true };
    setDismissed(updated);
    saveDismissed(updated);
  };

  return (
    <div className="mx-auto flex max-w-[1400px] flex-col gap-6 p-6">
      <HomeGuideCard
        hasResumeSessions={hasResumeSessions}
        sessionCount={sessionCount}
        dashboardState={dashboardState}
        signals={signals}
        coachRecommendationTitle={coachRecommendation?.action}
        onNavigateRoom={onNavigateRoom}
        onRefineWhyMe={onRefineWhyMe}
      />

      {spotlightFirst && (
        <CoachSpotlight
          userName={userName}
          recommendation={coachRecommendation ?? null}
          loading={coachLoading}
          onNavigateRoom={onNavigateRoom}
          onOpenCoach={onOpenCoach}
        />
      )}

      <ZoneYourDay
        userName={userName}
        signals={signals}
        dashboardState={dashboardState}
        onRefineWhyMe={onRefineWhyMe}
        onNavigateRoom={onNavigateRoom}
      />

      {showMomentumNudge && firstMomentumNudge && (
        <CoachingNudgeBar
          nudges={[firstMomentumNudge]}
          onDismiss={(nudgeId) => {
            handleDismiss(nudgeId);
            onDismissNudge?.(nudgeId);
          }}
        />
      )}

      {!spotlightFirst && (
        <CoachSpotlight
          userName={userName}
          recommendation={coachRecommendation ?? null}
          loading={coachLoading}
          onNavigateRoom={onNavigateRoom}
          onOpenCoach={onOpenCoach}
        />
      )}

      <ZoneYourPipeline
        onNavigateRoom={onNavigateRoom}
        mockCards={mockPipelineCards}
        onInterviewPrepClick={onInterviewPrepClick}
        onNegotiationPrepClick={onNegotiationPrepClick}
      />
    </div>
  );
}
