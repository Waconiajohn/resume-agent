// Mechanical substring attribution check.
//
// Two layers of attribution discipline:
//
//   checkAttributionMechanically  — Phase 4 Intervention 2: checks every
//     is_new=true bullet in WrittenResume against the source position's
//     bullets/scope/title/crossRoleHighlights. Used by verify as a pre-check.
//
//   checkStrategizeAttribution    — Phase 4.6: checks every entry in
//     Strategy.emphasizedAccomplishments.summary against the WHOLE source
//     resume (any position's bullets + scope + title + crossRoleHighlights).
//     Runs INSIDE strategize's pipeline AFTER the LLM call; if any summary
//     contains unsourced claim tokens, strategize retries once with the
//     offending phrases flagged. This stops DeepSeek strategize from
//     embellishing summaries that downstream write-position would faithfully
//     inherit as fabrications (the Phase 4.5 fixture-09 regression).
//
// This is NOT a guardrail. It does not modify output. It produces structured
// data that the calling stage uses either (a) for verify's LLM pre-check or
// (b) as retry context for strategize. In both cases the stage's LLM
// remains the judge; the check merely gives it concrete evidence.
//
// See docs/v3-rebuild/reports/phase-4.5-validation.md for the Phase 4.5
// regression that motivated the strategize variant.

import type {
  Position,
  Strategy,
  StructuredResume,
  WrittenResume,
} from '../types.js';

// -----------------------------------------------------------------------------
// Public API — written-bullet attribution (Phase 4 I2)
// -----------------------------------------------------------------------------

/**
 * Token kinds produced by the claim-token extractor. Each kind has a
 * different matching contract:
 *
 *   - `precise`  — substring match against the normalized source haystack.
 *                  Used for dollar amounts, percentages, number+unit tuples,
 *                  quoted strings, proper-noun phrases, acronyms. These are
 *                  atomic claim units where exact match matters ("$40M" vs
 *                  "$45M" is a real difference).
 *
 *   - `frame`    — word-bag match: the token's content words (excluding
 *                  stopwords) must ALL appear in the source haystack,
 *                  order-independent. Used for "by/through [verb]-ing X"
 *                  constructs where the rewrite may reorder or drop
 *                  function words without semantic change. Phase 4.7
 *                  addition — substring-matching frame phrases produced
 *                  false positives (e.g. "by promoting product performance"
 *                  not matching source "by promoting the performance of
 *                  products"); word-bag matching accepts that legitimate
 *                  paraphrase.
 */
export type ClaimTokenKind = 'precise' | 'frame';

export interface ClaimToken {
  kind: ClaimTokenKind;
  text: string;
}

export interface BulletAttributionCheck {
  /** Path in the WrittenResume — e.g. "positions[0].bullets[2]". */
  path: string;
  /** The rewritten bullet text being checked. */
  text: string;
  /** The value of `bullet.source` as recorded by the writer (hint; may be any string). */
  sourceHint: string | null;
  /** Whether every extracted claim token was found in the relevant source scope. */
  verified: boolean;
  /** Tokens that were extracted from the rewrite but could not be found in source. */
  missingTokens: string[];
  /** Tokens that WERE found (for diagnostic). */
  foundTokens: string[];
}

export interface AttributionResult {
  /** Per-bullet check results for every WrittenResume position bullet. */
  bullets: BulletAttributionCheck[];
  /** Summary counts — useful for logging / verify prompt. */
  summary: {
    totalBullets: number;
    verifiedCount: number;
    unverifiedCount: number;
    totalMissingTokens: number;
  };
}

/**
 * Run the mechanical attribution check against a WrittenResume and its
 * StructuredResume source. No LLM calls; pure string operations.
 */
