/**
 * V3ResumeView — attribution-first resume rendering.
 *
 * Every bullet shows its provenance:
 *  - is_new=false → verbatim from source, unmarked
 *  - is_new=true with source ref → rewritten; click to see original
 *  - confidence < 0.7 → soft amber indicator (writer signaled lower confidence)
 *
 * Sections rendered in order: header (from structured.contact) → summary →
 * core competencies → selected accomplishments → professional experience →
 * custom sections → education → certifications → skills.
 *
 * B5 adds inline editing. For B3, display + attribution only.
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import { GlassCard } from '@/components/GlassCard';
import {
  Link2, FileText, AlertTriangle, RotateCcw, RefreshCw, Loader2, X,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { EditableText } from './EditableText';
import type {
  V3StructuredResume,
  V3WrittenResume,
  V3WrittenPosition,
  V3Bullet,
  V3VerifyResult,
} from '@/hooks/useV3Pipeline';

interface FocusCue {
  key: string;
  section: string;
  at: number;
}

interface Props {
  structured: V3StructuredResume | null;
  written: V3WrittenResume | null;
  /**
   * The pristine pipeline output (pipeline.written). When provided, bullets
   * that diverge from this get a coral edit-dot in the gutter. Also used
   * by V3PipelineScreen to detect whether a bullet has been reverted to
   * source (current text === source text) vs. edited to something new.
   */
  pristineWritten?: V3WrittenResume | null;
  verify: V3VerifyResult | null;
  editable?: boolean;
  onEdit?: (updated: V3WrittenResume | null) => void;
  /**
   * Cross-panel scroll cue. When its `.section` matches a section in this
   * view, scroll+flash that section. Bumping `.at` re-triggers the flash
   * even when the section key hasn't changed.
   */
  focusCue?: FocusCue | null;
  /** Issues the user has dismissed. Their inline triangles dim to 30% but stay present. */
  dismissedIssueKeys?: Set<string>;
  /**
   * Emitted when the user clicks an inline alert triangle on a bullet. The
   * screen uses this to scroll the Final Check panel to the matching row.
   */
  onTriangleClick?: (key: string, section: string) => void;
  /**
   * Emitted when the user clicks a bullet's source chip. The screen flashes
   * the Strategy panel's emphasized-accomplishment card for this position.
   */
  onSourceChipClick?: (positionIndex: number) => void;
  /**
   * Regenerate a single bullet via the Phase-4 REST endpoint. When provided,
   * every is_new bullet shows a regenerate icon next to the revert icon.
   * Optional `guidance` is a free-form steering hint ("shorter", "add metrics").
   */
  onRegenerateBullet?: (
    positionIndex: number,
    bulletIndex: number,
    guidance?: string,
  ) => void | Promise<void>;
  /** Bullet keys (`${posIdx}#${bulletIdx}`) currently being regenerated — spinner. */
  pendingBulletKeys?: Set<string>;
  /**
   * Regenerate the executive summary. Same UX as bullet regen: click = no
   * guidance, Alt-click opens an inline guidance textbox.
   */
  onRegenerateSummary?: (guidance?: string) => void | Promise<void>;
  /** True while the summary is regenerating — spinner + lock. */
  summaryPending?: boolean;
}

// Immutable updater helpers for editing.
function updateSummary(w: V3WrittenResume, next: string): V3WrittenResume {
  return { ...w, summary: next };
}
function updateAccomplishment(w: V3WrittenResume, idx: number, next: string): V3WrittenResume {
  const list = w.selectedAccomplishments.slice();
  list[idx] = next;
  return { ...w, selectedAccomplishments: list };
}
function updateBullet(
  w: V3WrittenResume,
  posIdx: number,
  bulletIdx: number,
  next: string,
): V3WrittenResume {
  const positions = w.positions.slice();
  const pos = positions[posIdx];
  if (!pos) return w;
  const bullets = pos.bullets.slice();
  const b = bullets[bulletIdx];
  if (!b) return w;
  bullets[bulletIdx] = { ...b, text: next };
  positions[posIdx] = { ...pos, bullets };
  return { ...w, positions };
}

