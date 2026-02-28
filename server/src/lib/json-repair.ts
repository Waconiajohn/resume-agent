import logger from './logger.js';

/**
 * Multi-step JSON repair for LLM outputs that may include markdown fences,
 * surrounding text, or trailing commas.
 */
export function repairJSON<T>(text: string): T | null {
  if (!text || typeof text !== 'string') return null;

  // Step 1: Strip markdown fences
  let cleaned = text.replace(/^```(?:json)?\s*\n?/i, '').replace(/\n?```\s*$/i, '').trim();

  // Step 2: Direct parse attempt
  try {
    return JSON.parse(cleaned) as T;
  } catch {
    // continue
  }

  // Step 3: Extract JSON object/array from surrounding text
  const firstBrace = cleaned.indexOf('{');
  const firstBracket = cleaned.indexOf('[');
  let start = -1;
  let closeChar = '';

  if (firstBrace >= 0 && (firstBracket < 0 || firstBrace < firstBracket)) {
    start = firstBrace;
    closeChar = '}';
  } else if (firstBracket >= 0) {
    start = firstBracket;
    closeChar = ']';
  }

  if (start >= 0) {
    const lastClose = cleaned.lastIndexOf(closeChar);
    if (lastClose > start) {
      cleaned = cleaned.slice(start, lastClose + 1);
      try {
        return JSON.parse(cleaned) as T;
      } catch {
        // continue
      }
    }
  }

  // Step 4: Fix trailing commas
  const noTrailing = cleaned
    .replace(/,\s*([\]}])/g, '$1');

  try {
    return JSON.parse(noTrailing) as T;
  } catch {
    // continue
  }

  // Skip regex-heavy steps on large inputs to avoid catastrophic backtracking
  if (noTrailing.length > 50_000) {
    logger.warn({ size: noTrailing.length }, 'Skipping aggressive JSON repair on large input');
    return null;
  }

  // Step 5: Fix common Z.AI quirks — unescaped newlines/tabs inside strings,
  // single quotes, unquoted keys
  let aggressive = noTrailing
    // Fix unescaped control chars inside JSON strings (newlines, tabs)
    .replace(/(?<=:\s*"[^"]*)\n/g, '\\n')
    .replace(/(?<=:\s*"[^"]*)\t/g, '\\t')
    // Single quotes → double quotes (only when used as JSON delimiters)
    .replace(/(?<=[\[{,:])\s*'([^']*)'\s*(?=[,\]}:])/g, '"$1"');

  try {
    return JSON.parse(aggressive) as T;
  } catch {
    // continue
  }

  // Step 6: Fix unquoted keys — { key: "value" } → { "key": "value" }
  const quotedKeys = aggressive.replace(/([{,]\s*)([A-Za-z_$][A-Za-z0-9_$]*)\s*:/g, '$1"$2":');
  try {
    return JSON.parse(quotedKeys) as T;
  } catch {
    // continue
  }

  // Step 7: Partial JSON truncation — close unclosed braces/brackets
  // Common with Z.AI timeouts. Count opens vs closes and append missing closers.
  function closePartial(s: string): string {
    const stack: string[] = [];
    let inString = false;
    let escape = false;
    for (const ch of s) {
      if (escape) { escape = false; continue; }
      if (ch === '\\' && inString) { escape = true; continue; }
      if (ch === '"') { inString = !inString; continue; }
      if (inString) continue;
      if (ch === '{') stack.push('}');
      else if (ch === '[') stack.push(']');
      else if (ch === '}' || ch === ']') stack.pop();
    }
    // Remove trailing comma before we close, then append missing closers
    return s.replace(/,\s*$/, '') + stack.reverse().join('');
  }

  const closed = closePartial(quotedKeys);
  if (closed !== quotedKeys) {
    try {
      return JSON.parse(closed) as T;
    } catch {
      // continue
    }
  }

  // Step 8: Give up — log raw snippet for debugging
  logger.warn({ rawSnippet: text.substring(0, 300) }, 'Failed to repair JSON');
  return null;
}
