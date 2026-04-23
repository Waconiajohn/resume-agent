import { useState } from 'react';
import { ArrowRight } from 'lucide-react';
import { ZoneYourPipeline, type PipelineCard } from './ZoneYourPipeline';
import { GlassCard } from '@/components/GlassCard';
import { GlassButton } from '@/components/GlassButton';
import type { CareerIQRoom } from './Sidebar';
import type { WhyMeSignals, DashboardState } from './useWhyMeStory';
import type { CoachingNudge } from '@/hooks/useMomentum';
import type { CoachRecommendation } from '@/hooks/useCoachRecommendation';
import { deriveWorkspaceHomeGuidance } from './workspaceHomeGuidance';

export interface RecentSession {
  id: string;
  job_title?: string | null;
  company_name?: string | null;
  updated_at: string;
}

interface DashboardHomeProps {
  signals: WhyMeSignals;
  dashboardState: DashboardState;
  onNavigateRoom?: (room: CareerIQRoom) => void;
  onRefineWhyMe?: () => void;
  hasResumeSessions?: boolean;
  /**
   * Sprint E3 — true when the user has a v3 knowledge base or any legacy
   * master resume. Softens the dashboard hero for returning users who
   * haven't yet completed the Why Me positioning interview.
   */
  hasMasterResume?: boolean;
  sessionCount?: number;
  recentSession?: RecentSession | null;
  onResumeSession?: (sessionId: string) => void;
  nudges?: CoachingNudge[];
  onDismissNudge?: (nudgeId: string) => void;
  coachRecommendation?: CoachRecommendation | null;
  onInterviewPrepClick?: (card: PipelineCard) => void;
  onNegotiationPrepClick?: (card: PipelineCard) => void;
  onNavigateRoute?: (route: string) => void;
}

const NUDGE_DISMISS_KEY = 'workspace_home_nudge_dismissed';

function formatRelativeTime(isoString: string): string {
  const diffMs = Date.now() - new Date(isoString).getTime();
  const diffMins = Math.floor(diffMs / 60_000);
  if (diffMins < 60) return diffMins <= 1 ? 'just now' : `${diffMins} minutes ago`;
  const diffHours = Math.floor(diffMins / 60);
  if (diffHours < 24) return diffHours === 1 ? '1 hour ago' : `${diffHours} hours ago`;
  const diffDays = Math.floor(diffHours / 24);
  return diffDays === 1 ? 'yesterday' : `${diffDays} days ago`;
}

function ContinueCard({
  session,
  onResume,
  onNavigateRoom,
}: {
  session: RecentSession;
  onResume: (id: string) => void;
  onNavigateRoom?: (room: CareerIQRoom) => void;
}) {
  const title = [session.job_title, session.company_name].filter(Boolean).join(' at ') || 'Resume session';
  return (
    <GlassCard className="flex items-center justify-between gap-4 p-4 sm:p-5">
      <div className="min-w-0">
        <div className="text-[11px] font-medium uppercase tracking-widest text-[var(--text-muted)]">
          Continue where you left off
        </div>
        <div className="mt-1 truncate text-[15px] font-semibold text-[var(--text-strong)]">{title}</div>
        <div className="mt-0.5 text-xs text-[var(--text-soft)]">
          Last edited {formatRelativeTime(session.updated_at)}
        </div>
      </div>
      <div className="flex flex-col items-end gap-1 flex-shrink-0">
        <GlassButton
          variant="secondary"
          size="sm"
          onClick={() => onResume(session.id)}
        >
          Continue
          <ArrowRight size={14} aria-hidden="true" />
        </GlassButton>
        <button
          type="button"
          onClick={() => onNavigateRoom?.('resume')}
          className="text-xs text-[var(--text-soft)] hover:text-[var(--text-strong)] transition-colors mt-2"
        >
          or start a new resume →
        </button>
      </div>
    </GlassCard>
  );
}

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
  hasMasterResume = false,
  sessionCount,
  dashboardState,
  coachRecommendation,
  onNavigateRoom,
  onRefineWhyMe,
  onNavigateRoute,
}: {
  hasResumeSessions: boolean;
  /** Sprint E3 — drives the "returning user" variant of the hero. */
  hasMasterResume?: boolean;
  sessionCount: number;
  dashboardState: DashboardState;
  coachRecommendation?: CoachRecommendation | null;
  onNavigateRoom?: (room: CareerIQRoom) => void;
  onRefineWhyMe?: () => void;
  onNavigateRoute?: (route: string) => void;
}) {
  const guidance = deriveWorkspaceHomeGuidance({
    dashboardState,
    hasResumeSessions,
    sessionCount,
    coachRecommendation,
    hasMasterResume,
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
          <GlassButton
            variant="primary"
            size="sm"
            onClick={() => {
              if (guidance.primary.route) {
                onNavigateRoute?.(guidance.primary.route);
              } else if (guidance.primary.room === 'career-profile') {
                onRefineWhyMe?.();
              } else {
                onNavigateRoom?.(guidance.primary.room);
              }
            }}
          >
            {guidance.primary.label}
          </GlassButton>
          {secondaryAction && (
            <GlassButton
              variant="ghost"
              size="sm"
              onClick={() => {
                if (secondaryAction.route) {
                  onNavigateRoute?.(secondaryAction.route);
                } else if (secondaryAction.room === 'career-profile') {
                  onRefineWhyMe?.();
                } else {
                  onNavigateRoom?.(secondaryAction.room);
                }
              }}
            >
              {secondaryAction.label}
            </GlassButton>
          )}
        </div>
      </div>

    </GlassCard>
  );
}

export function DashboardHome({
  signals: _signals,
  dashboardState,
  onNavigateRoom,
  onRefineWhyMe,
  hasResumeSessions = false,
  hasMasterResume = false,
  sessionCount = 0,
  recentSession,
  onResumeSession,
  nudges: _nudges = [],
  onDismissNudge: _onDismissNudge,
  coachRecommendation,
  onInterviewPrepClick,
  onNegotiationPrepClick,
  onNavigateRoute,
}: DashboardHomeProps) {
  const [dismissed, setDismissed] = useState<Record<string, boolean>>(loadDismissed);
  const _handleDismiss = (key: string) => {
    const updated = { ...dismissed, [key]: true };
    setDismissed(updated);
    saveDismissed(updated);
  };

  const isNewUser = dashboardState === 'new-user';

  return (
    <div className="mx-auto flex max-w-[1400px] flex-col gap-6 p-6">
      {recentSession && onResumeSession && (
        <ContinueCard session={recentSession} onResume={onResumeSession} onNavigateRoom={onNavigateRoom} />
      )}
      <HomeGuideCard
        hasResumeSessions={hasResumeSessions}
        hasMasterResume={hasMasterResume}
        sessionCount={sessionCount}
        dashboardState={dashboardState}
        coachRecommendation={coachRecommendation}
        onNavigateRoom={onNavigateRoom}
        onRefineWhyMe={onRefineWhyMe}
        onNavigateRoute={onNavigateRoute}
      />

      {!isNewUser && (
        <ZoneYourPipeline
          onNavigateRoom={onNavigateRoom}
          onInterviewPrepClick={onInterviewPrepClick}
          onNegotiationPrepClick={onNegotiationPrepClick}
        />
      )}
    </div>
  );
}
