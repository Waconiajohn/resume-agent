/**
 * HiringManagerScanSection — Full hiring manager scan breakdown
 *
 * Shows the pass/fail verdict, overall score, 4 sub-scores in a 2x2 grid,
 * red flags callout, and quick wins list.
 */

import { CheckCircle2, XCircle, Eye, Zap, AlertTriangle } from 'lucide-react';
import type { HiringManagerScan } from '@/types/resume-v2';

// ─── Sub-score card ─────────────────────────────────────────────────────────

function SubScoreCard({
  label,
  score,
  note,
}: {
  label: string;
  score: number;
  note: string;
}) {
  const color =
    score >= 80 ? 'var(--badge-green-text)' : score >= 50 ? 'var(--badge-amber-text)' : 'var(--badge-red-text)';

  return (
    <div className="rounded-lg border border-[var(--line-soft)] bg-[var(--surface-1)] px-3 py-2.5 space-y-1.5">
      <div className="flex items-center justify-between">
        <p className="text-[10px] font-medium text-[var(--text-soft)]">{label}</p>
        <span className="text-sm font-bold tabular-nums" style={{ color }}>
          {score}
        </span>
      </div>
      <div
        className="h-1 w-full rounded-full overflow-hidden"
        style={{ backgroundColor: 'rgba(255,255,255,0.08)' }}
      >
        <div
          className="h-full rounded-full transition-all duration-700"
          style={{ width: `${Math.min(100, Math.max(0, score))}%`, backgroundColor: color }}
        />
      </div>
      <p className="text-[10px] text-[var(--text-soft)] leading-4">{note}</p>
    </div>
  );
}

// ─── Main section component ─────────────────────────────────────────────────

export interface HiringManagerScanSectionProps {
  scan: HiringManagerScan;
}

export function HiringManagerScanSection({ scan }: HiringManagerScanSectionProps) {
  const {
    pass,
    scan_score,
    header_impact,
    summary_clarity,
    above_fold_strength,
    keyword_visibility,
    red_flags,
    quick_wins,
  } = scan;

  const overallColor =
    scan_score >= 80 ? 'var(--badge-green-text)' : scan_score >= 50 ? 'var(--badge-amber-text)' : 'var(--badge-red-text)';

  return (
    <div className="space-y-4">
      {/* Verdict + overall score */}
      <div
        className={`rounded-lg border px-4 py-3 space-y-2 ${
          pass
            ? 'border-[var(--badge-green-text)]/20 bg-[var(--badge-green-text)]/[0.04]'
            : 'border-[var(--badge-amber-text)]/20 bg-[var(--badge-amber-text)]/[0.04]'
        }`}
      >
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Eye className="h-4 w-4" style={{ color: overallColor }} />
            <p className="text-xs font-medium text-[var(--text-muted)]">Recruiter Scan</p>
          </div>
          <div className="flex items-center gap-2">
            <span className="text-2xl font-bold tabular-nums" style={{ color: overallColor }}>
              {scan_score}
            </span>
            <span
              className={`rounded-md px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide ${
                pass
                  ? 'text-[var(--badge-green-text)] bg-[var(--badge-green-text)]/10 border border-[var(--badge-green-text)]/25'
                  : 'text-[var(--badge-amber-text)] bg-[var(--badge-amber-text)]/10 border border-[var(--badge-amber-text)]/25'
              }`}
            >
              {pass ? 'PASS' : 'NEEDS WORK'}
            </span>
          </div>
        </div>
        <div
          className="h-1.5 w-full rounded-full overflow-hidden"
          style={{ backgroundColor: 'rgba(255,255,255,0.08)' }}
        >
          <div
            className="h-full rounded-full transition-all duration-700"
            style={{ width: `${Math.min(100, Math.max(0, scan_score))}%`, backgroundColor: overallColor }}
          />
        </div>
      </div>

      {/* 2x2 sub-scores */}
      <div className="grid gap-2 grid-cols-2">
        <SubScoreCard
          label="Header Impact"
          score={header_impact.score}
          note={header_impact.note}
        />
        <SubScoreCard
          label="Summary Clarity"
          score={summary_clarity.score}
          note={summary_clarity.note}
        />
        <SubScoreCard
          label="Above-the-Fold Strength"
          score={above_fold_strength.score}
          note={above_fold_strength.note}
        />
        <SubScoreCard
          label="Keyword Visibility"
          score={keyword_visibility.score}
          note={keyword_visibility.note}
        />
      </div>

      {/* Red flags */}
      {red_flags.length > 0 && (
        <div className="rounded-lg border border-[var(--badge-red-text)]/25 bg-[var(--badge-red-text)]/[0.05] px-4 py-3 space-y-2">
          <div className="flex items-center gap-2">
            <AlertTriangle className="h-3.5 w-3.5 shrink-0" style={{ color: 'var(--badge-red-text)' }} />
            <p className="text-xs font-semibold" style={{ color: 'var(--badge-red-text)' }}>
              Red Flags ({red_flags.length})
            </p>
          </div>
          <ul className="space-y-1">
            {red_flags.map((flag, i) => (
              <li key={i} className="flex items-start gap-1.5 text-xs text-[var(--text-soft)]">
                <XCircle className="h-3 w-3 shrink-0 mt-0.5" style={{ color: 'var(--badge-red-text)' }} />
                {flag}
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* Quick wins */}
      {quick_wins.length > 0 && (
        <div className="rounded-lg border border-[var(--badge-green-text)]/20 bg-[var(--badge-green-text)]/[0.04] px-4 py-3 space-y-2">
          <div className="flex items-center gap-2">
            <Zap className="h-3.5 w-3.5 shrink-0" style={{ color: 'var(--badge-green-text)' }} />
            <p className="text-xs font-semibold" style={{ color: 'var(--badge-green-text)' }}>
              Quick Wins ({quick_wins.length})
            </p>
          </div>
          <ul className="space-y-1">
            {quick_wins.map((win, i) => (
              <li key={i} className="flex items-start gap-1.5 text-xs text-[var(--text-soft)]">
                <CheckCircle2 className="h-3 w-3 shrink-0 mt-0.5" style={{ color: 'var(--badge-green-text)' }} />
                {win}
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
