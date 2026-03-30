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
      return 'border-l-[var(--line-strong)]';
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
    <GlassCard className={`room-shell border-l-2 ${toneBorderClass(tone)} bg-[linear-gradient(180deg,rgba(255,255,255,0.075),rgba(255,255,255,0.025))] p-4 ${className}`.trim()}>
      <div className="flex items-center justify-between gap-3">
        <div className="text-sm font-medium text-[var(--text-strong)]">
          Step {contract.number} · {title}
        </div>
        <div className="rounded-md border border-[var(--line-soft)] bg-black/10 px-2.5 py-1 text-[12px] uppercase tracking-[0.18em] text-[var(--text-soft)]">
          Guided
        </div>
      </div>
      <p className="mt-2 text-sm leading-relaxed text-[var(--text-muted)]">{summary}</p>
      <div className={`mt-3 ${compact ? 'space-y-3' : 'grid gap-3 sm:grid-cols-2'}`}>
        <div className="support-callout px-3.5 py-3">
          <div className="text-[13px] uppercase tracking-[0.12em] text-[var(--text-soft)]">What happens here</div>
          <div className="mt-1.5 text-xs leading-relaxed text-[var(--text-muted)]">{systemDoes}</div>
        </div>
        <div className="support-callout px-3.5 py-3">
          <div className="text-[13px] uppercase tracking-[0.12em] text-[var(--text-soft)]">Your next move</div>
          <div className="mt-1.5 text-xs leading-relaxed text-[var(--text-muted)]">{userDoes}</div>
        </div>
      </div>
      <p className="support-callout mt-3 px-3 py-2 text-xs leading-relaxed text-[var(--text-soft)]">
        Next: {nextOverride ?? contract.next}
      </p>
    </GlassCard>
  );
}
