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

const VALID_ROOMS: readonly CareerIQRoom[] = [
  'dashboard', 'resume', 'linkedin', 'content-calendar', 'jobs', 'networking',
  'interview', 'salary-negotiation', 'executive-bio', 'case-study', 'thank-you-note',
  'personal-brand', 'ninety-day-plan', 'network-intelligence', 'financial', 'learning',
];

function toValidRoom(value: string | null): CareerIQRoom | null {
  if (!value) return null;
  return (VALID_ROOMS as readonly string[]).includes(value) ? (value as CareerIQRoom) : null;
}

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
          <div className="w-10 h-10 rounded-full bg-indigo-600/20" />
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
    const validRoom = toValidRoom(recommendation.room);
    if (validRoom) {
      onNavigateRoom?.(validRoom);
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
          className="w-10 h-10 rounded-full bg-indigo-600/30 border border-indigo-400/20 flex items-center justify-center flex-shrink-0 hover:bg-indigo-600/40 transition-colors"
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
              aria-label={recommendation.room ? `Go to ${recommendation.room.replace(/-/g, ' ')}` : 'Open AI Coach'}
            >
              {recommendation.room ? 'Go there' : 'Talk to coach'}
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
          <span className="text-[10px] text-white/30 bg-white/[0.04] border border-white/[0.06] rounded-full px-2 py-0.5">
            {recommendation.phase_label}
          </span>
        </div>
      </div>
    </GlassCard>
  );
}
