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
        description: 'This is the shared story every agent reads. The stronger it is, the sharper Resume Builder, Job Search, LinkedIn, and Interview Prep become.',
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
          description: `You already have ${sessionCount} saved application${sessionCount === 1 ? '' : 's'}. Resume Builder and Job Search should now be the main places you work from day to day.`,
          label: 'Open Resume Builder',
          onClick: () => onNavigateRoom?.('resume'),
        };

  const signalSummary = [
    `Clarity: ${signals.clarity}`,
    `Alignment: ${signals.alignment}`,
    `Differentiation: ${signals.differentiation}`,
  ];

  return (
    <GlassCard className="overflow-hidden border-[#98b3ff]/16 bg-[radial-gradient(circle_at_top_left,rgba(152,179,255,0.2),transparent_42%),linear-gradient(180deg,rgba(255,255,255,0.08),rgba(255,255,255,0.03))] p-0">
      <div className="grid gap-0 xl:grid-cols-[1.25fr_0.75fr]">
        <div className="p-6 sm:p-7">
          <div className="text-[11px] font-medium uppercase tracking-widest text-[#c9d7ff]/78">
            {primaryAction.eyebrow}
          </div>
          <h1 className="mt-3 max-w-3xl text-2xl font-semibold leading-tight text-white/92 sm:text-[2rem]">
            {primaryAction.title}
          </h1>
          <p className="mt-3 max-w-2xl text-sm leading-7 text-white/58 sm:text-[15px]">
            {primaryAction.description}
          </p>
          {coachRecommendationTitle && (
            <p className="mt-4 text-xs leading-relaxed text-white/45">
              Coach recommendation: {coachRecommendationTitle}
            </p>
          )}
          <div className="mt-6 flex flex-wrap gap-3">
            <button
              type="button"
              onClick={primaryAction.onClick}
              className="rounded-xl border border-[#98b3ff]/28 bg-[#98b3ff]/15 px-4 py-2.5 text-sm font-medium text-[#d8e2ff] transition-colors hover:bg-[#98b3ff]/22"
            >
              {primaryAction.label}
            </button>
          </div>
        </div>

        <div className="border-t border-white/[0.06] bg-black/10 p-6 sm:p-7 xl:border-l xl:border-t-0">
          <div className="text-[11px] font-medium uppercase tracking-widest text-white/38">
            Why this matters
          </div>
          <div className="mt-4 grid gap-3">
            <div className="rounded-2xl border border-white/[0.08] bg-white/[0.04] px-4 py-3">
              <div className="text-[11px] uppercase tracking-[0.18em] text-white/38">Signals</div>
              <div className="mt-2 text-sm leading-6 text-white/72">{signalSummary.join(' · ')}</div>
            </div>
            <div className="rounded-2xl border border-[#98b3ff]/18 bg-[#98b3ff]/[0.07] px-4 py-3">
              <div className="text-[11px] uppercase tracking-[0.18em] text-[#c9d7ff]/72">Working rule</div>
              <div className="mt-2 text-sm leading-6 text-white/78">
                Build the shared story first, tailor it to a live job second, then use the rest of Workspace to move that application forward.
              </div>
            </div>
          </div>
        </div>
      </div>

      <div className="grid gap-3 border-t border-white/[0.06] bg-black/10 p-5 lg:grid-cols-[1.2fr_0.8fr_0.8fr]">
        <StepCard
          icon={Target}
          title="Career Profile backbone"
          description="Sharpen the shared story all of the other tools read."
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
          className="border-white/[0.08] bg-white/[0.04]"
        />
        <StepCard
          icon={Search}
          title="Job Search"
          description="Track active roles, discover new ones, and keep your next moves moving in one place."
          actionLabel="Open Job Search"
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
    <div className={`rounded-2xl border p-4 ${className ?? 'border-white/[0.08] bg-white/[0.03]'}`}>
      <div className="flex items-center gap-2">
        <div className="rounded-xl bg-black/20 p-2.5">
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
        coachRecommendationTitle={coachRecommendation?.action}
        onNavigateRoom={onNavigateRoom}
        onRefineWhyMe={onRefineWhyMe}
      />

      <div className="grid gap-6 xl:grid-cols-[0.95fr_1.05fr]">
        <div className="space-y-4">
          <div className="rounded-2xl border border-white/[0.07] bg-white/[0.03] px-5 py-4">
            <div className="text-[11px] font-medium uppercase tracking-widest text-white/38">
              Secondary lane
            </div>
            <h2 className="mt-2 text-base font-semibold text-white/86">One support surface, not five competing prompts</h2>
            <p className="mt-2 text-sm leading-relaxed text-white/50">
              Workspace Home should tell you the single best next move, then give you one supporting prompt that helps you execute it.
            </p>
          </div>
          {supportSurface}
        </div>

        <div className="space-y-4">
          <div className="rounded-2xl border border-white/[0.07] bg-white/[0.03] px-5 py-4">
            <div className="text-[11px] font-medium uppercase tracking-widest text-white/38">
              Active applications
            </div>
            <h2 className="mt-2 text-base font-semibold text-white/86">Your pipeline should be the only other thing competing for attention here</h2>
            <p className="mt-2 text-sm leading-relaxed text-white/50">
              Reopen live roles, see what stage they are in, and jump straight into the next resume, interview, or negotiation action without scanning a crowded dashboard.
            </p>
          </div>
          <ZoneYourPipeline
            onNavigateRoom={onNavigateRoom}
            mockCards={mockPipelineCards}
            onInterviewPrepClick={onInterviewPrepClick}
            onNegotiationPrepClick={onNegotiationPrepClick}
          />
        </div>
      </div>
    </div>
  );
}
