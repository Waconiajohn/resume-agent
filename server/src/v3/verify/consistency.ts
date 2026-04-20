// Intra-resume numeric consistency check.
//
// Motivating case (2026-04-19 user-read audit of fixture-12 joel-hough):
//   summary: "...a distribution center network spanning three facilities..."
//   selectedAccomplishments[1]: "...a network of four distribution centers and fourteen stores..."
//   selectedAccomplishments[2]: "...three distribution centers and fourteen stores..."
//
// Verify caught nothing — its checks compare the WRITTEN resume against the
// SOURCE resume bullet-by-bullet; they don't cross-check internal consistency
// within the written rewrite. A hiring manager reading these three adjacent
// entries notices the "3 vs 4" split immediately and stops trusting the
// resume.
//
// This check is mechanical (no LLM). It scans number+noun pairs in the
// summary and selectedAccomplishments, canonicalizes them via a curated
// scope-noun synonym map, and emits an error when the same canonical noun
// carries two or more distinct canonical numbers.
//
// Scope is deliberately narrow (summary + selectedAccomplishments only).
// Position bullets are NOT compared against each other or against the
// summary: different positions legitimately have different team sizes and
// counts, and including them would over-flag. The audit's motivating case
// is inside the tight scope.
//
// Runs alongside `checkAttributionMechanically` in verify/index.ts; its
// output merges into the same `issues` array and flows through the same
// translate sidecar.

import type { WrittenResume } from '../types.js';

// ─── Public API ────────────────────────────────────────────────────────────

export interface ConsistencyIssue {
  severity: 'error';
  section: string;
  message: string;
}

/**
 * Scan the WrittenResume's summary and selectedAccomplishments for
 * contradictory number+noun claims. Returns one issue per canonical noun
 * that carries ≥2 distinct numbers.
 *
 * Pure; no LLM calls, no side effects.
 */
export function checkIntraResumeConsistency(
  written: WrittenResume,
): ConsistencyIssue[] {
  const claims: ScopeClaim[] = [];
  // Summary — single text chunk.
  extractScopeClaims(written.summary, 'summary').forEach((c) => claims.push(c));
  // Selected accomplishments — one chunk per entry.
  written.selectedAccomplishments.forEach((text, idx) => {
    extractScopeClaims(text, `selectedAccomplishments[${idx}]`).forEach((c) =>
      claims.push(c),
    );
  });

  // Group by canonical noun → canonical number → sections where it appeared.
  const byNoun = new Map<
    string,
    Map<number, Array<{ section: string; text: string }>>
  >();
  for (const c of claims) {
    if (!byNoun.has(c.canonicalNoun)) byNoun.set(c.canonicalNoun, new Map());
    const byNumber = byNoun.get(c.canonicalNoun)!;
    if (!byNumber.has(c.canonicalNumber)) byNumber.set(c.canonicalNumber, []);
    byNumber.get(c.canonicalNumber)!.push({ section: c.section, text: c.text });
  }

  const issues: ConsistencyIssue[] = [];
  for (const [noun, byNumber] of byNoun) {
    if (byNumber.size < 2) continue;
    // Build a readable message citing each conflicting number and the
    // sections where it appeared.
    const sortedEntries = [...byNumber.entries()].sort(
      ([a], [b]) => a - b,
    );
    const parts = sortedEntries.map(([num, mentions]) => {
      const sectionList = mentions
        .map((m) => `${m.section} ("${m.text}")`)
        .join(', ');
      return `${num} in ${sectionList}`;
    });
    const firstSection = sortedEntries[0][1][0].section;
    issues.push({
      severity: 'error',
      section: firstSection,
      message: `Resume asserts inconsistent counts for '${noun}': ${parts.join('; ')}. Pick one and make the others match.`,
    });
  }

  return issues;
}

// ─── Number + noun extraction ──────────────────────────────────────────────

interface ScopeClaim {
  section: string;
  /** The raw `NUMBER UNIT` phrase as it appeared, for diagnostic quoting. */
  text: string;
  canonicalNoun: string;
  canonicalNumber: number;
}

// Regex: optional ~/</> prefix + (digits or word-number) + whitespace + noun
// word. Supports hyphenated nouns (distribution-centers) and the common
// "distribution center(s)" two-word form which we handle by looking at two
// successive tokens below.
const NUMBER_RE =
  /(?:~|>|<)?((?:\d{1,3}(?:,\d{3})+|\d+(?:\.\d+)?|one|two|three|four|five|six|seven|eight|nine|ten|eleven|twelve|thirteen|fourteen|fifteen|sixteen|seventeen|eighteen|nineteen|twenty|thirty|forty|fifty|sixty|seventy|eighty|ninety|hundred|thousand))\s+([a-zA-Z][a-zA-Z\-']*(?:\s+[a-zA-Z][a-zA-Z\-']*)?)/gi;

