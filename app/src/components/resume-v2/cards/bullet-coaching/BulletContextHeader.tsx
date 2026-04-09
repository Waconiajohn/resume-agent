/**
 * BulletContextHeader — plain-language requirement summary for the active line.
 *
 * The UI here stays intentionally simple:
 * - the current requirement we are fixing now
 * - the other section priorities in one compact line
 * - what the app already found
 * - what is still missing before the line is strong enough
 */

import type { FramingGuardrail, NextBestAction, ProofLevel, ResumeReviewState, RequirementSource } from '@/types/resume-v2';

export interface BulletContextHeaderProps {
  requirement?: string;
  requirements?: string[];
  requirementSource?: RequirementSource;
  evidenceFound?: string;
  sourceEvidence?: string;
  missingSummary?: string;
  reviewState: ResumeReviewState;
  proofLevel?: ProofLevel;
  framingGuardrail?: FramingGuardrail;
  nextBestAction?: NextBestAction;
}

function getStateConfig(reviewState: ResumeReviewState) {
  switch (reviewState) {
    case 'strengthen':
      return {
        borderVar: 'rgba(217, 119, 6, 0.18)',
        bgVar: 'linear-gradient(180deg, rgba(255, 251, 235, 0.92), rgba(255, 255, 255, 0.98))',
        colorVar: 'var(--bullet-strengthen)',
        label: 'Make this stronger',
      };
    case 'confirm_fit':
      return {
        borderVar: 'rgba(37, 99, 235, 0.16)',
        bgVar: 'linear-gradient(180deg, rgba(239, 246, 255, 0.92), rgba(255, 255, 255, 0.98))',
        colorVar: 'var(--bullet-confirm)',
        label: 'Check this claim',
      };
    case 'code_red':
      return {
        borderVar: 'rgba(185, 28, 28, 0.16)',
        bgVar: 'linear-gradient(180deg, rgba(254, 242, 242, 0.92), rgba(255, 255, 255, 0.98))',
        colorVar: 'var(--bullet-code-red)',
        label: 'Needs proof',
      };
    default:
      return {
        borderVar: 'var(--line-soft)',
        bgVar: 'linear-gradient(180deg, rgba(248, 250, 252, 0.98), rgba(255, 255, 255, 0.98))',
        colorVar: 'var(--text-muted)',
        label: 'Supported',
      };
  }
}

function getIntroLabel(reviewState: ResumeReviewState): string {
  switch (reviewState) {
    case 'code_red':
      return 'Right now, make this section prove';
    default:
      return 'Right now, make this section show';
  }
}

function getSourceLabel(source?: RequirementSource): string {
  if (source === 'benchmark') return 'A strong candidate for this role would show this clearly.';
  return 'The job is asking for this directly.';
}

function dedupeRequirements(requirement: string | undefined, requirements: string[] | undefined): string[] {
  const values = [requirement, ...(requirements ?? [])]
    .filter((value): value is string => typeof value === 'string' && value.trim().length > 0);
  const seen = new Set<string>();
  return values.filter((value) => {
    const normalized = value.trim().toLowerCase();
    if (seen.has(normalized)) return false;
    seen.add(normalized);
    return true;
  }).slice(0, 3);
}

function getStateLabel(reviewState: ResumeReviewState): string {
  switch (reviewState) {
    case 'code_red':
      return 'Needs one more real detail';
    case 'confirm_fit':
      return 'Needs a safer version';
    case 'strengthen':
      return 'Can be stronger';
    default:
      return 'Looks solid';
  }
}

