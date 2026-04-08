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
  const metaTrail = [sourceLabel, proofLabel, nextActionLabel].filter(Boolean) as string[];

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
          {label}
        </span>
      </div>

      {metaTrail.length > 0 && (
        <p
          className="mt-2 text-[10.5px] font-semibold uppercase tracking-[0.15em]"
          style={{ color: 'var(--text-soft)' }}
        >
          {metaTrail.join(' · ')}
        </p>
      )}

      <div className="mt-3 space-y-2.5">
        <div>
          <p className="text-[11px] font-semibold uppercase tracking-[0.14em]" style={{ color: 'var(--text-soft)' }}>
            {introLabel}
          </p>
          <p className="mt-1.5 text-[15px] leading-6" style={{ color: 'var(--text-strong)' }}>
            {requirement}
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
              Role signal
            </p>
            <p className="mt-1 text-[12.5px] leading-5" style={{ color: 'var(--text-soft)' }}>
              &ldquo;{trimmedSourceEvidence}&rdquo;
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
              Current proof
            </p>
            <p className="mt-1 text-[12.5px] leading-5" style={{ color: 'var(--text-soft)' }}>
              &ldquo;{trimmedEvidence}&rdquo;
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