function formatDateRange(dr: { start: string | null; end: string | null; raw: string }): string {
  return dr.raw || [dr.start ?? '?', dr.end ?? 'Present'].join(' – ');
}

/** Extract the source bullet text for an is_new=true written bullet. */
function resolveSourceBullet(
  sourceRef: string,
  structured: V3StructuredResume | null,
): string | null {
  if (!structured) return null;
  // Match "positions[N].bullets[M]" or "positions[N].bullets[M] + positions[P].bullets[Q]"
  const re = /positions\[(\d+)\]\.bullets\[(\d+)\]/g;
  const matches = [...sourceRef.matchAll(re)];
  if (matches.length === 0) return null;
  const texts: string[] = [];
  for (const m of matches) {
    const posIdx = Number(m[1]);
    const bulletIdx = Number(m[2]);
    const pos = structured.positions[posIdx];
    if (!pos) continue;
    const b = pos.bullets[bulletIdx];
    if (!b) continue;
    texts.push(b.text);
  }
  return texts.length > 0 ? texts.join('\n---\n') : null;
}

/**
 * Resolve the source bullet text for a SINGLE-source rewrite.
 * Returns null if the bullet's source ref cites more than one source
 * (multi-source rewrites aren't reliably revertable to one canonical
 * source text — they'd need a user to pick which source to collapse to).
 * Write-position v1.4+ produces single-source rewrites per Rule 1c, so
 * nearly every bullet qualifies.
 */
function resolveSingleSourceBullet(
  sourceRef: string | null | undefined,
  structured: V3StructuredResume | null,
): string | null {
  if (!sourceRef || !structured) return null;
  const re = /positions\[(\d+)\]\.bullets\[(\d+)\]/g;
  const matches = [...sourceRef.matchAll(re)];
  if (matches.length !== 1) return null; // multi-source or unresolvable
  const m = matches[0]!;
  const posIdx = Number(m[1]);
  const bulletIdx = Number(m[2]);
  const pos = structured.positions[posIdx];
  if (!pos) return null;
  const b = pos.bullets[bulletIdx];
  if (!b) return null;
  return b.text;
}

function confidenceClass(confidence: number): string {
  if (confidence >= 0.7) return '';
  if (confidence >= 0.4) return 'border-l-2 border-[var(--badge-amber-text)] pl-3';
  return 'border-l-2 border-[var(--badge-red-text)] pl-3';
}

/** Look up verify issues (with their raw index) that cite this bullet's path. */
interface IndexedIssue {
  issue: V3VerifyResult['issues'][number];
  /** Raw index in verify.issues — used to build stable keys matching Final Check. */
  index: number;
}
function issuesForPath(verify: V3VerifyResult | null, pathPrefix: string): IndexedIssue[] {
  if (!verify) return [];
  const out: IndexedIssue[] = [];
  verify.issues.forEach((issue, index) => {
    if (issue.section === pathPrefix || issue.section.startsWith(pathPrefix + '.')) {
      out.push({ issue, index });
    }
  });
  return out;
}

function issueKey(section: string, index: number): string {
  return `${section}#${index}`;
}

// ─── Small building blocks ──────────────────────────────────────────────────

function SectionHeading({ children }: { children: React.ReactNode }) {
  return (
    <h3 className="text-[11px] font-semibold uppercase tracking-[0.12em] text-[var(--text-muted)] mt-6 mb-2 border-b border-[var(--line-soft)] pb-1.5">
      {children}
    </h3>
  );
}

