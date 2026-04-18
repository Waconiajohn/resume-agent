// Semantic diff check for classify snapshots.
// Purpose: Opus 4.7 is non-deterministic (temperature parameter is deprecated
// for the model, so we cannot pin output). A byte-for-byte diff between two
// v1.2 runs will always show differences even when the two outputs are
// semantically equivalent. This utility distinguishes:
//
//   REAL DIFFS (fail fixture, human review required):
//   - positions count changed
//   - education count changed
//   - certifications count changed
//   - careerGaps count changed
//   - crossRoleHighlights count changed
//   - discipline string changed substantively (>15% length delta OR different
//     primary keyword)
//   - pronoun changed
//   - overallConfidence changed by more than 0.1
//
//   ACCEPTED NOISE (no flag):
//   - bullet/summary/discipline text wording variance where the new version is
//     within ±15% of the old length and has no polarity change
//   - confidence scores varying within ±0.1
//   - ordering-stable structural fields (e.g., skills array order)
//
// The thresholds come from the Phase 3 review message (2026-04-18). Polarity
// detection is a lexical heuristic: if the new text gains/loses a negation
// word (not, never, without, no) that the old text didn't have/had, that is a
// polarity change and counts as a real diff.
//
// This is MECHANICAL per OPERATING-MANUAL.md — we are comparing two already-
// classified outputs, not making semantic judgments about the source. Regex is
// fine here.

import type { StructuredResume, CrossRoleHighlight } from '../types.js';

export type DiffSeverity = 'ok' | 'noise' | 'real';

export interface DiffFinding {
  field: string;
  severity: DiffSeverity;
  oldValue: string;
  newValue: string;
  reason: string;
}

export interface DiffResult {
  overall: DiffSeverity;
  findings: DiffFinding[];
}

const LENGTH_TOLERANCE = 0.15;
const CONFIDENCE_TOLERANCE = 0.1;

// Negation tokens used for polarity detection. Word-boundary matches only.
const POLARITY_TOKENS = ['not', 'never', 'without', 'no', 'none', 'cannot', "can't", "won't", "didn't"];
const POLARITY_RX = new RegExp(
  `\\b(${POLARITY_TOKENS.map((t) => t.replace(/'/g, "\\'")).join('|')})\\b`,
  'gi',
);

export function diffClassifySnapshots(
  oldR: StructuredResume,
  newR: StructuredResume,
): DiffResult {
  const findings: DiffFinding[] = [];

  // Counts of top-level arrays — any change is a real diff.
  diffCount(findings, 'positions', oldR.positions.length, newR.positions.length);
  diffCount(findings, 'education', oldR.education.length, newR.education.length);
  diffCount(findings, 'certifications', oldR.certifications.length, newR.certifications.length);
  diffCount(findings, 'careerGaps', oldR.careerGaps.length, newR.careerGaps.length);
  diffCount(
    findings,
    'crossRoleHighlights',
    oldR.crossRoleHighlights.length,
    newR.crossRoleHighlights.length,
  );

  // Discipline — substantive change is real, paraphrase is noise.
  diffDiscipline(findings, oldR.discipline, newR.discipline);

  // Pronoun — any change is real (it's an enumerated value).
  if (oldR.pronoun !== newR.pronoun) {
    findings.push({
      field: 'pronoun',
      severity: 'real',
      oldValue: String(oldR.pronoun),
      newValue: String(newR.pronoun),
      reason: 'Pronoun changed between runs.',
    });
  }

  // Overall confidence — ±0.1 is noise, beyond is real.
  const confDelta = Math.abs(oldR.overallConfidence - newR.overallConfidence);
  if (confDelta > CONFIDENCE_TOLERANCE) {
    findings.push({
      field: 'overallConfidence',
      severity: 'real',
      oldValue: oldR.overallConfidence.toFixed(2),
      newValue: newR.overallConfidence.toFixed(2),
      reason: `Confidence shifted by ${confDelta.toFixed(2)}, exceeds ${CONFIDENCE_TOLERANCE} tolerance.`,
    });
  }

  // Per-position bullet text variance check (only when counts match; if counts
  // differ, positions changed is already logged above and per-bullet diffs
  // aren't meaningful).
  if (oldR.positions.length === newR.positions.length) {
    for (let i = 0; i < oldR.positions.length; i++) {
      diffWording(findings, `positions[${i}].title`, oldR.positions[i].title, newR.positions[i].title);
    }
  }

  // Cross-role highlight text variance — compare by index if counts match.
  if (oldR.crossRoleHighlights.length === newR.crossRoleHighlights.length) {
    for (let i = 0; i < oldR.crossRoleHighlights.length; i++) {
      const o: CrossRoleHighlight = oldR.crossRoleHighlights[i];
      const n: CrossRoleHighlight = newR.crossRoleHighlights[i];
      diffWording(findings, `crossRoleHighlights[${i}].text`, o.text, n.text);
    }
  }

  const overall: DiffSeverity = findings.some((f) => f.severity === 'real')
    ? 'real'
    : findings.some((f) => f.severity === 'noise')
      ? 'noise'
      : 'ok';

  return { overall, findings };
}