export function checkAttributionMechanically(
  written: WrittenResume,
  source: StructuredResume,
): AttributionResult {
  const bullets: BulletAttributionCheck[] = [];

  for (const wp of written.positions) {
    const sourcePos = source.positions[wp.positionIndex];
    if (!sourcePos) {
      for (let i = 0; i < wp.bullets.length; i++) {
        const b = wp.bullets[i];
        if (!b.is_new) continue;
        bullets.push({
          path: `positions[${wp.positionIndex}].bullets[${i}]`,
          text: b.text,
          sourceHint: b.source ?? null,
          verified: false,
          missingTokens: extractClaimTokensTyped(b.text).map((t) => t.text),
          foundTokens: [],
        });
      }
      continue;
    }
    for (let i = 0; i < wp.bullets.length; i++) {
      const b = wp.bullets[i];
      if (!b.is_new) continue;
      const tokens = extractClaimTokensTyped(b.text);
      const haystack = buildPositionHaystack(sourcePos, source);
      const missing: string[] = [];
      const found: string[] = [];
      for (const tok of tokens) {
        if (haystackContainsToken(haystack, tok)) {
          found.push(tok.text);
        } else {
          missing.push(tok.text);
        }
      }
      bullets.push({
        path: `positions[${wp.positionIndex}].bullets[${i}]`,
        text: b.text,
        sourceHint: b.source ?? null,
        verified: missing.length === 0,
        missingTokens: missing,
        foundTokens: found,
      });
    }
  }

  const verifiedCount = bullets.filter((b) => b.verified).length;
  return {
    bullets,
    summary: {
      totalBullets: bullets.length,
      verifiedCount,
      unverifiedCount: bullets.length - verifiedCount,
      totalMissingTokens: bullets.reduce((s, b) => s + b.missingTokens.length, 0),
    },
  };
}

// -----------------------------------------------------------------------------
// Public API — strategize-summary attribution (Phase 4.6)
// -----------------------------------------------------------------------------

export interface SummaryAttributionCheck {
  /** Index into Strategy.emphasizedAccomplishments. */
  summaryIndex: number;
  /** The summary text being checked. */
  text: string;
  /** positionIndex this summary references (null for cross-role). */
  positionIndex: number | null;
  /** Whether every extracted claim token appears anywhere in source. */
  verified: boolean;
  /** Tokens extracted from the summary but not found in source. */
  missingTokens: string[];
  /** Tokens found (diagnostic). */
  foundTokens: string[];
}

/**
 * Per-field attribution check result (added 2026-04-19 for Fix 3).
 * Used for positioningFrame and targetDisciplinePhrase, which are short
 * free-form phrases rather than structured claims — so this check uses
 * word-bag matching (each content word must appear somewhere in the
 * resume haystack) rather than substring-matching individual tokens.
 */
export interface FieldAttributionCheck {
  field: 'positioningFrame' | 'targetDisciplinePhrase';
  text: string;
  verified: boolean;
  /** Content words (stopwords dropped) that were NOT found in the haystack. */
  missingWords: string[];
}

export interface StrategizeAttributionResult {
  summaries: SummaryAttributionCheck[];
  fields: FieldAttributionCheck[];
  summary: {
    totalSummaries: number;
    verifiedCount: number;
    unverifiedCount: number;
    totalMissingTokens: number;
    totalFields: number;
    fieldsVerifiedCount: number;
    fieldsUnverifiedCount: number;
  };
}

/**
 * Mechanical attribution check for Strategy.emphasizedAccomplishments[].summary.
 * Claim tokens (dollar amounts, percentages, number+unit phrases, proper
 * nouns, acronyms) are extracted from each summary and checked for substring
 * presence in the candidate resume's ENTIRE source text — any position's
 * bullets/scope/title plus crossRoleHighlights.
 *
 * The haystack is resume-wide (not position-scoped) because strategize can
 * legitimately pull from any source bullet regardless of positionIndex; it
 * summarizes accomplishments across the candidate's career.
 *
 * Used by strategize/index.ts for the one-retry attribution loop. If any
 * summary is unverified, strategize retries once with the missing tokens
 * fed back. See docs/v3-rebuild/reports/phase-4.5-validation.md for the
 * fixture-09 regression that motivated this.
 */
