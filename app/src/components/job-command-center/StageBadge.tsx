import { cn } from '@/lib/utils';
import type { PipelineStage } from '@/hooks/useApplicationPipeline';

const STAGE_COLORS: Record<PipelineStage, string> = {
  saved: 'bg-white/10 text-white/50',
  researching: 'bg-[#98b3ff]/10 text-[#98b3ff]',
  applied: 'bg-[#f0d99f]/10 text-[#f0d99f]',
  screening: 'bg-[#f0d99f]/15 text-[#f0d99f]',
  interviewing: 'bg-[#b5dec2]/10 text-[#b5dec2]',
  offer: 'bg-[#b5dec2]/15 text-[#b5dec2]',
  closed_won: 'bg-[#b5dec2]/20 text-[#b5dec2]',
  closed_lost: 'bg-red-400/10 text-red-400/60',
};

export function StageBadge({ stage }: { stage: PipelineStage }) {
  return (
    <span
      className={cn(
        'rounded-md px-2 py-1 text-[10px] font-semibold uppercase tracking-[0.12em]',
        STAGE_COLORS[stage],
      )}
    >
      {stage.replace('_', ' ')}
    </span>
  );
}
