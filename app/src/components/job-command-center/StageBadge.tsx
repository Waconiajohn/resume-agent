import { cn } from '@/lib/utils';
import type { PipelineStage } from '@/hooks/useApplicationPipeline';

const STAGE_COLORS: Record<PipelineStage, string> = {
  saved: 'bg-[var(--accent-muted)] text-[var(--text-soft)]',
  researching: 'bg-[#98b3ff]/10 text-[#98b3ff]',
  applied: 'bg-[var(--badge-amber-bg)] text-[var(--badge-amber-text)]',
  screening: 'bg-[var(--badge-amber-bg)] text-[var(--badge-amber-text)]',
  interviewing: 'bg-[var(--badge-green-bg)] text-[var(--badge-green-text)]',
  offer: 'bg-[var(--badge-green-bg)] text-[var(--badge-green-text)]',
  closed_won: 'bg-[var(--badge-green-bg)] text-[var(--badge-green-text)]',
  closed_lost: 'bg-red-400/10 text-red-400/60',
};

export function StageBadge({ stage }: { stage: PipelineStage }) {
  return (
    <span
      className={cn(
        'rounded-md px-2 py-1 text-[12px] font-semibold uppercase tracking-[0.12em]',
        STAGE_COLORS[stage],
      )}
    >
      {stage.replace('_', ' ')}
    </span>
  );
}