export function checkStrategizeAttribution(
  strategy: Strategy,
  source: StructuredResume,
): StrategizeAttributionResult {
  const haystack = buildResumeHaystack(source);
  const summaries: SummaryAttributionCheck[] = [];

  for (let i = 0; i < strategy.emphasizedAccomplishments.length; i++) {
    const e = strategy.emphasizedAccomplishments[i];
    const tokens = extractClaimTokensTyped(e.summary);
    const missing: string[] = [];
    const found: string[] = [];
    for (const tok of tokens) {
      if (haystackContainsToken(haystack, tok)) {
        found.push(tok.text);
      } else {
        missing.push(tok.text);
      }
    }
    summaries.push({
      summaryIndex: i,
      text: e.summary,
      positionIndex: e.positionIndex,
      verified: missing.length === 0,
      missingTokens: missing,
      foundTokens: found,
    });
  }

  // Fix 3 (2026-04-19): also validate positioningFrame and targetDisciplinePhrase
  // against the source resume. These are short free-form phrases (2-5 words
  // each) that the JD can legitimately influence, but the industry/discipline/
  // scope qualifiers they use must be present somewhere in the source — not
  // invented from the JD alone. Word-bag match: every content word in the
  // field must appear in the haystack (substring inclusion so simple plural/
  // suffix variants match).
  const fields: FieldAttributionCheck[] = [];
  fields.push(
    checkPhraseAgainstHaystack(
      'positioningFrame',
      strategy.positioningFrame ?? '',
      haystack,
    ),
  );
  fields.push(
    checkPhraseAgainstHaystack(
      'targetDisciplinePhrase',
      strategy.targetDisciplinePhrase ?? '',
      haystack,
    ),
  );

  const verifiedCount = summaries.filter((s) => s.verified).length;
  const fieldsVerifiedCount = fields.filter((f) => f.verified).length;
  return {
    summaries,
    fields,
    summary: {
      totalSummaries: summaries.length,
      verifiedCount,
      unverifiedCount: summaries.length - verifiedCount,
      totalMissingTokens: summaries.reduce((s, r) => s + r.missingTokens.length, 0),
      totalFields: fields.length,
      fieldsVerifiedCount,
      fieldsUnverifiedCount: fields.length - fieldsVerifiedCount,
    },
  };
}

/**
 * Role-shape vocabulary that appears in positioningFrame/
 * targetDisciplinePhrase without being an industry, scope, or discipline
 * qualifier. These words are acceptable in a frame even when absent from
 * the source, because they describe role shape (every resume has some
 * "leader" or "manager" role even if the specific word isn't in source
 * prose). Only industry/scope/discipline qualifiers are subject to
 * grounding per Rule 2b and Rule 5b of strategize.v1.
 */
const ROLE_SHAPE_STOPWORDS = new Set<string>([
  'leader', 'leaders', 'leadership',
  'specialist', 'specialists',
  'expert', 'experts',
  'builder', 'builders',
  'operator', 'operators',
  'practitioner', 'practitioners',
  'manager', 'managers',
  'director', 'directors',
  'architect', 'architects',
  'consultant', 'consultants',
  'executive', 'executives',
  'advisor', 'advisors',
  'strategist', 'strategists',
  'scaler', 'scalers',
  'consolidator', 'consolidators',
  'owner', 'owners',
  'head', 'lead',
  'vp', 'svp', 'evp',
  'chief', 'officer',
  'president', 'ceo', 'cfo', 'coo', 'cto', 'cio',
  'senior', 'principal', 'staff',
]);

/**
 * Check whether every industry/scope/discipline content word in `phrase`
 * appears in `haystack`. Used by checkStrategizeAttribution to validate
 * positioningFrame and targetDisciplinePhrase per strategize.v1 Rule 2b /
 * Rule 5b.
 *
 * Role-shape vocabulary (leader, specialist, manager, etc.) is dropped
 * before matching — those are acceptable in a frame even when absent from
 * source prose. The rule targets industry/scope/discipline qualifiers
 * like "hospitality", "fintech", "multi-property" — the slots where JD
 * language can leak into a resume the source doesn't back up.
 *
 * Empty phrase → verified true (nothing to check).
 */
