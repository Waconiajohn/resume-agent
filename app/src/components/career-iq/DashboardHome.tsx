import { useState } from 'react';
import { ArrowRight, FileText, Search, Target } from 'lucide-react';
import { ZoneYourPipeline, type PipelineCard } from './ZoneYourPipeline';
import { GlassCard } from '@/components/GlassCard';
import type { CareerIQRoom } from './Sidebar';
import type { WhyMeSignals, DashboardState } from './useWhyMeStory';
import type { CoachingNudge } from '@/hooks/useMomentum';
import type { CoachRecommendation } from '@/hooks/useCoachRecommendation';
import { deriveWorkspaceHomeGuidance } from './workspaceHomeGuidance';

interface DashboardHomeProps {
  signals: WhyMeSignals;
  dashboardState: DashboardState;
  onNavigateRoom?: (room: CareerIQRoom) => void;
  onRefineWhyMe?: () => void;
  hasResumeSessions?: boolean;
  sessionCount?: number;
  nudges?: CoachingNudge[];
  onDismissNudge?: (nudgeId: string) => void;
  coachRecommendation?: CoachRecommendation | null;
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
  coachRecommendation,
  onNavigateRoom,
  onRefineWhyMe,
}: {
  hasResumeSessions: boolean;
  sessionCount: number;
  dashboardState: DashboardState;
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

  const secondaryAction = guidance.secondary;

  return (
    <GlassCard className="overflow-hidden border-[var(--link)]/16 bg-[radial-gradient(circle_at_top_left,rgba(152,179,255,0.2),transparent_42%),linear-gradient(180deg,rgba(255,255,255,0.08),rgba(255,255,255,0.03))] p-0">
      <div className="p-4 sm:p-5">
        <div className="text-[13px] font-medium uppercase tracking-widest text-[var(--link)]/78">
          {guidance.eyebrow}
        </div>
        <h1 className="mt-2.5 max-w-3xl text-[1.55rem] font-semibold leading-tight text-[var(--text-strong)] sm:text-[1.75rem]">
          {guidance.title}
        </h1>
        <p className="mt-2.5 max-w-xl text-sm leading-6 text-[var(--text-soft)]">
          {guidance.description}
        </p>
        <div className="mt-4 flex flex-wrap gap-3">
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
              className="rounded-md border border-[var(--line-soft)] bg-[var(--accent-muted)] px-4 py-3 text-sm font-medium uppercase tracking-[0.12em] text-[var(--text-strong)] transition-colors hover:border-[var(--link)]/35 hover:text-white"
            >
              {secondaryAction.label}
            </button>
          )}
        </div>
      </div>

      <div className="grid gap-3 border-t border-[var(--line-soft)] bg-[var(--bg-1)]/10 p-4 lg:grid-cols-[1.05fr_0.85fr_0.85fr]">
        <StepCard
          icon={Target}
          title="Career story"
          description="Tighten the positioning story every other tool reads."
          actionLabel="Review story"
          onClick={onRefineWhyMe}
          className="border-[var(--link)]/18 bg-[var(--link)]/[0.08]"
        />
        <StepCard
          icon={FileText}
          title="Resume work"
          description={hasResumeSessions
            ? `${sessionCount} saved application${sessionCount === 1 ? '' : 's'} ready to reopen.`
            : 'Start a tailored resume and keep the best additions for future use.'}
          actionLabel={hasResumeSessions ? 'Open resumes' : 'Start resume'}
          onClick={() => onNavigateRoom?.('resume')}
          className="border-[var(--line-soft)] bg-[var(--accent-muted)]"
        />
        <StepCard
          icon={Search}
          title="Job board"
          description="Search roles, save the best ones, and keep applications moving."
          actionLabel="Open jobs"
          onClick={() => onNavigateRoom?.('jobs')}
          className="border-[var(--badge-green-text)]/18 bg-[var(--badge-green-text)]/[0.06]"
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
    <div className={`rounded-2xl border p-3.5 ${className ?? 'border-[var(--line-soft)] bg-[var(--accent-muted)]'}`}>
      <div className="flex items-center gap-2">
        <div className="rounded-xl bg-black/20 p-2">
          <Icon size={16} className="text-[var(--link)]" />
        </div>
        <div className="text-sm font-semibold text-[var(--text-strong)]">{title}</div>
      </div>
      <div className="mt-2 space-y-2">
        <p className="text-xs leading-relaxed text-[var(--text-soft)]">{description}</p>
        <button
          type="button"
          onClick={onClick}
          className="inline-flex items-center gap-1.5 whitespace-nowrap text-xs font-medium text-[var(--link)] transition-colors hover:text-[var(--link)]"
        >
          {actionLabel}
          <ArrowRight size={12} />
        </button>
      </div>
    </div>
  );
}

export function DashboardHome({
  signals,
  dashboardState,
  onNavigateRoom,
  onRefineWhyMe,
  hasResumeSessions = false,
  sessionCount = 0,
  nudges = [],
  onDismissNudge,
  coachRecommendation,
  onInterviewPrepClick,
  onNegotiationPrepClick,
}: DashboardHomeProps) {
  const [dismissed, setDismissed] = useState<Record<string, boolean>>(loadDismissed);
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
        coachRecommendation={coachRecommendation}
        onNavigateRoom={onNavigateRoom}
        onRefineWhyMe={onRefineWhyMe}
      />

      {/* CoachingNudgeBar removed — momentum nudges are not ready for production */}

      <ZoneYourPipeline
        onNavigateRoom={onNavigateRoom}
        onInterviewPrepClick={onInterviewPrepClick}
        onNegotiationPrepClick={onNegotiationPrepClick}
      />
    </div>
  );
}
