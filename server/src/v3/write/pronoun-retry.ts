// Post-write pronoun detection + one-shot retry helper.
// Fix 4 (2026-04-19) — handles DeepSeek pronoun drift without prompt
// overhaul. The write-summary and write-accomplishments prompts already
// include {{shared:pronoun-policy}} which forbids personal pronouns, but
// models occasionally emit them anyway (e.g. the HR-exec "She directed"
// and Jessica Boquist "her platform" regressions). This helper:
//
//   1. Scans the output text for a small, auditable banned-pronoun set.
//   2. If any are found, re-invokes the LLM ONCE with a system-message
//      addendum that names the specific pronouns found and instructs a
//      pronoun-free rewrite.
//   3. If the retry output still contains pronouns, emits the result
//      anyway and logs a telemetry counter so operators can catch
//      sustained regressions.
//
// Mechanical, regex-based. No LLM judgment about whether a word is a
// pronoun — if it's in BANNED_PRONOUNS, it's banned.

/**
 * Personal pronouns that refer to the candidate. This list is an exact
 * mirror of verify.v1's Check 2 and the shared pronoun-policy fragment's
 * "forbidden tokens" list — any drift between this set and those two
 * authoritative lists is a bug.
 */
export const BANNED_PRONOUNS = new Set<string>([
  // Third-person feminine
  'she', 'her', 'hers', 'herself',
  // Third-person masculine
  'he', 'him', 'his', 'himself',
  // Third-person plural (when referring to a single candidate)
  'they', 'them', 'their', 'theirs', 'themselves',
  // First-person
  'i', 'me', 'my', 'mine', 'myself',
  'we', 'us', 'our', 'ours', 'ourselves',
]);

/**
 * Relative pronoun "who" is handled specially. It's a legitimate relative
 * pronoun in many contexts ("customers who purchased the product") but a
 * banned framing device when it introduces the candidate at the start of
 * a sentence ("Multi-site consolidator who transforms complex networks").
 *
 * Heuristic: flag "who" only when it appears within the first 80 chars of
 * a sentence-like unit, AND nothing in the preceding text looks like a
 * plural-noun-phrase referent (like "customers", "stakeholders", "teams")
 * that would make "who" a legitimate restrictive clause.
 *
 * This keeps "Operations executive who consolidates..." (framing, flagged)
 * separate from "teams who reported up..." (restrictive clause, fine).
 *
 * Still heuristic — if this becomes noisy in practice, we drop it and
 * rely on verify's Check 2 for pronoun enforcement instead of retry.
 */
const LEGITIMATE_WHO_REFERENTS = new Set<string>([
  'customers', 'customer', 'clients', 'client',
  'teams', 'team',
  'stakeholders', 'stakeholder',
  'people', 'employees', 'employee',
  'leaders', 'managers', 'directors',
  'organizations', 'organization', 'groups', 'group',
  'vendors', 'vendor', 'partners', 'partner',
  'engineers', 'designers', 'analysts', 'architects',
  'candidates', 'candidate', 'users', 'user',
  'agents', 'agent',
]);

/**
 * Result of a pronoun scan.
 *  - `found`: distinct banned pronouns that appeared in the text.
 *  - `raw`: the original text (for downstream retry nudge construction).
 */
export interface PronounScanResult {
  found: string[];
  raw: string;
}

/**
 * Scan `text` for banned pronouns. Whole-word, case-insensitive. Returns a
 * deduplicated list of offenders (lowercase). Empty list means clean.
 */
export function detectBannedPronouns(text: string): PronounScanResult {
  const found = new Set<string>();
  if (!text) return { found: [], raw: text };

  // 1. Whole-word match for the explicit personal-pronoun set.
  const words = text.toLowerCase().match(/\b[a-z']+\b/g) ?? [];
  for (const w of words) {
    if (BANNED_PRONOUNS.has(w)) found.add(w);
  }

  // 2. "who" as a framing device — flag only when it appears in the first
  // 80 chars of a sentence AND isn't preceded by a plural-noun referent.
  const sentences = text.split(/(?<=[.!?])\s+/);
  for (const s of sentences) {
    const head = s.slice(0, 80);
    const whoMatch = /\b[Ww]ho\b/.exec(head);
    if (!whoMatch) continue;
    // What word comes immediately before "who"?
    const preceding = head.slice(0, whoMatch.index).trim();
    const precedingWord = preceding.split(/\s+/).pop()?.toLowerCase().replace(/[,.!?—–-]$/, '') ?? '';
    if (LEGITIMATE_WHO_REFERENTS.has(precedingWord)) continue;
    found.add('who');
  }

  return { found: [...found].sort(), raw: text };
}

/**
 * Build the system-prompt addendum for a pronoun-retry. Names the specific
 * pronouns the first call emitted so the model can fix them specifically.
 */
export function buildPronounRetryAddendum(found: string[]): string {
  const list = found.map((p) => `"${p}"`).join(', ');
  return [
    `RETRY — pronoun violation. Your previous response contained banned personal pronouns: ${list}.`,
    '',
    'Rewrite without any of these pronouns. Use active voice with the candidate as implicit subject.',
    'For framing sentences, use an em-dash, a colon, or a sentence break instead of a relative pronoun:',
    '  ✓ "Multi-site consolidator — transforms complex networks into streamlined operations."',
    '  ✗ "Multi-site consolidator who transforms complex networks..."',
    '',
    'Return the full JSON with the same structure; change only the offending prose.',
  ].join('\n');
}