function AttributionBadge({
  bullet,
  structured,
  verify,
  path,
  positionIndex,
  onRevert,
  isReverted,
  dismissedIssueKeys,
  onTriangleClick,
  onSourceChipClick,
}: {
  bullet: V3Bullet;
  structured: V3StructuredResume | null;
  verify: V3VerifyResult | null;
  path: string;
  /** Position index this bullet lives in — used for the cross-panel strategy trace. */
  positionIndex: number;
  /** Called when the user clicks the revert icon. Caller applies the text change. */
  onRevert?: (sourceText: string) => void;
  /** True when the bullet's current text already matches its source (hide revert). */
  isReverted?: boolean;
  dismissedIssueKeys?: Set<string>;
  onTriangleClick?: (key: string, section: string) => void;
  onSourceChipClick?: (positionIndex: number) => void;
}) {
  const [open, setOpen] = useState(false);
  const indexedIssues = issuesForPath(verify, path);
  const errorIssues = indexedIssues.filter(({ issue }) => issue.severity === 'error');
  // First non-dismissed error drives the triangle's scroll target.
  const primaryError =
    errorIssues.find(({ issue, index }) =>
      !dismissedIssueKeys?.has(issueKey(issue.section, index))
    ) ?? errorIssues[0];
  // The inline triangle dims when every error in this section is dismissed.
  const allDismissed =
    errorIssues.length > 0 &&
    errorIssues.every(({ issue, index }) => dismissedIssueKeys?.has(issueKey(issue.section, index)));

  const sourceText = bullet.source ? resolveSourceBullet(bullet.source, structured) : null;
  const singleSourceText = resolveSingleSourceBullet(bullet.source, structured);
  const hasSource = bullet.is_new && sourceText !== null;
  const canRevert = bullet.is_new && !isReverted && singleSourceText !== null && onRevert !== undefined;

  if (!bullet.is_new && errorIssues.length === 0) {
    return null;
  }

  return (
    <div className="inline-flex items-center gap-1.5 ml-2 align-baseline">
      {errorIssues.length > 0 && (
        <button
          type="button"
          onClick={() => {
            if (primaryError && onTriangleClick) {
              onTriangleClick(
                issueKey(primaryError.issue.section, primaryError.index),
                primaryError.issue.section,
              );
            } else {
              setOpen((o) => !o);
            }
          }}
          className={cn(
            'inline-flex items-center gap-0.5 text-[10px] text-[var(--badge-red-text)] hover:bg-[var(--badge-red-bg)] rounded px-1 py-0.5 transition-opacity',
            allDismissed && 'opacity-30',
          )}
          title={allDismissed ? 'Dismissed' : primaryError?.issue.message}
        >
          <AlertTriangle className="h-3 w-3" />
          {errorIssues.length}
        </button>
      )}
      {bullet.is_new && hasSource && (
        <button
          type="button"
          onClick={() => {
            setOpen((o) => !o);
            onSourceChipClick?.(positionIndex);
          }}
          className="inline-flex items-center gap-0.5 text-[10px] text-[var(--text-soft)] hover:text-[var(--bullet-confirm)] hover:bg-[var(--bullet-confirm-bg)] rounded px-1 py-0.5 transition-colors"
          title={`Rewritten from ${bullet.source}`}
        >
          <Link2 className="h-3 w-3" />
          source
        </button>
      )}
      {canRevert && (
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            if (singleSourceText !== null) onRevert!(singleSourceText);
          }}
          className="inline-flex items-center gap-0.5 text-[10px] text-[var(--text-soft)] hover:text-[var(--bullet-confirm)] hover:bg-[var(--bullet-confirm-bg)] rounded px-1 py-0.5 transition-colors"
          title="Use the original bullet instead of the rewrite"
          aria-label="Revert to original bullet text"
        >
          <RotateCcw className="h-3 w-3" />
        </button>
      )}
      {open && sourceText && (
        <div className="absolute z-20 mt-6 max-w-md right-0 text-left">
          <GlassCard className="p-3 text-[12px] space-y-2 shadow-lg">
            <div>
              <div className="text-[10px] uppercase tracking-wider text-[var(--text-soft)] mb-1">
                Source {bullet.source && <span className="font-mono normal-case">({bullet.source})</span>}
              </div>
              <div className="text-[var(--text-muted)] whitespace-pre-wrap">{sourceText}</div>
            </div>
          </GlassCard>
        </div>
      )}
    </div>
  );
}

