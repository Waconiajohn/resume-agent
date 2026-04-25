import {
  canonicalizeNumbers,
  extractClaimTokensTyped,
  type ClaimToken,
} from '../verify/attribution.js';
import type { Position, StructuredResume, WrittenPosition } from '../types.js';

export interface PositionSourceAttributionIssue {
  bulletIndex: number;
  text: string;
  sourceHint: string | null;
  citedBulletIndexes: number[];
  missingTokens: string[];
}

export interface PositionSourceAttributionResult {
  verified: boolean;
  issues: PositionSourceAttributionIssue[];
}

/**
 * Writer-side source check for the exact source bullet(s) a rewritten bullet
 * claims to be based on. The broader verify attribution pass checks against
 * the whole source position; this catches a narrower fabrication class where a
 * writer borrows a metric from one source bullet and attaches it to a different
 * accomplishment in another.
 */
export function checkPositionSourceAttribution(
  writtenPosition: WrittenPosition,
  sourceResume: StructuredResume,
): PositionSourceAttributionResult {
  const sourcePosition = sourceResume.positions[writtenPosition.positionIndex];
  if (!sourcePosition) {
    return {
      verified: false,
      issues: writtenPosition.bullets.map((bullet, bulletIndex) => ({
        bulletIndex,
        text: bullet.text,
        sourceHint: bullet.source ?? null,
        citedBulletIndexes: [],
        missingTokens: extractClaimTokensTyped(bullet.text).map((token) => token.text),
      })),
    };
  }

  const issues: PositionSourceAttributionIssue[] = [];
  for (let bulletIndex = 0; bulletIndex < writtenPosition.bullets.length; bulletIndex++) {
    const bullet = writtenPosition.bullets[bulletIndex]!;
    if (!bullet.is_new) continue;

    const citedBulletIndexes = parseSourceBulletIndexes(bullet.source ?? null)
      .filter((index) => index >= 0 && index < sourcePosition.bullets.length);

    // If the writer omitted a parseable source locator, fall back to the
    // existing full-position verifier. This helper is deliberately about
    // source-hint precision, not making optional metadata suddenly fatal.
    if (citedBulletIndexes.length === 0) continue;

    const haystack = buildCitedSourceHaystack(sourcePosition, citedBulletIndexes);
    const missingTokens = extractClaimTokensTyped(bullet.text)
      .filter((token) => !haystackContainsToken(haystack, token))
      .map((token) => token.text);

    if (missingTokens.length === 0) continue;
    issues.push({
      bulletIndex,
      text: bullet.text,
      sourceHint: bullet.source ?? null,
      citedBulletIndexes,
      missingTokens,
    });
  }

  return {
    verified: issues.length === 0,
    issues,
  };
}

export function buildPositionSourceAttributionRetryAddendum(
  result: PositionSourceAttributionResult,
): string {
  const lines = [
    'RETRY: Your previous position output moved claim tokens away from their cited source bullet(s).',
    '',
    'For each bullet below, rewrite the bullet so every dollar figure, percentage, number+unit claim, named system, and named outcome is present in the cited source bullet(s), the role title, or the role scope. If the cited source bullet does not support the claim, remove the claim or drop the bullet.',
    '',
    'Do NOT attach a metric from one source bullet to a different accomplishment in another source bullet. Example: if one source bullet says "supported facility expansion" and another says "$4.5M budget", do NOT write "$4.5M facility expansion" unless the same cited source text explicitly links them.',
    '',
    'Problem bullets:',
  ];

  for (const issue of result.issues.slice(0, 8)) {
    lines.push(
      `- output bullets[${issue.bulletIndex}] source=${JSON.stringify(issue.sourceHint)} cited source bullets=[${issue.citedBulletIndexes.join(', ')}]`,
      `  text: ${issue.text}`,
      `  claim tokens not found in cited source: ${issue.missingTokens.map((token) => JSON.stringify(token)).join(', ')}`,
    );
  }

  lines.push(
    '',
    'Return the full position JSON again. Preserve clean bullets. Rewrite or remove only the unsupported claims.',
  );

  return lines.join('\n');
}

export function parseSourceBulletIndexes(sourceHint: string | null): number[] {
  if (!sourceHint) return [];
  const indexes = new Set<number>();
  const re = /bullets\[(\d+)\]/g;
  for (const match of sourceHint.matchAll(re)) {
    indexes.add(Number(match[1]));
  }
  return [...indexes].sort((a, b) => a - b);
}

function buildCitedSourceHaystack(
  sourcePosition: Position,
  bulletIndexes: number[],
): string {
  const parts = [
    sourcePosition.title,
    sourcePosition.company,
    sourcePosition.parentCompany ?? '',
    sourcePosition.location ?? '',
    sourcePosition.dates.raw,
    sourcePosition.scope ?? '',
  ];
  for (const index of bulletIndexes) {
    parts.push(sourcePosition.bullets[index]?.text ?? '');
  }
  return normalizeForAttribution(parts.join('\n'));
}

function haystackContainsToken(haystack: string, token: ClaimToken): boolean {
  if (token.kind === 'frame') {
    return frameContentWords(token.text).every((word) => haystack.includes(word));
  }
  return haystack.includes(normalizeForAttribution(token.text));
}

function frameContentWords(text: string): string[] {
  const stopwords = new Set([
    'by', 'through', 'the', 'a', 'an', 'of', 'and', 'to', 'for', 'with',
    'in', 'on', 'at', 'across', 'via', 'into', 'from', 'up', 'over', 'around',
  ]);
  return normalizeForAttribution(text)
    .split(/\s+/)
    .filter((word) => word.length > 0 && !stopwords.has(word));
}

function normalizeForAttribution(text: string): string {
  return canonicalizeNumbers(
    text
      .replace(/[\u2010-\u2014\u2212\u2013]/g, '-')
      .replace(/\s+/g, ' ')
      .toLowerCase()
      .trim(),
  );
}
