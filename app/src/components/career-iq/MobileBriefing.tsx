import { GlassCard } from '@/components/GlassCard';
import {
  ArrowRight,
  Sparkles,
  Bot,
  Radio,
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
  onRefineWhyMe: () => void;
  onNavigateRoom: (room: CareerIQRoom) => void;
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

// --- Card 2: Agent Activity Overnight ---

const MOCK_OVERNIGHT_ACTIVITY = [
  { icon: '📝', text: 'Cover Letter Agent drafted a letter for Acme Corp' },
  { icon: '🔗', text: 'LinkedIn Agent found 3 new connections at target companies' },
  { icon: '🎯', text: 'Job Finder surfaced 2 roles matching your profile' },
  { icon: '💡', text: 'Interview Agent prepared practice questions for Thursday' },
];

function AgentActivityCard() {
  return (
    <GlassCard className="p-6 flex flex-col min-h-[240px]">
      <div className="flex items-center gap-2 mb-4">
        <Bot size={16} className="text-[#98b3ff]" />
        <span className="text-[11px] font-medium text-[#98b3ff]/60 uppercase tracking-widest">
          What Agents Did Overnight
        </span>
      </div>
      <div className="flex-1 space-y-3">
        {MOCK_OVERNIGHT_ACTIVITY.map((item, i) => (
          <div key={i} className="flex items-start gap-2.5">
            <span className="text-[14px] flex-shrink-0 mt-0.5">{item.icon}</span>
            <span className="text-[13px] text-white/60 leading-relaxed">{item.text}</span>
          </div>
        ))}
      </div>
    </GlassCard>
  );
}

// --- Card 3: Live Session Alert ---

function LiveSessionCard() {
  const now = new Date();
  const isLive = now.getMinutes() < 30;

  return (
    <GlassCard className={cn('p-6 flex flex-col min-h-[240px]', isLive && 'border-red-400/20')}>
      <div className="flex items-center gap-2 mb-4">
        {isLive ? (
          <>
            <span className="relative flex h-2 w-2">
              <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-red-400 opacity-75" style={{ animationDuration: '2s' }} />
              <span className="relative inline-flex h-2 w-2 rounded-full bg-red-400" />
            </span>
            <span className="text-[11px] font-semibold text-red-400 uppercase tracking-widest">
              Live Now
            </span>
          </>
        ) : (
          <>
            <Radio size={14} className="text-white/30" />
            <span className="text-[11px] font-medium text-white/30 uppercase tracking-widest">
              Next Session
            </span>
          </>
        )}
      </div>

      <h3 className="text-[16px] font-semibold text-white/85 mb-1">
        {isLive ? 'Interview Confidence for Executives' : 'Networking Without the Cringe'}
      </h3>
      <p className="text-[12px] text-white/40 mb-1">
        with {isLive ? 'Dr. Amy Walsh' : 'James Okafor'}
      </p>
      {!isLive && (
        <p className="text-[12px] text-white/30 mb-auto">
          Thursday at 3:00 PM
        </p>
      )}

      <button
        type="button"
        className={cn(
          'mt-4 w-full flex items-center justify-center gap-2 rounded-xl px-4 py-3 text-[14px] font-medium transition-colors',
          isLive
            ? 'bg-red-400/15 border border-red-400/20 text-red-300 hover:bg-red-400/25'
            : 'border border-white/[0.08] bg-white/[0.04] text-white/50 hover:bg-white/[0.07]',
        )}
      >
        {isLive ? 'Join Now' : 'Set Reminder'}
        <ArrowRight size={16} />
      </button>
    </GlassCard>
  );
}

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

const MOBILE_TABS: { id: CareerIQRoom | 'profile'; label: string; icon: typeof Home }[] = [
  { id: 'dashboard', label: 'Home', icon: Home },
  { id: 'jobs', label: 'Pipeline', icon: Columns3 },
  { id: 'learning', label: 'Live', icon: Video },
  { id: 'dashboard', label: 'Agents', icon: Activity },
  { id: 'profile' as CareerIQRoom, label: 'Profile', icon: User },
];

function BottomNav({ activeTab, onNavigate }: { activeTab: string; onNavigate: (room: CareerIQRoom) => void }) {
  return (
    <nav className="fixed bottom-0 left-0 right-0 z-50 flex items-center justify-around border-t border-white/[0.08] bg-[var(--bg-1)]/95 backdrop-blur-xl px-2 py-2 safe-area-pb">
      {MOBILE_TABS.map((tab) => {
        const Icon = tab.icon;
        const isActive = activeTab === tab.id || (tab.label === 'Home' && activeTab === 'dashboard');
        return (
          <button
            key={tab.label}
            type="button"
            onClick={() => onNavigate(tab.id as CareerIQRoom)}
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

export function MobileBriefing({ userName, signals, dashboardState, onRefineWhyMe, onNavigateRoom }: MobileBriefingProps) {
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
          <LiveSessionCard />
        </CardStack>
      </div>

      {/* Bottom navigation */}
      <BottomNav activeTab="dashboard" onNavigate={onNavigateRoom} />
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
