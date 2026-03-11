import { ZoneYourDay } from './ZoneYourDay';
import { ZoneYourPipeline } from './ZoneYourPipeline';
import { ZoneAgentFeed, type RealFeedEvent } from './ZoneAgentFeed';
import { ZoneYourSignals } from './ZoneYourSignals';
import { MomentumCard } from './MomentumCard';
import { CoachingNudgeBar } from './CoachingNudgeBar';
import { GlassCard } from '@/components/GlassCard';
import { ArrowRight, FileText, Search, X, AlertCircle } from 'lucide-react';
import { useState, useMemo, useEffect, useCallback } from 'react';
import { supabase } from '@/lib/supabase';
import type { CareerIQRoom } from './Sidebar';
import type { WhyMeSignals, DashboardState } from './useWhyMeStory';
import type { MomentumSummary, CoachingNudge } from '@/hooks/useMomentum';
import type { CoachRecommendation } from '@/hooks/useCoachRecommendation';
import { CoachSpotlight } from './CoachSpotlight';

interface PipelineStats {
  total: number;
  interviewing: number;
  offer: number;
  daysSinceLastActivity: number;
}

interface CoverLetterSession {
  id: string;
  company_name: string | null;
  created_at: string;
  pipeline_status: string | null;
}

interface DashboardHomeProps {
  userName: string;
  signals: WhyMeSignals;
  dashboardState: DashboardState;
  onNavigateRoom?: (room: CareerIQRoom) => void;
  onRefineWhyMe?: () => void;
  hasResumeSessions?: boolean;
  sessionCount?: number;
  recentSessions?: { id: string; company_name?: string | null; created_at: string; pipeline_stage?: string | null; pipeline_status?: string | null }[];
  coverLetterSessions?: CoverLetterSession[];
  momentum?: MomentumSummary | null;
  momentumLoading?: boolean;
  nudges?: CoachingNudge[];
  onDismissNudge?: (nudgeId: string) => void;
  onOpenCoach?: () => void;
  coachRecommendation?: CoachRecommendation | null;
  coachLoading?: boolean;
}

const NUDGE_DISMISS_KEY = 'careeriq_nudge_dismissed';

function loadDismissed(): Record<string, boolean> {
  try {
    const saved = localStorage.getItem(NUDGE_DISMISS_KEY);
    if (saved) return JSON.parse(saved);
  } catch { /* ignore */ }
  return {};
}

function saveDismissed(dismissed: Record<string, boolean>) {
  try { localStorage.setItem(NUDGE_DISMISS_KEY, JSON.stringify(dismissed)); } catch { /* ignore */ }
}

