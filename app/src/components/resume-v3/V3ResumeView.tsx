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

import { useState } from 'react';
import { GlassCard } from '@/components/GlassCard';
import { Link2, FileText, AlertTriangle } from 'lucide-react';
import { cn } from '@/lib/utils';
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
  verify: V3VerifyResult | null;
  editable?: boolean;
  onEdit?: (updated: V3WrittenResume | null) => void;
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
}: {
  bullet: V3Bullet;
  structured: V3StructuredResume | null;
  verify: V3VerifyResult | null;
  path: string;
}) {
  const [open, setOpen] = useState(false);
  const issues = issuesForPath(verify, path);
  const errorCount = issues.filter((i) => i.severity === 'error').length;

  const hasSource = bullet.is_new && bullet.source && resolveSourceBullet(bullet.source, structured);
  const sourceText = bullet.source ? resolveSourceBullet(bullet.source, structured) : null;

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
}: {
  bullet: V3Bullet;
  structured: V3StructuredResume | null;
  verify: V3VerifyResult | null;
  path: string;
}) {
  return (
    <li className={cn('relative pl-1 leading-relaxed text-[14px] text-[var(--text-strong)]', confidenceClass(bullet.confidence))}>
      <span className="mr-1.5 text-[var(--text-soft)]">•</span>
      <span>{bullet.text}</span>
      <AttributionBadge bullet={bullet} structured={structured} verify={verify} path={path} />
    </li>
  );
}

function PositionBlock({
  position,
  structured,
  verify,
  posIdx,
}: {
  position: V3WrittenPosition;
  structured: V3StructuredResume | null;
  verify: V3VerifyResult | null;
  posIdx: number;
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
            />
          ))}
        </ul>
      )}
    </div>
  );
}

// ─── Main view ──────────────────────────────────────────────────────────────

export function V3ResumeView({ structured, written, verify }: Props) {
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
        <p
          className={cn(
            'text-[14px] leading-relaxed text-[var(--text-strong)]',
            summaryHasError && 'border-l-2 border-[var(--badge-red-text)] pl-3',
          )}
        >
          {written.summary}
        </p>
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
                {a}
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
              structured={structured}
              verify={verify}
              posIdx={i}
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
