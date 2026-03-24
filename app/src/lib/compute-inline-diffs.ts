/**
 * compute-inline-diffs — Character-level diff utility for inline suggestion marks
 *
 * Uses diff-match-patch's diff_main + diff_cleanupSemantic to produce clean,
 * human-readable diff segments between original and suggested resume text.
 */

import DiffMatchPatch from 'diff-match-patch';

// ─── Public types ─────────────────────────────────────────────────────────────

export interface InlineSuggestion {
  id: string;
  requirementText: string;
  requirementPriority: 'critical' | 'important' | 'supporting';
  /** Whether this requirement came from the job description or from the benchmark profile */
  requirementSource: 'jd' | 'benchmark';
  sectionId: string;
  originalText: string;
  suggestedText: string;
  changeType: 'addition' | 'replacement' | 'deletion';
  rationale: string;
  status: 'pending' | 'accepted' | 'rejected';
  /** The text that was confirmed when the user accepted (may differ from suggestedText if they edited it). */
  acceptedText?: string;
}

export interface DiffSegment {
  id: string;
  type: 'unchanged' | 'addition' | 'deletion';
  text: string;
  /** null for unchanged segments; the suggestion this mark belongs to otherwise */
  suggestionId: string | null;
}

// ─── DiffMatchPatch operation constants ───────────────────────────────────────

const DIFF_DELETE = -1;
const DIFF_INSERT = 1;
const DIFF_EQUAL = 0;

// ─── Core function ────────────────────────────────────────────────────────────

/**
 * Computes character-level diffs between original and suggested text.
 *
 * Returns an array of DiffSegment values ready to be rendered as inline marks.
 * Deletion segments appear before their corresponding insertion segments so
 * the visual read order matches the original document flow.
 */
export function computeInlineDiffs(
  original: string,
  suggested: string,
  suggestionId: string,
): DiffSegment[] {
  const dmp = new DiffMatchPatch();
  const diffs = dmp.diff_main(original, suggested);
  dmp.diff_cleanupSemantic(diffs);

  const segments: DiffSegment[] = [];
  let segmentIndex = 0;

  for (const [op, text] of diffs) {
    if (!text) continue;

    const id = `${suggestionId}-seg-${segmentIndex++}`;

    if (op === DIFF_EQUAL) {
      segments.push({ id, type: 'unchanged', text, suggestionId: null });
    } else if (op === DIFF_DELETE) {
      segments.push({ id, type: 'deletion', text, suggestionId });
    } else if (op === DIFF_INSERT) {
      segments.push({ id, type: 'addition', text, suggestionId });
    }
  }

  return segments;
}