function checkPhraseAgainstHaystack(
  fieldName: 'positioningFrame' | 'targetDisciplinePhrase',
  phrase: string,
  haystack: string,
): FieldAttributionCheck {
  if (!phrase.trim()) {
    return { field: fieldName, text: phrase, verified: true, missingWords: [] };
  }
  // Filter: frame content words minus role-shape vocabulary.
  const words = frameContentWords(phrase).filter((w) => !ROLE_SHAPE_STOPWORDS.has(w));
  const missingWords: string[] = [];
  for (const w of words) {
    if (!haystack.includes(w)) missingWords.push(w);
  }
  return {
    field: fieldName,
    text: phrase,
    verified: missingWords.length === 0,
    missingWords,
  };
}

// -----------------------------------------------------------------------------
// Claim-token extraction (mechanical, heuristic)
// -----------------------------------------------------------------------------

/**
 * Extract typed claim tokens from any bullet-like text. Public API for
 * callers that want the kind distinction (substring vs word-bag matching).
 *
 * Kinds:
 *   - `precise`: dollar amounts, percentages, number+unit tuples, quoted
 *     strings, proper-noun phrases, acronyms. Matched by substring in source.
 *   - `frame`:   "by/through [verb]-ing X" constructs. Matched by word-bag
 *     (content words must all appear in source, order-independent).
 *
 * The distinction exists because frame phrases in a rewrite are often
 * paraphrases of a matching source phrase with different function words
 * ("by promoting product performance" vs source "by promoting the performance
 * of products"). Substring matching fails; word-bag matching accepts these
 * as faithful.
 */
export function extractClaimTokensTyped(text: string): ClaimToken[] {
  const precise = new Set<string>();
  const frame = new Set<string>();

  // 1. Dollar amounts
  const dollarRe = /\$[\d.,]+\s*(?:[KMBkmb]|million|billion|thousand)?/g;
  for (const m of text.matchAll(dollarRe)) precise.add(m[0].trim());

  // 2. Percentages
  const pctRe = /\d+(?:\.\d+)?\s*%/g;
  for (const m of text.matchAll(pctRe)) precise.add(m[0].trim());
  const pctWordRe = /\d+(?:\.\d+)?\s*percent\b/gi;
  for (const m of text.matchAll(pctWordRe)) precise.add(m[0].trim());

  // 3. Number + unit tuples (number + one immediate noun)
  const numUnitRe = /(?:~|>|<)?\d+(?:[.,]\d+)?[KMB]?\s+[A-Za-z][A-Za-z\-/]*/g;
  for (const m of text.matchAll(numUnitRe)) {
    const cleaned = m[0].trim();
    if (/^\d+\s+(?:year|month|week|day|hour)s?\b/i.test(cleaned)) continue;
    if (/^\d+[KMB]?\s+(?:in|to|of|and|the|at|on|for|with|by|a|an)$/i.test(cleaned)) continue;
    precise.add(cleaned);
  }

  // 4. Quoted strings
  const quoteRe = /["""']([^"""']{3,})["""']/g;
  for (const m of text.matchAll(quoteRe)) precise.add(m[1].trim());

  // 5. Proper-noun phrases (2+ consecutive capitalized words)
  const properRe = /\b([A-Z][a-zA-Z]+(?:\s+(?:[A-Z][a-zA-Z]+|of|the|and|&)\s+)*(?:\s+[A-Z][a-zA-Z]+)+)\b/g;
  for (const m of text.matchAll(properRe)) {
    const p = m[1].trim();
    if (p.length < 6) continue;
    precise.add(p);
  }

  // 6. ALL-CAPS or CapsMix acronyms
  const acroRe = /\b([A-Z]{2,}(?:[\/&][A-Z]+)?s?|[A-Z]+[a-z]*[A-Z]+(?:[\/&][A-Z]+)?)\b/g;
  for (const m of text.matchAll(acroRe)) {
    const a = m[1];
    if (a.length < 2) continue;
    precise.add(a);
  }

  // 7. "by/through [verb]-ing X" framing phrases — FRAME kind (word-bag match).
  //    Phase 4.6: these were added to catch DeepSeek strategize embellishments.
  //    Phase 4.7: matched via word-bag rather than substring, because source
  //    phrases can reorder function words ("by promoting the performance of
  //    products" vs "by promoting product performance"). Substring match
  //    failed; word-bag match accepts faithful paraphrases while still
  //    catching genuine fabrications (different content words).
  const framingRe = /\b(?:by|through)\s+[a-z]+ing\s+[a-z][a-z\s-]{2,40}/gi;
  for (const m of text.matchAll(framingRe)) {
    const phrase = m[0].trim();
    if (phrase.length < 15) continue;
    const cut = phrase.split(/[,.;]/)[0].trim();
    if (cut.length >= 15) frame.add(cut);
  }

  const out: ClaimToken[] = [];
  for (const t of precise) out.push({ kind: 'precise', text: t });
  for (const t of frame) out.push({ kind: 'frame', text: t });
  return out;
}

