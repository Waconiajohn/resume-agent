import type { ReactNode } from 'react';
import { ClipboardList } from 'lucide-react';

interface ProgressHeaderProps {
  title: string;
  currentStep: number;
  totalSteps: number;
  icon?: ReactNode;
}

export function ProgressHeader({ title, currentStep, totalSteps, icon }: ProgressHeaderProps) {
  const progressPct = totalSteps > 0 ? Math.round((currentStep / totalSteps) * 100) : 0;

  return (
    <div className="border-b border-[var(--line-soft)] px-4 py-3">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          {icon ?? <ClipboardList className="h-3.5 w-3.5 text-[var(--link)]" aria-hidden="true" />}
          <span className="text-sm font-medium text-[var(--text-strong)]">{title}</span>
        </div>
        {totalSteps > 0 && (
          <span
            className="text-xs font-medium text-[var(--text-soft)]"
            aria-label={`Question ${currentStep} of ${totalSteps}`}
          >
            {currentStep} / {totalSteps}
          </span>
        )}
      </div>

      {totalSteps > 0 && (
        <div
          className="mt-2 h-1.5 w-full overflow-hidden bg-[var(--accent-muted)]"
          role="progressbar"
          aria-valuenow={progressPct}
          aria-valuemin={0}
          aria-valuemax={100}
          aria-label={`${progressPct}% complete`}
        >
          <div
            className="h-full bg-[var(--link)] transition-all duration-500 ease-out"
            style={{ width: `${progressPct}%` }}
          />
        </div>
      )}
    </div>
  );
}
