/**
 * WhatChangedCard — Summary of resume changes after a re-run with added context.
 *
 * Compares previousResume to currentResume and surfaces:
 *   - Executive summary changes
 *   - Core competency additions / removals
 *   - Bullet-level additions, removals, and modifications per experience entry
 *   - Selected accomplishment additions / removals
 *
 * Shows a summary count row at the top, with expandable per-section details below.
 */

import { useState } from 'react';
import { ArrowLeftRight, ChevronDown, ChevronUp, X } from 'lucide-react';
import { GlassCard } from '../../GlassCard';
import type { ResumeDraft } from '@/types/resume-v2';

interface WhatChangedCardProps {
  previousResume: ResumeDraft;
  currentResume: ResumeDraft;
  onDismiss: () => void;
}

// ─── Diff helpers ────────────────────────────────────────────────────────────

interface BulletChange {
  type: 'added' | 'removed' | 'unchanged';
  text: string;
}

interface SectionBulletDiff {
  company: string;
  title: string;
  changes: BulletChange[];
  hasChanges: boolean;
}

interface CompetencyDiff {
  added: string[];
  removed: string[];
}

interface SummaryDiff {
  changed: boolean;
  previous: string;
  current: string;
}

interface AccomplishmentDiff {
  added: string[];
  removed: string[];
}

interface ResumeChangeSet {
  summaryDiff: SummaryDiff;
  competencyDiff: CompetencyDiff;
  accomplishmentDiff: AccomplishmentDiff;
  experienceDiffs: SectionBulletDiff[];
  totalAdded: number;
  totalRemoved: number;
  totalModified: number;
}

/**
 * Normalizes a bullet string for comparison: trim whitespace and collapse
 * internal runs of whitespace to a single space.
 */
function normalizeBullet(text: string): string {
  return text.trim().replace(/\s+/g, ' ');
}

/**
 * Simple word-overlap similarity between two strings (Jaccard index on words).
 * Returns a value in [0, 1].
 */
function similarity(a: string, b: string): number {
  const wordsA = new Set(a.toLowerCase().split(/\W+/).filter(Boolean));
  const wordsB = new Set(b.toLowerCase().split(/\W+/).filter(Boolean));
  if (wordsA.size === 0 && wordsB.size === 0) return 1;
  let intersection = 0;
  for (const w of wordsA) {
    if (wordsB.has(w)) intersection++;
  }
  return intersection / (wordsA.size + wordsB.size - intersection);
}

const SIMILARITY_THRESHOLD = 0.5; // Bullets with >50% word overlap are considered "modified"

function diffBullets(prev: string[], curr: string[]): { changes: BulletChange[]; added: number; removed: number; modified: number } {
  const normalizedPrev = prev.map(normalizeBullet);
  const normalizedCurr = curr.map(normalizeBullet);

  const usedPrev = new Set<number>();
  const usedCurr = new Set<number>();
  let added = 0;
  let removed = 0;
  let modified = 0;

  // First pass: exact matches
  for (let i = 0; i < normalizedPrev.length; i++) {
    const j = normalizedCurr.indexOf(normalizedPrev[i]);
    if (j !== -1 && !usedCurr.has(j)) {
      usedPrev.add(i);
      usedCurr.add(j);
    }
  }

  // Second pass: fuzzy matches for remaining bullets
  for (let i = 0; i < normalizedPrev.length; i++) {
    if (usedPrev.has(i)) continue;
    let bestJ = -1;
    let bestScore = SIMILARITY_THRESHOLD;
    for (let j = 0; j < normalizedCurr.length; j++) {
      if (usedCurr.has(j)) continue;
      const score = similarity(normalizedPrev[i], normalizedCurr[j]);
      if (score > bestScore) {
        bestScore = score;
        bestJ = j;
      }
    }
    if (bestJ !== -1) {
      usedPrev.add(i);
      usedCurr.add(bestJ);
      modified++;
    }
  }

  // Count unmatched
  for (let i = 0; i < normalizedPrev.length; i++) {
    if (!usedPrev.has(i)) removed++;
  }
  for (let j = 0; j < normalizedCurr.length; j++) {
    if (!usedCurr.has(j)) added++;
  }

  // Build ordered change list relative to current resume bullets (added + unchanged/modified)
  const changes: BulletChange[] = [];

  // Removed bullets first (were in prev, not matched in curr)
  for (let i = 0; i < prev.length; i++) {
    if (!usedPrev.has(i)) {
      changes.push({ type: 'removed', text: prev[i] });
    }
  }

  // Current bullets — annotated as added or unchanged
  for (let j = 0; j < curr.length; j++) {
    if (usedCurr.has(j)) {
      changes.push({ type: 'unchanged', text: curr[j] });
    } else {
      changes.push({ type: 'added', text: curr[j] });
    }
  }

  return { changes, added, removed, modified };
}

