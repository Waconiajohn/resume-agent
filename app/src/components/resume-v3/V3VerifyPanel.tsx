/**
 * V3VerifyPanel — side panel summarizing the verify stage.
 *
 * Shows:
 *  - Pass/fail badge at top
 *  - Counts by severity (errors / warnings)
 *  - Grouped list of issues by section ("summary", "positions[2].bullets[4]")
 *  - Each issue text with severity color
 *
 * v3's verify issues already surface INLINE on bullets in V3ResumeView.
 * This panel is the aggregate summary — glance here to know how many
 * issues there are and jump to them.
 *
 * Loading state: skeleton while stages 1-4 run, "Verifying…" while verify
 * itself runs.
 */

import { GlassCard } from '@/components/GlassCard';
import { CheckCircle2, AlertTriangle, AlertCircle, Shield } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { V3VerifyResult, V3VerifyIssue } from '@/hooks/useV3Pipeline';

interface Props {
  verify: V3VerifyResult | null;
  isRunning: boolean;
}

function groupIssuesBySection(issues: V3VerifyIssue[]): Record<string, V3VerifyIssue[]> {
  const groups: Record<string, V3VerifyIssue[]> = {};
  for (const i of issues) {
    const key = i.section || '(unspecified)';
    if (!groups[key]) groups[key] = [];
    groups[key].push(i);
  }
  return groups;
}

/** Collapse long refs like "positions[2].bullets[4]" → "pos 2 · bullet 4" */
function prettifySection(s: string): string {
  return s
    .replace(/positions\[(\d+)\]\.bullets\[(\d+)\]/g, 'pos $1 · bullet $2')
    .replace(/positions\[(\d+)\]/g, 'pos $1')
    .replace(/selectedAccomplishments\[(\d+)\]/g, 'accomplishment $1')
    .replace(/customSections\[(\d+)\]/g, 'custom section $1');
}

export function V3VerifyPanel({ verify, isRunning }: Props) {
  if (!verify) {
    return (
      <GlassCard className="p-5">
        <div className="flex items-center gap-2">
          <Shield className="h-4 w-4 text-[var(--text-soft)]" />
          <h2 className="text-[11px] font-semibold uppercase tracking-[0.1em] text-[var(--text-muted)]">
            Verify
          </h2>
        </div>
        <p className="text-sm text-[var(--text-soft)] mt-3">
          {isRunning ? 'Waiting on verify stage…' : 'Not yet run.'}
        </p>
        {isRunning && (
          <div className="mt-3 space-y-2">
            <div className="h-2 rounded bg-[var(--surface-2)] motion-safe:animate-pulse w-1/2" />
            <div className="h-2 rounded bg-[var(--surface-2)] motion-safe:animate-pulse w-2/3" />
          </div>
        )}
      </GlassCard>
    );
  }

  const errors = verify.issues.filter((i) => i.severity === 'error');
  const warnings = verify.issues.filter((i) => i.severity === 'warning');
  const groups = groupIssuesBySection(verify.issues);
  const groupKeys = Object.keys(groups).sort();

  return (
    <GlassCard className="p-5">
      <div className="flex items-center gap-2">
        <Shield className="h-4 w-4 text-[var(--text-soft)]" />
        <h2 className="text-[11px] font-semibold uppercase tracking-[0.1em] text-[var(--text-muted)]">
          Verify
        </h2>
      </div>

      {/* Overall verdict */}
      <div className="mt-3 flex items-center gap-2">
        {verify.passed ? (
          <>
            <CheckCircle2 className="h-5 w-5 text-[var(--bullet-confirm)]" />
            <span className="text-sm font-semibold text-[var(--text-strong)]">Passed</span>
          </>
        ) : (
          <>
            <AlertTriangle className="h-5 w-5 text-[var(--badge-red-text)]" />
            <span className="text-sm font-semibold text-[var(--text-strong)]">Needs review</span>
          </>
        )}
      </div>

      {/* Counts */}
      <div className="mt-2 flex gap-3 text-[11px]">
        {errors.length > 0 && (
          <div className="flex items-center gap-1 text-[var(--badge-red-text)]">
            <AlertTriangle className="h-3 w-3" />
            {errors.length} {errors.length === 1 ? 'error' : 'errors'}
          </div>
        )}
        {warnings.length > 0 && (
          <div className="flex items-center gap-1 text-[var(--badge-amber-text)]">
            <AlertCircle className="h-3 w-3" />
            {warnings.length} {warnings.length === 1 ? 'warning' : 'warnings'}
          </div>
        )}
        {verify.issues.length === 0 && (
          <div className="text-[var(--text-soft)]">All sections clean.</div>
        )}
      </div>

      {/* Grouped issues */}
      {groupKeys.length > 0 && (
        <div className="mt-4 space-y-3">
          {groupKeys.map((key) => (
            <div key={key}>
              <div className="text-[10px] uppercase tracking-wider text-[var(--text-soft)] mb-1 font-mono">
                {prettifySection(key)}
              </div>
              <ul className="space-y-1.5">
                {groups[key].map((issue, i) => (
                  <li
                    key={i}
                    className={cn(
                      'text-[11px] leading-snug flex items-start gap-1.5',
                      issue.severity === 'error'
                        ? 'text-[var(--badge-red-text)]'
                        : 'text-[var(--badge-amber-text)]',
                    )}
                  >
                    {issue.severity === 'error' ? (
                      <AlertTriangle className="h-3 w-3 flex-shrink-0 mt-0.5" />
                    ) : (
                      <AlertCircle className="h-3 w-3 flex-shrink-0 mt-0.5" />
                    )}
                    <span>{issue.message}</span>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
      )}
    </GlassCard>
  );
}