export function DashboardHome({ userName, signals, dashboardState, onNavigateRoom, onRefineWhyMe, hasResumeSessions, sessionCount, recentSessions, coverLetterSessions, momentum, momentumLoading = false, nudges = [], onDismissNudge, onOpenCoach, coachRecommendation, coachLoading = false }: DashboardHomeProps) {
  const [dismissed, setDismissed] = useState<Record<string, boolean>>(loadDismissed);
  const [pipelineStats, setPipelineStats] = useState<PipelineStats | undefined>(undefined);
  const [pipelineStatsError, setPipelineStatsError] = useState<string | null>(null);

  const loadPipelineStats = useCallback(async () => {
    setPipelineStatsError(null);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;
      const { data } = await supabase
        .from('application_pipeline')
        .select('stage, updated_at')
        .eq('user_id', user.id);
      if (!data) return;
      const total = data.length;
      const interviewing = data.filter((r) => r.stage === 'interviewing' || r.stage === 'phone_screen' || r.stage === 'final_round').length;
      const offer = data.filter((r) => r.stage === 'offer' || r.stage === 'accepted').length;
      const lastActivity = data.reduce((max, r) => {
        const t = r.updated_at ? new Date(r.updated_at).getTime() : 0;
        return t > max ? t : max;
      }, 0);
      const daysSinceLastActivity = lastActivity
        ? Math.floor((Date.now() - lastActivity) / (1000 * 60 * 60 * 24))
        : 99;
      setPipelineStats({ total, interviewing, offer, daysSinceLastActivity });
    } catch {
      setPipelineStatsError('Could not load pipeline stats. Please try again.');
    }
  }, []);

  useEffect(() => {
    void loadPipelineStats();
  }, [loadPipelineStats]);

  const handleDismiss = (key: string) => {
    const updated = { ...dismissed, [key]: true };
    setDismissed(updated);
    saveDismissed(updated);
  };

  const handleNudgeNavigate = (room: CareerIQRoom, nudgeKey: string) => {
    handleDismiss(nudgeKey);
    onNavigateRoom?.(room);
  };

  // Generate real feed events from session data (resume + cover letter, merged and sorted)
  const feedEvents = useMemo<RealFeedEvent[] | undefined>(() => {
    const events: RealFeedEvent[] = [];

    if (recentSessions) {
      for (const s of recentSessions) {
        if (s.pipeline_status === 'error') continue;
        const company = s.company_name || 'Untitled';
        const isComplete = s.pipeline_stage === 'complete' || s.pipeline_stage === 'completed';
        events.push({
          type: isComplete ? 'session_completed' as const : 'session_created' as const,
          timestamp: s.created_at,
          detail: isComplete
            ? `Completed resume for ${company} — ready for download`
            : `Started resume session for ${company}`,
        });
      }
    }

    if (coverLetterSessions) {
      for (const s of coverLetterSessions) {
        const company = s.company_name || 'Untitled';
        const isComplete = s.pipeline_status === 'complete';
        events.push({
          type: isComplete ? 'session_completed' as const : 'session_created' as const,
          timestamp: s.created_at,
          detail: isComplete
            ? `Generated cover letter for ${company}`
            : `Started cover letter for ${company}`,
        });
      }
    }

    if (events.length === 0) return undefined;

    events.sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());
    return events.slice(0, 5);
  }, [recentSessions, coverLetterSessions]);

  // Determine which nudge to show — max 1 at a time.
  // Momentum nudges take priority; fall back to hardcoded contextual nudges.
  const firstMomentumNudge = nudges.length > 0 ? nudges[0] : null;
  const showResumeNudge = !firstMomentumNudge && dashboardState !== 'new-user' && !hasResumeSessions && !dismissed['resume_nudge'];
  const showJobsNudge = !firstMomentumNudge && !showResumeNudge && dashboardState !== 'new-user' && hasResumeSessions && !dismissed['jobs_nudge'];

  return (
    <div className="flex flex-col gap-6 p-6 max-w-[1400px] mx-auto">
      {/* Coach spotlight — deterministic recommendation from AI coach */}
      <CoachSpotlight
        userName={userName}
        recommendation={coachRecommendation ?? null}
        loading={coachLoading}
        onNavigateRoom={onNavigateRoom}
        onOpenCoach={onOpenCoach}
      />

      {/* Contextual nudge */}
      {showResumeNudge && (
        <GlassCard className="px-4 py-3 flex items-center gap-3 border-[#98b3ff]/15 bg-[#98b3ff]/[0.04]">
          <div className="rounded-lg bg-[#98b3ff]/15 p-2 flex-shrink-0">
            <FileText size={16} className="text-[#98b3ff]" />
          </div>
          <div className="flex-1 min-w-0">
            <div className="text-[13px] font-medium text-white/75">Your story is defined — time to build your first resume</div>
            <div className="text-[11px] text-white/40 mt-0.5">3 AI agents will craft a targeted resume powered by your Why-Me story.</div>
          </div>
          <button
            type="button"
            onClick={() => handleNudgeNavigate('resume', 'resume_nudge')}
            className="flex items-center gap-1 text-[12px] text-[#98b3ff] hover:text-[#98b3ff]/80 transition-colors flex-shrink-0"
          >
            Resume Workshop <ArrowRight size={13} />
          </button>
          <button
            type="button"
            onClick={() => handleDismiss('resume_nudge')}
            className="text-white/45 hover:text-white/70 transition-colors flex-shrink-0"
          >
            <X size={14} />
          </button>
        </GlassCard>
      )}

      {showJobsNudge && (
        <GlassCard className="px-4 py-3 flex items-center gap-3 border-[#98b3ff]/15 bg-[#98b3ff]/[0.04]">
          <div className="rounded-lg bg-[#98b3ff]/15 p-2 flex-shrink-0">
            <Search size={16} className="text-[#98b3ff]" />
          </div>
          <div className="flex-1 min-w-0">
            <div className="text-[13px] font-medium text-white/75">Resume in progress — start discovering matching roles</div>
            <div className="text-[11px] text-white/40 mt-0.5">AI-surfaced jobs that match your Why-Me story and experience.</div>
          </div>
          <button
            type="button"
            onClick={() => handleNudgeNavigate('jobs', 'jobs_nudge')}
            className="flex items-center gap-1 text-[12px] text-[#98b3ff] hover:text-[#98b3ff]/80 transition-colors flex-shrink-0"
          >
            Job Command Center <ArrowRight size={13} />
          </button>
          <button
            type="button"
            onClick={() => handleDismiss('jobs_nudge')}
            className="text-white/45 hover:text-white/70 transition-colors flex-shrink-0"
          >
            <X size={14} />
          </button>
        </GlassCard>
      )}

      {/* Coaching nudge from momentum engine — one at a time */}
      {firstMomentumNudge && (
        <CoachingNudgeBar nudges={[firstMomentumNudge]} onDismiss={onDismissNudge ?? (() => {})} />
      )}

      {/* Zone 1: Your Day — full width */}
      <ZoneYourDay
        userName={userName}
        signals={signals}
        dashboardState={dashboardState}
        onRefineWhyMe={onRefineWhyMe}
      />

      {/* Zone 2 + 3: Pipeline (60%) + Agent Feed (40%) */}
      <div className="flex gap-6 flex-col lg:flex-row">
        <ZoneYourPipeline onNavigateRoom={onNavigateRoom} />
        <ZoneAgentFeed onNavigateRoom={onNavigateRoom} realEvents={feedEvents} />
      </div>

      {/* Zone 4: Your Signals + Momentum (50/50) */}
      <div className="flex gap-6 flex-col lg:flex-row">
        <div className="flex-1 min-w-0">
          {pipelineStatsError && (
            <div className="text-[12px] text-red-400/70 flex items-center gap-2 mb-3">
              <AlertCircle size={12} />
              {pipelineStatsError}
              <button
                type="button"
                onClick={() => { void loadPipelineStats(); }}
                className="text-[#98b3ff] hover:underline"
              >
                Retry
              </button>
            </div>
          )}
          <ZoneYourSignals
            whyMeSignals={signals}
            sessionCount={sessionCount}
            pipelineStats={pipelineStats}
          />
        </div>
        <div className="flex-1 min-w-0">
          <MomentumCard summary={momentum ?? null} loading={momentumLoading} />
        </div>
      </div>
    </div>
  );
}
