/**
 * BulletContextHeader — Shows the JD requirement and evidence in 2 scannable lines.
 *
 * Renders a left-bordered header that tells the user exactly which role requirement
 * this bullet is trying to prove, and what evidence the pipeline found to support it.
 * Colors track the coaching state so the urgency level is immediately legible.
 */

import { AlertTriangle, Shield, XCircle } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { ResumeReviewState, RequirementSource } from '@/types/resume-v2';

export interface BulletContextHeaderProps {
  requirement?: string;
  requirementSource?: RequirementSource;
  evidenceFound?: string;
  reviewState: ResumeReviewState;
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

function getSourceLabel(source?: RequirementSource): string {
  if (source === 'benchmark') return 'Benchmark';
  if (source === 'job_description') return 'Job Description';
  return 'Role Requirement';
}

export function BulletContextHeader({
  requirement,
  requirementSource,
  evidenceFound,
  reviewState,
}: BulletContextHeaderProps) {
  if (!requirement) return null;

  const { borderVar, bgVar, colorVar, Icon } = getStateConfig(reviewState);
  const sourceLabel = getSourceLabel(requirementSource);
  const trimmedEvidence = evidenceFound?.trim();

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
            className="font-semibold"
            style={{ color: 'var(--text-strong)' }}
          >
            This bullet proves:&nbsp;
          </span>
          <span style={{ color: 'var(--text-muted)' }}>{requirement}</span>
          <span
            className={cn(
              'ml-2 inline-block rounded px-1.5 py-0.5 text-[10px] font-medium uppercase tracking-wide',
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
    </div>
  );
}