function BulletLine({
  bullet,
  structured,
  verify,
  path,
  positionIndex,
  bulletIndex,
  editable,
  onTextChange,
  pristineText,
  registerSectionRef,
  dismissedIssueKeys,
  onTriangleClick,
  onSourceChipClick,
  onRegenerateBullet,
  isRegenerating,
}: {
  bullet: V3Bullet;
  structured: V3StructuredResume | null;
  verify: V3VerifyResult | null;
  path: string;
  positionIndex: number;
  bulletIndex: number;
  editable: boolean;
  onTextChange?: (next: string) => void;
  pristineText?: string;
  registerSectionRef?: (section: string, el: HTMLElement | null) => void;
  dismissedIssueKeys?: Set<string>;
  onTriangleClick?: (key: string, section: string) => void;
  onSourceChipClick?: (positionIndex: number) => void;
  onRegenerateBullet?: (
    positionIndex: number,
    bulletIndex: number,
    guidance?: string,
  ) => void | Promise<void>;
  isRegenerating?: boolean;
}) {
  const hasDiverged =
    typeof pristineText === 'string' && normalize(bullet.text) !== normalize(pristineText);
  const source = resolveSingleSourceBullet(bullet.source, structured);
  const isReverted = source !== null && normalize(bullet.text) === normalize(source);
  const [guidanceOpen, setGuidanceOpen] = useState(false);
  const [guidance, setGuidance] = useState('');

  const submitRegen = (hint: string | undefined) => {
    if (!onRegenerateBullet) return;
    setGuidanceOpen(false);
    setGuidance('');
    void onRegenerateBullet(positionIndex, bulletIndex, hint);
  };

  return (
    <li
      ref={(el) => registerSectionRef?.(path, el)}
      className={cn(
        'relative pl-1 leading-relaxed text-[14px] text-[var(--text-strong)]',
        confidenceClass(bullet.confidence),
        isRegenerating && 'opacity-50',
      )}
    >
      {hasDiverged && (
        <span
          className="absolute -left-2 top-[7px] h-1.5 w-1.5 rounded-full bg-[var(--bullet-confirm)]"
          aria-label="edited"
          title={isReverted ? 'Reverted to original' : 'Edited'}
        />
      )}
      <span className="mr-1.5 text-[var(--text-soft)]">•</span>
      <EditableText
        value={bullet.text}
        onChange={(next) => onTextChange?.(next)}
        multiline
        disabled={!editable || !onTextChange || isRegenerating}
      />
      <AttributionBadge
        bullet={bullet}
        structured={structured}
        verify={verify}
        path={path}
        positionIndex={positionIndex}
        onRevert={editable && onTextChange ? onTextChange : undefined}
        isReverted={isReverted}
        dismissedIssueKeys={dismissedIssueKeys}
        onTriangleClick={onTriangleClick}
        onSourceChipClick={onSourceChipClick}
      />
      {/* Regenerate icon — next to the revert chrome. Click = no-guidance
          regen; Alt-click = open the guidance textbox for a steered rewrite. */}
      {bullet.is_new && editable && onRegenerateBullet && (
        <button
          type="button"
          onClick={(e) => {
            if (e.altKey) {
              setGuidanceOpen((o) => !o);
            } else {
              submitRegen(undefined);
            }
          }}
          disabled={isRegenerating}
          className={cn(
            'inline-flex items-center gap-0.5 text-[10px] rounded px-1 py-0.5 ml-1.5 align-baseline transition-colors',
            isRegenerating
              ? 'text-[var(--text-soft)] cursor-wait'
              : 'text-[var(--text-soft)] hover:text-[var(--badge-blue-text)] hover:bg-[var(--badge-blue-bg)]',
          )}
          title="Regenerate this bullet (Alt-click for guided)"
          aria-label="Regenerate bullet"
        >
          {isRegenerating ? (
            <Loader2 className="h-3 w-3 animate-spin" />
          ) : (
            <RefreshCw className="h-3 w-3" />
          )}
          <span>AI</span>
        </button>
      )}
      {/* Guided-regen inline input. Enter submits; Esc or X closes. */}
      {guidanceOpen && !isRegenerating && (
        <div className="mt-1.5 ml-4 flex items-center gap-1">
          <input
            type="text"
            value={guidance}
            onChange={(e) => setGuidance(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                e.preventDefault();
                submitRegen(guidance);
              } else if (e.key === 'Escape') {
                e.preventDefault();
                setGuidanceOpen(false);
                setGuidance('');
              }
            }}
            autoFocus
            maxLength={200}
            placeholder="shorter, add metrics, lead with outcome…"
            className="flex-1 text-[12px] px-2 py-1 rounded border border-[var(--line-soft)] bg-[var(--surface-1)] text-[var(--text-strong)] placeholder:text-[var(--text-soft)] focus:border-[var(--badge-blue-text)] focus:outline-none"
          />
          <button
            type="button"
            onClick={() => submitRegen(guidance.trim() || undefined)}
            className="text-[11px] text-[var(--badge-blue-text)] hover:underline font-medium"
          >
            Regenerate
          </button>
          <button
            type="button"
            onClick={() => {
              setGuidanceOpen(false);
              setGuidance('');
            }}
            className="text-[var(--text-soft)] hover:text-[var(--text-muted)]"
            aria-label="Cancel"
          >
            <X className="h-3 w-3" />
          </button>
        </div>
      )}
    </li>
  );
}

