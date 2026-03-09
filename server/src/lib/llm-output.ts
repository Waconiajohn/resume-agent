/**
 * LLM Output Utilities — Generic helpers for parsing and validating LLM responses.
 *
 * The repairJSON + Zod safeParse + fallback + warn pattern appears in every agent's
 * tool files. This module centralises it behind a single generic function so each
 * call site stays small and the behaviour is consistent.
 *
 * Usage:
 * ```ts
 * import { parseAndValidateLLMOutput } from '../../lib/llm-output.js';
 * import { MySchema } from './my-schemas.js';
 *
 * const result = parseAndValidateLLMOutput(
 *   response.text,
 *   MySchema,
 *   myFallback,
 *   { tool: 'my_tool', sessionId: ctx.sessionId },
 * );
 * ```
 */

import { z } from 'zod';
import { repairJSON } from './json-repair.js';
import logger from './logger.js';

// ─── Context passed to every warn log ────────────────────────────────

export interface LLMOutputContext {
  /** Tool or call-site name — used in log messages for easy filtering */
  tool: string;
  /** Session ID for per-session log correlation (optional) */
  sessionId?: string;
}

// ─── Core utility ─────────────────────────────────────────────────────

/**
 * Parse and validate an LLM response string against a Zod schema.
 *
 * Resolution order:
 * 1. If `text` is falsy — log a warn, return `fallback`.
 * 2. Run `repairJSON` — if it returns null — log a warn, return `fallback`.
 * 3. Run `schema.safeParse(raw)` — if it succeeds, return the typed result.
 * 4. If schema validation fails — log a warn with the Zod issues, return `raw as T`
 *    so the caller still gets the parsed (but unvalidated) data rather than the
 *    typed fallback.  This matches the existing pattern in craftsman/tools.ts.
 *
 * The function is intentionally side-effect free except for the warn logs —
 * it never throws.
 *
 * @param text     Raw text from the LLM response
 * @param schema   Zod schema to validate against
 * @param fallback Value returned when repair fails or text is empty
 * @param context  { tool, sessionId? } — logged on every warn
 */
export function parseAndValidateLLMOutput<T>(
  text: string,
  schema: z.ZodType<T>,
  fallback: T,
  context: LLMOutputContext,
): T {
  // Guard: empty / null text
  if (!text || typeof text !== 'string' || !text.trim()) {
    logger.warn({ ...context }, 'parseAndValidateLLMOutput: empty text from LLM, using fallback');
    return fallback;
  }

  // Repair JSON
  const raw = repairJSON<Record<string, unknown>>(text);
  if (raw === null) {
    logger.warn({ ...context }, 'parseAndValidateLLMOutput: repairJSON returned null, using fallback');
    return fallback;
  }

  // Validate against schema
  const result = schema.safeParse(raw);
  if (result.success) {
    return result.data;
  }

  // Validation failed — return raw parsed object so the caller gets real data
  logger.warn(
    { ...context, issues: result.error.issues },
    'parseAndValidateLLMOutput: schema validation failed, using raw parsed data',
  );
  return raw as unknown as T;
}
