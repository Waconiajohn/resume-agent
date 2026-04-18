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

export interface StrategizeAttributionResult {
  summaries: SummaryAttributionCheck[];
  summary: {
    totalSummaries: number;
    verifiedCount: number;
    unverifiedCount: number;
    totalMissingTokens: number;
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

  const verifiedCount = summaries.filter((s) => s.verified).length;
  return {
    summaries,
    summary: {
      totalSummaries: summaries.length,
      verifiedCount,
      unverifiedCount: summaries.length - verifiedCount,
      totalMissingTokens: summaries.reduce((s, r) => s + r.missingTokens.length, 0),
    },
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
 * Position-scoped haystack: the source position's title + scope + all its
 * bullets + the resume's crossRoleHighlights. Used by
 * checkAttributionMechanically — writers rewrite bullets from their own
 * position's material, plus top-level highlights.
 */
function buildPositionHaystack(sourcePos: Position, source: StructuredResume): string {
  const parts: string[] = [];
  parts.push(sourcePos.title ?? '');
  if (sourcePos.scope) parts.push(sourcePos.scope);
  if (sourcePos.location) parts.push(sourcePos.location);
  for (const b of sourcePos.bullets) parts.push(b.text);
  for (const h of source.crossRoleHighlights) parts.push(h.text);
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
  return haystack.includes(needle);
}

/**
 * Normalize whitespace, case, and dash types so "2020 – 2023" matches
 * "2020-2023" etc.
 */
function normalize(s: string): string {
  return s
    .replace(/[\u2010-\u2014\u2212\u2013]/g, '-')
    .replace(/\s+/g, ' ')
    .toLowerCase()
    .trim();
}