/** Normalize for equality check — trim + collapse inner whitespace. */
function normalize(s: string): string {
  return s.trim().replace(/\s+/g, ' ');
}

function PositionBlock({
  position,
  pristinePosition,
  structured,
  verify,
  posIdx,
  editable,
  onBulletChange,
  registerSectionRef,
  dismissedIssueKeys,
  onTriangleClick,
  onSourceChipClick,
  onRegenerateBullet,
  pendingBulletKeys,
}: {
  position: V3WrittenPosition;
  pristinePosition?: V3WrittenPosition;
  structured: V3StructuredResume | null;
  verify: V3VerifyResult | null;
  posIdx: number;
  editable: boolean;
  onBulletChange?: (bulletIdx: number, next: string) => void;
  registerSectionRef?: (section: string, el: HTMLElement | null) => void;
  dismissedIssueKeys?: Set<string>;
  onTriangleClick?: (key: string, section: string) => void;
  onSourceChipClick?: (positionIndex: number) => void;
  onRegenerateBullet?: (
    positionIndex: number,
    bulletIndex: number,
    guidance?: string,
  ) => void | Promise<void>;
  pendingBulletKeys?: Set<string>;
}) {
  return (
    <div
      ref={(el) => registerSectionRef?.(`positions[${posIdx}]`, el)}
      className="mb-6"
    >
      <div className="flex items-baseline justify-between gap-4">
        <div>
          <div className="text-[15px] font-semibold text-[var(--text-strong)]">
            {position.title}
          </div>
          <div className="text-[13px] text-[var(--text-muted)]">{position.company}</div>
        </div>
        <div className="text-[11px] text-[var(--text-soft)] whitespace-nowrap">
          {formatDateRange(position.dates)}
        </div>
      </div>
      {position.scope && (
        <p className="mt-1.5 text-[12px] italic text-[var(--text-muted)] leading-snug">
          {position.scope}
        </p>
      )}
      {position.bullets.length > 0 && (
        <ul className="mt-2 space-y-1.5">
          {position.bullets.map((b, i) => (
            <BulletLine
              key={i}
              bullet={b}
              structured={structured}
              verify={verify}
              path={`positions[${posIdx}].bullets[${i}]`}
              positionIndex={posIdx}
              bulletIndex={i}
              editable={editable}
              onTextChange={onBulletChange ? (next) => onBulletChange(i, next) : undefined}
              pristineText={pristinePosition?.bullets[i]?.text}
              registerSectionRef={registerSectionRef}
              dismissedIssueKeys={dismissedIssueKeys}
              onTriangleClick={onTriangleClick}
              onSourceChipClick={onSourceChipClick}
              onRegenerateBullet={onRegenerateBullet}
              isRegenerating={pendingBulletKeys?.has(`${posIdx}#${i}`)}
            />
          ))}
        </ul>
      )}
    </div>
  );
}

// ─── Main view ──────────────────────────────────────────────────────────────

