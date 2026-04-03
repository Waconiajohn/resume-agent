/**
 * TruthVerificationSection — Full truth verification breakdown
 *
 * Shows the truth score, flagged items callout, and all claims grouped by
 * confidence level (verified / plausible / unverified / fabricated).
 */

import { useState } from 'react';
import {
  ChevronDown,
  ChevronUp,
  Shield,
  AlertTriangle,
  CheckCircle2,
  Info,
  AlertOctagon,
  HelpCircle,
} from 'lucide-react';
import type { TruthVerificationDetail } from '@/types/resume-v2';

// ─── Confidence config ──────────────────────────────────────────────────────

type ConfidenceLevel = TruthVerificationDetail['claims'][number]['confidence'];

const CONFIDENCE_CONFIG: Record<
  ConfidenceLevel,
  { label: string; color: string; bgColor: string; borderColor: string; icon: React.ReactNode }
> = {
  verified: {
    label: 'Verified',
    color: 'var(--badge-green-text)',
    bgColor: 'var(--badge-green-bg)',
    borderColor: 'color-mix(in srgb, var(--badge-green-text) 22%, transparent)',
    icon: <CheckCircle2 className="h-3.5 w-3.5" style={{ color: 'var(--badge-green-text)' }} />,
  },
  plausible: {
    label: 'Plausible',
    color: 'var(--link)',
    bgColor: 'var(--badge-blue-bg)',
    borderColor: 'color-mix(in srgb, var(--link) 22%, transparent)',
    icon: <Info className="h-3.5 w-3.5" style={{ color: 'var(--link)' }} />,
  },
  unverified: {
    label: 'Unverified',
    color: 'var(--badge-amber-text)',
    bgColor: 'var(--badge-amber-bg)',
    borderColor: 'color-mix(in srgb, var(--badge-amber-text) 22%, transparent)',
    icon: <HelpCircle className="h-3.5 w-3.5" style={{ color: 'var(--badge-amber-text)' }} />,
  },
  fabricated: {
    label: 'Fabricated',
    color: 'var(--badge-red-text)',
    bgColor: 'var(--badge-red-bg)',
    borderColor: 'color-mix(in srgb, var(--badge-red-text) 22%, transparent)',
    icon: <AlertOctagon className="h-3.5 w-3.5" style={{ color: 'var(--badge-red-text)' }} />,
  },
};

// ─── Claim row ──────────────────────────────────────────────────────────────

function ClaimRow({ claim }: { claim: TruthVerificationDetail['claims'][number] }) {
  const [expanded, setExpanded] = useState(false);
  const conf = CONFIDENCE_CONFIG[claim.confidence];
  const hasDetail = claim.source_text || claim.note;

  return (
    <div className="rounded-lg border border-[var(--line-soft)] bg-[var(--surface-1)] px-3 py-2.5 space-y-1.5">
      <div className="flex items-start gap-2">
        <div className="min-w-0 flex-1">
          <p className="text-xs text-[var(--text-muted)] leading-5">{claim.claim}</p>
          <p className="text-[10px] text-[var(--text-soft)]">{claim.section}</p>
        </div>
        <span
          className="rounded-md px-1.5 py-0.5 text-[10px] font-medium whitespace-nowrap shrink-0"
          style={{ color: conf.color, backgroundColor: conf.bgColor, border: `1px solid ${conf.borderColor}` }}
        >
          {conf.label}
        </span>
      </div>

      {hasDetail && (
        <button
          type="button"
          onClick={() => setExpanded((p) => !p)}
          className="flex items-center gap-1 text-[10px] text-[var(--text-soft)] hover:text-[var(--text-muted)] transition-colors"
        >
          {expanded ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />}
          {expanded ? 'Hide detail' : 'Show detail'}
        </button>
      )}

      {expanded && (
        <div className="space-y-1 pl-1">
          {claim.source_text && (
            <p className="text-[11px] text-[var(--text-soft)] leading-4">
              <span className="font-medium text-[var(--text-muted)]">Source:</span> {claim.source_text}
            </p>
          )}
          {claim.note && (
            <p className="text-[11px] text-[var(--text-soft)] leading-4 italic">{claim.note}</p>
          )}
        </div>
      )}
    </div>
  );
}

