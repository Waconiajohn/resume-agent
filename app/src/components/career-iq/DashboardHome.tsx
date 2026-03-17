import { useState } from 'react';
import { ArrowRight, FileText, Search, Target, X } from 'lucide-react';
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
  onNavigateRoom,
  onRefineWhyMe,
}: {
  hasResumeSessions: boolean;
  sessionCount: number;
  onNavigateRoom?: (room: CareerIQRoom) => void;
  onRefineWhyMe?: () => void;
}) {
  return (
    <GlassCard className="p-5">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
        <div className="max-w-2xl">
          <div className="text-[11px] font-medium uppercase tracking-widest text-[#98b3ff]/70">
            Workspace Home
          </div>
          <h1 className="mt-2 text-xl font-semibold text-white/90">A simpler path through the platform</h1>
          <p className="mt-2 text-sm leading-relaxed text-white/50">
            Start with your Career Profile, use Resume Builder to tailor each application, and come back here to track what needs attention next.
          </p>
        </div>

        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            onClick={onRefineWhyMe}
            className="rounded-lg border border-white/[0.08] bg-white/[0.04] px-3 py-2 text-xs font-medium text-white/70 transition-colors hover:bg-white/[0.08] hover:text-white/90"
          >
            Open Career Profile
          </button>
          <button
            type="button"
            onClick={() => onNavigateRoom?.('resume')}
            className="rounded-lg border border-[#98b3ff]/25 bg-[#98b3ff]/12 px-3 py-2 text-xs font-medium text-[#c9d7ff] transition-colors hover:bg-[#98b3ff]/18"
          >
            Open Resume Builder
          </button>
        </div>
      </div>

      <div className="mt-5 grid gap-3 lg:grid-cols-3">
        <StepCard
          icon={Target}
          title="1. Career Profile"
          description="Clarify the story, strengths, and fit you want every tool to use."
          actionLabel="Review profile"
          onClick={onRefineWhyMe}
        />
        <StepCard
          icon={FileText}
          title="2. Resume Builder"
          description={hasResumeSessions
            ? `You have ${sessionCount} saved application${sessionCount === 1 ? '' : 's'} ready to reopen by company, role, and date.`
            : 'Create a tailored resume for a target job and keep the strongest additions for future use.'}
          actionLabel={hasResumeSessions ? 'Review saved work' : 'Start a tailored resume'}
          onClick={() => onNavigateRoom?.('resume')}
        />
        <StepCard
          icon={Search}
          title="3. Job Command Center"
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
  const showResumeNudge = !firstMomentumNudge && dashboardState !== 'new-user' && !hasResumeSessions && !dismissed.resume_nudge;

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
        onNavigateRoom={onNavigateRoom}
        onRefineWhyMe={onRefineWhyMe}
      />

      <CoachSpotlight
        userName={userName}
        recommendation={coachRecommendation ?? null}
        loading={coachLoading}
        onNavigateRoom={onNavigateRoom}
        onOpenCoach={onOpenCoach}
      />

      {showResumeNudge && (
        <GlassCard className="flex items-center gap-3 border-[#98b3ff]/15 bg-[#98b3ff]/[0.04] px-4 py-3">
          <div className="rounded-lg bg-[#98b3ff]/15 p-2">
            <FileText size={16} className="text-[#98b3ff]" />
          </div>
          <div className="min-w-0 flex-1">
            <div className="text-[13px] font-medium text-white/75">Your profile is ready for a tailored resume</div>
            <div className="mt-0.5 text-[11px] text-white/40">
              Resume Builder saves each application by company, job title, and date so you can reopen the exact version later.
            </div>
          </div>
          <button
            type="button"
            onClick={() => {
              handleDismiss('resume_nudge');
              onNavigateRoom?.('resume');
            }}
            className="flex items-center gap-1 text-[12px] text-[#98b3ff] transition-colors hover:text-[#c9d7ff]"
          >
            Open Resume Builder
            <ArrowRight size={13} />
          </button>
          <button
            type="button"
            onClick={() => handleDismiss('resume_nudge')}
            className="text-white/45 transition-colors hover:text-white/70"
          >
            <X size={14} />
          </button>
        </GlassCard>
      )}

      {firstMomentumNudge && (
        <CoachingNudgeBar nudges={[firstMomentumNudge]} onDismiss={onDismissNudge ?? (() => {})} />
      )}

      <ZoneYourDay
        userName={userName}
        signals={signals}
        dashboardState={dashboardState}
        onRefineWhyMe={onRefineWhyMe}
        onNavigateRoom={onNavigateRoom}
      />

      <ZoneYourPipeline
        onNavigateRoom={onNavigateRoom}
        mockCards={mockPipelineCards}
        onInterviewPrepClick={onInterviewPrepClick}
        onNegotiationPrepClick={onNegotiationPrepClick}
      />
    </div>
  );
}