// -----------------------------------------------------------------------------
// Helpers
// -----------------------------------------------------------------------------

function diffCount(
  findings: DiffFinding[],
  field: string,
  oldN: number,
  newN: number,
): void {
  if (oldN !== newN) {
    findings.push({
      field,
      severity: 'real',
      oldValue: String(oldN),
      newValue: String(newN),
      reason: `${field} count changed: ${oldN} → ${newN}.`,
    });
  }
}

function diffDiscipline(
  findings: DiffFinding[],
  oldD: string,
  newD: string,
): void {
  if (oldD === newD) return;

  // If the first substantive keyword differs (e.g., "quality engineering" vs
  // "software engineering"), the discipline changed for real. Heuristic:
  // compare the lowercased first 20 chars as a proxy for the primary domain.
  const oldHead = oldD.toLowerCase().slice(0, 20);
  const newHead = newD.toLowerCase().slice(0, 20);
  if (oldHead !== newHead && !prefixesOverlapStrongly(oldHead, newHead)) {
    findings.push({
      field: 'discipline',
      severity: 'real',
      oldValue: oldD,
      newValue: newD,
      reason: 'Discipline primary-domain phrase changed substantively.',
    });
    return;
  }

  // Fall through: same primary domain, wording differs. Apply length + polarity
  // check.
  const wording = wordingVariance(oldD, newD);
  findings.push({
    field: 'discipline',
    severity: wording.severity,
    oldValue: oldD,
    newValue: newD,
    reason: wording.reason,
  });
}

function diffWording(
  findings: DiffFinding[],
  field: string,
  oldText: string,
  newText: string,
): void {
  if (oldText === newText) return;
  const w = wordingVariance(oldText, newText);
  findings.push({
    field,
    severity: w.severity,
    oldValue: oldText,
    newValue: newText,
    reason: w.reason,
  });
}

function wordingVariance(
  oldText: string,
  newText: string,
): { severity: DiffSeverity; reason: string } {
  if (oldText === newText) return { severity: 'ok', reason: 'identical' };

  const oldLen = oldText.length;
  const newLen = newText.length;
  const maxLen = Math.max(oldLen, newLen);
  const lengthDelta = Math.abs(oldLen - newLen) / Math.max(1, maxLen);

  if (lengthDelta > LENGTH_TOLERANCE) {
    return {
      severity: 'real',
      reason: `Length delta ${(lengthDelta * 100).toFixed(0)}% exceeds ±${LENGTH_TOLERANCE * 100}% tolerance.`,
    };
  }

  // Polarity: count negation words in each. Any change in the multiset is a
  // polarity change.
  const oldPol = (oldText.match(POLARITY_RX) ?? []).map((t) => t.toLowerCase()).sort();
  const newPol = (newText.match(POLARITY_RX) ?? []).map((t) => t.toLowerCase()).sort();
  if (oldPol.length !== newPol.length || oldPol.some((t, i) => t !== newPol[i])) {
    return {
      severity: 'real',
      reason: `Polarity change: negation-token set differs (old: [${oldPol.join(', ')}], new: [${newPol.join(', ')}]).`,
    };
  }

  return {
    severity: 'noise',
    reason: `Wording variance within tolerance (length delta ${(lengthDelta * 100).toFixed(0)}%, no polarity change).`,
  };
}

function prefixesOverlapStrongly(a: string, b: string): boolean {
  // Quick heuristic: if the first word of each overlaps, they're likely the
  // same domain with different phrasing. "quality engineering" vs "quality
  // engineering and DevOps" → same primary domain.
  const firstWordA = a.split(/\s+/)[0];
  const firstWordB = b.split(/\s+/)[0];
  return firstWordA.length > 3 && firstWordA === firstWordB;
}
