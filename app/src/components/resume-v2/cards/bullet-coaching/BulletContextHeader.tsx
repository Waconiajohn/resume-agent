/**
 * BulletContextHeader — Shows the JD requirement and evidence in 2 scannable lines.
 *
 * Renders a left-bordered header that tells the user exactly which role requirement
 * this bullet is trying to prove, and what evidence the pipeline found to support it.
 * Colors track the coaching state so the urgency level is immediately legible.
 */

import { AlertTriangle, Shield, XCircle } from 'lucide-react';
import { cn } from '@/lib/utils';
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
        borderVar: 'var(--bullet-strengthen-border)',
        bgVar: 'var(--bullet-strengthen-bg)',
        colorVar: 'var(--bullet-strengthen)',
        Icon: AlertTriangle,
      };
    case 'confirm_fit':
      return {
        borderVar: 'var(--bullet-confirm-border)',
        bgVar: 'var(--bullet-confirm-bg)',
        colorVar: 'var(--bullet-confirm)',
        Icon: Shield,
      };
    case 'code_red':
      return {
        borderVar: 'var(--bullet-code-red-border)',
        bgVar: 'var(--bullet-code-red-bg)',
        colorVar: 'var(--bullet-code-red)',
        Icon: XCircle,
      };
    default:
      return {
        borderVar: 'var(--line-soft)',
        bgVar: 'transparent',
        colorVar: 'var(--text-muted)',
        Icon: Shield,
      };
  }
}

function getIntroLabel(reviewState: ResumeReviewState): string {
  switch (reviewState) {
    case 'strengthen':
      return 'This addresses:';
    case 'confirm_fit':
      return 'This was written to show:';
    case 'code_red':
      return 'We need evidence for:';
    default:
      return 'This addresses:';
  }
}

function getSourceLabel(source?: RequirementSource): string {
  if (source === 'benchmark') return 'from our analysis';
  if (source === 'job_description') return 'from the JD';
  return 'from the JD';
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

  const { borderVar, bgVar, colorVar, Icon } = getStateConfig(reviewState);
  const introLabel = getIntroLabel(reviewState);
  const sourceLabel = getSourceLabel(requirementSource);
  const trimmedEvidence = evidenceFound?.trim();
  const trimmedSourceEvidence = sourceEvidence?.trim();
  const proofLabel = getProofLabel(proofLevel, framingGuardrail);
  const nextActionLabel = getNextActionLabel(nextBestAction);

  return (
    <div
      className="rounded-lg border-l-2 px-3 py-2.5"
      style={{
        borderLeftColor: borderVar,
        background: bgVar,
      }}
    >
      {/* Line 1: requirement */}
      <div className="flex items-start gap-2">
        <Icon
          className="mt-0.5 h-3.5 w-3.5 shrink-0"
          style={{ color: colorVar }}
          aria-hidden="true"
        />
        <p className="text-[12px] leading-snug">
          <span
            className="font-medium"
            style={{ color: 'var(--text-muted)' }}
          >
            {introLabel}&nbsp;
          </span>
          <span style={{ color: 'var(--text-strong)' }}>{requirement}</span>
          <span
            className={cn(
              'ml-2 inline-block rounded px-1.5 py-0.5 text-[10px] font-normal',
            )}
            style={{
              background: 'var(--badge-blue-bg)',
              color: 'var(--badge-blue-text)',
            }}
          >
            {sourceLabel}
          </span>
        </p>
      </div>

      {/* Line 2: evidence (only when present) */}
      {trimmedEvidence && (
        <p
          className="mt-1 pl-5.5 text-[11px] leading-snug"
          style={{ color: 'var(--text-soft)', paddingLeft: '22px' }}
        >
          <span className="font-medium" style={{ color: 'var(--text-muted)' }}>
            Your evidence:&nbsp;
          </span>
          <span className="italic">&ldquo;{trimmedEvidence}&rdquo;</span>
        </p>
      )}

      {trimmedSourceEvidence && (
        <p
          className="mt-1 pl-5.5 text-[11px] leading-snug"
          style={{ color: 'var(--text-soft)', paddingLeft: '22px' }}
        >
          <span className="font-medium" style={{ color: 'var(--text-muted)' }}>
            Role needs:&nbsp;
          </span>
          <span className="italic">&ldquo;{trimmedSourceEvidence}&rdquo;</span>
        </p>
      )}

      {(proofLabel || nextActionLabel) && (
        <div className="mt-2 flex flex-wrap gap-2 pl-5.5" style={{ paddingLeft: '22px' }}>
          {proofLabel && (
            <span
              className="inline-flex rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-[0.14em]"
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
              className="inline-flex rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-[0.14em]"
              style={{
                background: 'var(--badge-blue-bg)',
                color: 'var(--badge-blue-text)',
              }}
            >
              {nextActionLabel}
            </span>
          )}
        </div>
      )}
    </div>
  );
}
