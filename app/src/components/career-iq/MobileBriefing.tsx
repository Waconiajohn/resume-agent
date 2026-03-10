import { GlassCard } from '@/components/GlassCard';
import {
  ArrowRight,
  Sparkles,
  Bot,
  Home,
  Columns3,
  Video,
  Activity,
  User,
  ChevronLeft,
  ChevronRight,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { useState, useRef, useCallback } from 'react';
import type { WhyMeSignals, DashboardState } from './useWhyMeStory';
import type { CareerIQRoom } from './Sidebar';

interface MobileBriefingProps {
  userName: string;
  signals: WhyMeSignals;
  dashboardState: DashboardState;
  activeRoom: CareerIQRoom;
  onRefineWhyMe: () => void;
  onNavigateRoom: (room: CareerIQRoom) => void;
  /** When true, renders only the bottom nav (used when a room is active) */
  navOnly?: boolean;
}

// --- Card 1: One Action Today ---

function ActionCard({ userName, dashboardState, onRefineWhyMe }: {
  userName: string;
  dashboardState: DashboardState;
  onRefineWhyMe: () => void;
}) {
  const firstName = userName?.split('@')[0]?.split('.')[0] ?? 'there';
  const displayName = firstName.charAt(0).toUpperCase() + firstName.slice(1);

  const actions: Record<DashboardState, { insight: string; cta: string }> = {
    'new-user': {
      insight: 'Define your Why-Me story to unlock the full platform.',
      cta: 'Define Your Why-Me Story',
    },
    refining: {
      insight: 'Strengthening your story will sharpen every agent\'s output.',
      cta: 'Refine Your Story',
    },
    strong: {
      insight: 'Your LinkedIn headline isn\'t reflecting your Why-Me story yet.',
      cta: 'Update LinkedIn Headline',
    },
  };

  const { insight, cta } = actions[dashboardState];

  return (
    <GlassCard className="p-6 flex flex-col min-h-[240px]">
      <div className="text-[11px] font-medium text-[#98b3ff]/60 uppercase tracking-widest mb-3">
        Your One Action Today
      </div>
      <h2 className="text-lg font-semibold text-white/90 mb-2">
        Good {getTimeOfDay()}, {displayName}
      </h2>
      <p className="text-[14px] text-white/55 leading-relaxed flex-1">
        <Sparkles size={14} className="inline mr-1.5 text-[#98b3ff] -mt-0.5" />
        {insight}
      </p>
      <button
        type="button"
        onClick={dashboardState !== 'strong' ? onRefineWhyMe : undefined}
        className="mt-4 w-full flex items-center justify-center gap-2 rounded-xl border border-[#9eb8ff]/45 bg-[linear-gradient(180deg,rgba(158,184,255,0.2),rgba(158,184,255,0.1))] px-4 py-3 text-[14px] font-medium text-white shadow-[0_10px_28px_-18px_rgba(132,160,255,0.9)]"
      >
        {cta}
        <ArrowRight size={16} />
      </button>
    </GlassCard>
  );
}

// --- Card 2: Agent Activity ---

function AgentActivityCard() {
  return (
    <GlassCard className="p-6 flex flex-col min-h-[240px]">
      <div className="flex items-center gap-2 mb-4">
        <Bot size={16} className="text-[#98b3ff]" />
        <span className="text-[11px] font-medium text-[#98b3ff]/60 uppercase tracking-widest">
          Agent Activity
        </span>
      </div>
      <div className="flex-1 flex items-center justify-center">
        <p className="text-[13px] text-white/35 text-center leading-relaxed">
          No recent agent activity.
        </p>
      </div>
    </GlassCard>
  );
}

// LiveSessionCard is hidden until a real session schedule system is connected.
// Returning null here removes it from the CardStack children array.
// Note: CardStack filters out null/undefined children via React's normal rendering.

// --- Swipeable Card Stack ---

function CardStack({ children }: { children: React.ReactNode[] }) {
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
    if (touchDeltaX.current < -threshold && activeIndex < children.length - 1) {
      setActiveIndex((i) => i + 1);
    } else if (touchDeltaX.current > threshold && activeIndex > 0) {
      setActiveIndex((i) => i - 1);
    }
  }, [activeIndex, children.length]);

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
          {children.map((child, i) => (
            <div key={i} className="w-full flex-shrink-0 px-4">
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
          className="text-white/30 hover:text-white/60 disabled:opacity-20 transition-colors"
        >
          <ChevronLeft size={20} />
        </button>
        <div className="flex gap-2">
          {children.map((_, i) => (
            <button
              key={i}
              type="button"
              onClick={() => setActiveIndex(i)}
              className={cn(
                'h-2 rounded-full transition-all duration-300',
                i === activeIndex ? 'w-6 bg-[#98b3ff]' : 'w-2 bg-white/20',
              )}
            />
          ))}
        </div>
        <button
          type="button"
          onClick={() => setActiveIndex((i) => Math.min(children.length - 1, i + 1))}
          disabled={activeIndex === children.length - 1}
          className="text-white/30 hover:text-white/60 disabled:opacity-20 transition-colors"
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
  { id: 'jobs', label: 'Pipeline', icon: Columns3 },
  { id: 'learning', label: 'Live', icon: Video },
  { id: 'networking', label: 'Network', icon: Activity },
  { id: 'resume', label: 'Resume', icon: User },
];

function BottomNav({ activeTab, onNavigate }: { activeTab: CareerIQRoom; onNavigate: (room: CareerIQRoom) => void }) {
  return (
    <nav className="fixed bottom-0 left-0 right-0 z-50 flex items-center justify-around border-t border-white/[0.08] bg-[var(--bg-1)]/95 backdrop-blur-xl px-2 py-2 safe-area-pb">
      {MOBILE_TABS.map((tab) => {
        const Icon = tab.icon;
        const isActive = activeTab === tab.id;
        return (
          <button
            key={tab.id}
            type="button"
            onClick={() => onNavigate(tab.id)}
            className={cn(
              'flex flex-col items-center gap-0.5 px-3 py-1 transition-colors',
              isActive ? 'text-[#98b3ff]' : 'text-white/35',
            )}
          >
            <Icon size={20} />
            <span className="text-[10px] font-medium">{tab.label}</span>
          </button>
        );
      })}
    </nav>
  );
}

// --- Main export ---

export function MobileBriefing({ userName, signals, dashboardState, activeRoom, onRefineWhyMe, onNavigateRoom, navOnly = false }: MobileBriefingProps) {
  // navOnly mode: render only the bottom nav bar (used when a room is displayed above)
  if (navOnly) {
    return <BottomNav activeTab={activeRoom} onNavigate={onNavigateRoom} />;
  }

  return (
    <div className="flex flex-col min-h-screen pb-20">
      {/* Header */}
      <div className="px-4 pt-4 pb-2">
        <span className="text-[11px] font-medium text-[#98b3ff]/60 uppercase tracking-widest">
          Daily Briefing
        </span>
      </div>

      {/* Swipeable card stack */}
      <div className="flex-1 pt-2">
        <CardStack>
          <ActionCard userName={userName} dashboardState={dashboardState} onRefineWhyMe={onRefineWhyMe} />
          <AgentActivityCard />
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
