/**
 * RequirementsCoverageSection — Full requirements coverage breakdown
 *
 * Groups all requirements by classification (strong / partial / missing),
 * sorted by importance within each group.  Shows evidence snippets,
 * importance/source badges, and highlights critical gaps.
 */

import { useState } from 'react';
import {
  ChevronDown,
  ChevronUp,
  CheckCircle2,
  AlertTriangle,
  XCircle,
  FileText,
  Target,
} from 'lucide-react';
import type { GapAnalysis, RequirementGap } from '@/types/resume-v2';

// ─── Helpers ────────────────────────────────────────────────────────────────

const IMPORTANCE_ORDER: Record<string, number> = { must_have: 0, important: 1, nice_to_have: 2 };

function sortByImportance(a: RequirementGap, b: RequirementGap): number {
  return (IMPORTANCE_ORDER[a.importance] ?? 9) - (IMPORTANCE_ORDER[b.importance] ?? 9);
}

function importanceBadge(importance: RequirementGap['importance']) {
  const styles: Record<string, React.CSSProperties> = {
    must_have: {
      color: 'var(--badge-red-text)',
      backgroundColor: 'rgba(240,184,184,0.10)',
      border: '1px solid rgba(240,184,184,0.22)',
    },
    important: {
      color: 'var(--badge-amber-text)',
      backgroundColor: 'rgba(240,217,159,0.10)',
      border: '1px solid rgba(240,217,159,0.22)',
    },
    nice_to_have: {
      color: 'rgba(255,255,255,0.45)',
      backgroundColor: 'rgba(255,255,255,0.06)',
      border: '1px solid rgba(255,255,255,0.10)',
    },
  };
  const labels: Record<string, string> = {
    must_have: 'Must Have',
    important: 'Important',
    nice_to_have: 'Nice to Have',
  };
  return (
    <span
      className="rounded-md px-1.5 py-0.5 text-[10px] font-medium whitespace-nowrap"
      style={styles[importance]}
    >
      {labels[importance]}
    </span>
  );
}

function sourceBadge(source: RequirementGap['source']) {
  if (!source) return null;
  const isJD = source === 'job_description';
  return (
    <span
      className="rounded-md px-1.5 py-0.5 text-[10px] font-medium whitespace-nowrap"
      style={{
        color: isJD ? 'var(--link)' : '#c4b5fd',
        backgroundColor: isJD ? 'rgba(175,196,255,0.08)' : 'rgba(196,181,253,0.08)',
        border: isJD ? '1px solid rgba(175,196,255,0.18)' : '1px solid rgba(196,181,253,0.18)',
      }}
    >
      {isJD ? 'JD' : 'Benchmark'}
    </span>
  );
}

// ─── Expandable requirement row ─────────────────────────────────────────────