function computeChanges(prev: ResumeDraft, curr: ResumeDraft): ResumeChangeSet {
  // Executive summary
  const prevSummary = prev.executive_summary.content.trim();
  const currSummary = curr.executive_summary.content.trim();
  const summaryDiff: SummaryDiff = {
    changed: prevSummary !== currSummary,
    previous: prevSummary,
    current: currSummary,
  };

  // Core competencies
  const prevComps = new Set(prev.core_competencies.map(c => c.trim().toLowerCase()));
  const currComps = new Set(curr.core_competencies.map(c => c.trim().toLowerCase()));
  const compAddedSet = curr.core_competencies.filter(c => !prevComps.has(c.trim().toLowerCase()));
  const compRemovedSet = prev.core_competencies.filter(c => !currComps.has(c.trim().toLowerCase()));
  const competencyDiff: CompetencyDiff = { added: compAddedSet, removed: compRemovedSet };

  // Selected accomplishments
  const prevAccTexts = new Set(prev.selected_accomplishments.map(a => normalizeBullet(a.content)));
  const currAccTexts = new Set(curr.selected_accomplishments.map(a => normalizeBullet(a.content)));
  const accAdded = curr.selected_accomplishments
    .filter(a => !prevAccTexts.has(normalizeBullet(a.content)))
    .map(a => a.content);
  const accRemoved = prev.selected_accomplishments
    .filter(a => !currAccTexts.has(normalizeBullet(a.content)))
    .map(a => a.content);
  const accomplishmentDiff: AccomplishmentDiff = { added: accAdded, removed: accRemoved };

  // Experience bullets — match entries by company+title, then diff bullets
  let totalAdded = accAdded.length;
  let totalRemoved = accRemoved.length;
  let totalModified = summaryDiff.changed ? 1 : 0;

  totalAdded += compAddedSet.length;
  totalRemoved += compRemovedSet.length;

  const experienceDiffs: SectionBulletDiff[] = [];

  for (const currExp of curr.professional_experience) {
    const prevExp = prev.professional_experience.find(
      p => p.company.trim().toLowerCase() === currExp.company.trim().toLowerCase() &&
           p.title.trim().toLowerCase() === currExp.title.trim().toLowerCase()
    );

    if (!prevExp) {
      // Entire experience entry is new
      const changes: BulletChange[] = currExp.bullets.map(b => ({ type: 'added' as const, text: b.text }));
      totalAdded += changes.length;
      if (changes.length > 0) {
        experienceDiffs.push({ company: currExp.company, title: currExp.title, changes, hasChanges: true });
      }
      continue;
    }

    const prevBulletTexts = prevExp.bullets.map(b => b.text);
    const currBulletTexts = currExp.bullets.map(b => b.text);
    const { changes, added, removed, modified } = diffBullets(prevBulletTexts, currBulletTexts);

    totalAdded += added;
    totalRemoved += removed;
    totalModified += modified;

    const hasChanges = added > 0 || removed > 0 || modified > 0;
    if (hasChanges) {
      experienceDiffs.push({ company: currExp.company, title: currExp.title, changes, hasChanges });
    }
  }

  // Entries that were in prev but not in curr (entire entry removed — rare but possible)
  for (const prevExp of prev.professional_experience) {
    const stillExists = curr.professional_experience.some(
      c => c.company.trim().toLowerCase() === prevExp.company.trim().toLowerCase() &&
           c.title.trim().toLowerCase() === prevExp.title.trim().toLowerCase()
    );
    if (!stillExists) {
      const changes: BulletChange[] = prevExp.bullets.map(b => ({ type: 'removed' as const, text: b.text }));
      totalRemoved += changes.length;
      if (changes.length > 0) {
        experienceDiffs.push({ company: prevExp.company, title: prevExp.title, changes, hasChanges: true });
      }
    }
  }

  return {
    summaryDiff,
    competencyDiff,
    accomplishmentDiff,
    experienceDiffs,
    totalAdded,
    totalRemoved,
    totalModified,
  };
}

