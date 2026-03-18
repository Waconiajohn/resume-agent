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
  titleOverride?: string;
  summaryOverride?: string;
  systemDoesOverride?: string;
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
  titleOverride,
  summaryOverride,
  systemDoesOverride,
  userDoesOverride,
  nextOverride,
}: ProcessStepGuideCardProps) {
  const contract = PROCESS_STEP_CONTRACTS[step];
  if (!contract) return null;

  const title = titleOverride ?? contract.title;
  const summary = summaryOverride ?? contract.summary;
  const systemDoes = systemDoesOverride ?? contract.systemDoes;
  const userDoes = userDoesOverride ?? contract.userDoes;

  return (
    <GlassCard className={`border-l-2 ${toneBorderClass(tone)} p-3.5 ${className}`.trim()}>
      <div className="text-sm font-medium text-white/88">
        Step {contract.number} · {title}
      </div>
      <p className="mt-1.5 text-xs leading-relaxed text-white/68">{summary}</p>
      <div className={`mt-2.5 ${compact ? 'space-y-3' : 'grid gap-3 sm:grid-cols-2'}`}>
        <div>
          <div className="text-[11px] uppercase tracking-[0.12em] text-white/45">What AI is doing</div>
          <div className="mt-1 text-xs leading-relaxed text-white/72">{systemDoes}</div>
        </div>
        <div>
          <div className="text-[11px] uppercase tracking-[0.12em] text-white/45">What you should do</div>
          <div className="mt-1 text-xs leading-relaxed text-white/72">{userDoes}</div>
        </div>
      </div>
      <p className="mt-2 text-xs leading-relaxed text-white/52">
        Next: {nextOverride ?? contract.next}
      </p>
    </GlassCard>
  );
}
