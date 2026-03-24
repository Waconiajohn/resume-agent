import { GlassCard } from '@/components/GlassCard';
import { cn } from '@/lib/utils';
import { Target, Activity, TrendingUp, ArrowUpRight } from 'lucide-react';
import type { WhyMeSignals } from './useWhyMeStory';

type SignalLevel = 'strong' | 'building' | 'needs-work';

interface Signal {
  label: string;
  description: string;
  level: SignalLevel;
  icon: typeof Target;
  detail: string;
}

interface PipelineStats {
  total: number;
  interviewing: number;
  offer: number;
  daysSinceLastActivity: number;
}

interface ZoneYourSignalsProps {
  whyMeSignals?: WhyMeSignals;
  sessionCount?: number;
  pipelineStats?: PipelineStats;
}

function computePositioningStrength(signals?: WhyMeSignals): { level: SignalLevel; detail: string } {
  if (!signals) return { level: 'needs-work', detail: 'Complete your Career Profile to activate this signal' };

  const levels = [signals.clarity, signals.alignment, signals.differentiation];
  const greenCount = levels.filter((l) => l === 'green').length;
  const redCount = levels.filter((l) => l === 'red').length;

  if (greenCount === 3) return { level: 'strong', detail: 'Resume + LinkedIn aligned with your Career Profile narrative' };
  if (redCount >= 2) return { level: 'needs-work', detail: 'Refine your Career Profile to strengthen your positioning' };
  return { level: 'building', detail: `${greenCount} of 3 signals strong — keep refining for full alignment` };
}

function computeActivityScore(sessionCount?: number, stats?: PipelineStats): { level: SignalLevel; detail: string } {
  const sessions = sessionCount ?? 0;
  const total = stats?.total ?? 0;
  const daysSince = stats?.daysSinceLastActivity ?? 99;

  if (sessions >= 2 && total >= 5 && daysSince <= 3) {
    return { level: 'strong', detail: `${total} active applications, ${sessions} resume sessions — strong momentum` };
  }
  if (sessions >= 1 || total >= 2) {
    const parts: string[] = [];
    if (total > 0) parts.push(`${total} application${total > 1 ? 's' : ''}`);
    if (sessions > 0) parts.push(`${sessions} resume session${sessions > 1 ? 's' : ''}`);
    return { level: 'building', detail: `${parts.join(', ')} — keep building momentum` };
  }
  return { level: 'needs-work', detail: 'Start with a resume session to build search momentum' };
}

function computeMarketAlignment(stats?: PipelineStats): { level: SignalLevel; detail: string } {
  if (!stats || stats.total === 0) {
    return { level: 'needs-work', detail: 'Add applications to your pipeline to track market alignment' };
  }

  const advancedCount = stats.interviewing + stats.offer;
  const advancedRatio = advancedCount / stats.total;

  if (advancedRatio >= 0.3 && advancedCount >= 2) {
    return { level: 'strong', detail: `${advancedCount} of ${stats.total} applications advancing — your targeting is on point` };
  }
  if (advancedCount >= 1) {
    return { level: 'building', detail: `${advancedCount} of ${stats.total} advancing — refine targeting to improve conversion` };
  }
  return { level: 'needs-work', detail: `${stats.total} applications, none advancing yet — review your positioning` };
}

const SIGNAL_DEFINITIONS: Pick<Signal, 'label' | 'description' | 'icon'>[] = [
  { label: 'Positioning Strength', description: 'How well your materials tell your Career Profile story', icon: Target },
  { label: 'Activity Score', description: 'Your consistent engagement across the platform', icon: Activity },
  { label: 'Market Alignment', description: 'How well your targeting matches market opportunity', icon: TrendingUp },
];

const LEVEL_CONFIG: Record<SignalLevel, { color: string; bg: string; border: string; label: string; barWidth: string }> = {
  strong: { color: 'text-[#b5dec2]', bg: 'bg-[#b5dec2]/10', border: 'border-[#b5dec2]/20', label: 'Strong', barWidth: 'w-[85%]' },
  building: { color: 'text-[#f0d99f]', bg: 'bg-[#f0d99f]/10', border: 'border-[#f0d99f]/20', label: 'Building', barWidth: 'w-[55%]' },
  'needs-work': { color: 'text-[#f0b8b8]', bg: 'bg-[#f0b8b8]/10', border: 'border-[#f0b8b8]/20', label: 'Needs work', barWidth: 'w-[30%]' },
};

function SignalCard({ signal }: { signal: Signal }) {
  const config = LEVEL_CONFIG[signal.level];
  const Icon = signal.icon;

  return (
    <div
      className={cn(
        'group flex-1 min-w-[220px] rounded-xl border bg-[var(--accent-muted)] p-4 transition-all duration-150',
        'hover:bg-[var(--surface-1)] cursor-pointer',
        config.border,
      )}
    >
      <div className="flex items-start justify-between mb-3">
        <div className="rounded-lg bg-[var(--accent-muted)] p-2">
          <Icon size={16} className="text-[var(--text-soft)]" />
        </div>
        <div className="flex items-center gap-1">
          <span className={cn('text-[13px] font-medium px-2 py-0.5 rounded-full', config.bg, config.color)}>
            {config.label}
          </span>
          <ArrowUpRight size={12} className="text-transparent group-hover:text-[var(--text-soft)] transition-colors" />
        </div>
      </div>

      <div className="text-[13px] font-medium text-[var(--text-strong)]">{signal.label}</div>
      <div className="text-[13px] text-[var(--text-soft)] mt-1 leading-relaxed">{signal.description}</div>

      <div className="mt-3 h-1 rounded-full bg-[var(--accent-muted)] overflow-hidden">
        <div
          className={cn(
            'h-full rounded-full transition-all duration-700',
            signal.level === 'strong' && 'bg-[#b5dec2]/60',
            signal.level === 'building' && 'bg-[#f0d99f]/60',
            signal.level === 'needs-work' && 'bg-[#f0b8b8]/60',
            config.barWidth,
          )}
        />
      </div>

      <div className="mt-2.5 text-[13px] text-[var(--text-soft)] leading-relaxed">{signal.detail}</div>
    </div>
  );
}

export function ZoneYourSignals({ whyMeSignals, sessionCount, pipelineStats }: ZoneYourSignalsProps) {
  const signals: Signal[] = [
    { ...SIGNAL_DEFINITIONS[0], ...computePositioningStrength(whyMeSignals) },
    { ...SIGNAL_DEFINITIONS[1], ...computeActivityScore(sessionCount, pipelineStats) },
    { ...SIGNAL_DEFINITIONS[2], ...computeMarketAlignment(pipelineStats) },
  ];

  return (
    <GlassCard className="p-5">
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-[14px] font-semibold text-[var(--text-strong)]">Your Signals</h3>
        <span className="text-[13px] text-[var(--text-soft)]">
          Quality of effort, not raw outcomes
        </span>
      </div>
      <div className="flex gap-4 flex-wrap">
        {signals.map((signal) => (
          <SignalCard key={signal.label} signal={signal} />
        ))}
      </div>
    </GlassCard>
  );
}
