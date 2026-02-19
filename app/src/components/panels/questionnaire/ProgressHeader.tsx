import type { ReactNode } from 'react';
import { ClipboardList } from 'lucide-react';

interface ProgressHeaderProps {
  title: string;
  currentStep: number;
  totalSteps: number;
  icon?: ReactNode;
}

export function ProgressHeader({ title, currentStep, totalSteps, icon }: ProgressHeaderProps) {
  const progressPct = totalSteps > 0 ? Math.round((Math.max(0, currentStep - 1) / totalSteps) * 100) : 0;

  return (
    <div className="border-b border-white/[0.12] px-4 py-3">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          {icon ?? <ClipboardList className="h-3.5 w-3.5 text-[#afc4ff]" aria-hidden="true" />}
          <span className="text-sm font-medium text-white/85">{title}</span>
        </div>
        {totalSteps > 0 && (
          <span
            className="text-xs font-medium text-white/50"
            aria-label={`Question ${currentStep} of ${totalSteps}`}
          >
            {currentStep} / {totalSteps}
          </span>
        )}
      </div>

      {totalSteps > 0 && (
        <div
          className="mt-2 h-0.5 w-full overflow-hidden rounded-full bg-white/[0.10]"
          role="progressbar"
          aria-valuenow={progressPct}
          aria-valuemin={0}
          aria-valuemax={100}
          aria-label={`${progressPct}% complete`}
        >
          <div
            className="h-full rounded-full bg-[#b5c9ff] transition-all duration-500 ease-out"
            style={{ width: `${progressPct}%` }}
          />
        </div>
      )}
    </div>
  );
}
