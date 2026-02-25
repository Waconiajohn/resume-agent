import { GlassCard } from '@/components/GlassCard';
import {
  PROCESS_STEP_CONTRACTS,
  type ProcessStepKey,
} from '@/constants/process-contract';

type GuideTone = 'info' | 'action' | 'review' | 'export';

interface ProcessStepGuideCardProps {
  step: ProcessStepKey;
  tone?: GuideTone;
  compact?: boolean;
  className?: string;
  userDoesOverride?: string;
  nextOverride?: string;
}

function toneBadgeClass(tone: GuideTone): string {
  switch (tone) {
    case 'action':
      return 'border-sky-300/20 bg-sky-400/[0.08] text-sky-100/90';
    case 'review':
      return 'border-amber-300/20 bg-amber-400/[0.08] text-amber-100/90';
    case 'export':
      return 'border-emerald-300/20 bg-emerald-400/[0.08] text-emerald-100/90';
    case 'info':
    default:
      return 'border-white/[0.1] bg-white/[0.03] text-white/70';
  }
}

function toneLabel(tone: GuideTone): string {
  switch (tone) {
    case 'action':
      return 'Action required';
    case 'review':
      return 'Review step';
    case 'export':
      return 'Final step';
    case 'info':
    default:
      return 'Info';
  }
}

export function ProcessStepGuideCard({
  step,
  tone = 'info',
  compact = false,
  className = '',
  userDoesOverride,
  nextOverride,
}: ProcessStepGuideCardProps) {
  const contract = PROCESS_STEP_CONTRACTS[step];
  if (!contract) return null;

  return (
    <GlassCard className={`p-3.5 ${className}`.trim()}>
      <div className="flex flex-wrap items-center gap-2">
        <span className="rounded-full border border-white/[0.1] bg-white/[0.03] px-2 py-0.5 text-[10px] font-semibold uppercase tracking-[0.12em] text-white/75">
          Step {contract.number} of 7
        </span>
        <span className={`rounded-full border px-2 py-0.5 text-[10px] font-semibold uppercase tracking-[0.12em] ${toneBadgeClass(tone)}`}>
          {toneLabel(tone)}
        </span>
        <span className="text-xs font-medium text-white/85">{contract.title}</span>
      </div>
      <p className="mt-2 text-xs leading-relaxed text-white/68">{contract.summary}</p>
      {!compact && (
        <div className="mt-2.5 grid gap-2 sm:grid-cols-2">
          <div className="rounded-lg border border-white/[0.08] bg-white/[0.02] px-2.5 py-2">
            <div className="text-[10px] uppercase tracking-[0.12em] text-white/45">System does</div>
            <div className="mt-1 text-[11px] leading-relaxed text-white/72">{contract.systemDoes}</div>
          </div>
          <div className="rounded-lg border border-white/[0.08] bg-white/[0.02] px-2.5 py-2">
            <div className="text-[10px] uppercase tracking-[0.12em] text-white/45">You do</div>
            <div className="mt-1 text-[11px] leading-relaxed text-white/72">{userDoesOverride ?? contract.userDoes}</div>
          </div>
        </div>
      )}
      <p className="mt-2 text-[11px] leading-relaxed text-white/52">
        Next: {nextOverride ?? contract.next}
      </p>
    </GlassCard>
  );
}

