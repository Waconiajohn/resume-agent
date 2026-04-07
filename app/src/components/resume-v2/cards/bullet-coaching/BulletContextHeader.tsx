/**
 * BulletContextHeader — compact proof header for the active line.
 *
 * This is the single context block for the coach. It tells the user:
 * - what this line needs to prove
 * - whether that target came from the JD or benchmark
 * - what proof we already have
 * - what kind of move is safest next
 */

import type { FramingGuardrail, NextBestAction, ProofLevel, ResumeReviewState, RequirementSource } from '@/types/resume-v2';

export interface BulletContextHeaderProps {
  requirement?: string;
  requirementSource?: RequirementSource;
  evidenceFound?: string;
  sourceEvidence?: string;
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
        label: 'Can be sharper',
      };
    case 'confirm_fit':
      return {
        borderVar: 'rgba(37, 99, 235, 0.16)',
        bgVar: 'linear-gradient(180deg, rgba(239, 246, 255, 0.92), rgba(255, 255, 255, 0.98))',
        colorVar: 'var(--bullet-confirm)',
        label: 'Verify the fit',
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
      return 'This line is trying to show';
    default:
      return 'This line needs to show';
  }
}

function getSourceLabel(source?: RequirementSource): string {
  if (source === 'benchmark') return 'Benchmark signal';
  if (source === 'job_description') return 'JD signal';
  return 'JD signal';
}

function getProofLabel(proofLevel?: ProofLevel, framingGuardrail?: FramingGuardrail): string | null {
  switch (proofLevel) {
    case 'direct':
      return 'Direct proof';
    case 'adjacent':
      return framingGuardrail === 'reframe' ? 'Adjacent proof' : 'Related proof';
    case 'inferable':
      return 'Inferable proof';
    case 'none':
      return 'No proof yet';
    default:
      return null;
  }
}

function getNextActionLabel(nextBestAction?: NextBestAction): string | null {
  switch (nextBestAction) {
    case 'accept':
      return 'Ready to accept';
    case 'tighten':
      return 'Sharpen the wording';
    case 'quantify':
      return 'Add scope or a metric';
    case 'confirm':
      return 'Confirm honest fit';
    case 'answer':
      return 'Answer one question';
    case 'remove':
      return 'Remove if it does not fit';
    default:
      return null;
  }
}

export function BulletContextHeader({
  requirement,
  requirementSource,
  evidenceFound,
  sourceEvidence,
  reviewState,
  proofLevel,
  framingGuardrail,
  nextBestAction,
}: BulletContextHeaderProps) {
  if (!requirement) return null;

  const { borderVar, bgVar, colorVar, label } = getStateConfig(reviewState);
  const introLabel = getIntroLabel(reviewState);
  const sourceLabel = getSourceLabel(requirementSource);
  const trimmedEvidence = evidenceFound?.trim();
  const trimmedSourceEvidence = sourceEvidence?.trim();
  const proofLabel = getProofLabel(proofLevel, framingGuardrail);
  const nextActionLabel = getNextActionLabel(nextBestAction);

  return (
    <div
      className="rounded-xl border px-3.5 py-3"
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
          {label}
        </span>
        <span
          className="inline-flex rounded-full px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.14em]"
          style={{
            background: 'var(--surface-0)',
            color: 'var(--text-soft)',
            border: '1px solid var(--line-soft)',
          }}
        >
          {sourceLabel}
        </span>
        {proofLabel && (
          <span
            className="inline-flex rounded-full px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.14em]"
            style={{
              background: 'var(--surface-0)',
              color: 'var(--text-soft)',
              border: '1px solid var(--line-soft)',
            }}
          >
            {proofLabel}
          </span>
        )}
        {nextActionLabel && (
          <span
            className="inline-flex rounded-full px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.14em]"
            style={{
              background: 'var(--badge-blue-bg)',
              color: 'var(--badge-blue-text)',
            }}
          >
            {nextActionLabel}
          </span>
        )}
      </div>

      <div className="mt-3 space-y-2">
        <div>
          <p className="text-[11px] font-semibold uppercase tracking-[0.14em]" style={{ color: 'var(--text-soft)' }}>
            {introLabel}
          </p>
          <p className="mt-1 text-sm leading-6" style={{ color: 'var(--text-strong)' }}>
            {requirement}
          </p>
        </div>

        {trimmedSourceEvidence && (
          <p className="text-[12px] leading-5" style={{ color: 'var(--text-soft)' }}>
            <span className="font-semibold" style={{ color: 'var(--text-muted)' }}>
              Role signal:
            </span>{' '}
            <span>&ldquo;{trimmedSourceEvidence}&rdquo;</span>
          </p>
        )}

        {trimmedEvidence && (
          <p className="text-[12px] leading-5" style={{ color: 'var(--text-soft)' }}>
            <span className="font-semibold" style={{ color: 'var(--text-muted)' }}>
              Current proof:
            </span>{' '}
            <span>&ldquo;{trimmedEvidence}&rdquo;</span>
          </p>
        )}
      </div>
    </div>
  );
}
