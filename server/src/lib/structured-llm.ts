// Shared structured LLM call primitive.
//
// Extracted from v3 in commit 1 (f6f81f19) and promoted to a shared lib
// in commit 2 (af84c4c0) so non-v3 products (cover-letter, exec-bio,
// LinkedIn, etc.) can reuse the same retry machinery. All v3 stages flow
// through this primitive.
//
// Consolidates the stream → fence-strip → JSON.parse → Zod-validate →
// one-shot retry pattern that was previously duplicated across every
// LLM-producing stage.
//
// Design rules (see /Users/johnschrup/.claude/plans/dazzling-weaving-meerkat.md):
//
//   1. The primitive owns ONLY the structural retry (JSON.parse failure
//      + Zod schema failure). Semantic retries (pronoun, forbidden-phrase,
//      attribution) layer OUTSIDE the primitive and can invoke it a
//      second time with maxStructuralAttempts=1 to prevent compounded
//      retry counts.
//
//   2. The retry addendum is caller-provided. Each stage's retry copy
//      is stage-specific (classify's null-dates guidance, verify's
//      truncation hints, etc.) and must not be generalized.
//
//   3. Empty-response failures are non-retryable. That's LLM-side drop,
//      not a correctable parse/validation issue.
//
//   4. Both-attempts-fail throws a StructuredLlmCallError with BOTH error
//      details so the operator can see the failure pattern. Callers
//      wrap/rethrow as their stage-specific error type (ClassifyError,
//      WriteError, VerifyError, etc.) to preserve existing catch-sites.
//
//   5. No silent fallback. No JSON repair. No coercion. If both attempts
//      fail, the pipeline throws loudly — consistent with
//      OPERATING-MANUAL.md.

import type { ZodIssue, ZodSchema } from 'zod';
import type { LLMProvider, StreamEvent } from './llm-provider.js';

// ─── Public types ─────────────────────────────────────────────────────

/** Which structural failure classes trigger retry. */
export type RetryKind = 'json-parse' | 'zod-schema';

/** Details of a structural failure, passed to buildRetryAddendum. */
export type StructuralError =
  | { kind: 'json-parse'; message: string; rawSnippet: string }
  | { kind: 'zod-schema'; issues: ZodIssue[]; rawSnippet: string };

export interface StructuredLlmCallInput<T> {
  // Stream config — pass-through to provider.stream()
  provider: LLMProvider;
  model: string;
  system: string;
  userMessage: string;
  temperature: number;
  maxTokens: number;
  signal?: AbortSignal;
  /** Passed through to provider.stream when thinking mode is on (DeepSeek
   *  deep-writer on Vertex). The primitive does NOT decide when to enable
   *  thinking — callers (write/runSection) control this. */
  thinking?: boolean;

  // Validation
  schema: ZodSchema<T>;

  // Retry policy
  /** Which failure classes trigger retry. Default: both.
   *  Stages can opt out of one kind — e.g. pass ['zod-schema'] to retry
   *  only on schema validation failure and not on JSON.parse failure. */
  retryOn?: ReadonlyArray<RetryKind>;
  /** Total attempts the primitive may make (initial + retries).
   *  Default 2 (one retry). Set to 1 to disable retry — used by semantic
   *  retry wrappers so that stacked retries don't compound. */
  maxStructuralAttempts?: 1 | 2;

  /** Build the retry addendum based on the first-attempt error. Caller
   *  owns the copy: classify's null-dates guidance, verify's truncation
   *  hints, benchmark's, etc. */
  buildRetryAddendum: (error: StructuralError) => string;

  // Observability
  stage: string;
  promptName: string;
  promptVersion: string;
}

export interface StructuredLlmCallOutput<T> {
  parsed: T;
  usage: { input_tokens: number; output_tokens: number };
  /** True iff a retry attempt fired (the first call failed and a second
   *  call was made). Independent of whether the retry succeeded — if the
   *  retry also failed, the primitive throws, so callers that see this
   *  field at all know the retry succeeded. */
  retryFired: boolean;
  /** Which failure class triggered the retry. Null when retryFired is
   *  false. */
  retryReason: RetryKind | null;
  durationMs: number;
}

export class StructuredLlmCallError extends Error {
  constructor(
    message: string,
    public readonly detail: {
      stage: string;
      promptName: string;
      promptVersion: string;
      firstError: StructuralError;
      /** Undefined when maxStructuralAttempts=1 or the error was
       *  non-retryable (empty response). */
      retryError?: StructuralError;
      rawFirst: string;
      rawRetry?: string;
    },
  ) {
    super(message);
    this.name = 'StructuredLlmCallError';
  }
}

// ─── Primitive ────────────────────────────────────────────────────────

