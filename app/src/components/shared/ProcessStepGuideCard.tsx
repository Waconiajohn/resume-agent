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

function toneBorderClass(tone: GuideTone): string {
  switch (tone) {
    case 'action':
      return 'border-l-[#afc4ff]/60';
    case 'review':
      return 'border-l-[#f0d99f]/60';
    case 'export':
      return 'border-l-[#b5dec2]/60';
    case 'info':
    default:
      return 'border-l-white/20';
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
    <GlassCard className={`border-l-2 ${toneBorderClass(tone)} p-3.5 ${className}`.trim()}>
      <div className="text-sm font-medium text-white/88">
        Step {contract.number} · {contract.title}
      </div>
      <p className="mt-1.5 text-xs leading-relaxed text-white/68">{contract.summary}</p>
      {!compact && (
        <div className="mt-2.5 grid gap-3 sm:grid-cols-2">
          <div>
            <div className="text-[11px] uppercase tracking-[0.12em] text-white/45">What we're doing</div>
            <div className="mt-1 text-xs leading-relaxed text-white/72">{contract.systemDoes}</div>
          </div>
          <div>
            <div className="text-[11px] uppercase tracking-[0.12em] text-white/45">What you can do</div>
            <div className="mt-1 text-xs leading-relaxed text-white/72">{userDoesOverride ?? contract.userDoes}</div>
          </div>
        </div>
      )}
      <p className="mt-2 text-xs leading-relaxed text-white/52">
        Next: {nextOverride ?? contract.next}
      </p>
    </GlassCard>
  );
}
