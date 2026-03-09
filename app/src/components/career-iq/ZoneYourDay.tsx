import { GlassCard } from '@/components/GlassCard';
import { GlassButton } from '@/components/GlassButton';
import { Sparkles, Flame, ArrowRight, Pencil } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { WhyMeSignals, SignalLevel, DashboardState } from './useWhyMeStory';

interface ZoneYourDayProps {
  userName: string;
  signals: WhyMeSignals;
  dashboardState: DashboardState;
  onRefineWhyMe?: () => void;
}

// Webinar-triggered insights rotate into the strong state
const WEBINAR_INSIGHTS = [
  'Based on Monday\'s Why-Me Workshop: your Clarity signal could be stronger. Revisiting your first prompt is the highest-leverage move today.',
  'From Tuesday\'s LinkedIn Masterclass: your headline isn\'t reflecting your Why-Me story. Your LinkedIn Agent has a suggested update ready.',
  'After last week\'s Salary Negotiation session: review any "Offer" stage roles in your pipeline — the tactics discussed apply directly.',
];

function getRotatingInsight(state: DashboardState): string {
  if (state === 'new-user') {
    return 'Let\'s start by defining what makes you exceptional. Your Why-Me story is the foundation everything else builds on.';
  }
  if (state === 'refining') {
    return 'Your Why-Me story is taking shape. Strengthen your signals and every agent will produce sharper results.';
  }
  // Strong state: rotate between default and webinar-triggered insights
  const dayOfWeek = new Date().getDay();
  if (dayOfWeek <= 2) {
    // Mon-Tue: show webinar insight from most recent session
    return WEBINAR_INSIGHTS[dayOfWeek % WEBINAR_INSIGHTS.length];
  }
  return 'Your LinkedIn headline isn\'t reflecting your Why-Me story. Fixing this is the highest-leverage action you can take today.';
}

const ACTIONS_BY_STATE: Record<DashboardState, string> = {
  'new-user': 'Define your Why-Me story',
  refining: 'Refine your Why-Me story',
  strong: 'Update your LinkedIn headline',
};

const MOCK_STREAK = 3;

function SignalDot({ level, label }: { level: SignalLevel; label: string }) {
  const colors: Record<SignalLevel, string> = {
    green: 'bg-[#b5dec2]',
    yellow: 'bg-[#f0d99f]',
    red: 'bg-white/20',
  };
  return (
    <div className="flex items-center gap-1.5">
      <div className={cn('h-2.5 w-2.5 rounded-full transition-colors duration-500', colors[level])} />
      <span className="text-[11px] text-white/50">{label}</span>
    </div>
  );
}

export function ZoneYourDay({ userName, signals, dashboardState, onRefineWhyMe }: ZoneYourDayProps) {
  const firstName = userName?.split('@')[0]?.split('.')[0] ?? 'there';
  const displayName = firstName.charAt(0).toUpperCase() + firstName.slice(1);

  return (
    <GlassCard className="p-6">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
        {/* Left: Greeting + Insight */}
        <div className="flex-1 min-w-0">
          <h2 className="text-lg font-semibold text-white/90">
            Good {getTimeOfDay()}, {displayName}
          </h2>
          <p className="mt-2 text-[14px] leading-relaxed text-white/60 max-w-xl">
            <Sparkles size={14} className="inline mr-1.5 text-[#98b3ff] -mt-0.5" />
            {getRotatingInsight(dashboardState)}
          </p>
          <div className="mt-4 flex items-center gap-3">
            <GlassButton
              variant="primary"
              className="group"
              onClick={dashboardState !== 'strong' ? onRefineWhyMe : undefined}
            >
              {ACTIONS_BY_STATE[dashboardState]}
              <ArrowRight size={16} className="ml-2 transition-transform group-hover:translate-x-0.5" />
            </GlassButton>
            {dashboardState === 'strong' && onRefineWhyMe && (
              <button
                type="button"
                onClick={onRefineWhyMe}
                className="flex items-center gap-1.5 text-[12px] text-white/35 hover:text-white/55 transition-colors"
              >
                <Pencil size={12} />
                Refine story
              </button>
            )}
          </div>
        </div>

        {/* Right: Why-Me Indicator + Streak */}
        <div className="flex flex-col items-end gap-3 flex-shrink-0">
          {/* Why-Me Strength */}
          <div className="rounded-xl border border-white/[0.08] bg-white/[0.03] px-4 py-3">
            <div className="text-[11px] font-medium text-white/40 uppercase tracking-wider mb-2">
              Why-Me Strength
            </div>
            <div className="flex gap-4">
              <SignalDot level={signals.clarity} label="Clarity" />
              <SignalDot level={signals.alignment} label="Alignment" />
              <SignalDot level={signals.differentiation} label="Differentiation" />
            </div>
          </div>

          {/* Streak */}
          {dashboardState !== 'new-user' && (
            <div className="flex items-center gap-2 text-[13px] text-white/40">
              <Flame size={16} className="text-[#f0d99f]" />
              <span>{MOCK_STREAK}-day streak</span>
            </div>
          )}
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
