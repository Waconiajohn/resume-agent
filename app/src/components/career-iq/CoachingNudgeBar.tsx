import { GlassCard } from '@/components/GlassCard';
import { cn } from '@/lib/utils';
import { X, Clock, Heart, AlertCircle, Star } from 'lucide-react';
import type { CoachingNudge } from '@/hooks/useMomentum';

// ─── Types ───────────────────────────────────────────────────────────────────

interface CoachingNudgeBarProps {
  nudges: CoachingNudge[];
  onDismiss: (nudgeId: string) => void;
}

// ─── Config ──────────────────────────────────────────────────────────────────

interface NudgeStyle {
  border: string;
  bg: string;
  iconColor: string;
  Icon: typeof Clock;
}

const NUDGE_STYLES: Record<string, NudgeStyle> = {
  inactivity: {
    border: 'border-[#f0d99f]/20',
    bg: 'bg-[#f0d99f]/[0.04]',
    iconColor: 'text-[#f0d99f]',
    Icon: Clock,
  },
  rejection_streak: {
    border: 'border-[#98b3ff]/20',
    bg: 'bg-[#98b3ff]/[0.04]',
    iconColor: 'text-[#98b3ff]',
    Icon: Heart,
  },
  stalled_pipeline: {
    border: 'border-[#f0d99f]/20',
    bg: 'bg-[#f0d99f]/[0.04]',
    iconColor: 'text-[#f0d99f]',
    Icon: AlertCircle,
  },
  milestone: {
    border: 'border-[#b5dec2]/20',
    bg: 'bg-[#b5dec2]/[0.04]',
    iconColor: 'text-[#b5dec2]',
    Icon: Star,
  },
};

const DEFAULT_NUDGE_STYLE: NudgeStyle = {
  border: 'border-white/10',
  bg: 'bg-white/[0.03]',
  iconColor: 'text-white/50',
  Icon: AlertCircle,
};

function getNudgeStyle(triggerType: string): NudgeStyle {
  return NUDGE_STYLES[triggerType] ?? DEFAULT_NUDGE_STYLE;
}

// ─── Single nudge card ───────────────────────────────────────────────────────

function NudgeCard({ nudge, onDismiss }: { nudge: CoachingNudge; onDismiss: (id: string) => void }) {
  const style = getNudgeStyle(nudge.trigger_type);
  const { Icon } = style;

  return (
    <GlassCard
      className={cn(
        'px-4 py-3 flex items-center gap-3',
        style.border,
        style.bg,
      )}
    >
      <div
        className={cn(
          'rounded-lg p-2 flex-shrink-0',
          nudge.trigger_type === 'inactivity' && 'bg-[#f0d99f]/10',
          nudge.trigger_type === 'rejection_streak' && 'bg-[#98b3ff]/10',
          nudge.trigger_type === 'stalled_pipeline' && 'bg-[#f0d99f]/10',
          nudge.trigger_type === 'milestone' && 'bg-[#b5dec2]/10',
          !NUDGE_STYLES[nudge.trigger_type] && 'bg-white/[0.06]',
        )}
      >
        <Icon size={15} className={style.iconColor} />
      </div>

      <p className="flex-1 min-w-0 text-[13px] text-white/75 leading-relaxed">
        {nudge.message}
      </p>

      <button
        type="button"
        aria-label="Dismiss nudge"
        onClick={() => onDismiss(nudge.id)}
        className="flex-shrink-0 text-white/25 hover:text-white/50 transition-colors"
      >
        <X size={14} />
      </button>
    </GlassCard>
  );
}

// ─── Component ───────────────────────────────────────────────────────────────

export function CoachingNudgeBar({ nudges, onDismiss }: CoachingNudgeBarProps) {
  const visible = nudges.slice(0, 3);

  if (visible.length === 0) return null;

  return (
    <div className="flex flex-col gap-2">
      {visible.map((nudge) => (
        <NudgeCard key={nudge.id} nudge={nudge} onDismiss={onDismiss} />
      ))}
    </div>
  );
}
