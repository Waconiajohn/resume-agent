import { cn } from '@/lib/utils';
import type { PipelineStage } from '@/hooks/useApplicationPipeline';

const STAGE_COLORS: Record<PipelineStage, string> = {
  saved: 'bg-white/10 text-white/50',
  researching: 'bg-[#98b3ff]/10 text-[#98b3ff]',
  applied: 'bg-[#dfc797]/10 text-[#dfc797]',
  screening: 'bg-[#dfc797]/15 text-[#dfc797]',
  interviewing: 'bg-[#b5dec2]/10 text-[#b5dec2]',
  offer: 'bg-[#b5dec2]/15 text-[#b5dec2]',
  closed_won: 'bg-[#b5dec2]/20 text-[#b5dec2]',
  closed_lost: 'bg-red-400/10 text-red-400/60',
};

export function StageBadge({ stage }: { stage: PipelineStage }) {
  return (
    <span
      className={cn(
        'text-[10px] font-medium px-1.5 py-0.5 rounded-full capitalize',
        STAGE_COLORS[stage],
      )}
    >
      {stage.replace('_', ' ')}
    </span>
  );
}
