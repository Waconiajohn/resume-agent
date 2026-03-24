import { useDroppable } from '@dnd-kit/core';
import { cn } from '@/lib/utils';
import type { PipelineStage } from '@/hooks/useApplicationPipeline';

const STAGE_DOT: Record<PipelineStage, string> = {
  saved: 'bg-white/30',
  researching: 'bg-[#98b3ff]/60',
  applied: 'bg-[#f0d99f]/60',
  screening: 'bg-[#f0d99f]/80',
  interviewing: 'bg-[#b5dec2]/60',
  offer: 'bg-[#b5dec2]/80',
  closed_won: 'bg-[#b5dec2]',
  closed_lost: 'bg-red-400/50',
};

interface PipelineColumnProps {
  stageKey: PipelineStage;
  label: string;
  color: string;
  count: number;
  children: React.ReactNode;
}

export function PipelineColumn({ stageKey, label, color, count, children }: PipelineColumnProps) {
  const { setNodeRef, isOver } = useDroppable({ id: stageKey });

  return (
    <div className="min-w-[160px] flex flex-col">
      <div className="flex items-center gap-1.5 mb-2">
        <span className={cn('h-2 w-2 rounded-full flex-shrink-0', STAGE_DOT[stageKey])} />
        <span className={cn('text-[13px] font-semibold uppercase tracking-wider', color)}>
          {label}
        </span>
        <span className="text-[12px] text-[var(--text-soft)] tabular-nums ml-auto">{count}</span>
      </div>

      <div
        ref={setNodeRef}
        className={cn(
          'flex-1 space-y-2 rounded-xl p-1 min-h-[60px] transition-colors',
          isOver && 'bg-[var(--accent-muted)] ring-1 ring-[var(--line-soft)]',
        )}
      >
        {children}
      </div>
    </div>
  );
}