function getFallbackMissingSummary(args: {
  reviewState: ResumeReviewState;
  proofLevel?: ProofLevel;
  framingGuardrail?: FramingGuardrail;
  nextBestAction?: NextBestAction;
}): string {
  const { reviewState, proofLevel, framingGuardrail, nextBestAction } = args;

  switch (nextBestAction) {
    case 'answer':
      return 'One concrete example, number, or scope detail before we can safely strengthen the line.';
    case 'quantify':
      return 'A number, budget, team size, timeline, or business result so the impact feels real.';
    case 'confirm':
      return 'The safest version of the claim, so the line does not overstate your role.';
    case 'tighten':
      return 'A sharper connection between what you did and why this role cares about it.';
    case 'accept':
      return 'Nothing critical. We can keep it or make the wording cleaner.';
    case 'remove':
      return 'A real reason to keep this line. If we cannot support it, it should go.';
    default:
      break;
  }

  if (reviewState === 'code_red') {
    return 'A concrete proof point before this line is safe to keep.';
  }
  if (reviewState === 'confirm_fit') {
    return 'A safer way to phrase the claim unless the stronger version is definitely true.';
  }
  if (reviewState === 'strengthen') {
    return 'A clearer business outcome, scope marker, or tighter wording.';
  }
  if (proofLevel === 'none') {
    return 'Direct proof before we make this claim stronger.';
  }
  if (proofLevel === 'adjacent' && framingGuardrail === 'reframe') {
    return 'A cleaner way to connect your related experience to what the job needs.';
  }

  return 'A little more clarity so the line reads stronger and more specific.';
}

export function BulletContextHeader({
  requirement,
  requirements,
  requirementSource,
  evidenceFound,
  sourceEvidence,
  missingSummary,
  reviewState,
  proofLevel,
  framingGuardrail,
  nextBestAction,
}: BulletContextHeaderProps) {
  const topRequirements = dedupeRequirements(requirement, requirements);
  if (topRequirements.length === 0) return null;

  const { borderVar, bgVar, colorVar } = getStateConfig(reviewState);
  const introLabel = getIntroLabel(reviewState);
  const currentRequirement = requirement ?? topRequirements[0];
  const sourceLabel = getSourceLabel(requirementSource);
  const trimmedEvidence = evidenceFound?.trim();
  const trimmedSourceEvidence = sourceEvidence?.trim();
  const resolvedMissingSummary = missingSummary?.trim() || getFallbackMissingSummary({
    reviewState,
    proofLevel,
    framingGuardrail,
    nextBestAction,
  });
  const secondaryRequirements = topRequirements.filter((item) => item !== currentRequirement);

  return (
    <div
      className="rounded-2xl border px-4 py-3.5"
      style={{
        borderColor: borderVar,
        background: bgVar,
      }}
    >
      <div className="flex flex-wrap items-center gap-2">
        <span
          className="inline-flex rounded-full px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.14em]"
          style={{
            background: 'rgba(255, 255, 255, 0.88)',
            color: 'var(--text-strong)',
            border: '1px solid rgba(148, 163, 184, 0.16)',
          }}
        >
          Current focus
        </span>
        <span
          className="inline-flex rounded-full px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.14em]"
          style={{
            background: 'rgba(255, 255, 255, 0.88)',
            color: colorVar,
            border: `1px solid ${borderVar}`,
          }}
        >
          {getStateLabel(reviewState)}
        </span>
      </div>

      <div className="mt-3 space-y-3">
        <div>
          <p className="text-[11px] font-semibold uppercase tracking-[0.14em]" style={{ color: 'var(--text-muted)' }}>
            {introLabel}
          </p>
          <p className="mt-1.5 text-[15px] leading-6" style={{ color: 'var(--text-strong)' }}>
            {currentRequirement}
          </p>
        </div>

        {trimmedSourceEvidence && (
          <p className="text-[12.5px] leading-5" style={{ color: 'var(--text-muted)' }}>
            <span className="font-semibold" style={{ color: 'var(--text-strong)' }}>
              Why this matters:
            </span>{' '}
            {sourceLabel} {trimmedSourceEvidence}
          </p>
        )}

        {trimmedEvidence && (
          <p className="text-[12.5px] leading-5" style={{ color: 'var(--text-muted)' }}>
            <span className="font-semibold" style={{ color: 'var(--text-strong)' }}>
              What we already have:
            </span>{' '}
            {trimmedEvidence}
          </p>
        )}

        <p className="text-[12.5px] leading-5" style={{ color: 'var(--text-muted)' }}>
          <span className="font-semibold" style={{ color: 'var(--text-strong)' }}>
            Best next improvement:
          </span>{' '}
          {resolvedMissingSummary}
        </p>

        {secondaryRequirements.length > 0 && (
          <p className="text-[12px] leading-5" style={{ color: 'var(--text-muted)' }}>
            After this, this section should still help show: {secondaryRequirements.join(' • ')}
          </p>
        )}
      </div>
    </div>
  );
}
