import { ZoneYourDay } from './ZoneYourDay';
import { ZoneYourPipeline } from './ZoneYourPipeline';
import { ZoneAgentFeed, type RealFeedEvent } from './ZoneAgentFeed';
import { ZoneYourSignals } from './ZoneYourSignals';
import { GlassCard } from '@/components/GlassCard';
import { ArrowRight, FileText, Search, X } from 'lucide-react';
import { useState, useMemo } from 'react';
import type { CareerIQRoom } from './Sidebar';
import type { WhyMeSignals, DashboardState } from './useWhyMeStory';

interface DashboardHomeProps {
  userName: string;
  signals: WhyMeSignals;
  dashboardState: DashboardState;
  onNavigateRoom?: (room: CareerIQRoom) => void;
  onRefineWhyMe?: () => void;
  hasResumeSessions?: boolean;
  sessionCount?: number;
  recentSessions?: { id: string; company_name?: string | null; created_at: string; pipeline_stage?: string | null }[];
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

export function DashboardHome({ userName, signals, dashboardState, onNavigateRoom, onRefineWhyMe, hasResumeSessions, sessionCount, recentSessions }: DashboardHomeProps) {
  const [dismissed, setDismissed] = useState<Record<string, boolean>>(loadDismissed);

  const handleDismiss = (key: string) => {
    const updated = { ...dismissed, [key]: true };
    setDismissed(updated);
    saveDismissed(updated);
  };

  const handleNudgeNavigate = (room: CareerIQRoom, nudgeKey: string) => {
    handleDismiss(nudgeKey);
    onNavigateRoom?.(room);
  };

  // Generate real feed events from session data
  const feedEvents = useMemo<RealFeedEvent[] | undefined>(() => {
    if (!recentSessions || recentSessions.length === 0) return undefined;
    return recentSessions.slice(0, 5).map((s) => {
      const company = s.company_name || 'Untitled';
      const isComplete = s.pipeline_stage === 'complete' || s.pipeline_stage === 'completed';
      return {
        type: isComplete ? 'session_completed' as const : 'session_created' as const,
        timestamp: s.created_at,
        detail: isComplete
          ? `Completed resume for ${company} — ready for download`
          : `Started resume session for ${company}`,
      };
    });
  }, [recentSessions]);

  // Determine which nudge to show
  const showResumeNudge = dashboardState !== 'new-user' && !hasResumeSessions && !dismissed['resume_nudge'];
  const showJobsNudge = dashboardState !== 'new-user' && hasResumeSessions && !dismissed['jobs_nudge'];

  return (
    <div className="flex flex-col gap-6 p-6 max-w-[1400px] mx-auto">
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
            className="text-white/25 hover:text-white/50 transition-colors flex-shrink-0"
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
            className="text-white/25 hover:text-white/50 transition-colors flex-shrink-0"
          >
            <X size={14} />
          </button>
        </GlassCard>
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

      {/* Zone 4: Your Signals — full width */}
      <ZoneYourSignals
        whyMeSignals={signals}
        sessionCount={sessionCount}
      />
    </div>
  );
}
