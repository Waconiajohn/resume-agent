/**
 * BulletContextHeader — plain-language requirement summary for the active line.
 *
 * The UI here stays intentionally simple:
 * - top requirements for this section
 * - the current requirement we are fixing now
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
      return 'This line is trying to prove';
    default:
      return 'This line needs to show';
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
      return 'The safest truthful version of the claim, so the line does not overstate your role.';
    case 'tighten':
      return 'A sharper connection between what you did and why this role cares about it.';
    case 'accept':
      return 'Nothing critical. We can keep it or make the wording cleaner.';
    case 'remove':
      return 'A truthful reason to keep this line. If we cannot support it, it should go.';
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
            color: colorVar,
            border: `1px solid ${borderVar}`,
          }}
        >
          {getStateLabel(reviewState)}
        </span>
      </div>

      <div className="mt-3">
        <p className="text-[11px] font-semibold uppercase tracking-[0.14em]" style={{ color: 'var(--text-soft)' }}>
          Top requirements for this section
        </p>
        <ol className="mt-2 space-y-1.5">
          {topRequirements.map((item, index) => {
            const isActive = item === currentRequirement;
            return (
              <li key={`${item}-${index}`} className="flex items-start gap-2">
                <span
                  className="mt-[2px] inline-flex h-5 w-5 shrink-0 items-center justify-center rounded-full text-[10px] font-semibold"
                  style={{
                    background: isActive ? 'rgba(255, 255, 255, 0.88)' : 'rgba(255, 255, 255, 0.6)',
                    color: isActive ? colorVar : 'var(--text-soft)',
                    border: `1px solid ${isActive ? borderVar : 'rgba(203, 213, 225, 0.48)'}`,
                  }}
                >
                  {index + 1}
                </span>
                <p
                  className="text-[13px] leading-5"
                  style={{ color: isActive ? 'var(--text-strong)' : 'var(--text-muted)', fontWeight: isActive ? 600 : 500 }}
                >
                  {item}
                </p>
              </li>
            );
          })}
        </ol>
      </div>

      <div className="mt-3 space-y-2.5">
        <div>
          <p className="text-[11px] font-semibold uppercase tracking-[0.14em]" style={{ color: 'var(--text-soft)' }}>
            {introLabel}
          </p>
          <p className="mt-1.5 text-[15px] leading-6" style={{ color: 'var(--text-strong)' }}>
            {currentRequirement}
          </p>
        </div>

        {trimmedSourceEvidence && (
          <div
            className="rounded-xl px-3 py-2"
            style={{
              background: 'rgba(255, 255, 255, 0.74)',
              border: '1px solid rgba(148, 163, 184, 0.14)',
            }}
          >
            <p className="text-[11px] font-semibold uppercase tracking-[0.14em]" style={{ color: 'var(--text-soft)' }}>
              Why this matters for the job
            </p>
            <p className="mt-1 text-[12.5px] leading-5" style={{ color: 'var(--text-soft)' }}>
              {sourceLabel} {trimmedSourceEvidence}
            </p>
          </div>
        )}

        {trimmedEvidence && (
          <div
            className="rounded-xl px-3 py-2"
            style={{
              background: 'rgba(255, 255, 255, 0.84)',
              border: '1px solid rgba(148, 163, 184, 0.14)',
            }}
          >
            <p className="text-[11px] font-semibold uppercase tracking-[0.14em]" style={{ color: 'var(--text-soft)' }}>
              What I already found
            </p>
            <p className="mt-1 text-[12.5px] leading-5" style={{ color: 'var(--text-soft)' }}>
              &ldquo;{trimmedEvidence}&rdquo;
            </p>
          </div>
        )}

        <div
          className="rounded-xl px-3 py-2"
          style={{
            background: 'rgba(255, 255, 255, 0.84)',
            border: '1px solid rgba(148, 163, 184, 0.14)',
          }}
        >
          <p className="text-[11px] font-semibold uppercase tracking-[0.14em]" style={{ color: 'var(--text-soft)' }}>
            What is still missing
          </p>
          <p className="mt-1 text-[12.5px] leading-5" style={{ color: 'var(--text-soft)' }}>
            {resolvedMissingSummary}
          </p>
        </div>
      </div>
    </div>
  );
}
