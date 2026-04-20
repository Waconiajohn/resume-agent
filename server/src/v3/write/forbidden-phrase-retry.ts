// Post-write forbidden-phrase detection + one-shot retry helper.
// Ships 2026-04-20 — addresses the UX-test finding that the shared
// forbidden-phrases prompt fragment is ~50–60% effective. The recurring
// reader-visible tells ("with a track record of", "Orchestrated", etc.)
// slip past prompt discipline in roughly one out of three runs.
//
// Mirrors the pronoun-retry pattern (Fix 4, 2026-04-19):
//
//   1. Scan the output text for a small, auditable set of banned phrases.
//   2. If any are found, re-invoke the LLM ONCE with an addendum that names
//      the specific phrases found and instructs a phrase-free rewrite.
//   3. If the retry still contains offenders, emit the result anyway and
//      log a telemetry counter so operators can catch sustained regressions.
//
// Mechanical, pattern-based. No LLM judgment — if the text matches a
// banned pattern, it's banned. Patterns deliberately mirror the high-
// confidence subset of `_shared/forbidden-phrases.md`; context-dependent
// items like "robust [noun]" are NOT mechanically detected here because
// they legitimately pass in technical contexts.

/**
 * A banned phrase, expressed either as an exact lowercase whole-word token
 * list or as a regex. Each entry names:
 *   - `id`: stable key for telemetry + addendum deduplication.
 *   - `label`: human-readable string used in the retry addendum.
 *   - `pattern`: case-insensitive RegExp. Must anchor to word boundaries
 *     where appropriate to avoid substring false positives.
 *   - `example` (optional): a replacement hint emitted in the addendum.
 */
export interface ForbiddenPhrase {
  id: string;
  label: string;
  pattern: RegExp;
  example?: string;
}

/**
 * The authoritative banned-phrase registry. Drawn from
 * `server/prompts/_shared/forbidden-phrases.md` — any new entry here must
 * also appear in that fragment (and vice versa for new fragment entries
 * that should be mechanically enforced).
 *
 * Deliberately narrow: only include patterns confident enough to trigger
 * an LLM retry. Patterns that risk false positives (e.g. "robust" on a
 * technical noun) stay prompt-only.
 */
