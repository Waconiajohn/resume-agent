import { GlassCard } from '@/components/GlassCard';
import { GlassButton } from '@/components/GlassButton';
import { Sparkles, ArrowRight, Pencil } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { WhyMeSignals, SignalLevel, DashboardState } from './useWhyMeStory';
import type { CareerIQRoom } from './Sidebar';

interface ZoneYourDayProps {
  userName: string;
  signals: WhyMeSignals;
  dashboardState: DashboardState;
  onRefineWhyMe?: () => void;
  onNavigateRoom?: (room: CareerIQRoom) => void;
}

function getRotatingInsight(state: DashboardState): string {
  if (state === 'new-user') {
    return 'Start by building your Career Profile. It gives the rest of the platform the story, strengths, and direction to work from.';
  }
  if (state === 'refining') {
    return 'Your Career Profile is taking shape. Tightening it up will make every resume, interview, and LinkedIn recommendation sharper.';
  }
  return 'Your profile is strong. Use it to target better-fit roles and tailor stronger applications.';
}

const ACTIONS_BY_STATE: Record<DashboardState, string> = {
  'new-user': 'Build your Career Profile',
  refining: 'Strengthen your Career Profile',
  strong: 'Find matching roles',
};

function SignalDot({ level, label }: { level: SignalLevel; label: string }) {
  const colors: Record<SignalLevel, string> = {
    green: 'bg-[var(--badge-green-text)]',
    yellow: 'bg-[var(--badge-amber-text)]',
    red: 'bg-[var(--line-strong)]',
  };
  return (
    <div className="flex items-center gap-1.5">
      <div className={cn('h-2.5 w-2.5 rounded-full transition-colors duration-500', colors[level])} />
      <span className="text-[13px] text-[var(--text-soft)]">{label}</span>
    </div>
  );
}

export function ZoneYourDay({ userName, signals, dashboardState, onRefineWhyMe, onNavigateRoom }: ZoneYourDayProps) {
  const displayName = userName || 'there';

  return (
    <GlassCard className="p-6">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
        {/* Left: Greeting + Insight */}
        <div className="flex-1 min-w-0">
          <h2 className="text-lg font-semibold text-[var(--text-strong)]">
            Good {getTimeOfDay()}, {displayName}
          </h2>
          <p className="mt-2 text-[14px] leading-relaxed text-[var(--text-soft)] max-w-xl">
            <Sparkles size={14} className="inline mr-1.5 text-[var(--link)] -mt-0.5" />
            {getRotatingInsight(dashboardState)}
          </p>
          <div className="mt-4 flex items-center gap-3">
            <GlassButton
              variant="primary"
              className="group"
              onClick={dashboardState === 'strong' ? () => onNavigateRoom?.('jobs') : onRefineWhyMe}
            >
              {ACTIONS_BY_STATE[dashboardState]}
              <ArrowRight size={16} className="ml-2 transition-transform group-hover:translate-x-0.5" />
            </GlassButton>
            {dashboardState === 'strong' && onRefineWhyMe && (
              <button
                type="button"
                onClick={onRefineWhyMe}
                className="flex items-center gap-1.5 text-[12px] text-[var(--text-soft)] hover:text-[var(--text-soft)] transition-colors"
              >
                <Pencil size={12} />
                Refine story
              </button>
            )}
          </div>
        </div>

        {/* Right: profile signals */}
        <div className="flex flex-col items-end gap-3 flex-shrink-0">
          <div className="rounded-xl border border-[var(--line-soft)] bg-[var(--accent-muted)] px-4 py-3">
            <div className="text-[13px] font-medium text-[var(--text-soft)] uppercase tracking-wider mb-2">
              Career Profile Signals
            </div>
            <div className="flex gap-4">
              <SignalDot level={signals.clarity} label="Clarity" />
              <SignalDot level={signals.alignment} label="Alignment" />
              <SignalDot level={signals.differentiation} label="Differentiation" />
            </div>
          </div>

          {/* Streak — hidden until connected to real Momentum data */}
        </div>
      </div>
    </GlassCard>
  );
}

function getTimeOfDay(): string {
  const hour = new Date().getHours();
  if (hour < 12) return 'morning';
  if (hour < 17) return 'afternoon';
  return 'evening';
}