// ─── Sub-components ──────────────────────────────────────────────────────────

function BulletLine({ change }: { change: BulletChange }) {
  if (change.type === 'unchanged') return null;

  const prefix = change.type === 'added' ? '+' : '−';
  const color =
    change.type === 'added' ? 'text-[#b5dec2]' : 'text-[#f0b8b8]';
  const bg =
    change.type === 'added' ? 'bg-[#b5dec2]/[0.05]' : 'bg-[#f0b8b8]/[0.05]';

  return (
    <div className={`flex items-start gap-2 rounded px-2 py-1.5 ${bg}`}>
      <span className={`text-xs font-bold shrink-0 ${color}`} aria-hidden="true">{prefix}</span>
      <span className="text-xs text-white/70 leading-relaxed">{change.text}</span>
    </div>
  );
}

function ExperienceDiffSection({ diff }: { diff: SectionBulletDiff }) {
  const visibleChanges = diff.changes.filter(c => c.type !== 'unchanged');
  if (visibleChanges.length === 0) return null;

  return (
    <div className="space-y-1">
      <div className="text-xs font-medium text-white/50">
        {diff.company} — <span className="font-normal">{diff.title}</span>
      </div>
      <div className="space-y-1 pl-1">
        {diff.changes.map((c, i) => (
          <BulletLine key={i} change={c} />
        ))}
      </div>
    </div>
  );
}

