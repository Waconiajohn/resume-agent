import { Loader2, Check } from 'lucide-react';
import type { V2Stage } from '@/types/resume-v2';
import {
  PIPELINE_STAGE_LABELS,
  stageToProgressIndex,
  stageStatusMessage,
} from '../utils/review-state-labels';

interface PipelineProgressCardProps {
  stage: V2Stage;
  isComplete: boolean;
  companyAndRole: string | null;
}

export function PipelineProgressCard({ stage, isComplete, companyAndRole }: PipelineProgressCardProps) {
  const activeIndex = stageToProgressIndex(stage, isComplete);
  const statusMessage = stageStatusMessage(stage, isComplete);

  return (
    <div
      className="bg-[var(--surface-elevated)] rounded-lg shadow-[0_4px_24px_rgba(0,0,0,0.15)] border border-[var(--line-soft)] p-6"
      role="status"
      aria-live="polite"
    >
      <p className="text-[11px] font-semibold uppercase tracking-widest text-[var(--text-soft)] mb-4">
        Building Your Role-Specific Resume
      </p>

      {/* 6-step stepper */}
      <div className="flex items-center justify-between mb-6" role="list" aria-label="Pipeline progress">
        {PIPELINE_STAGE_LABELS.map((step, i) => {
          const isDone = i < activeIndex;
          const isActive = i === activeIndex && !isComplete;
          const isFinalDone = i === activeIndex && isComplete;

          return (
            <div
              key={step.key}
              className="flex flex-col items-center gap-1.5 flex-1"
              role="listitem"
              aria-current={isActive ? 'step' : undefined}
            >
              <div
                className={[
                  'flex items-center justify-center h-8 w-8 rounded-full text-xs font-semibold transition-colors duration-300',
                  isDone || isFinalDone
                    ? 'bg-[var(--link)] text-white'
                    : isActive
                      ? 'bg-[var(--link)]/15 text-[var(--link)] ring-2 ring-[var(--link)]/40'
                      : 'bg-[var(--surface-1)] text-[var(--text-soft)]',
                ].join(' ')}
              >
                {isDone || isFinalDone ? (
                  <Check className="h-4 w-4" />
                ) : isActive ? (
                  <Loader2 className="h-4 w-4 motion-safe:animate-spin" />
                ) : (
                  i + 1
                )}
              </div>
              <span
                className={[
                  'text-[11px] text-center leading-tight',
                  isDone || isFinalDone
                    ? 'text-[var(--text-muted)] font-medium'
                    : isActive
                      ? 'text-[var(--link)] font-semibold'
                      : 'text-[var(--text-soft)]',
                ].join(' ')}
              >
                {step.label}
              </span>
            </div>
          );
        })}
      </div>

      {/* Status line */}
      <p className="text-[15px] text-[var(--text-muted)] text-center">{statusMessage}</p>

      {companyAndRole && (
        <p className="mt-2 text-[12px] text-[var(--text-soft)] text-center">{companyAndRole}</p>
      )}
    </div>
  );
}