export async function structuredLlmCall<T>(
  input: StructuredLlmCallInput<T>,
): Promise<StructuredLlmCallOutput<T>> {
  const start = Date.now();
  const retryOn = new Set<RetryKind>(
    input.retryOn ?? ['json-parse', 'zod-schema'],
  );
  const maxAttempts = input.maxStructuralAttempts ?? 2;

  // First attempt
  const first = await streamAndParse<T>(input, input.system);
  if (first.ok) {
    return {
      parsed: first.parsed,
      usage: first.usage,
      retryFired: false,
      retryReason: null,
      durationMs: Date.now() - start,
    };
  }

  // First attempt failed. Decide whether to retry.
  const firstError = first.error;
  const canRetry =
    maxAttempts > 1 && firstError.retryable && retryOn.has(firstError.kind);

  if (!canRetry) {
    throw new StructuredLlmCallError(
      `${input.stage}: ${input.promptName} v${input.promptVersion} — ${failureSummary(firstError)}. No retry attempted (${!firstError.retryable ? 'empty response' : maxAttempts === 1 ? 'maxStructuralAttempts=1' : `retry disabled for ${firstError.kind}`}).`,
      {
        stage: input.stage,
        promptName: input.promptName,
        promptVersion: input.promptVersion,
        firstError,
        rawFirst: first.rawText,
      },
    );
  }

  // Retry with caller-supplied addendum appended.
  const addendum = input.buildRetryAddendum(firstError);
  const retrySystem = `${input.system}\n\n---\n\n${addendum}`;
  const retry = await streamAndParse<T>(input, retrySystem);

  if (retry.ok) {
    return {
      parsed: retry.parsed,
      usage: {
        input_tokens: first.usage.input_tokens + retry.usage.input_tokens,
        output_tokens: first.usage.output_tokens + retry.usage.output_tokens,
      },
      retryFired: true,
      retryReason: firstError.kind,
      durationMs: Date.now() - start,
    };
  }

  // Both attempts failed.
  throw new StructuredLlmCallError(
    `${input.stage}: ${input.promptName} v${input.promptVersion} — failed on BOTH the first attempt AND the retry. ` +
      `First: ${failureSummary(firstError)}. Retry: ${failureSummary(retry.error)}. ` +
      `This indicates a systemic model-compliance issue, not a one-off flake.`,
    {
      stage: input.stage,
      promptName: input.promptName,
      promptVersion: input.promptVersion,
      firstError,
      retryError: retry.error,
      rawFirst: first.rawText,
      rawRetry: retry.rawText,
    },
  );
}

// ─── Shared fence-strip ───────────────────────────────────────────────

/**
 * Strip a surrounding ```json ... ``` (or ``` ... ```) markdown fence if
 * present. Idempotent; safe to call on already-bare JSON.
 *
 * Extracted here as the canonical implementation; all seven prior
 * duplicates across v3 stage files should import from this module.
 */
export function stripMarkdownJsonFence(input: string): string {
  const s = input.trim();
  const fenceStart = /^```(?:json|JSON)?\s*\n/;
  const fenceEnd = /\n```\s*$/;
  if (fenceStart.test(s) && fenceEnd.test(s)) {
    return s.replace(fenceStart, '').replace(fenceEnd, '').trim();
  }
  return s;
}

// ─── Internals ────────────────────────────────────────────────────────

type ParseResult<T> =
  | {
      ok: true;
      parsed: T;
      usage: { input_tokens: number; output_tokens: number };
      rawText: string;
    }
  | {
      ok: false;
      error: StructuralError & { retryable: boolean };
      usage: { input_tokens: number; output_tokens: number };
      rawText: string;
    };

async function streamAndParse<T>(
  input: StructuredLlmCallInput<T>,
  system: string,
): Promise<ParseResult<T>> {
  let fullText = '';
  let usage = { input_tokens: 0, output_tokens: 0 };

  for await (const event of input.provider.stream({
    model: input.model,
    system,
    messages: [{ role: 'user', content: input.userMessage }],
    max_tokens: input.maxTokens,
    temperature: input.temperature,
    signal: input.signal,
    ...(input.thinking ? { thinking: true } : {}),
  })) {
    const e = event as StreamEvent;
    if (e.type === 'text') fullText += e.text;
    else if (e.type === 'done') usage = e.usage;
  }

  // Empty response — NOT retryable (LLM-side drop).
  if (!fullText.trim()) {
    return {
      ok: false,
      error: {
        kind: 'json-parse',
        message: 'Empty response (model emitted zero text content).',
        rawSnippet: '',
        retryable: false,
      },
      usage,
      rawText: fullText,
    };
  }

  const cleaned = stripMarkdownJsonFence(fullText.trim());

  // JSON parse
  let parsedRaw: unknown;
  try {
    parsedRaw = JSON.parse(cleaned);
  } catch (err) {
    return {
      ok: false,
      error: {
        kind: 'json-parse',
        message: err instanceof Error ? err.message : String(err),
        rawSnippet: cleaned.slice(0, 500),
        retryable: true,
      },
      usage,
      rawText: cleaned,
    };
  }

  // Zod validate
  const result = input.schema.safeParse(parsedRaw);
  if (!result.success) {
    return {
      ok: false,
      error: {
        kind: 'zod-schema',
        issues: result.error.issues as ZodIssue[],
        rawSnippet: cleaned.slice(0, 500),
        retryable: true,
      },
      usage,
      rawText: cleaned,
    };
  }

  return {
    ok: true,
    parsed: result.data as T,
    usage,
    rawText: cleaned,
  };
}

function failureSummary(error: StructuralError): string {
  if (error.kind === 'json-parse') {
    return `JSON parse: ${error.message}`;
  }
  const issueSummary = error.issues
    .slice(0, 5)
    .map((i) => `${i.path.map((p) => String(p)).join('.') || '<root>'}: ${i.message}`)
    .join('; ');
  const more = error.issues.length > 5 ? `; ...(${error.issues.length - 5} more)` : '';
  return `Zod (${error.issues.length} issue(s)): ${issueSummary}${more}`;
}
