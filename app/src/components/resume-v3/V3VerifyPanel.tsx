/**
 * V3VerifyPanel — right-column "Review" summary of the verify stage.
 *
 * What the user sees:
 *   - A header "Review" (the word "Verify" is developer vocabulary; users
 *     understand "Review" as "things to look over before you hit send").
 *   - Status line: "Looks good" when nothing surfaced, or
 *     "Passed with N suggestion(s)" when there are items.
 *   - A list of items, each with:
 *       * Small uppercase tag label (e.g. "SUMMARY", "KEY ACCOMPLISHMENTS",
 *         "ROLE AT UNDER ARMOUR")
 *       * Plain-English message
 *       * Optional italic suggestion
 *
 * Data source:
 *   - Prefer verify.translated[] (produced by the server-side
 *     translate step; filters noise via shouldShow=false, rewrites prose
 *     into user-facing language).
 *   - Fall back to verify.issues[] with a mechanical path->label
 *     translation when .translated is absent (translator failed or
 *     hasn't run yet). Noise does not get filtered in the fallback
 *     path, but the panel still reads correctly.
 */

import { GlassCard } from '@/components/GlassCard';
import { CheckCircle2, AlertTriangle, AlertCircle, Shield } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { V3VerifyResult, V3VerifyIssue, V3TranslatedIssue } from '@/hooks/useV3Pipeline';

interface Props {
  verify: V3VerifyResult | null;
  isRunning: boolean;
}

interface DisplayItem {
  severity: 'error' | 'warning';
  label: string;
  message: string;
  suggestion?: string;
}

function fallbackLabel(section: string): string {
  // Last-resort label when translator didn't run. Matches the translator's
  // mapping for the common cases so the UX is consistent on both paths.
  if (section === 'summary') return 'Summary';
  if (section === 'coreCompetencies') return 'Core competencies';
  if (section.startsWith('selectedAccomplishments')) return 'Key accomplishments';
  const bullet = section.match(/^positions\[(\d+)\]\.bullets\[(\d+)\]$/);
  if (bullet) return `Position ${Number(bullet[1]) + 1} · bullet ${Number(bullet[2]) + 1}`;
  const pos = section.match(/^positions\[(\d+)\]$/);
  if (pos) return `Position ${Number(pos[1]) + 1}`;
  if (section.startsWith('customSections')) return 'Custom section';
  return section;
}

function buildDisplayItems(verify: V3VerifyResult): DisplayItem[] {
  const translated: V3TranslatedIssue[] | undefined = verify.translated;
  if (translated && translated.length > 0) {
    return translated
      .filter((t) => t.shouldShow)
      .map((t) => ({
        severity: t.severity,
        label: t.label,
        message: t.message,
        suggestion: t.suggestion,
      }));
  }
  // Fallback: raw issues with mechanical labels.
  return verify.issues.map((i: V3VerifyIssue) => ({
    severity: i.severity,
    label: fallbackLabel(i.section),
    message: i.message,
  }));
}

export function V3VerifyPanel({ verify, isRunning }: Props) {
  if (!verify) {
    return (
      <GlassCard className="p-5">
        <div className="flex items-center gap-2">
          <Shield className="h-4 w-4 text-[var(--text-soft)]" />
          <h2 className="text-[11px] font-semibold uppercase tracking-[0.1em] text-[var(--text-muted)]">
            Review
          </h2>
        </div>
        <p className="text-sm text-[var(--text-soft)] mt-3">
          {isRunning ? 'Waiting on review…' : 'Not yet run.'}
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

  const items = buildDisplayItems(verify);
  const errorCount = items.filter((i) => i.severity === 'error').length;
  const warningCount = items.filter((i) => i.severity === 'warning').length;
  const totalShown = items.length;
  const anyErrors = errorCount > 0;

  return (
    <GlassCard className="p-5">
      <div className="flex items-center gap-2">
        <Shield className="h-4 w-4 text-[var(--text-soft)]" />
        <h2 className="text-[11px] font-semibold uppercase tracking-[0.1em] text-[var(--text-muted)]">
          Review
        </h2>
      </div>

      {/* Status line — neutral, descriptive. Avoids "Passed" (creates a
          misleading sense of completion when warnings remain) in favor of
          "N review note(s)" — the user decides what, if anything, to act on. */}
      <div className="mt-3 flex items-center gap-2">
        {anyErrors ? (
          <>
            <AlertTriangle className="h-5 w-5 text-[var(--badge-red-text)]" />
            <span className="text-sm font-semibold text-[var(--text-strong)]">
              Needs review
            </span>
          </>
        ) : totalShown > 0 ? (
          <>
            <AlertCircle className="h-5 w-5 text-[var(--badge-amber-text)]" />
            <span className="text-sm font-semibold text-[var(--text-strong)]">
              {totalShown} review {totalShown === 1 ? 'note' : 'notes'}
            </span>
          </>
        ) : (
          <>
            <CheckCircle2 className="h-5 w-5 text-[var(--bullet-confirm)]" />
            <span className="text-sm font-semibold text-[var(--text-strong)]">
              No review notes
            </span>
          </>
        )}
      </div>

      {/* Count line — only surface the error breakdown; warnings are
          already named in the status line above. */}
      {errorCount > 0 && (
        <div className="mt-1.5 flex gap-3 text-[11px]">
          <div className="flex items-center gap-1 text-[var(--badge-red-text)]">
            <AlertTriangle className="h-3 w-3" />
            {errorCount} {errorCount === 1 ? 'issue' : 'issues'}
          </div>
        </div>
      )}
      {totalShown === 0 && (
        <p className="mt-1.5 text-[11px] text-[var(--text-soft)]">
          Nothing flagged. Safe to export.
        </p>
      )}

      {/* Items */}
      {items.length > 0 && (
        <div className="mt-4 space-y-3 max-h-[480px] overflow-y-auto">
          {items.map((item, i) => (
            <div key={i} className="text-[12px] leading-snug">
              <div
                className={cn(
                  'text-[10px] font-semibold uppercase tracking-[0.08em] mb-1',
                  item.severity === 'error'
                    ? 'text-[var(--badge-red-text)]'
                    : 'text-[var(--text-soft)]',
                )}
              >
                {item.label}
              </div>
              <div className="text-[var(--text-strong)]">{item.message}</div>
              {item.suggestion && (
                <div className="mt-1 text-[var(--text-muted)] italic">
                  {item.suggestion}
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </GlassCard>
  );
}
