/**
 * V3StageProgress — horizontal 5-stage indicator for the v3 pipeline.
 *
 * Visual spec: pending=muted, running=coral with a subtle pulse, complete=coral
 * solid with checkmark, failed=red. Labels sit below each dot. Connecting
 * lines fill as stages complete.
 *
 * Uses --bullet-confirm tokens as the v3 accent color (coral) per the design
 * direction — distinct from v2's blue, warm like claude.ai's palette.
 */

import { Check, AlertCircle } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { V3Stage, V3StageStatus } from '@/hooks/useV3Pipeline';

interface V3StageProgressProps {
  stageStatus: Record<V3Stage, V3StageStatus>;
  currentStage: V3Stage | null;
}

const STAGES: Array<{ id: V3Stage; label: string; description: string }> = [
  { id: 'extract', label: 'Extract', description: 'Reading the resume' },
  { id: 'classify', label: 'Classify', description: 'Structuring content' },
  { id: 'benchmark', label: 'Benchmark', description: 'Ideal candidate profile' },
  { id: 'strategize', label: 'Strategize', description: 'Designing positioning' },
  { id: 'write', label: 'Write', description: 'Drafting the resume' },
  { id: 'verify', label: 'Verify', description: 'Checking attribution' },
];

function dotClass(status: V3StageStatus, current: boolean): string {
  if (status === 'complete') {
    return 'bg-[var(--bullet-confirm)] border-[var(--bullet-confirm)] text-white';
  }
  if (status === 'failed') {
    return 'bg-[var(--badge-red-bg)] border-[var(--badge-red-text)] text-[var(--badge-red-text)]';
  }
  if (status === 'running' || current) {
    return 'bg-[var(--bullet-confirm-bg)] border-[var(--bullet-confirm)] text-[var(--bullet-confirm)] motion-safe:animate-pulse';
  }
  return 'bg-[var(--surface-2)] border-[var(--line-soft)] text-[var(--text-soft)]';
}

function connectorClass(leftStatus: V3StageStatus): string {
  if (leftStatus === 'complete') return 'bg-[var(--bullet-confirm)]';
  if (leftStatus === 'failed') return 'bg-[var(--badge-red-text)] opacity-40';
  return 'bg-[var(--line-soft)]';
}

export function V3StageProgress({ stageStatus, currentStage }: V3StageProgressProps) {
  return (
    <div className="w-full">
      <div className="flex items-start justify-between">
        {STAGES.map((s, idx) => {
          const status = stageStatus[s.id];
          const isCurrent = currentStage === s.id;
          const isLast = idx === STAGES.length - 1;
          return (
            <div key={s.id} className="flex-1 flex flex-col items-center relative">
              <div className="flex items-center w-full">
                {/* left connector (absent for first stage) */}
                <div
                  className={cn(
                    'flex-1 h-px transition-colors duration-500',
                    idx === 0 ? 'opacity-0' : connectorClass(STAGES[idx - 1] ? stageStatus[STAGES[idx - 1].id] : 'pending'),
                  )}
                />
                {/* dot */}
                <div
                  className={cn(
                    'flex h-8 w-8 items-center justify-center rounded-full border-2 transition-all duration-300 text-xs font-semibold',
                    dotClass(status, isCurrent),
                  )}
                  aria-label={`${s.label}: ${status}`}
                >
                  {status === 'complete' ? (
                    <Check className="h-4 w-4" strokeWidth={2.5} />
                  ) : status === 'failed' ? (
                    <AlertCircle className="h-4 w-4" />
                  ) : (
                    <span>{idx + 1}</span>
                  )}
                </div>
                {/* right connector (absent for last stage) */}
                <div
                  className={cn(
                    'flex-1 h-px transition-colors duration-500',
                    isLast ? 'opacity-0' : connectorClass(status),
                  )}
                />
              </div>
              <div className="mt-2 text-center">
                <div
                  className={cn(
                    'text-[11px] font-semibold uppercase tracking-[0.08em] transition-colors',
                    status === 'complete' || status === 'running' || isCurrent
                      ? 'text-[var(--text-strong)]'
                      : status === 'failed'
                        ? 'text-[var(--badge-red-text)]'
                        : 'text-[var(--text-soft)]',
                  )}
                >
                  {s.label}
                </div>
                <div className="text-[10px] text-[var(--text-soft)] mt-0.5 max-w-[88px]">
                  {s.description}
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