function RequirementRow({ req }: { req: RequirementGap }) {
  const [expanded, setExpanded] = useState(false);
  const hasEvidence = req.evidence.length > 0 || req.source_evidence;

  return (
    <div className="rounded-lg border border-[var(--line-soft)] bg-[var(--surface-1)] px-3 py-2.5 space-y-1.5">
      {/* Top row: requirement text + badges */}
      <div className="flex items-start gap-2">
        <div className="min-w-0 flex-1">
          <p className="text-xs text-[var(--text-muted)] leading-5">{req.requirement}</p>
        </div>
        <div className="flex items-center gap-1.5 shrink-0">
          {importanceBadge(req.importance)}
          {sourceBadge(req.source)}
        </div>
      </div>

      {/* Evidence toggle */}
      {hasEvidence && (
        <button
          type="button"
          onClick={() => setExpanded((p) => !p)}
          className="flex items-center gap-1 text-[10px] text-[var(--text-soft)] hover:text-[var(--text-muted)] transition-colors"
        >
          {expanded ? (
            <ChevronUp className="h-3 w-3" />
          ) : (
            <ChevronDown className="h-3 w-3" />
          )}
          {expanded ? 'Hide evidence' : 'Show evidence'}
        </button>
      )}

      {expanded && (
        <div className="space-y-1 pl-1">
          {req.evidence.map((ev, i) => (
            <div key={i} className="flex items-start gap-1.5">
              <FileText className="h-2.5 w-2.5 shrink-0 mt-1 text-[var(--text-soft)]" />
              <p className="text-[11px] text-[var(--text-soft)] leading-4">{ev}</p>
            </div>
          ))}
          {req.source_evidence && (
            <div className="flex items-start gap-1.5">
              <Target className="h-2.5 w-2.5 shrink-0 mt-1 text-[var(--text-soft)]" />
              <p className="text-[11px] text-[var(--text-soft)] leading-4 italic">
                Source: {req.source_evidence}
              </p>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ─── Group section ──────────────────────────────────────────────────────────

function RequirementGroup({
  label,
  icon,
  borderColor,
  bgColor,
  requirements,
}: {
  label: string;
  icon: React.ReactNode;
  borderColor: string;
  bgColor: string;
  requirements: RequirementGap[];
}) {
  if (requirements.length === 0) return null;
  return (
    <div className="space-y-2">
      <div className="flex items-center gap-2">
        {icon}
        <p className="text-[11px] font-semibold uppercase tracking-[0.14em]" style={{ color: borderColor }}>
          {label} ({requirements.length})
        </p>
      </div>
      <div className="space-y-1.5" style={{ borderLeft: `2px solid ${bgColor}`, paddingLeft: '0.75rem' }}>
        {requirements.map((req, i) => (
          <RequirementRow key={i} req={req} />
        ))}
      </div>
    </div>
  );
}

// ─── Main section component ─────────────────────────────────────────────────

export interface RequirementsCoverageSectionProps {
  gapAnalysis: GapAnalysis;
}

export function RequirementsCoverageSection({ gapAnalysis }: RequirementsCoverageSectionProps) {
  const { requirements, coverage_score, score_breakdown, critical_gaps } = gapAnalysis;

  const strong = requirements.filter((r) => r.classification === 'strong').sort(sortByImportance);
  const partial = requirements.filter((r) => r.classification === 'partial').sort(sortByImportance);
  const missing = requirements.filter((r) => r.classification === 'missing').sort(sortByImportance);

  const jd = score_breakdown?.job_description;
  const bench = score_breakdown?.benchmark;

  return (
    <div className="space-y-4">
      {/* Coverage score header */}
      <div className="rounded-lg border border-[var(--line-soft)] bg-[var(--accent-muted)] px-4 py-3 space-y-2">
        <div className="flex items-center justify-between">
          <p className="text-xs font-medium text-[var(--text-muted)]">Overall Coverage Score</p>
          <span
            className="text-2xl font-bold tabular-nums"
            style={{
              color:
                coverage_score >= 80
                  ? 'var(--badge-green-text)'
                  : coverage_score >= 50
                    ? 'var(--badge-amber-text)'
                    : 'var(--badge-red-text)',
            }}
          >
            {coverage_score}
          </span>
        </div>

        {/* Score breakdown */}
        {(jd || bench) && (
          <div className="grid gap-2 grid-cols-2">
            {jd && (
              <div className="rounded-lg border border-[var(--line-soft)] bg-[var(--surface-1)] px-3 py-2 space-y-1">
                <p className="text-[10px] font-medium text-[var(--text-soft)]">JD Requirements</p>
                <p className="text-[9px] text-[var(--text-soft)] -mt-0.5">What the employer asked for</p>
                <p className="text-xs font-bold tabular-nums" style={{ color: 'var(--link)' }}>
                  {jd.coverage_score}
                </p>
                <p className="text-[10px] text-[var(--text-soft)]">
                  {jd.strong} strong / {jd.partial} partial / {jd.missing} missing
                </p>
              </div>
            )}
            {bench && (
              <div className="rounded-lg border border-[var(--line-soft)] border-dashed bg-[var(--surface-1)] px-3 py-2 space-y-1">
                <p className="text-[10px] font-medium text-[var(--text-soft)]">Ideal Candidate</p>
                <p className="text-[9px] text-[var(--text-soft)] -mt-0.5">Aspirational, not required</p>
                <p className="text-xs font-bold tabular-nums" style={{ color: '#c4b5fd' }}>
                  {bench.coverage_score}
                </p>
                <p className="text-[10px] text-[var(--text-soft)]">
                  {bench.strong} strong / {bench.partial} partial / {bench.missing} missing
                </p>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Critical gaps callout */}
      {critical_gaps.length > 0 && (
        <div className="rounded-lg border border-[var(--badge-red-text)]/25 bg-[var(--badge-red-text)]/[0.05] px-4 py-3 space-y-1.5">
          <div className="flex items-center gap-2">
            <AlertTriangle className="h-3.5 w-3.5 shrink-0" style={{ color: 'var(--badge-red-text)' }} />
            <p className="text-xs font-semibold" style={{ color: 'var(--badge-red-text)' }}>
              Critical Gaps ({critical_gaps.length})
            </p>
          </div>
          <ul className="space-y-1 pl-5">
            {critical_gaps.map((gap, i) => (
              <li key={i} className="flex items-start gap-1.5 text-xs text-[var(--text-soft)]">
                <span className="shrink-0 mt-1 h-1 w-1 rounded-full bg-[var(--badge-red-text)]" />
                {gap}
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* Grouped requirements */}
      <RequirementGroup
        label="Strong Matches"
        icon={<CheckCircle2 className="h-3.5 w-3.5" style={{ color: 'var(--badge-green-text)' }} />}
        borderColor="var(--badge-green-text)"
        bgColor="rgba(181,222,194,0.25)"
        requirements={strong}
      />

      <RequirementGroup
        label="Partial Matches"
        icon={<AlertTriangle className="h-3.5 w-3.5" style={{ color: 'var(--badge-amber-text)' }} />}
        borderColor="var(--badge-amber-text)"
        bgColor="rgba(240,217,159,0.25)"
        requirements={partial}
      />

      <RequirementGroup
        label="Gaps"
        icon={<XCircle className="h-3.5 w-3.5" style={{ color: 'var(--badge-red-text)' }} />}
        borderColor="var(--badge-red-text)"
        bgColor="rgba(240,184,184,0.25)"
        requirements={missing}
      />
    </div>
  );
}
