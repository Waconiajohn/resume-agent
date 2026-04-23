import { GlassCard } from '@/components/GlassCard';
import {
  ArrowRight,
  Sparkles,
  Bot,
  Home,
  Columns3,
  Activity,
  User,
  ChevronLeft,
  ChevronRight,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { useState, useRef, useCallback } from 'react';
import type { WhyMeSignals, DashboardState } from './useWhyMeStory';
import type { CareerIQRoom } from './Sidebar';
import type { RealFeedEvent } from './ZoneAgentFeed';
import type { CoachRecommendation } from '@/hooks/useCoachRecommendation';
import { deriveWorkspaceHomeGuidance } from './workspaceHomeGuidance';

interface MobileBriefingProps {
  userName: string;
  signals: WhyMeSignals;
  dashboardState: DashboardState;
  activeRoom: CareerIQRoom;
  onRefineWhyMe: () => void;
  onNavigateRoom: (room: CareerIQRoom) => void;
  hasResumeSessions?: boolean;
  sessionCount?: number;
  coachRecommendation?: CoachRecommendation | null;
  feedEvents?: RealFeedEvent[];
  /** When true, renders only the bottom nav (used when a room is active) */
  navOnly?: boolean;
  onNavigateRoute?: (route: string) => void;
}

// --- Card 1: One Action Today ---

function ActionCard({ userName, dashboardState, onRefineWhyMe, onNavigateRoom, onNavigateRoute, hasResumeSessions, sessionCount, coachRecommendation }: {
  userName: string;
  dashboardState: DashboardState;
  onRefineWhyMe: () => void;
  onNavigateRoom: (room: CareerIQRoom) => void;
  onNavigateRoute?: (route: string) => void;
  hasResumeSessions: boolean;
  sessionCount: number;
  coachRecommendation?: CoachRecommendation | null;
}) {
  const firstName = userName?.split('@')[0]?.split('.')[0] ?? 'there';
  const displayName = firstName.charAt(0).toUpperCase() + firstName.slice(1);
  const guidance = deriveWorkspaceHomeGuidance({
    dashboardState,
    hasResumeSessions,
    sessionCount,
    coachRecommendation,
  });

  return (
    <GlassCard className="p-6 flex flex-col min-h-[240px]">
      <div className="text-[13px] font-medium text-[var(--link)]/60 uppercase tracking-widest mb-3">
        Your One Action Today
      </div>
      <h2 className="text-lg font-semibold text-[var(--text-strong)] mb-2">
        Good {getTimeOfDay()}, {displayName}
      </h2>
      <p className="text-[14px] text-[var(--text-soft)] leading-relaxed flex-1">
        <Sparkles size={14} className="inline mr-1.5 text-[var(--link)] -mt-0.5" />
        {guidance.mobileInsight}
      </p>
      <button
        type="button"
        onClick={() => {
          if (guidance.primary.route) {
            onNavigateRoute?.(guidance.primary.route);
          } else if (guidance.primary.room === 'career-profile') {
            onRefineWhyMe();
          } else {
            onNavigateRoom(guidance.primary.room);
          }
        }}
        className="mt-4 w-full flex items-center justify-center gap-2 rounded-xl border border-[var(--link)]/45 bg-[linear-gradient(180deg,rgba(158,184,255,0.2),rgba(158,184,255,0.1))] px-4 py-3 text-[14px] font-medium text-white shadow-[0_10px_28px_-18px_rgba(132,160,255,0.9)]"
      >
        {guidance.primary.label}
        <ArrowRight size={16} />
      </button>
    </GlassCard>
  );
}

// --- Card 2: Agent Activity ---

function AgentActivityCard({ feedEvents }: { feedEvents?: RealFeedEvent[] }) {
  const events = feedEvents ?? [];

  function relativeTime(timestamp: string): string {
    const diffMs = Date.now() - new Date(timestamp).getTime();
    const diffMin = Math.floor(diffMs / 60000);
    if (diffMin < 1) return 'just now';
    if (diffMin < 60) return `${diffMin}m ago`;
    const diffHr = Math.floor(diffMin / 60);
    if (diffHr < 24) return `${diffHr}h ago`;
    return `${Math.floor(diffHr / 24)}d ago`;
  }

  return (
    <GlassCard className="p-6 flex flex-col min-h-[240px]">
      <div className="flex items-center gap-2 mb-4">
        <Bot size={16} className="text-[var(--link)]" />
        <span className="text-[13px] font-medium text-[var(--link)]/60 uppercase tracking-widest">
          Agent Activity
        </span>
      </div>
      {events.length === 0 ? (
        <div className="flex-1 flex items-center justify-center">
          <p className="text-[13px] text-[var(--text-soft)] text-center leading-relaxed">
            No recent agent activity.
          </p>
        </div>
      ) : (
        <div className="flex-1 space-y-3">
          {events.slice(0, 5).map((event, i) => (
            <div key={`${event.type}-${event.timestamp}-${i}`} className="flex items-start gap-2">
              <div className="h-1.5 w-1.5 rounded-full bg-[var(--link)]/40 mt-1.5 flex-shrink-0" />
              <div className="flex-1 min-w-0">
                <p className="text-[12px] text-[var(--text-soft)] leading-relaxed">{event.detail}</p>
                <p className="text-[12px] text-[var(--text-soft)] mt-0.5">{relativeTime(event.timestamp)}</p>
              </div>
            </div>
          ))}
        </div>
      )}
    </GlassCard>
  );
}

// LiveSessionCard is hidden until a real session schedule system is connected.

// --- Swipeable Card Stack ---

function CardStack({ children }: { children: React.ReactNode[] }) {
  const validChildren = children.filter(Boolean);
  const [activeIndex, setActiveIndex] = useState(0);
  const touchStartX = useRef(0);
  const touchDeltaX = useRef(0);

  const handleTouchStart = useCallback((e: React.TouchEvent) => {
    touchStartX.current = e.touches[0].clientX;
    touchDeltaX.current = 0;
  }, []);

  const handleTouchMove = useCallback((e: React.TouchEvent) => {
    touchDeltaX.current = e.touches[0].clientX - touchStartX.current;
  }, []);

  const handleTouchEnd = useCallback(() => {
    const threshold = 50;
    if (touchDeltaX.current < -threshold && activeIndex < validChildren.length - 1) {
      setActiveIndex((i) => i + 1);
    } else if (touchDeltaX.current > threshold && activeIndex > 0) {
      setActiveIndex((i) => i - 1);
    }
  }, [activeIndex, validChildren.length]);

  return (
    <div className="flex flex-col">
      <div
        className="overflow-hidden"
        onTouchStart={handleTouchStart}
        onTouchMove={handleTouchMove}
        onTouchEnd={handleTouchEnd}
      >
        <div
          className="flex transition-transform duration-300 ease-out"
          style={{ transform: `translateX(-${activeIndex * 100}%)` }}
        >
          {validChildren.map((child, i) => (
            <div key={`card-${i}`} className="w-full flex-shrink-0 px-4">
              {child}
            </div>
          ))}
        </div>
      </div>

      {/* Dots + arrows */}
      <div className="flex items-center justify-center gap-4 mt-4">
        <button
          type="button"
          onClick={() => setActiveIndex((i) => Math.max(0, i - 1))}
          disabled={activeIndex === 0}
          aria-label="Previous card"
          className="text-[var(--text-soft)] hover:text-[var(--text-soft)] disabled:opacity-20 transition-colors min-h-[44px] min-w-[44px] flex items-center justify-center"
        >
          <ChevronLeft size={20} />
        </button>
        <div className="flex gap-2" role="tablist" aria-label="Card navigation">
          {validChildren.map((_, i) => (
            <button
              key={`dot-${i}`}
              type="button"
              role="tab"
              aria-selected={i === activeIndex}
              aria-label={`Go to card ${i + 1}`}
              onClick={() => setActiveIndex(i)}
              className={cn(
                'h-2 rounded-full transition-all duration-300',
                i === activeIndex ? 'w-6 bg-[var(--link)]' : 'w-2 bg-[var(--line-strong)]',
              )}
            />
          ))}
        </div>
        <button
          type="button"
          onClick={() => setActiveIndex((i) => Math.min(validChildren.length - 1, i + 1))}
          disabled={activeIndex === validChildren.length - 1}
          aria-label="Next card"
          className="text-[var(--text-soft)] hover:text-[var(--text-soft)] disabled:opacity-20 transition-colors min-h-[44px] min-w-[44px] flex items-center justify-center"
        >
          <ChevronRight size={20} />
        </button>
      </div>
    </div>
  );
}

// --- Bottom Navigation ---

const MOBILE_TABS: { id: CareerIQRoom; label: string; icon: typeof Home }[] = [
  { id: 'dashboard', label: 'Home', icon: Home },
  { id: 'career-profile', label: 'Profile', icon: Sparkles },
  { id: 'resume', label: 'Resume', icon: User },
  { id: 'jobs', label: 'Board', icon: Columns3 },
  { id: 'interview', label: 'Interview', icon: Activity },
];

function BottomNav({ activeTab, onNavigate }: { activeTab: CareerIQRoom; onNavigate: (room: CareerIQRoom) => void }) {
  return (
    <nav className="fixed bottom-0 left-0 right-0 z-50 flex items-center justify-around border-t border-[var(--line-soft)] bg-[var(--bg-1)]/95 backdrop-blur-xl px-2 py-2 safe-area-pb">
      {MOBILE_TABS.map((tab) => {
        const Icon = tab.icon;
        const isActive = activeTab === tab.id;
        return (
          <button
            key={tab.id}
            type="button"
            onClick={() => onNavigate(tab.id)}
            className={cn(
              'flex flex-col items-center gap-0.5 px-3 py-1 min-h-[44px] min-w-[44px] transition-colors',
              isActive ? 'text-[var(--link)]' : 'text-[var(--text-soft)]',
            )}
          >
            <Icon size={20} />
            <span className="text-[12px] font-medium">{tab.label}</span>
          </button>
        );
      })}
    </nav>
  );
}

// --- Main export ---

export function MobileBriefing({
  userName,
  signals: _signals,
  dashboardState,
  activeRoom,
  onRefineWhyMe,
  onNavigateRoom,
  hasResumeSessions = false,
  sessionCount = 0,
  coachRecommendation = null,
  feedEvents,
  navOnly = false,
  onNavigateRoute,
}: MobileBriefingProps) {
  // navOnly mode: render only the bottom nav bar (used when a room is displayed above)
  if (navOnly) {
    return <BottomNav activeTab={activeRoom} onNavigate={onNavigateRoom} />;
  }

  return (
    <div className="flex flex-col min-h-screen pb-20">
      {/* Header */}
      <div className="px-4 pt-4 pb-2">
        <span className="text-[13px] font-medium text-[var(--link)]/60 uppercase tracking-widest">
          Daily Briefing
        </span>
      </div>

      {/* Swipeable card stack */}
      <div className="flex-1 pt-2">
        <CardStack>
          <ActionCard
            userName={userName}
            dashboardState={dashboardState}
            onRefineWhyMe={onRefineWhyMe}
            onNavigateRoom={onNavigateRoom}
            onNavigateRoute={onNavigateRoute}
            hasResumeSessions={hasResumeSessions}
            sessionCount={sessionCount}
            coachRecommendation={coachRecommendation}
          />
          <AgentActivityCard feedEvents={feedEvents} />
        </CardStack>
      </div>

      {/* Bottom navigation — reflects current active room */}
      <BottomNav activeTab={activeRoom} onNavigate={onNavigateRoom} />
    </div>
  );
}

// --- Helpers ---

function getTimeOfDay(): string {
  const hour = new Date().getHours();
  if (hour < 12) return 'morning';
  if (hour < 17) return 'afternoon';
  return 'evening';
}
