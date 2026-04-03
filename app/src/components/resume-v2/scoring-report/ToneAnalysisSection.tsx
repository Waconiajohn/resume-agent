/**
 * ToneAnalysisSection — Full executive tone analysis breakdown
 *
 * Shows the tone score, banned phrases callout, and all tone findings
 * with issue type, offending text, section, and suggested improvement.
 */

import { AlertTriangle, Mic, XCircle } from 'lucide-react';
import type { ExecutiveToneDetail } from '@/types/resume-v2';

import { humanizeIssueType, humanizeSectionName } from '../utils/humanize';

// ─── Main section component ─────────────────────────────────────────────────

export interface ToneAnalysisSectionProps {
  tone: ExecutiveToneDetail;
}

export function ToneAnalysisSection({ tone }: ToneAnalysisSectionProps) {
  const { tone_score, findings, banned_phrases_found } = tone;

  const scoreColor =
    tone_score >= 80 ? 'var(--badge-green-text)' : tone_score >= 50 ? 'var(--badge-amber-text)' : 'var(--badge-red-text)';

  return (
    <div className="space-y-4">
      {/* Score header */}
      <div className="rounded-lg border border-[var(--line-soft)] bg-[var(--accent-muted)] px-4 py-3 space-y-2">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Mic className="h-4 w-4" style={{ color: scoreColor }} />
            <p className="text-xs font-medium text-[var(--text-muted)]">Executive Tone Score</p>
          </div>
          <span className="text-2xl font-bold tabular-nums" style={{ color: scoreColor }}>
            {tone_score}
          </span>
        </div>
        <div
          className="h-1.5 w-full rounded-full overflow-hidden"
          style={{ backgroundColor: 'rgba(255,255,255,0.08)' }}
        >
          <div
            className="h-full rounded-full transition-all duration-700"
            style={{
              width: `${Math.min(100, Math.max(0, tone_score))}%`,
              backgroundColor: scoreColor,
            }}
          />
        </div>
        <p className="text-[11px] text-[var(--text-soft)]">
          {findings.length === 0
            ? 'No tone issues detected'
            : `${findings.length} finding${findings.length !== 1 ? 's' : ''} to review`}
        </p>
      </div>

      {/* Banned phrases callout */}
      {banned_phrases_found.length > 0 && (
        <div className="rounded-lg border border-[var(--badge-red-text)]/25 bg-[var(--badge-red-text)]/[0.05] px-4 py-3 space-y-2">
          <div className="flex items-center gap-2">
            <XCircle className="h-3.5 w-3.5 shrink-0" style={{ color: 'var(--badge-red-text)' }} />
            <p className="text-xs font-semibold" style={{ color: 'var(--badge-red-text)' }}>
              Banned Phrases ({banned_phrases_found.length})
            </p>
          </div>
          <div className="flex flex-wrap gap-1.5">
            {banned_phrases_found.map((phrase, i) => (
              <span
                key={i}
                className="rounded-md px-2 py-0.5 text-[11px] font-medium"
                style={{
                  color: 'var(--badge-red-text)',
                  backgroundColor: 'rgba(240,184,184,0.10)',
                  border: '1px solid rgba(240,184,184,0.22)',
                }}
              >
                {phrase}
              </span>
            ))}
          </div>
        </div>
      )}

      {/* Findings list */}
      {findings.length > 0 && (
        <div className="space-y-2">
          <p className="text-[11px] uppercase tracking-[0.14em] text-[var(--text-soft)]">
            Findings ({findings.length})
          </p>
          {findings.map((f, i) => (
            <div
              key={i}
              className="rounded-lg border border-[var(--badge-amber-text)]/15 bg-[var(--badge-amber-text)]/[0.04] px-3 py-2.5 space-y-1.5"
            >
              {/* Issue type + section */}
              <div className="flex items-center gap-2 flex-wrap">
                <AlertTriangle className="h-3 w-3 shrink-0" style={{ color: 'var(--badge-amber-text)' }} />
                <span
                  className="rounded-md px-1.5 py-0.5 text-[10px] font-medium whitespace-nowrap"
                  style={{
                    color: 'var(--badge-amber-text)',
                    backgroundColor: 'rgba(240,217,159,0.10)',
                    border: '1px solid rgba(240,217,159,0.22)',
                  }}
                >
                  {humanizeIssueType(f.issue)}
                </span>
                <span className="text-[10px] text-[var(--text-soft)]">{humanizeSectionName(f.section)}</span>
              </div>

              {/* Offending text */}
              <div
                className="rounded-md px-3 py-2 text-xs text-[var(--text-soft)] leading-5 italic"
                style={{
                  backgroundColor: 'rgba(255,255,255,0.03)',
                  borderLeft: '2px solid rgba(240,217,159,0.30)',
                }}
              >
                "{f.text}"
              </div>

              {/* Suggestion */}
              {f.suggestion && (
                <p className="text-xs text-[var(--text-soft)] leading-4">
                  <span style={{ color: 'var(--badge-green-text)' }} className="font-medium">
                    Suggestion:
                  </span>{' '}
                  {f.suggestion}
                </p>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