export const FORBIDDEN_PHRASES: readonly ForbiddenPhrase[] = [
  // Single-word AI-tell verbs. These almost always open a bullet or clause
  // and rarely carry source-specific content.
  {
    id: 'orchestrated',
    label: 'Orchestrated',
    pattern: /\borchestrated\b/i,
    example: 'Led / Delivered / Ran',
  },
  {
    id: 'spearheaded',
    label: 'Spearheaded',
    pattern: /\bspearheaded\b/i,
    example: 'Led / Drove / Launched',
  },
  {
    id: 'leveraged',
    label: 'Leveraged',
    pattern: /\bleveraged\b/i,
    example: 'Used / Applied / Built on',
  },

  // "Track record" family. "with a track record of scaling..." was the
  // highest-signal recurrence from the UX test.
  {
    id: 'track-record',
    label: 'track record',
    pattern: /\b(?:with|brings?)\s+(?:a\s+)?(?:proven\s+)?track\s+record(?:\s+of)?\b/i,
    example: 'Scaled X from $Y to $Z / Delivered N in outcome',
  },
  {
    id: 'proven-track-record',
    label: 'proven track record',
    pattern: /\bproven\s+track\s+record\b/i,
    example: 'Delivered / Scaled / Achieved (with specifics)',
  },

  // "Results-driven" / "passion for excellence" — textbook executive filler.
  {
    id: 'results-driven',
    label: 'results-driven',
    pattern: /\bresults[-\s]driven\b/i,
    example: 'Replace with a specific outcome.',
  },
  {
    id: 'passion-for-excellence',
    label: 'passion for excellence / passionate about',
    pattern: /\bpassion(?:ate)?\s+(?:for|about)\b/i,
    example: 'Name the specific discipline or outcome instead.',
  },
  {
    id: 'driving-operational-excellence',
    label: 'driving operational excellence',
    pattern: /\bdriving\s+operational\s+excellence\b/i,
    example: 'Delivered N% efficiency / Cut cycle time from X to Y',
  },

  // Framing patterns that read as filler.
  {
    id: 'setting-the-standard',
    label: 'setting the standard for / raising the bar',
    pattern: /\b(?:setting\s+the\s+standard\s+for|raising\s+the\s+bar)\b/i,
    example: 'Cite the specific metric that improved.',
  },
  {
    id: 'establishing-a-culture',
    label: 'establishing a culture of [anything]',
    pattern: /\b(?:establishing|build(?:ing)?|foster(?:ing)?|champion(?:ing)?)\s+(?:a\s+culture\s+of|an?\s+environment\s+of|a\s+mindset\s+of|a\s+foundation\s+for)\b/i,
    example: 'Name the concrete behavior change instead.',
  },

  // "Transformative / transformational" adjective.
  {
    id: 'transformative',
    label: 'transformative / transformational',
    pattern: /\btransformat(?:ive|ional)\b/i,
    example: 'Drop the adjective; the number or outcome does the work.',
  },

  // "Utilize / utilizing".
  {
    id: 'utilize',
    label: 'utilize / utilizing',
    pattern: /\butiliz(?:e|es|ed|ing)\b/i,
    example: 'Use "use" / "using".',
  },

  // "Thought leader / thought leadership".
  {
    id: 'thought-leader',
    label: 'thought leader / thought leadership',
    pattern: /\bthought\s+leader(?:ship)?\b/i,
    example: 'Cite the specific evidence (publications, speaking, cited work).',
  },

  // "Expanding brand reach / brand presence / market penetration".
  {
    id: 'brand-reach',
    label: 'expanding brand reach / brand presence',
    pattern: /\b(?:expand(?:ing)?\s+brand\s+(?:reach|presence)|market\s+penetration|regional\s+market\s+leadership)\b/i,
    example: 'Name the channel growth, market-share %, or revenue expansion.',
  },

  // "Translating X into actionable Y" — filler framing.
  {
    id: 'translating-actionable',
    label: 'translating [X] into actionable [Y]',
    pattern: /\btranslat(?:ing|ed)\s+[^.]{0,40}?\binto\s+actionable\b/i,
    example: 'Name the before/after artifact directly.',
  },
];

export interface ForbiddenPhraseScanResult {
  /** IDs of phrases that matched. Deduplicated, stable ordering. */
  foundIds: string[];
  /** Matching labels (for human-readable telemetry + addendum). */
  foundLabels: string[];
  /** The original text, preserved for debugging. */
  raw: string;
}

/**
 * Scan `text` for any banned phrase. Returns an empty result on clean text.
 * The matching is intentionally deterministic — regex-only, no context
 * disambiguation. False positives are acceptable; the retry is one-shot
 * and cheap compared to a reader-visible tell.
 */
export function detectForbiddenPhrases(text: string): ForbiddenPhraseScanResult {
  if (!text) return { foundIds: [], foundLabels: [], raw: text };

  const foundIds: string[] = [];
  const foundLabels: string[] = [];
  for (const phrase of FORBIDDEN_PHRASES) {
    if (phrase.pattern.test(text)) {
      foundIds.push(phrase.id);
      foundLabels.push(phrase.label);
    }
  }

  return { foundIds, foundLabels, raw: text };
}

/**
 * Build the system-prompt addendum used in the retry call. Names every
 * phrase the first call emitted and (where available) suggests a concrete
 * replacement framing.
 */
export function buildForbiddenPhraseRetryAddendum(foundIds: string[]): string {
  const details = FORBIDDEN_PHRASES
    .filter((p) => foundIds.includes(p.id))
    .map((p) => (p.example ? `  • "${p.label}" — ${p.example}` : `  • "${p.label}"`))
    .join('\n');

  return [
    'RETRY — forbidden-phrase violation. Your previous response contained banned editorial filler:',
    '',
    details,
    '',
    'Rewrite the offending prose without any of these phrases. Keep every source-grounded',
    'number, scope, and outcome intact — only change the connective / framing language.',
    '',
    'General rule: if deleting the phrase loses no information, it was padding. Replace the',
    'sentence with a specific verb + concrete outcome, or drop it entirely.',
    '',
    'Return the full JSON with the same structure; change only the offending prose.',
  ].join('\n');
}