/**
 * Back-compat wrapper: returns just the token text strings (any kind).
 * Existing callers that don't care about kind distinction can keep using
 * this. Internal callers use the typed variant and dispatch matching by kind.
 */
export function extractClaimTokens(text: string): string[] {
  return extractClaimTokensTyped(text).map((t) => t.text);
}

// -----------------------------------------------------------------------------
// Word-bag matching for frame-phrase tokens
// -----------------------------------------------------------------------------

/**
 * Stopwords dropped during word-bag matching. Function words that commonly
 * appear in "by X-ing Y" constructs without carrying the claim's content.
 * We keep this list short; if in doubt, prefer to include the word in the
 * bag so that different content words ("reliability" vs "performance") are
 * still distinguishable.
 */
const FRAME_STOPWORDS = new Set<string>([
  'by', 'through', 'the', 'a', 'an', 'of', 'and', 'to', 'for', 'with',
  'in', 'on', 'at', 'across', 'via', 'into', 'from', 'up', 'over', 'around',
]);

function frameContentWords(phrase: string): string[] {
  return normalize(phrase)
    .split(/\s+/)
    .filter((w) => w.length > 0)
    .filter((w) => !FRAME_STOPWORDS.has(w));
}

/**
 * Word-bag match for a frame phrase against the source haystack.
 * Returns true iff every content word in `phrase` appears somewhere in
 * `haystack` (normalized, order-independent).
 *
 * Example:
 *   haystack  = "by promoting the performance of products"
 *   phrase    = "by promoting product performance"
 *   content   = ["promoting", "product", "performance"]  (stopwords dropped)
 *   haystack contains each → true
 *
 * Example of a real fabrication correctly rejected:
 *   haystack  = "promoting product reliability"
 *   phrase    = "by developing pricing strategies"
 *   content   = ["developing", "pricing", "strategies"]
 *   haystack missing "developing", "pricing", "strategies" → false
 */
function haystackContainsFramePhrase(haystack: string, phrase: string): boolean {
  const words = frameContentWords(phrase);
  if (words.length === 0) return true;
  for (const w of words) {
    // Substring match (not word-boundary) so "product" matches "products"
    // and "performance" matches "performances". This accepts simple
    // singular/plural and suffix variants without a full stemmer. The
    // haystack is normalized (lowercase, whitespace-collapsed, dashes
    // unified) at construction time.
    if (!haystack.includes(w)) return false;
  }
  return true;
}

/**
 * Kind-aware check — substring for precise tokens, word-bag for frame tokens.
 */
function haystackContainsToken(haystack: string, token: ClaimToken): boolean {
  if (token.kind === 'frame') {
    return haystackContainsFramePhrase(haystack, token.text);
  }
  return haystackContains(haystack, token.text);
}

// -----------------------------------------------------------------------------
// Haystack construction
// -----------------------------------------------------------------------------

