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

import { useCallback, useState } from 'react';
import { GlassCard } from '@/components/GlassCard';
import { Link2, FileText, AlertTriangle, RotateCcw } from 'lucide-react';
import { cn } from '@/lib/utils';
import { EditableText } from './EditableText';
import type {
  V3StructuredResume,
  V3WrittenResume,
  V3WrittenPosition,
  V3Bullet,
  V3VerifyResult,
} from '@/hooks/useV3Pipeline';

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

/** Look up verify issues that cite this bullet's path. */
function issuesForPath(verify: V3VerifyResult | null, pathPrefix: string): V3VerifyResult['issues'] {
  if (!verify) return [];
  return verify.issues.filter((i) => i.section === pathPrefix || i.section.startsWith(pathPrefix + '.'));
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
  onRevert,
  isReverted,
}: {
  bullet: V3Bullet;
  structured: V3StructuredResume | null;
  verify: V3VerifyResult | null;
  path: string;
  /** Called when the user clicks the revert icon. Caller applies the text change. */
  onRevert?: (sourceText: string) => void;
  /** True when the bullet's current text already matches its source (hide revert). */
  isReverted?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const issues = issuesForPath(verify, path);
  const errorCount = issues.filter((i) => i.severity === 'error').length;

  const sourceText = bullet.source ? resolveSourceBullet(bullet.source, structured) : null;
  const singleSourceText = resolveSingleSourceBullet(bullet.source, structured);
  const hasSource = bullet.is_new && sourceText !== null;
  // Revert is only available for single-source rewrites that aren't already reverted.
  const canRevert = bullet.is_new && !isReverted && singleSourceText !== null && onRevert !== undefined;

  if (!bullet.is_new && errorCount === 0) {
    // Verbatim bullet with no verify concerns — no chrome needed
    return null;
  }

  return (
    <div className="inline-flex items-center gap-1.5 ml-2 align-baseline">
      {errorCount > 0 && (
        <button
          type="button"
          onClick={() => setOpen((o) => !o)}
          className="inline-flex items-center gap-0.5 text-[10px] text-[var(--badge-red-text)] hover:bg-[var(--badge-red-bg)] rounded px-1 py-0.5"
          title={issues[0]?.message}
        >
          <AlertTriangle className="h-3 w-3" />
          {errorCount}
        </button>
      )}
      {bullet.is_new && hasSource && (
        <button
          type="button"
          onClick={() => setOpen((o) => !o)}
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
      {open && (sourceText || issues.length > 0) && (
        <div className="absolute z-20 mt-6 max-w-md right-0 text-left">
          <GlassCard className="p-3 text-[12px] space-y-2 shadow-lg">
            {sourceText && (
              <div>
                <div className="text-[10px] uppercase tracking-wider text-[var(--text-soft)] mb-1">
                  Source {bullet.source && <span className="font-mono normal-case">({bullet.source})</span>}
                </div>
                <div className="text-[var(--text-muted)] whitespace-pre-wrap">{sourceText}</div>
              </div>
            )}
            {issues.length > 0 && (
              <div>
                <div className="text-[10px] uppercase tracking-wider text-[var(--badge-red-text)] mb-1">
                  Verify issues
                </div>
                <ul className="space-y-1">
                  {issues.map((i, k) => (
                    <li
                      key={k}
                      className={cn(
                        'text-[11px]',
                        i.severity === 'error' ? 'text-[var(--badge-red-text)]' : 'text-[var(--badge-amber-text)]',
                      )}
                    >
                      {i.message}
                    </li>
                  ))}
                </ul>
              </div>
            )}
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
  editable,
  onTextChange,
  pristineText,
}: {
  bullet: V3Bullet;
  structured: V3StructuredResume | null;
  verify: V3VerifyResult | null;
  path: string;
  editable: boolean;
  onTextChange?: (next: string) => void;
  /** The pipeline's original text for this bullet. When the current text
   * diverges, an edit-dot shows in the gutter. */
  pristineText?: string;
}) {
  // Has the bullet diverged from what the pipeline produced?
  const hasDiverged =
    typeof pristineText === 'string' && normalize(bullet.text) !== normalize(pristineText);
  // Has the bullet been reverted to its source text (for hiding the revert icon)?
  const source = resolveSingleSourceBullet(bullet.source, structured);
  const isReverted = source !== null && normalize(bullet.text) === normalize(source);

  return (
    <li className={cn('relative pl-1 leading-relaxed text-[14px] text-[var(--text-strong)]', confidenceClass(bullet.confidence))}>
      {/* Per-bullet edit-dot — shown when the current text differs from the
          pipeline's original output. Positioned in the left gutter (negative
          inset) so it doesn't disturb text flow. */}
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
        disabled={!editable || !onTextChange}
      />
      <AttributionBadge
        bullet={bullet}
        structured={structured}
        verify={verify}
        path={path}
        onRevert={editable && onTextChange ? onTextChange : undefined}
        isReverted={isReverted}
      />
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
}: {
  position: V3WrittenPosition;
  /** Pristine pipeline output for this position, used to detect per-bullet edits. */
  pristinePosition?: V3WrittenPosition;
  structured: V3StructuredResume | null;
  verify: V3VerifyResult | null;
  posIdx: number;
  editable: boolean;
  onBulletChange?: (bulletIdx: number, next: string) => void;
}) {
  return (
    <div className="mb-6">
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
              editable={editable}
              onTextChange={onBulletChange ? (next) => onBulletChange(i, next) : undefined}
              pristineText={pristinePosition?.bullets[i]?.text}
            />
          ))}
        </ul>
      )}
    </div>
  );
}

// ─── Main view ──────────────────────────────────────────────────────────────

export function V3ResumeView({ structured, written, pristineWritten, verify, editable = false, onEdit }: Props) {
  const emitEdit = useCallback(
    (next: V3WrittenResume) => onEdit?.(next),
    [onEdit],
  );

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
  const summaryHasError = summaryIssues.some((i) => i.severity === 'error');

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
      <SectionHeading>Summary</SectionHeading>
      <div className="relative">
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
            disabled={!editable}
            placeholder="Summary…"
          />
        </div>
        {summaryIssues.length > 0 && (
          <div className="mt-2 text-[11px] text-[var(--badge-red-text)] space-y-0.5">
            {summaryIssues.map((i, k) => (
              <div key={k} className="flex items-start gap-1">
                <AlertTriangle className="h-3 w-3 flex-shrink-0 mt-0.5" />
                <span>{i.message}</span>
              </div>
            ))}
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
          <ul className="space-y-1.5">
            {written.selectedAccomplishments.map((a, i) => (
              <li
                key={i}
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
