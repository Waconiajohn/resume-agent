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
          missingTokens: extractClaimTokens(b.text),
          foundTokens: [],
        });
      }
      continue;
    }
    for (let i = 0; i < wp.bullets.length; i++) {
      const b = wp.bullets[i];
      if (!b.is_new) continue;
      const tokens = extractClaimTokens(b.text);
      const haystack = buildPositionHaystack(sourcePos, source);
      const missing: string[] = [];
      const found: string[] = [];
      for (const tok of tokens) {
        if (haystackContains(haystack, tok)) {
          found.push(tok);
        } else {
          missing.push(tok);
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
    const tokens = extractClaimTokens(e.summary);
    const missing: string[] = [];
    const found: string[] = [];
    for (const tok of tokens) {
      if (haystackContains(haystack, tok)) {
        found.push(tok);
      } else {
        missing.push(tok);
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
 * Extract the concrete claim tokens from any bullet-like text.
 *
 * Extractors (in order, deduplicated at the end):
 *   1. **Dollar amounts** — `$26M`, `$1.2B`, `$40 million`, `$40M`
 *   2. **Percentages** — `40%`, `22 percent`
 *   3. **Number + unit tuples** — `15 Agile Release Trains`, `85 staff`, `~4B messages`, `3 continents`
 *   4. **Quoted strings** — anything in straight or curly quotes
 *   5. **Proper-noun phrases** — 2+ consecutive capitalized words (`GitHub Actions`, `AWS EC2`, `Collins Aerospace`)
 *   6. **ALL-CAPS tokens of 2+ chars** — `SCARs`, `CI/CD`, `FDA`, `SOX`
 *   7. **"by/through [verb]-ing" framing phrases** (Phase 4.6) — `by developing pricing strategies`,
 *      `through leveraging X`. These are the signature of embellished summaries; treat them as
 *      claim tokens so the attribution check surfaces them if source doesn't contain the phrase.
 *
 * Mechanical, not semantic. We are not trying to understand text; we are
 * extracting the atoms that MUST be present in the source if the rewrite
 * (or summary) is faithful.
 */
export function extractClaimTokens(text: string): string[] {
  const out = new Set<string>();

  // 1. Dollar amounts
  const dollarRe = /\$[\d.,]+\s*(?:[KMBkmb]|million|billion|thousand)?/g;
  for (const m of text.matchAll(dollarRe)) out.add(m[0].trim());

  // 2. Percentages
  const pctRe = /\d+(?:\.\d+)?\s*%/g;
  for (const m of text.matchAll(pctRe)) out.add(m[0].trim());
  const pctWordRe = /\d+(?:\.\d+)?\s*percent\b/gi;
  for (const m of text.matchAll(pctWordRe)) out.add(m[0].trim());

  // 3. Number + unit tuples
  //    The extractor is deliberately conservative: it captures the number
  //    plus 1 immediate noun (e.g. "85 staff", "$26M ROI", "15 ART"),
  //    NOT a multi-word trailing phrase. The trailing-phrase version was
  //    too greedy and flagged legitimate paraphrases: "$15M in savings"
  //    from summary didn't substring-match "$15M in savings across career"
  //    from source even though the specific $15M claim was present.
  //    For attribution, the number + 1 adjacent word is the minimum unit
  //    that distinguishes real claims. Longer phrase matching is covered
  //    by the proper-noun extractor (#5).
  const numUnitRe = /(?:~|>|<)?\d+(?:[.,]\d+)?[KMB]?\s+[A-Za-z][A-Za-z\-/]*/g;
  for (const m of text.matchAll(numUnitRe)) {
    const cleaned = m[0].trim();
    if (/^\d+\s+(?:year|month|week|day|hour)s?\b/i.test(cleaned)) continue;
    // Skip generic combos that carry no specific claim signal. Words like
    // "in", "to", "of", "and", "the" appear after numbers in most prose.
    if (/^\d+[KMB]?\s+(?:in|to|of|and|the|at|on|for|with|by|a|an)$/i.test(cleaned)) continue;
    out.add(cleaned);
  }

  // 4. Quoted strings
  const quoteRe = /["""']([^"""']{3,})["""']/g;
  for (const m of text.matchAll(quoteRe)) out.add(m[1].trim());

  // 5. Proper-noun phrases
  const properRe = /\b([A-Z][a-zA-Z]+(?:\s+(?:[A-Z][a-zA-Z]+|of|the|and|&)\s+)*(?:\s+[A-Z][a-zA-Z]+)+)\b/g;
  for (const m of text.matchAll(properRe)) {
    const p = m[1].trim();
    if (p.length < 6) continue;
    out.add(p);
  }

  // 6. ALL-CAPS or CapsMix acronyms
  const acroRe = /\b([A-Z]{2,}(?:[\/&][A-Z]+)?s?|[A-Z]+[a-z]*[A-Z]+(?:[\/&][A-Z]+)?)\b/g;
  for (const m of text.matchAll(acroRe)) {
    const a = m[1];
    if (a.length < 2) continue;
    out.add(a);
  }

  // 7. "by/through [verb]-ing X" framing phrases (Phase 4.6).
  //    This catches DeepSeek strategize's embellishment pattern where it
  //    adds "by developing pricing strategies" / "through leveraging" / etc.
  //    that the source doesn't contain verbatim. If the phrase appears in
  //    source verbatim it passes; if not, it's flagged.
  //    Regex: "by" or "through" + verb-ing + 1-3 following words.
  const framingRe = /\b(?:by|through)\s+[a-z]+ing\s+[a-z][a-z\s-]{2,40}/gi;
  for (const m of text.matchAll(framingRe)) {
    const phrase = m[0].trim();
    // Skip very short matches that are likely to be present in any prose
    if (phrase.length < 15) continue;
    // Trim at punctuation so "by developing X, reducing Y" captures only "by developing X"
    const cut = phrase.split(/[,.;]/)[0].trim();
    if (cut.length >= 15) out.add(cut);
  }

  return Array.from(out);
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