/**
 * Position-scoped haystack: every source field that a rewritten bullet
 * might legitimately cite. Listed explicitly so audits can see coverage.
 *
 * Included (phase-A-fix expansion):
 *   - position.title
 *   - position.company            (added 2026-04-19 — was missing)
 *   - position.dates.raw           (added 2026-04-19 — was missing)
 *   - position.location
 *   - position.scope
 *   - position.bullets[].text
 *   - source.discipline            (added 2026-04-19 — resume-level)
 *   - source.crossRoleHighlights[].text
 *   - source.customSections[].title + .entries[].text   (added 2026-04-19)
 *
 * Deliberately NOT included: source.education, source.certifications,
 * source.skills. Bullet claims rarely pull from these; adding them risks
 * false-positive matches on unrelated material (e.g. a skill "SailPoint"
 * matching a bullet claim about a SailPoint deployment that actually
 * belongs to a different position).
 */
function buildPositionHaystack(sourcePos: Position, source: StructuredResume): string {
  const parts: string[] = [];
  parts.push(sourcePos.title ?? '');
  parts.push(sourcePos.company ?? '');
  if (sourcePos.dates?.raw) parts.push(sourcePos.dates.raw);
  if (sourcePos.location) parts.push(sourcePos.location);
  if (sourcePos.scope) parts.push(sourcePos.scope);
  for (const b of sourcePos.bullets) parts.push(b.text);
  parts.push(source.discipline ?? '');
  for (const h of source.crossRoleHighlights) parts.push(h.text);
  for (const cs of source.customSections) {
    parts.push(cs.title);
    for (const e of cs.entries) parts.push(e.text);
  }
  return normalize(parts.join('\n'));
}

/**
 * Resume-wide haystack: every position's title/scope/bullets + all
 * crossRoleHighlights + discipline. Used by checkStrategizeAttribution —
 * strategize summarizes across the whole career, not per-position.
 */
function buildResumeHaystack(source: StructuredResume): string {
  const parts: string[] = [];
  parts.push(source.discipline);
  for (const p of source.positions) {
    parts.push(p.title ?? '');
    if (p.scope) parts.push(p.scope);
    if (p.location) parts.push(p.location);
    if (p.company) parts.push(p.company);
    for (const b of p.bullets) parts.push(b.text);
  }
  for (const h of source.crossRoleHighlights) parts.push(h.text);
  // customSections count as source material — executives list board seats,
  // patents, etc. that strategize can legitimately cite.
  for (const cs of source.customSections) {
    parts.push(cs.title);
    for (const e of cs.entries) parts.push(e.text);
  }
  return normalize(parts.join('\n'));
}

function haystackContains(haystack: string, token: string): boolean {
  const needle = normalize(token);
  if (needle.length === 0) return true;
  if (haystack.includes(needle)) return true;
  // Fallback for number+unit tokens (e.g. "742 staff"): accept the match
  // if the number and the unit both appear within a small window of each
  // other, in either order. This handles source phrasings like
  // "staff of 742" or "742-person staff" that substring-match can't see.
  return numberUnitMatchLoose(haystack, needle);
}

/**
 * Regex-escape for user-supplied string going into a RegExp.
 */
