/**
 * CoachSpotlight — Dashboard card showing the coach's recommendation with CTA.
 *
 * Renders at the top of DashboardHome. Receives recommendation from parent
 * (single hook instance in CareerIQScreen) so sidebar and dashboard stay in sync.
 * Hidden when FF_VIRTUAL_COACH is off (recommendation is null).
 */

import { useState } from 'react';
import { GlassCard } from '@/components/GlassCard';
import { ChevronDown, ChevronUp, ArrowRight } from 'lucide-react';
import type { CoachRecommendation } from '@/hooks/useCoachRecommendation';
import type { CareerIQRoom } from './Sidebar';
import { isExposedWorkspaceRoom } from './workspaceRoomAccess';

interface CoachSpotlightProps {
  userName: string;
  recommendation: CoachRecommendation | null;
  loading: boolean;
  onNavigateRoom?: (room: CareerIQRoom) => void;
  onOpenCoach?: () => void;
}

export function CoachSpotlight({ userName, recommendation, loading, onNavigateRoom, onOpenCoach }: CoachSpotlightProps) {
  const [rationaleOpen, setRationaleOpen] = useState(false);

  // Hidden when coach is off or no data
  if (!loading && !recommendation) return null;

  const firstName = userName?.split(' ')[0] || 'Coach';
  const displayName = `AI ${firstName}`;

  // Loading skeleton
  if (loading) {
    return (
      <GlassCard className="p-4 animate-pulse">
        <div className="flex items-center gap-3">
          <div className="h-10 w-10 rounded-md bg-indigo-600/20" />
          <div className="flex-1">
            <div className="h-4 w-40 bg-white/[0.06] rounded mb-2" />
            <div className="h-3 w-64 bg-white/[0.04] rounded" />
          </div>
        </div>
      </GlassCard>
    );
  }

  if (!recommendation) return null;

  const handleCTA = () => {
    if (isExposedWorkspaceRoom(recommendation.room)) {
      onNavigateRoom?.(recommendation.room);
    } else {
      onOpenCoach?.();
    }
  };

  return (
    <GlassCard className="p-4 border-indigo-400/10 bg-indigo-500/[0.03]">
      <div className="flex items-start gap-3">
        {/* Avatar */}
        <button
          type="button"
          onClick={onOpenCoach}
          className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-md border border-indigo-400/20 bg-indigo-600/30 transition-colors hover:bg-indigo-600/40"
          aria-label={`Open ${displayName}`}
        >
          <span className="text-xs font-bold text-indigo-300">AI</span>
        </button>

        <div className="flex-1 min-w-0">
          {/* Header */}
          <div className="text-[11px] text-indigo-300/60 font-medium mb-1">
            {displayName} recommends:
          </div>

          {/* Recommendation text */}
          <div className="text-[13px] text-white/80 leading-relaxed mb-3">
            {recommendation.action}
          </div>

          {/* CTA + Rationale toggle */}
          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={handleCTA}
              className="flex items-center gap-1.5 text-[12px] font-medium text-indigo-300 hover:text-indigo-200 transition-colors"
              aria-label={isExposedWorkspaceRoom(recommendation.room) ? `Go to ${recommendation.room.replace(/-/g, ' ')}` : 'Open AI Coach'}
            >
              {isExposedWorkspaceRoom(recommendation.room) ? 'Go there' : 'Talk to coach'}
              <ArrowRight size={13} />
            </button>
            <button
              type="button"
              onClick={() => setRationaleOpen(!rationaleOpen)}
              className="flex items-center gap-1 text-[11px] text-white/30 hover:text-white/50 transition-colors"
            >
              Why?
              {rationaleOpen ? <ChevronUp size={12} /> : <ChevronDown size={12} />}
            </button>
          </div>

          {/* Collapsible rationale */}
          {rationaleOpen && (
            <div className="mt-2 pt-2 border-t border-white/[0.06] text-[11px] text-white/40 leading-relaxed">
              {recommendation.rationale}
            </div>
          )}
        </div>

        {/* Phase badge */}
        <div className="flex-shrink-0">
          <span className="rounded-md border border-white/[0.06] bg-white/[0.04] px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.12em] text-white/30">
            {recommendation.phase_label}
          </span>
        </div>
      </div>
    </GlassCard>
  );
}