// ─── Claim group ────────────────────────────────────────────────────────────

function ClaimGroup({
  level,
  claims,
}: {
  level: ConfidenceLevel;
  claims: TruthVerificationDetail['claims'];
}) {
  const conf = CONFIDENCE_CONFIG[level];
  if (claims.length === 0) return null;

  return (
    <div className="space-y-2">
      <div className="flex items-center gap-2">
        {conf.icon}
        <p
          className="text-[11px] font-semibold uppercase tracking-[0.14em]"
          style={{ color: conf.color }}
        >
          {conf.label} ({claims.length})
        </p>
      </div>
      <div className="space-y-1.5">
        {claims.map((claim, i) => (
          <ClaimRow key={i} claim={claim} />
        ))}
      </div>
    </div>
  );
}

// ─── Main section component ─────────────────────────────────────────────────

export interface TruthVerificationSectionProps {
  truth: TruthVerificationDetail;
}

export function TruthVerificationSection({ truth }: TruthVerificationSectionProps) {
  const { truth_score, claims, flagged_items } = truth;

  const grouped = {
    verified: claims.filter((c) => c.confidence === 'verified'),
    plausible: claims.filter((c) => c.confidence === 'plausible'),
    unverified: claims.filter((c) => c.confidence === 'unverified'),
    fabricated: claims.filter((c) => c.confidence === 'fabricated'),
  };

  const scoreColor =
    truth_score >= 80 ? 'var(--badge-green-text)' : truth_score >= 50 ? 'var(--badge-amber-text)' : 'var(--badge-red-text)';

  return (
    <div className="space-y-4">
      {/* Score header */}
      <div className="rounded-lg border border-[var(--line-soft)] bg-[var(--accent-muted)] px-4 py-3 space-y-2">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Shield className="h-4 w-4" style={{ color: scoreColor }} />
            <p className="text-xs font-medium text-[var(--text-muted)]">Truth Score</p>
          </div>
          <span className="text-2xl font-bold tabular-nums" style={{ color: scoreColor }}>
            {truth_score}
          </span>
        </div>
        <div
          className="h-1.5 w-full rounded-full overflow-hidden"
          style={{ backgroundColor: 'var(--ring-track)' }}
        >
          <div
            className="h-full rounded-full transition-all duration-700"
            style={{ width: `${Math.min(100, Math.max(0, truth_score))}%`, backgroundColor: scoreColor }}
          />
        </div>
        <p className="text-[11px] text-[var(--text-soft)]">
          {claims.length} claim{claims.length !== 1 ? 's' : ''} analyzed
        </p>
      </div>

      {/* Flagged items callout */}
      {flagged_items.length > 0 && (
        <div className="rounded-lg border border-[var(--badge-red-text)]/25 bg-[var(--badge-red-bg)] px-4 py-3 space-y-2">
          <div className="flex items-center gap-2">
            <AlertTriangle className="h-3.5 w-3.5 shrink-0" style={{ color: 'var(--badge-red-text)' }} />
            <p className="text-xs font-semibold" style={{ color: 'var(--badge-red-text)' }}>
              Flagged Items ({flagged_items.length})
            </p>
          </div>
          {flagged_items.map((item, i) => (
            <div key={i} className="rounded-lg border border-[var(--line-soft)] bg-[var(--surface-1)] px-3 py-2.5 space-y-1">
              <p className="text-xs text-[var(--text-muted)] leading-4">"{item.claim}"</p>
              <p className="text-[11px] text-[var(--text-soft)]">{item.issue}</p>
              <p className="text-[11px]" style={{ color: 'var(--badge-green-text)' }}>
                {item.recommendation}
              </p>
            </div>
          ))}
        </div>
      )}

      {/* Claims by confidence */}
      <ClaimGroup level="verified" claims={grouped.verified} />
      <ClaimGroup level="plausible" claims={grouped.plausible} />
      <ClaimGroup level="unverified" claims={grouped.unverified} />
      <ClaimGroup level="fabricated" claims={grouped.fabricated} />
    </div>
  );
}