function escapeRegExp(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/**
 * Loose match for a `NUMBER UNIT` shaped token (e.g. "742 staff",
 * "85 people", "15 trains"). Returns true iff the number and unit both
 * appear in the haystack within 40 characters of each other, in either
 * order. Returns false for tokens that don't match the number+unit shape.
 *
 * Motivating case: written bullet "742 staff" vs source scope "staff of
 * 742". Substring match fails (order differs); this fallback accepts
 * because "staff" is within 40 chars of "742" in the haystack.
 *
 * False-positive cost: if the resume mentions "742 stores" somewhere AND
 * "staff" somewhere else, this would accept "742 staff" as sourced. The
 * 40-char proximity window keeps that risk bounded — the number and unit
 * must cooccur in the same clause, not anywhere in the resume.
 */
function numberUnitMatchLoose(haystack: string, token: string): boolean {
  const m = /^((?:~|>|<)?\d+(?:[.,]?\d+)*)\s+([a-z][a-z\-/]{1,40})$/.exec(token);
  if (!m) return false;
  const num = m[1];
  const unit = m[2];
  const escNum = escapeRegExp(num);
  const escUnit = escapeRegExp(unit);
  // "\b" around the number catches edges around punctuation/space; around
  // the unit we use a letter-boundary pattern that accepts plural forms.
  const re = new RegExp(
    `(?:\\b${escNum}\\b[^a-zA-Z0-9]{0,40}${escUnit}|` +
      `\\b${escUnit}\\b[^0-9]{0,40}\\b${escNum}\\b)`,
    'i',
  );
  return re.test(haystack);
}

/**
 * Normalize whitespace, case, dash types, AND numeric formatting.
 *
 * The three cosmetic steps (dash unification, whitespace collapse,
 * lowercase) were here before Phase A. The number canonicalization below
 * is new (2026-04-19) — it unifies the surface-form variations a resume
 * writer legitimately introduces into the matcher's single form:
 *   - commas removed from numbers: "6,300" → "6300"
 *   - "percent" word normalized to "%": "22 percent" → "22%"
 *   - space inserted before unit words: "$1.3million" → "$1.3 million"
 *   - letter-unit abbreviations expanded: "$40m" → "$40 million",
 *     "$500k" → "$500 thousand", "$2b" → "$2 billion" (case-insensitive
 *     because lowercase runs first). Only applied when the letter is
 *     immediately attached to or space-separated from a number, to
 *     avoid collisions with unrelated words.
 *
 * After normalize(), "$1.3 million", "$1.3million", and "$1.3M" all
 * reduce to "$1.3 million"; "6,300 tons" and "6300 tons" both reduce to
 * "6300 tons"; "22%" and "22 percent" both reduce to "22%".
 */
function normalize(s: string): string {
  let out = s
    .replace(/[\u2010-\u2014\u2212\u2013]/g, '-')
    .replace(/\s+/g, ' ')
    .toLowerCase()
    .trim();
  out = canonicalizeNumbers(out);
  return out;
}

/**
 * Number-format canonicalization. Called by normalize(). Separate so it
 * can be unit-tested in isolation.
 *
 * Order matters:
 *   1. Remove commas INSIDE numbers (1,000 / 1,000,000 / 6,300).
 *   2. Normalize the word "percent" to "%".
 *   3. Insert a space between a number and an attached unit word
 *      (million/billion/thousand) — "$1.3million" becomes "$1.3 million".
 *   4. Expand letter-unit abbreviations (m/k/b) adjacent to a number
 *      into their long forms — "$40m" becomes "$40 million". Only
 *      applied when touching the number (no word boundary mid-abbrev)
 *      so unrelated "m" / "k" / "b" words are not altered.
 *
 * Idempotent: running twice on the same input produces the same output.
 */
export function canonicalizeNumbers(input: string): string {
  let s = input;
  // 1. Remove commas from inside multi-digit numbers. Apply repeatedly to
  //    handle 1,000,000 (three chunks).
  for (let i = 0; i < 4; i++) {
    const next = s.replace(/(\d),(\d)/g, '$1$2');
    if (next === s) break;
    s = next;
  }
  // 2. "percent" word → "%".
  s = s.replace(/(\d+(?:\.\d+)?)\s*percent\b/g, '$1%');
  // 3. Insert space between number and attached unit word.
  s = s.replace(/(\d+(?:\.\d+)?)(million|billion|thousand)\b/g, '$1 $2');
  // 4. Expand letter abbreviations m/k/b immediately attached to a number.
  //    Example: "$40m" → "$40 million"; "40m" → "40 million".
  //    The leading \B pattern would reject mid-word, but \b on the letter's
  //    right is what we actually want — so require the letter to be followed
  //    by a word boundary (end of word).
  s = s.replace(/(\d+(?:\.\d+)?)m\b/g, '$1 million');
  s = s.replace(/(\d+(?:\.\d+)?)k\b/g, '$1 thousand');
  s = s.replace(/(\d+(?:\.\d+)?)b\b/g, '$1 billion');
  return s;
}