export function V3ResumeView({
  structured,
  written,
  pristineWritten,
  verify,
  editable = false,
  onEdit,
  focusCue,
  dismissedIssueKeys,
  onTriangleClick,
  onSourceChipClick,
  onRegenerateBullet,
  pendingBulletKeys,
  onRegenerateSummary,
  summaryPending,
}: Props) {
  // Summary guidance-input toggle (mirrors the pattern in BulletLine).
  const [summaryGuidanceOpen, setSummaryGuidanceOpen] = useState(false);
  const [summaryGuidance, setSummaryGuidance] = useState('');

  const submitSummaryRegen = (hint: string | undefined) => {
    if (!onRegenerateSummary) return;
    setSummaryGuidanceOpen(false);
    setSummaryGuidance('');
    void onRegenerateSummary(hint);
  };
  const emitEdit = useCallback(
    (next: V3WrittenResume) => onEdit?.(next),
    [onEdit],
  );

  // Map of section path → DOM element. Populated by the bullet/summary
  // components via the `registerSectionRef` callback. The scroll+flash
  // effect below looks up the target here whenever `focusCue` changes.
  const sectionRefs = useRef<Map<string, HTMLElement>>(new Map());
  const registerSectionRef = useCallback((section: string, el: HTMLElement | null) => {
    if (el) sectionRefs.current.set(section, el);
    else sectionRefs.current.delete(section);
  }, []);

  // Scroll-sync: when focusCue fires, scroll the target section into view
  // and flash it. Falls back progressively — if `positions[2].bullets[5]`
  // isn't registered, try `positions[2]`; if that's missing, bail silently.
  useEffect(() => {
    if (!focusCue) return;
    const el =
      sectionRefs.current.get(focusCue.section) ??
      sectionRefs.current.get(focusCue.section.replace(/\.bullets\[\d+\]$/, ''));
    if (!el) return;
    el.scrollIntoView({ behavior: 'smooth', block: 'center' });
    el.classList.remove('v3-address-flash');
    // Force a reflow so re-adding the class re-runs the animation.
    void el.offsetWidth;
    el.classList.add('v3-address-flash');
  }, [focusCue]);

  if (!written) {
    return (
      <GlassCard className="p-8">
        <div className="flex items-center gap-2">
          <FileText className="h-4 w-4 text-[var(--text-soft)]" />
          <h2 className="text-[11px] font-semibold uppercase tracking-[0.1em] text-[var(--text-muted)]">
            Resume
          </h2>
        </div>
        <div className="mt-6 space-y-3">
          <div className="h-4 rounded bg-[var(--surface-2)] motion-safe:animate-pulse w-2/3" />
          <div className="h-3 rounded bg-[var(--surface-2)] motion-safe:animate-pulse w-full" />
          <div className="h-3 rounded bg-[var(--surface-2)] motion-safe:animate-pulse w-4/5" />
          <div className="h-3 rounded bg-[var(--surface-2)] motion-safe:animate-pulse w-5/6" />
        </div>
      </GlassCard>
    );
  }

  const summaryIssues = issuesForPath(verify, 'summary');
  const summaryHasError = summaryIssues.some(({ issue }) => issue.severity === 'error');

  return (
    <GlassCard className="p-8">
      {/* Header (from structured.contact) */}
      {structured?.contact && (
        <div className="pb-4 border-b border-[var(--line-soft)] mb-2">
          <h1 className="text-2xl font-semibold text-[var(--text-strong)]">
            {structured.contact.fullName}
          </h1>
          <div className="text-[12px] text-[var(--text-muted)] mt-1 flex flex-wrap gap-x-3 gap-y-0.5">
            {structured.contact.email && <span>{structured.contact.email}</span>}
            {structured.contact.phone && <span>{structured.contact.phone}</span>}
            {structured.contact.linkedin && <span>{structured.contact.linkedin}</span>}
            {structured.contact.location && <span>{structured.contact.location}</span>}
          </div>
        </div>
      )}

      {/* Summary */}
      <div className="flex items-baseline justify-between mt-6 mb-2 border-b border-[var(--line-soft)] pb-1.5">
        <h3 className="text-[11px] font-semibold uppercase tracking-[0.12em] text-[var(--text-muted)]">
          Summary
        </h3>
        {editable && onRegenerateSummary && (
          <button
            type="button"
            onClick={(e) => {
              if (e.altKey) {
                setSummaryGuidanceOpen((o) => !o);
              } else {
                submitSummaryRegen(undefined);
              }
            }}
            disabled={summaryPending}
            className={cn(
              'inline-flex items-center gap-1 text-[10px] rounded px-1.5 py-0.5 transition-colors',
              summaryPending
                ? 'text-[var(--text-soft)] cursor-wait'
                : 'text-[var(--text-soft)] hover:text-[var(--badge-blue-text)] hover:bg-[var(--badge-blue-bg)]',
            )}
            title="Regenerate summary (Alt-click for guided)"
            aria-label="Regenerate summary"
          >
            {summaryPending ? (
              <Loader2 className="h-3 w-3 animate-spin" />
            ) : (
              <RefreshCw className="h-3 w-3" />
            )}
            AI rewrite
          </button>
        )}
      </div>
      <div
        ref={(el) => registerSectionRef('summary', el)}
        className={cn('relative', summaryPending && 'opacity-50')}
      >
        <div
          className={cn(
            'text-[14px] leading-relaxed text-[var(--text-strong)]',
            summaryHasError && 'border-l-2 border-[var(--badge-red-text)] pl-3',
          )}
        >
          <EditableText
            value={written.summary}
            onChange={(next) => emitEdit(updateSummary(written, next))}
            multiline
            disabled={!editable || summaryPending}
            placeholder="Summary…"
          />
        </div>
        {summaryGuidanceOpen && !summaryPending && (
          <div className="mt-2 flex items-center gap-1">
            <input
              type="text"
              value={summaryGuidance}
              onChange={(e) => setSummaryGuidance(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  e.preventDefault();
                  submitSummaryRegen(summaryGuidance);
                } else if (e.key === 'Escape') {
                  e.preventDefault();
                  setSummaryGuidanceOpen(false);
                  setSummaryGuidance('');
                }
              }}
              autoFocus
              maxLength={200}
              placeholder="shorter, lead with consolidator frame, emphasize public sector…"
              className="flex-1 text-[12px] px-2 py-1 rounded border border-[var(--line-soft)] bg-[var(--surface-1)] text-[var(--text-strong)] placeholder:text-[var(--text-soft)] focus:border-[var(--badge-blue-text)] focus:outline-none"
            />
            <button
              type="button"
              onClick={() => submitSummaryRegen(summaryGuidance.trim() || undefined)}
              className="text-[11px] text-[var(--badge-blue-text)] hover:underline font-medium"
            >
              Regenerate
            </button>
            <button
              type="button"
              onClick={() => {
                setSummaryGuidanceOpen(false);
                setSummaryGuidance('');
              }}
              className="text-[var(--text-soft)] hover:text-[var(--text-muted)]"
              aria-label="Cancel"
            >
              <X className="h-3 w-3" />
            </button>
          </div>
        )}
        {summaryIssues.length > 0 && (
          <div className="mt-2 text-[11px] text-[var(--badge-red-text)] space-y-0.5">
            {summaryIssues.map(({ issue, index }) => {
              const isDismissed = dismissedIssueKeys?.has(issueKey(issue.section, index)) ?? false;
              return (
                <button
                  key={index}
                  type="button"
                  onClick={() => onTriangleClick?.(issueKey(issue.section, index), issue.section)}
                  className={cn(
                    'flex items-start gap-1 text-left w-full hover:underline',
                    isDismissed && 'opacity-40',
                  )}
                >
                  <AlertTriangle className="h-3 w-3 flex-shrink-0 mt-0.5" />
                  <span>{issue.message}</span>
                </button>
              );
            })}
          </div>
        )}
      </div>

      {/* Core competencies */}
      {written.coreCompetencies.length > 0 && (
        <>
          <SectionHeading>Core Competencies</SectionHeading>
          <div className="flex flex-wrap gap-1.5">
            {written.coreCompetencies.map((c, i) => (
              <span
                key={i}
                className="text-[12px] px-2 py-1 rounded bg-[var(--surface-2)] border border-[var(--line-soft)] text-[var(--text-strong)]"
              >
                {c}
              </span>
            ))}
          </div>
        </>
      )}

      {/* Selected accomplishments */}
      {written.selectedAccomplishments.length > 0 && (
        <>
          <SectionHeading>Selected Accomplishments</SectionHeading>
          <ul
            ref={(el) => registerSectionRef('selectedAccomplishments', el)}
            className="space-y-1.5"
          >
            {written.selectedAccomplishments.map((a, i) => (
              <li
                key={i}
                ref={(el) => registerSectionRef(`selectedAccomplishments[${i}]`, el)}
                className="relative pl-1 leading-relaxed text-[14px] text-[var(--text-strong)]"
              >
                <span className="mr-1.5 text-[var(--text-soft)]">•</span>
                <EditableText
                  value={a}
                  onChange={(next) => emitEdit(updateAccomplishment(written, i, next))}
                  multiline
                  disabled={!editable}
                />
              </li>
            ))}
          </ul>
        </>
      )}

      {/* Professional experience */}
      {written.positions.length > 0 && (
        <>
          <SectionHeading>Professional Experience</SectionHeading>
          {written.positions.map((p, i) => (
            <PositionBlock
              key={p.positionIndex}
              position={p}
              pristinePosition={pristineWritten?.positions[i]}
              structured={structured}
              verify={verify}
              posIdx={i}
              editable={editable}
              onBulletChange={
                editable
                  ? (bulletIdx, next) => emitEdit(updateBullet(written, i, bulletIdx, next))
                  : undefined
              }
              registerSectionRef={registerSectionRef}
              dismissedIssueKeys={dismissedIssueKeys}
              onTriangleClick={onTriangleClick}
              onSourceChipClick={onSourceChipClick}
              onRegenerateBullet={onRegenerateBullet}
              pendingBulletKeys={pendingBulletKeys}
            />
          ))}
        </>
      )}

      {/* Custom sections */}
      {written.customSections.map((cs, i) => (
        <div key={i}>
          <SectionHeading>{cs.title}</SectionHeading>
          <ul className="space-y-1.5">
            {cs.entries.map((e, k) => (
              <li key={k} className="pl-1 leading-relaxed text-[14px] text-[var(--text-strong)]">
                <span className="mr-1.5 text-[var(--text-soft)]">•</span>
                {e.text}
              </li>
            ))}
          </ul>
        </div>
      ))}

      {/* Education (from structured — v3 doesn't re-emit these) */}
      {structured && structured.education.length > 0 && (
        <>
          <SectionHeading>Education</SectionHeading>
          <ul className="space-y-1.5">
            {structured.education.map((e, i) => (
              <li key={i} className="text-[14px] leading-relaxed">
                <div className="text-[var(--text-strong)] font-medium">{e.degree}</div>
                <div className="text-[13px] text-[var(--text-muted)]">
                  {e.institution}
                  {e.graduationYear && <span> · {e.graduationYear}</span>}
                  {e.location && <span> · {e.location}</span>}
                </div>
              </li>
            ))}
          </ul>
        </>
      )}

      {/* Certifications */}
      {structured && structured.certifications.length > 0 && (
        <>
          <SectionHeading>Certifications</SectionHeading>
          <ul className="space-y-1">
            {structured.certifications.map((c, i) => (
              <li key={i} className="text-[13px] text-[var(--text-strong)]">
                {c.name}
                {c.issuer && <span className="text-[var(--text-muted)]"> — {c.issuer}</span>}
                {c.year && <span className="text-[var(--text-soft)]"> · {c.year}</span>}
              </li>
            ))}
          </ul>
        </>
      )}

      {/* Skills */}
      {structured && structured.skills.length > 0 && (
        <>
          <SectionHeading>Skills</SectionHeading>
          <div className="flex flex-wrap gap-1.5">
            {structured.skills.map((s, i) => (
              <span
                key={i}
                className="text-[12px] px-2 py-1 rounded bg-[var(--surface-2)] border border-[var(--line-soft)] text-[var(--text-strong)]"
              >
                {s}
              </span>
            ))}
          </div>
        </>
      )}
    </GlassCard>
  );
}
