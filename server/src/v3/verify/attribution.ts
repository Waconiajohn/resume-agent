// Mechanical substring attribution check for Stage 5 verify.
//
// Runs BEFORE the verify LLM call. Extracts "claim tokens" (numbers +
// units, proper nouns, quoted strings) from each is_new=true bullet in the
// WrittenResume and checks whether each token appears as a substring in the
// source position's bullets / scope / title / crossRoleHighlights.
//
// This is NOT a guardrail. It does not modify output. It provides structured
// data that the verify LLM call uses to focus its attention on real
// attribution failures, rather than generating its own semantic matching
// from scratch (which is where DeepSeek-as-verifier produces false
// positives).
//
// See docs/v3-rebuild/reports/phase-3.5-report.md "what's uncertain" on
// verify false-positive residue. Phase 4 cleanup Intervention 2.

import type {
  StructuredResume,
  WrittenResume,
  WrittenPosition,
  Position,
} from '../types.js';

// -----------------------------------------------------------------------------
// Public API
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
      // Written position has no corresponding source position. Every bullet
      // is unverifiable against source — verify's Check 9 will catch this
      // structural issue separately; here we report per-bullet.
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
// Claim-token extraction (mechanical, heuristic)
// -----------------------------------------------------------------------------

/**
 * Extract the concrete claim tokens from a bullet's text.
 *
 * Extractors (in order, deduplicated at the end):
 *   1. **Dollar amounts** — `$26M`, `$1.2B`, `$40 million`, `$40M`
 *   2. **Percentages** — `40%`, `22 percent`
 *   3. **Number + unit tuples** — `15 Agile Release Trains`, `85 staff`, `~4B messages`, `3 continents`
 *   4. **Quoted strings** — anything in straight or curly quotes
 *   5. **Proper-noun phrases** — 2+ consecutive capitalized words (`GitHub Actions`, `AWS EC2`, `Collins Aerospace`)
 *   6. **ALL-CAPS tokens of 2+ chars** — `SCARs`, `CI/CD`, `FDA`, `SOX`
 *
 * Mechanical, not semantic. We are not trying to understand bullets; we are
 * extracting the atoms that MUST be present in the source if the rewrite
 * is faithful.
 */
export function extractClaimTokens(text: string): string[] {
  const out = new Set<string>();

  // 1. Dollar amounts — matches $26M, $26 million, $1.2B, $500K, $1,234
  const dollarRe = /\$[\d.,]+\s*(?:[KMBkmb]|million|billion|thousand)?/g;
  for (const m of text.matchAll(dollarRe)) out.add(m[0].trim());

  // 2. Percentages — 40%, 22 percent
  const pctRe = /\d+(?:\.\d+)?\s*%/g;
  for (const m of text.matchAll(pctRe)) out.add(m[0].trim());
  const pctWordRe = /\d+(?:\.\d+)?\s*percent\b/gi;
  for (const m of text.matchAll(pctWordRe)) out.add(m[0].trim());

  // 3. Number + unit tuples — "15 Agile Release Trains", "85 staff",
  //    "~4B messages daily", "3 business units"
  //    Approach: capture a leading number (possibly with ~ or > or <) and
  //    1-4 following words, at least one starting capital OR a recognized
  //    noun category. We grab liberally; substring check tolerates noise.
  const numUnitRe = /(?:~|>|<)?\d+(?:[.,]\d+)?[KMB]?\s+[A-Za-z][A-Za-z\-/]*(?:\s+[A-Za-z][A-Za-z\-/]*){0,3}/g;
  for (const m of text.matchAll(numUnitRe)) {
    const cleaned = m[0].trim();
    // Skip pure "X years" / "X months" style (too generic for attribution)
    if (/^\d+\s+(?:year|month|week|day|hour)s?\b/i.test(cleaned)) continue;
    out.add(cleaned);
  }

  // 4. Quoted strings
  const quoteRe = /["""']([^"""']{3,})["""']/g;
  for (const m of text.matchAll(quoteRe)) out.add(m[1].trim());

  // 5. Proper-noun phrases — 2+ consecutive Capitalized-Words. Simple heuristic:
  //    a run of 2+ whitespace-separated tokens, each starting with [A-Z].
  const properRe = /\b([A-Z][a-zA-Z]+(?:\s+(?:[A-Z][a-zA-Z]+|of|the|and|&)\s+)*(?:\s+[A-Z][a-zA-Z]+)+)\b/g;
  for (const m of text.matchAll(properRe)) {
    const p = m[1].trim();
    // Skip very generic 2-word phrases that tend to start sentences
    if (p.length < 6) continue;
    out.add(p);
  }

  // 6. ALL-CAPS or CapsMix acronyms (2+ chars). Also pick up things like
  //    SCARs, API, SRE, CI/CD, FDA, SOX. Allow internal slash, ampersand, lowercase s.
  const acroRe = /\b([A-Z]{2,}(?:[\/&][A-Z]+)?s?|[A-Z]+[a-z]*[A-Z]+(?:[\/&][A-Z]+)?)\b/g;
  for (const m of text.matchAll(acroRe)) {
    const a = m[1];
    // Skip if entirely lowercase words mixed with an acronym at the end — heuristic
    if (a.length < 2) continue;
    out.add(a);
  }

  return Array.from(out);
}

// -----------------------------------------------------------------------------
// Substring matching
// -----------------------------------------------------------------------------

/**
 * Build the "haystack" for a position: concatenation of its title, scope,
 * every bullet text, plus the resume's top-level crossRoleHighlights.
 * Case-folded and whitespace-normalized.
 */
function buildPositionHaystack(sourcePos: Position, source: StructuredResume): string {
  const parts: string[] = [];
  parts.push(sourcePos.title ?? '');
  if (sourcePos.scope) parts.push(sourcePos.scope);
  if (sourcePos.location) parts.push(sourcePos.location);
  for (const b of sourcePos.bullets) parts.push(b.text);
  // Cross-role highlights are attributable to any position.
  for (const h of source.crossRoleHighlights) parts.push(h.text);
  return normalize(parts.join('\n'));
}

function haystackContains(haystack: string, token: string): boolean {
  const needle = normalize(token);
  if (needle.length === 0) return true;
  return haystack.includes(needle);
}

/**
 * Normalize whitespace, case, and dash types so that "2020 – 2023" (en-dash)
 * matches "2020-2023" (hyphen) in substring checks, and so "Agile Release
 * Trains" matches "agile release trains" regardless of case.
 */
function normalize(s: string): string {
  return s
    .replace(/[\u2010-\u2014\u2212\u2013]/g, '-') // all dash variants → hyphen-minus
    .replace(/\s+/g, ' ') // collapse whitespace
    .toLowerCase()
    .trim();
}