function StringListDiff({ added, removed, label }: { added: string[]; removed: string[]; label: string }) {
  if (added.length === 0 && removed.length === 0) return null;

  return (
    <div className="space-y-1">
      <div className="text-xs font-medium text-white/50">{label}</div>
      <div className="space-y-1 pl-1">
        {removed.map((item, i) => (
          <div key={`r-${i}`} className="flex items-start gap-2 rounded px-2 py-1.5 bg-[#f0b8b8]/[0.05]">
            <span className="text-xs font-bold shrink-0 text-[#f0b8b8]" aria-hidden="true">−</span>
            <span className="text-xs text-white/70">{item}</span>
          </div>
        ))}
        {added.map((item, i) => (
          <div key={`a-${i}`} className="flex items-start gap-2 rounded px-2 py-1.5 bg-[#b5dec2]/[0.05]">
            <span className="text-xs font-bold shrink-0 text-[#b5dec2]" aria-hidden="true">+</span>
            <span className="text-xs text-white/70">{item}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

function SummaryDiffSection({ diff }: { diff: SummaryDiff }) {
  if (!diff.changed) return null;

  return (
    <div className="space-y-1">
      <div className="text-xs font-medium text-white/50">Executive Summary</div>
      <div className="pl-1 space-y-1">
        <div className="flex items-start gap-2 rounded px-2 py-1.5 bg-[#f0b8b8]/[0.05]">
          <span className="text-xs font-bold shrink-0 text-[#f0b8b8]" aria-hidden="true">−</span>
          <span className="text-xs text-white/70 line-clamp-3">{diff.previous}</span>
        </div>
        <div className="flex items-start gap-2 rounded px-2 py-1.5 bg-[#b5dec2]/[0.05]">
          <span className="text-xs font-bold shrink-0 text-[#b5dec2]" aria-hidden="true">+</span>
          <span className="text-xs text-white/70 line-clamp-3">{diff.current}</span>
        </div>
      </div>
    </div>
  );
}

// ─── Main card ───────────────────────────────────────────────────────────────

export function WhatChangedCard({ previousResume, currentResume, onDismiss }: WhatChangedCardProps) {
  const [expanded, setExpanded] = useState(false);

  const changes = computeChanges(previousResume, currentResume);
  const hasAnyChange =
    changes.totalAdded > 0 ||
    changes.totalRemoved > 0 ||
    changes.totalModified > 0;

  if (!hasAnyChange) return null;

  return (
    <GlassCard className="p-5 border-[#afc4ff]/20">
      {/* Header row */}
      <div className="flex items-center gap-2 mb-4">
        <ArrowLeftRight className="h-4 w-4 text-[#afc4ff] shrink-0" />
        <h3 className="text-sm font-semibold text-white/90 flex-1">What Changed</h3>
        <button
          type="button"
          onClick={onDismiss}
          className="rounded-lg p-1 text-white/30 hover:bg-white/[0.06] hover:text-white/60 transition-colors"
          aria-label="Dismiss changes summary"
        >
          <X className="h-4 w-4" />
        </button>
      </div>

      {/* Summary counts */}
      <div className="flex flex-wrap gap-3 text-xs mb-4">
        {changes.totalAdded > 0 && (
          <span className="flex items-center gap-1 text-[#b5dec2]">
            <span className="font-bold text-sm">+{changes.totalAdded}</span>
            <span className="text-white/50">added</span>
          </span>
        )}
        {changes.totalRemoved > 0 && (
          <span className="flex items-center gap-1 text-[#f0b8b8]">
            <span className="font-bold text-sm">−{changes.totalRemoved}</span>
            <span className="text-white/50">removed</span>
          </span>
        )}
        {changes.totalModified > 0 && (
          <span className="flex items-center gap-1 text-[#afc4ff]">
            <span className="font-bold text-sm">~{changes.totalModified}</span>
            <span className="text-white/50">modified</span>
          </span>
        )}
      </div>

      {/* Expand/collapse details */}
      <button
        type="button"
        onClick={() => setExpanded(v => !v)}
        className="flex items-center gap-1 text-xs text-white/40 hover:text-white/60 transition-colors mb-1"
        aria-expanded={expanded}
      >
        {expanded ? <ChevronUp className="h-3.5 w-3.5" /> : <ChevronDown className="h-3.5 w-3.5" />}
        {expanded ? 'Hide details' : 'Show details'}
      </button>

      {expanded && (
        <div className="mt-3 space-y-4">
          <SummaryDiffSection diff={changes.summaryDiff} />

          <StringListDiff
            added={changes.competencyDiff.added}
            removed={changes.competencyDiff.removed}
            label="Core Competencies"
          />

          <StringListDiff
            added={changes.accomplishmentDiff.added}
            removed={changes.accomplishmentDiff.removed}
            label="Selected Accomplishments"
          />

          {changes.experienceDiffs.map((diff, i) => (
            <ExperienceDiffSection key={i} diff={diff} />
          ))}
        </div>
      )}

      {/* Dismiss footer */}
      <div className="mt-4 flex justify-end">
        <button
          type="button"
          onClick={onDismiss}
          className="rounded-lg border border-white/[0.08] bg-white/[0.04] px-3 py-1.5 text-xs text-white/50 hover:bg-white/[0.08] hover:text-white/70 transition-colors"
        >
          Got it
        </button>
      </div>
    </GlassCard>
  );
}