function extractScopeClaims(text: string, section: string): ScopeClaim[] {
  if (!text) return [];
  const out: ScopeClaim[] = [];
  // Regex produces consecutive matches that may overlap at token boundaries
  // when the second token is the start of another noun phrase; the /g flag's
  // lastIndex handling is sufficient here because we only match once per
  // number occurrence.
  for (const m of text.matchAll(NUMBER_RE)) {
    const rawNumber = m[1];
    const rawNoun = m[2];
    const canonicalNumber = canonicalizeNumberWord(rawNumber);
    if (canonicalNumber === null) continue;
    // Try the two-word noun form first ("distribution centers"), then fall
    // back to the single leading token ("facilities"). If neither canonicalizes,
    // skip — this scope noun isn't in the map.
    const canonicalNoun = canonicalizeNoun(rawNoun);
    if (canonicalNoun === null) {
      // Try just the first word of the noun, in case we captured a two-word
      // phrase that isn't a scope pair (e.g. "three month"+"period").
      const firstWord = rawNoun.split(/\s+/)[0];
      const soloCanonical = canonicalizeNoun(firstWord);
      if (soloCanonical === null) continue;
      out.push({
        section,
        text: `${rawNumber} ${firstWord}`,
        canonicalNoun: soloCanonical,
        canonicalNumber,
      });
      continue;
    }
    out.push({
      section,
      text: `${rawNumber} ${rawNoun}`,
      canonicalNoun,
      canonicalNumber,
    });
  }
  return out;
}

// ─── Canonicalization ──────────────────────────────────────────────────────

/**
 * Scope-noun synonym map. Keys are the canonical bucket name; values are
 * lowercase noun forms (singular and plural) that map to that bucket.
 *
 * Curated conservatively — only nouns a hiring manager would instinctively
 * read as "the same kind of thing." Adding an entry here changes how
 * contradictions are detected; expand carefully.
 *
 * If a number+noun pair's noun isn't in any bucket, the check silently
 * drops it (no over-flagging on unfamiliar scope nouns).
 */
const SCOPE_NOUN_MAP: Record<string, string[]> = {
  // 2026-04-19: "site" / "sites" deliberately NOT in this bucket. "Sites"
  // is often used as an aggregate count ("18 sites" = 14 stores + 4 DCs +
  // office) while "distribution centers" is a specific subset. Keeping
  // them in the same bucket produced a false positive on fixture-12:
  // summary "18 sites" vs bullet "four distribution centers" — both
  // legitimate counts of different scopes. The check now skips "site(s)".
  location: [
    'facility',
    'facilities',
    'dc',
    'dcs',
    'distribution center',
    'distribution centers',
    'warehouse',
    'warehouses',
    'location',
    'locations',
    'office',
    'offices',
  ],
  store: ['store', 'stores', 'branch', 'branches', 'outlet', 'outlets', 'shop', 'shops'],
  headcount: [
    'staff',
    'employee',
    'employees',
    'team member',
    'team members',
    'fte',
    'ftes',
    'headcount',
    'direct report',
    'direct reports',
    'person',
    'people',
  ],
  state: ['state', 'states', 'region', 'regions', 'country', 'countries', 'territory', 'territories'],
  customer: ['customer', 'customers', 'client', 'clients', 'account', 'accounts'],
  product: ['product', 'products', 'sku', 'skus', 'product line', 'product lines', 'line', 'lines'],
};

// Build the reverse lookup once at module load.
const NOUN_LOOKUP = (() => {
  const m = new Map<string, string>();
  for (const [bucket, variants] of Object.entries(SCOPE_NOUN_MAP)) {
    for (const v of variants) m.set(v.toLowerCase(), bucket);
  }
  return m;
})();

function canonicalizeNoun(raw: string): string | null {
  const key = raw.trim().toLowerCase();
  if (NOUN_LOOKUP.has(key)) return NOUN_LOOKUP.get(key)!;
  return null;
}

/**
 * Number-word canonicalizer. Handles:
 *   - plain digits ("3", "85", "12.5")
 *   - digit with commas ("1,300")
 *   - word numbers 1-20
 *   - round multipliers ("hundred" → 100, "thousand" → 1000)
 *
 * Returns null for anything else (including "dozen" — rare on resumes and
 * ambiguous: 12 or ~12?).
 */
function canonicalizeNumberWord(raw: string): number | null {
  const s = raw.trim().toLowerCase();
  // Digit form, possibly with commas.
  const noCommas = s.replace(/,/g, '');
  if (/^\d+(?:\.\d+)?$/.test(noCommas)) {
    const n = Number(noCommas);
    return Number.isFinite(n) ? n : null;
  }
  const wordMap: Record<string, number> = {
    one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7,
    eight: 8, nine: 9, ten: 10, eleven: 11, twelve: 12, thirteen: 13,
    fourteen: 14, fifteen: 15, sixteen: 16, seventeen: 17,
    eighteen: 18, nineteen: 19, twenty: 20, thirty: 30, forty: 40,
    fifty: 50, sixty: 60, seventy: 70, eighty: 80, ninety: 90,
    hundred: 100, thousand: 1000,
  };
  if (s in wordMap) return wordMap[s];
  return null;
}
