/**
 * V3VerifyPanel — right-column "Review" summary of the verify stage.
 *
 * Role in the three-panel model: this is the SECOND OPINION panel, a peer
 * view of the resume that surfaces verify's disagreements. It's a
 * disagreement surface, not a fix queue — every row has three actions:
 *
 *   - Address ▸ — scroll the middle panel to the target, flash it. The
 *     user edits in the resume itself.
 *   - Apply ▸  — one-click accept a pre-written patch (additive-only,
 *     phase-3 feature; button is rendered only when suggestedPatches
 *     exist so phase 2 ships as a shell).
 *   - Dismiss ▸ — "I did this on purpose." The row collapses to a
 *     dismissed-strip at the bottom of the list, and the inline
 *     triangle in the middle panel dims but stays visible.
 *
 * The panel also participates in bi-directional scroll-sync: clicking an
 * inline triangle in V3ResumeView scrolls the corresponding row into
 * view here and flashes it.
 *
 * Staleness: when the user has edited a bullet that an issue targets,
 * that row renders at reduced opacity with an "edited — re-verify?"
 * label. Phase 2 shows awareness only; actual re-verify lands in phase 4.
 */

import { useEffect, useMemo, useRef, useState } from 'react';
import { GlassCard } from '@/components/GlassCard';
import { GlassButton } from '@/components/GlassButton';
import {
  CheckCircle2, AlertTriangle, AlertCircle, Shield,
  ArrowRight, X, ChevronDown, ChevronRight as ChevronRightIcon,
  Sparkles,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import type {
  V3VerifyResult, V3VerifyIssue, V3TranslatedIssue,
  V3WrittenResume, V3SuggestedPatch, V3Stage,
} from '@/hooks/useV3Pipeline';

interface FocusCue {
  key: string;
  section: string;
  at: number;
}

interface Props {
  verify: V3VerifyResult | null;
  discoveryWarning?: DiscoveryReviewWarning | null;
  isRunning: boolean;
  /** The pipeline stage currently executing. Lets the placeholder copy
   *  distinguish "verify is actively working" from "an earlier stage is
   *  still running" so the review panel doesn't claim active fact-checking
   *  before verify begins. */
  currentStage?: V3Stage | null;
  /** True while a Phase-4 re-verify REST call is in flight. Renders a
   *  subtle "Re-checking…" label without throwing away the visible issues. */
  reverifying?: boolean;
  /** The edited resume (if the user has diverged from the pipeline output). */
  editedWritten: V3WrittenResume | null;
  /** The snapshot verify was last run against. Used for staleness detection;
   *  after a reverify completes the screen updates this to the newly verified
   *  snapshot so stale cues clear. */
  pristineWritten: V3WrittenResume | null;
  /** Cross-panel scroll cue; when its `.at` bumps with `key` in this panel, the row scrolls+flashes. */
  focusCue: FocusCue | null;
  /** Dismissed issue keys (session-only). */
  dismissedIssueKeys: Set<string>;
  /** Issues resolved via Apply (Phase 3); distinct bucket from dismissed for UX signaling. */
  appliedIssueKeys: Set<string>;
  /** Address click — scroll middle panel to the target. */
  onAddress: (key: string, section: string) => void;
  /** Dismiss click — mark issue as deliberately ignored. */
  onDismiss: (key: string) => void;
  /** Restore a previously dismissed issue. */
  onUndismiss: (key: string) => void;
  /** Apply a pre-written patch — inserts into editedWritten and auto-resolves the issue. */
  onApplyPatch: (key: string, patch: V3SuggestedPatch) => void;
  /**
   * Bridge from a rewrite-class review note (no suggestedPatches) whose
   * target is regeneratable (summary/bullet) to the middle-panel's
   * regenerate flow. Uses the note's `suggestion` as the guidance hint.
   * Optional: the host screen only provides this when the pipeline is
   * complete — otherwise the button stays hidden.
   */
  onRegenerateFromSuggestion?: (
    key: string,
    section: string,
    suggestion: string,
  ) => void;
}

interface DisplayItem {
  /** Stable, session-scoped key: `${section}#${rawIndex}`. */
  key: string;
  /** Raw verify section path — the scroll target in the middle panel. */
  section: string;
  severity: 'error' | 'warning';
  label: string;
  message: string;
  suggestion?: string;
  /** Additive-only patches from the translator; populated via the Phase-3 wire. */
  suggestedPatches?: V3SuggestedPatch[];
}

export interface DiscoveryReviewWarning {
  count: number;
  highRiskCount: number;
}

// ─── Helpers ───────────────────────────────────────────────────────────────

function fallbackLabel(section: string): string {
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

/**
 * Pair translated items with their raw counterparts (1:1 by index, enforced
 * by the server translator). Yields display items that carry both the user-
 * facing prose and the raw section path needed for scroll-sync.
 */
function buildDisplayItems(verify: V3VerifyResult): DisplayItem[] {
  const translated: V3TranslatedIssue[] | undefined = verify.translated;
  if (translated && translated.length === verify.issues.length) {
    const items: DisplayItem[] = [];
    translated.forEach((t, i) => {
      if (!t.shouldShow) return;
      const raw = verify.issues[i];
      if (!raw) return;
      items.push({
        key: `${raw.section}#${i}`,
        section: raw.section,
        severity: t.severity,
        label: t.label,
        message: t.message,
        suggestion: t.suggestion,
        suggestedPatches: t.suggestedPatches,
      });
    });
    return items;
  }
  // Fallback: raw issues with mechanical labels.
  return verify.issues.map((i: V3VerifyIssue, idx) => ({
    key: `${i.section}#${idx}`,
    section: i.section,
    severity: i.severity,
    label: fallbackLabel(i.section),
    message: i.message,
  }));
}

/**
 * Resolve a verify `section` path to the current/pristine text at that path.
 * Used for staleness detection: if the edited text differs from pristine at
 * the issue's target, the verify call was against stale input — dim the row.
 */
function readSectionText(w: V3WrittenResume | null, section: string): string | null {
  if (!w) return null;
  if (section === 'summary') return w.summary;
  const accIdx = section.match(/^selectedAccomplishments\[(\d+)\]$/);
  if (accIdx) {
    const i = Number(accIdx[1]);
    return w.selectedAccomplishments[i] ?? null;
  }
  const bullet = section.match(/^positions\[(\d+)\]\.bullets\[(\d+)\]$/);
  if (bullet) {
    const pi = Number(bullet[1]);
    const bi = Number(bullet[2]);
    return w.positions[pi]?.bullets[bi]?.text ?? null;
  }
  // Coarser paths (e.g. positions[N], coreCompetencies) don't have a single
  // canonical text surface; treat as "not stale" by returning null.
  return null;
}

function normalize(s: string): string {
  return s.trim().replace(/\s+/g, ' ');
}

function isSectionStale(
  section: string,
  edited: V3WrittenResume | null,
  pristine: V3WrittenResume | null,
): boolean {
  if (!edited || !pristine) return false;
  const e = readSectionText(edited, section);
  const p = readSectionText(pristine, section);
  if (e === null || p === null) return false;
  return normalize(e) !== normalize(p);
}

// ─── Main panel ────────────────────────────────────────────────────────────

export function V3VerifyPanel({
  verify,
  discoveryWarning,
  isRunning,
  currentStage,
  reverifying,
  editedWritten,
  pristineWritten,
  focusCue,
  dismissedIssueKeys,
  appliedIssueKeys,
  onAddress,
  onDismiss,
  onUndismiss,
  onApplyPatch,
  onRegenerateFromSuggestion,
}: Props) {
  const [reverifyToast, setReverifyToast] = useState<string | null>(null);
  // Hooks must run unconditionally; compute items before the early return.
  const items = useMemo(() => (verify ? buildDisplayItems(verify) : []), [verify]);

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
          {isRunning
            ? currentStage === 'verify'
              ? 'Fact-checking every claim against your source material…'
              : 'Your review notes will appear here once fact-checking runs.'
            : 'Not yet run.'}
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

  const activeItems = items.filter(
    (i) => !dismissedIssueKeys.has(i.key) && !appliedIssueKeys.has(i.key),
  );
  const dismissedItems = items.filter((i) => dismissedIssueKeys.has(i.key));
  const appliedItems = items.filter((i) => appliedIssueKeys.has(i.key));
  const errorCount = activeItems.filter((i) => i.severity === 'error').length;
  const totalShown = activeItems.length;
  const anyErrors = errorCount > 0;
  const unresolvedDiscoveryCount = discoveryWarning?.count ?? 0;
  const hasDiscoveryWarning = unresolvedDiscoveryCount > 0;

  const handleReverifyToast = () => {
    setReverifyToast('Re-verify coming in the next phase. For now, verify reflects the original run.');
    setTimeout(() => setReverifyToast(null), 4000);
  };

  return (
    <GlassCard className="p-5">
      <div className="flex items-center gap-2">
        <Shield className="h-4 w-4 text-[var(--text-soft)]" />
        <h2 className="text-[11px] font-semibold uppercase tracking-[0.1em] text-[var(--text-muted)]">
          Review
        </h2>
        {reverifying && (
          <span className="text-[10px] text-[var(--text-soft)] italic">
            re-checking…
          </span>
        )}
      </div>

      {/* Status line */}
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
        ) : hasDiscoveryWarning ? (
          <>
            <AlertCircle className="h-5 w-5 text-[var(--badge-amber-text)]" />
            <span className="text-sm font-semibold text-[var(--text-strong)]">
              Discovery still needed
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

      {errorCount > 0 && (
        <div className="mt-1.5 flex gap-3 text-[11px]">
          <div className="flex items-center gap-1 text-[var(--badge-red-text)]">
            <AlertTriangle className="h-3 w-3" />
            {errorCount} {errorCount === 1 ? 'issue' : 'issues'}
          </div>
        </div>
      )}
      {totalShown === 0 && dismissedItems.length === 0 && hasDiscoveryWarning && (
        <p className="mt-1.5 text-[11px] text-[var(--badge-amber-text)]/90">
          {unresolvedDiscoveryCount} role-specific proof {unresolvedDiscoveryCount === 1 ? 'question still needs' : 'questions still need'} an answer before this is export-ready
          {discoveryWarning?.highRiskCount ? `, including ${discoveryWarning.highRiskCount} high-risk ${discoveryWarning.highRiskCount === 1 ? 'item' : 'items'}` : ''}.
        </p>
      )}
      {totalShown === 0 && dismissedItems.length === 0 && !hasDiscoveryWarning && (
        <p className="mt-1.5 text-[11px] text-[var(--text-soft)]">
          Nothing flagged. Safe to export.
        </p>
      )}

      {/* Reverify toast (phase-2 stub — actual re-verify is phase 4) */}
      {reverifyToast && (
        <div
          role="status"
          className="mt-3 text-[11px] text-[var(--text-muted)] bg-[var(--surface-2)] border border-[var(--line-soft)] rounded px-2 py-1.5"
        >
          {reverifyToast}
        </div>
      )}

      {/* Active items */}
      {activeItems.length > 0 && (
        <div className="mt-4 space-y-2 max-h-[540px] overflow-y-auto pr-1">
          {activeItems.map((item) => (
            <IssueRow
              key={item.key}
              item={item}
              stale={isSectionStale(item.section, editedWritten, pristineWritten)}
              focusCue={focusCue}
              onAddress={() => onAddress(item.key, item.section)}
              onDismiss={() => onDismiss(item.key)}
              onReverifyToast={handleReverifyToast}
              onApplyPatch={(patch) => onApplyPatch(item.key, patch)}
              onRegenerateFromSuggestion={
                onRegenerateFromSuggestion && item.suggestion
                  ? () => onRegenerateFromSuggestion(item.key, item.section, item.suggestion!)
                  : undefined
              }
            />
          ))}
        </div>
      )}

      {/* Resolved strip — applied (phase 3) + dismissed items, session-scoped. */}
      {(dismissedItems.length > 0 || appliedItems.length > 0) && (
        <ResolvedStrip
          appliedItems={appliedItems}
          dismissedItems={dismissedItems}
          onUndismiss={onUndismiss}
        />
      )}
    </GlassCard>
  );
}

// ─── Row components ────────────────────────────────────────────────────────

function IssueRow({
  item,
  stale,
  focusCue,
  onAddress,
  onDismiss,
  onReverifyToast,
  onApplyPatch,
  onRegenerateFromSuggestion,
}: {
  item: DisplayItem;
  stale: boolean;
  focusCue: FocusCue | null;
  onAddress: () => void;
  onDismiss: () => void;
  onReverifyToast: () => void;
  onApplyPatch: (patch: V3SuggestedPatch) => void;
  /** Optional — present only when the row qualifies (rewrite-class + regeneratable section). */
  onRegenerateFromSuggestion?: () => void;
}) {
  const ref = useRef<HTMLDivElement | null>(null);
  const [pickerOpen, setPickerOpen] = useState(false);
  const patches = item.suggestedPatches ?? [];
  const hasPatches = patches.length > 0;
  // The Review-bridge button qualifies only for rewrite-class rows whose
  // section is regeneratable. Additive rows route through Apply instead
  // (different semantic — insert vs rewrite).
  const isRegeneratable =
    item.section === 'summary' ||
    /^positions\[\d+\]\.bullets\[\d+\]$/.test(item.section);
  const showRegenButton =
    Boolean(onRegenerateFromSuggestion) && !hasPatches && isRegeneratable;

  // Scroll+flash when the focus cue hits this row.
  useEffect(() => {
    if (!focusCue || focusCue.key !== item.key) return;
    const el = ref.current;
    if (!el) return;
    el.scrollIntoView({ behavior: 'smooth', block: 'center' });
    el.classList.remove('v3-address-flash');
    // Force reflow so the re-added class triggers animation from scratch.
    void el.offsetWidth;
    el.classList.add('v3-address-flash');
  }, [focusCue, item.key]);

  // Keyboard: Enter = Address, Alt+Enter = Dismiss.
  const handleKeyDown = (e: React.KeyboardEvent<HTMLDivElement>) => {
    if (e.key !== 'Enter') return;
    e.preventDefault();
    if (e.altKey) onDismiss();
    else onAddress();
  };

  return (
    <div
      ref={ref}
      tabIndex={0}
      role="group"
      aria-label={`${item.label} — ${item.message}`}
      onKeyDown={handleKeyDown}
      className={cn(
        'rounded-md p-2.5 border outline-none transition-opacity',
        'focus:ring-2 focus:ring-[var(--bullet-confirm)] focus:ring-opacity-40',
        item.severity === 'error'
          ? 'border-[var(--badge-red-text)]/30 bg-[var(--badge-red-bg)]/30'
          : 'border-[var(--line-soft)] bg-[var(--surface-1)]/60',
        stale && 'opacity-60',
      )}
    >
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
      <div className="text-[12px] leading-snug text-[var(--text-strong)]">
        {item.message}
      </div>
      {item.suggestion && (
        <div className="mt-1 text-[11px] text-[var(--text-muted)] italic leading-snug">
          {item.suggestion}
        </div>
      )}

      {stale && (
        <button
          type="button"
          onClick={onReverifyToast}
          className="mt-2 inline-flex items-center gap-1 text-[10px] text-[var(--badge-amber-text)] hover:underline"
          title="This section was edited after the review ran"
        >
          <AlertCircle className="h-3 w-3" />
          Edited — re-verify?
        </button>
      )}

      {/* Action row */}
      <div className="mt-2 flex items-center gap-1">
        <button
          type="button"
          onClick={onAddress}
          className="inline-flex items-center gap-0.5 text-[11px] text-[var(--bullet-confirm)] hover:bg-[var(--bullet-confirm-bg)] rounded px-1.5 py-1 transition-colors font-medium"
          title="Jump to this spot in the resume"
        >
          Address
          <ArrowRight className="h-3 w-3" />
        </button>
        {hasPatches && (
          <button
            type="button"
            onClick={() => setPickerOpen((o) => !o)}
            className={cn(
              'inline-flex items-center gap-0.5 text-[11px] rounded px-1.5 py-1 transition-colors font-medium',
              pickerOpen
                ? 'text-[var(--badge-blue-text)] bg-[var(--badge-blue-bg)]'
                : 'text-[var(--badge-blue-text)] hover:bg-[var(--badge-blue-bg)]',
            )}
            title={
              patches.length === 1
                ? 'Apply the suggested fix'
                : `Pick from ${patches.length} suggested fixes`
            }
            aria-expanded={pickerOpen}
          >
            <Sparkles className="h-3 w-3" />
            Apply
          </button>
        )}
        {showRegenButton && (
          <button
            type="button"
            onClick={onRegenerateFromSuggestion}
            className="inline-flex items-center gap-0.5 text-[11px] rounded px-1.5 py-1 transition-colors font-medium text-[var(--badge-blue-text)] hover:bg-[var(--badge-blue-bg)]"
            title="Regenerate the target using this note's suggestion as guidance"
          >
            <Sparkles className="h-3 w-3" />
            AI rewrite
          </button>
        )}
        <button
          type="button"
          onClick={onDismiss}
          className="inline-flex items-center gap-0.5 text-[11px] text-[var(--text-soft)] hover:text-[var(--text-muted)] rounded px-1.5 py-1 transition-colors ml-auto"
          title="I did this on purpose — hide this note"
        >
          Dismiss
          <X className="h-3 w-3" />
        </button>
      </div>

      {/* Patch picker — 1 to 3 pre-written inserts the translator produced.
          Each is read-only here; clicking applies it in place. The user can
          still edit or revert afterwards in the resume view. */}
      {pickerOpen && hasPatches && (
        <div className="mt-2 space-y-1.5">
          {patches.map((patch, i) => (
            <div
              key={i}
              className="rounded border border-[var(--badge-blue-bg)] bg-[var(--surface-1)] p-2"
            >
              <div className="text-[10px] uppercase tracking-[0.08em] text-[var(--text-soft)] mb-1 flex items-center justify-between">
                <span>{patchTargetLabel(patch.target)}</span>
                {patches.length > 1 && (
                  <span className="text-[var(--text-soft)]">Option {i + 1}</span>
                )}
              </div>
              <div className="text-[11px] leading-snug text-[var(--text-strong)]">
                {patch.text}
              </div>
              <div className="mt-1.5 flex justify-end">
                <button
                  type="button"
                  onClick={() => onApplyPatch(patch)}
                  className="inline-flex items-center gap-0.5 text-[11px] text-[var(--badge-blue-text)] hover:underline font-medium"
                >
                  Insert
                  <ArrowRight className="h-3 w-3" />
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function patchTargetLabel(target: string): string {
  if (target === 'summary') return 'Replaces summary';
  if (target === 'selectedAccomplishments') return 'Adds key accomplishment';
  const m = target.match(/^positions\[(\d+)\]$/);
  if (m) return `Adds bullet to position ${Number(m[1]) + 1}`;
  return target;
}

/**
 * Resolved strip — one collapsible footer that shows both "applied" (the
 * user accepted a pre-written patch) and "dismissed" (the user said the
 * issue was intentional) items. They share a section because they share a
 * meaning: "this row is no longer in the active list." The distinction
 * shows as a per-row prefix so the user can tell at a glance what happened.
 */
function ResolvedStrip({
  appliedItems,
  dismissedItems,
  onUndismiss,
}: {
  appliedItems: DisplayItem[];
  dismissedItems: DisplayItem[];
  onUndismiss: (key: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const total = appliedItems.length + dismissedItems.length;
  const appliedLabel = appliedItems.length === 1 ? 'applied' : 'applied';
  return (
    <div className="mt-4 pt-3 border-t border-[var(--line-soft)]">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="flex items-center gap-1 text-[10px] uppercase tracking-[0.08em] text-[var(--text-soft)] hover:text-[var(--text-muted)]"
      >
        {open ? <ChevronDown className="h-3 w-3" /> : <ChevronRightIcon className="h-3 w-3" />}
        Resolved ({total})
        {appliedItems.length > 0 && (
          <span className="ml-1 text-[var(--badge-blue-text)] normal-case tracking-normal">
            · {appliedItems.length} {appliedLabel}
          </span>
        )}
      </button>
      {open && (
        <ul className="mt-2 space-y-1.5">
          {appliedItems.map((item) => (
            <li
              key={item.key}
              className="flex items-center gap-2 text-[11px] text-[var(--text-soft)]"
            >
              <CheckCircle2 className="h-3 w-3 text-[var(--badge-blue-text)] flex-shrink-0" />
              <span className="flex-1 truncate" title={item.message}>
                <span className="text-[var(--text-muted)] font-medium">{item.label}</span>
                {' — '}
                <span className="italic">applied suggested fix</span>
              </span>
            </li>
          ))}
          {dismissedItems.map((item) => (
            <li
              key={item.key}
              className="flex items-center gap-2 text-[11px] text-[var(--text-soft)]"
            >
              <X className="h-3 w-3 flex-shrink-0 opacity-60" />
              <span className="flex-1 truncate" title={item.message}>
                <span className="text-[var(--text-muted)] font-medium">{item.label}</span>
                {' — '}
                <span className="italic">{item.message}</span>
              </span>
              <GlassButton
                variant="ghost"
                size="sm"
                onClick={() => onUndismiss(item.key)}
                className="text-[10px]"
              >
                Restore
              </GlassButton>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
