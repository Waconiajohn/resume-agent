// Unit tests for the structured-llm-call primitive — written test-first
// before implementation per the plan at
// /Users/johnschrup/.claude/plans/dazzling-weaving-meerkat.md.
//
// The primitive consolidates stream → fence-strip → JSON.parse →
// Zod-validate → one-shot retry with error-kind-aware addendum that
// was previously duplicated across classify/verify with bespoke retry
// machinery. These tests lock the state machine before any stage
// migrates to it.

import { describe, expect, it, vi } from 'vitest';
import { z } from 'zod';
import type { LLMProvider, StreamEvent } from '../../lib/llm-provider.js';
import {
  structuredLlmCall,
  StructuredLlmCallError,
} from '../../lib/structured-llm.js';

// ─── Fixtures ─────────────────────────────────────────────────────────

const TestSchema = z.object({
  name: z.string(),
  count: z.number(),
});
type TestShape = z.infer<typeof TestSchema>;

const VALID = { name: 'ok', count: 3 };

// passes JSON.parse but fails Zod (count is the wrong type)
const SCHEMA_INVALID = '{"name": "x", "count": "three"}';

// cannot be JSON.parsed (truncated string)
const PARSE_INVALID = '{"name": "x", "count":';

function streamOf(
  text: string,
  usage = { input_tokens: 1000, output_tokens: 500 },
) {
  return async function* (): AsyncIterable<StreamEvent> {
    yield { type: 'text' as const, text };
    yield { type: 'done' as const, usage };
  };
}

function mockProvider(
  streamFn: (...args: unknown[]) => AsyncIterable<StreamEvent>,
): LLMProvider {
  return {
    name: 'mock',
    stream: streamFn,
    // chat isn't used by the primitive; stub that fails loudly if accessed.
    chat: (() => {
      throw new Error('chat() should not be called by structured-llm-call');
    }) as LLMProvider['chat'],
  };
}

const BASE_INPUT = {
  model: 'mock-model',
  system: 'You are a test.',
  userMessage: 'Return some JSON.',
  temperature: 0.2,
  maxTokens: 1000,
  schema: TestSchema,
  stage: 'test',
  promptName: 'test.v1',
  promptVersion: '1.0',
  buildRetryAddendum: () => 'RETRY: please fix the JSON.',
};

// ─── 1. Valid first attempt ────────────────────────────────────────────

describe('structuredLlmCall — valid first attempt', () => {
  it('returns parsed value with retryFired=false after a single call', async () => {
    const streamFn = vi.fn(streamOf(JSON.stringify(VALID)));
    const provider = mockProvider(streamFn);

    const result = await structuredLlmCall<TestShape>({
      ...BASE_INPUT,
      provider,
    });

    expect(result.parsed).toEqual(VALID);
    expect(result.retryFired).toBe(false);
    expect(result.retryReason).toBeNull();
    expect(result.usage).toEqual({ input_tokens: 1000, output_tokens: 500 });
    expect(streamFn).toHaveBeenCalledTimes(1);
  });
});

// ─── 2. JSON-parse failure + valid retry ───────────────────────────────

describe('structuredLlmCall — JSON-parse retry', () => {
  it('fires one retry, returns valid output on second attempt, sums tokens', async () => {
    const streamFn = vi
      .fn()
      .mockImplementationOnce(streamOf(PARSE_INVALID))
      .mockImplementationOnce(streamOf(JSON.stringify(VALID)));
    const provider = mockProvider(streamFn as never);

    const result = await structuredLlmCall<TestShape>({
      ...BASE_INPUT,
      provider,
    });

    expect(result.parsed).toEqual(VALID);
    expect(result.retryFired).toBe(true);
    expect(result.retryReason).toBe('json-parse');
    // tokens from both attempts
    expect(result.usage).toEqual({ input_tokens: 2000, output_tokens: 1000 });
    expect(streamFn).toHaveBeenCalledTimes(2);
  });
});

// ─── 3. Zod-schema failure + valid retry ───────────────────────────────

describe('structuredLlmCall — Zod-schema retry', () => {
  it('fires one retry, returns valid output on second attempt, sums tokens', async () => {
    const streamFn = vi
      .fn()
      .mockImplementationOnce(streamOf(SCHEMA_INVALID))
      .mockImplementationOnce(streamOf(JSON.stringify(VALID)));
    const provider = mockProvider(streamFn as never);

    const result = await structuredLlmCall<TestShape>({
      ...BASE_INPUT,
      provider,
    });

    expect(result.parsed).toEqual(VALID);
    expect(result.retryFired).toBe(true);
    expect(result.retryReason).toBe('zod-schema');
    expect(result.usage).toEqual({ input_tokens: 2000, output_tokens: 1000 });
    expect(streamFn).toHaveBeenCalledTimes(2);
  });
});

// ─── 4. JSON-parse + JSON-parse both fail ─────────────────────────────

describe('structuredLlmCall — JSON+JSON both fail', () => {
  it('throws StructuredLlmCallError with both parse errors populated', async () => {
    const streamFn = vi
      .fn()
      .mockImplementationOnce(streamOf(PARSE_INVALID))
      .mockImplementationOnce(streamOf(PARSE_INVALID));
    const provider = mockProvider(streamFn as never);

    let thrown: unknown = null;
    try {
      await structuredLlmCall<TestShape>({ ...BASE_INPUT, provider });
    } catch (err) {
      thrown = err;
    }

    expect(thrown).toBeInstanceOf(StructuredLlmCallError);
    const e = thrown as StructuredLlmCallError;
    expect(e.detail.firstError.kind).toBe('json-parse');
    expect(e.detail.retryError?.kind).toBe('json-parse');
    expect(streamFn).toHaveBeenCalledTimes(2);
  });
});

// ─── 5. Zod+Zod both fail ──────────────────────────────────────────────

describe('structuredLlmCall — Zod+Zod both fail', () => {
  it('throws StructuredLlmCallError with both schema errors populated', async () => {
    const streamFn = vi
      .fn()
      .mockImplementationOnce(streamOf(SCHEMA_INVALID))
      .mockImplementationOnce(streamOf(SCHEMA_INVALID));
    const provider = mockProvider(streamFn as never);

    await expect(
      structuredLlmCall<TestShape>({ ...BASE_INPUT, provider }),
    ).rejects.toMatchObject({
      name: 'StructuredLlmCallError',
      detail: expect.objectContaining({
        firstError: expect.objectContaining({ kind: 'zod-schema' }),
        retryError: expect.objectContaining({ kind: 'zod-schema' }),
      }),
    });
    expect(streamFn).toHaveBeenCalledTimes(2);
  });
});

// ─── 6. Mixed-kind failures both fail ─────────────────────────────────

describe('structuredLlmCall — mixed-kind both fail', () => {
  it('captures mismatched error kinds in firstError and retryError', async () => {
    const streamFn = vi
      .fn()
      .mockImplementationOnce(streamOf(PARSE_INVALID))
      .mockImplementationOnce(streamOf(SCHEMA_INVALID));
    const provider = mockProvider(streamFn as never);

    let thrown: unknown = null;
    try {
      await structuredLlmCall<TestShape>({ ...BASE_INPUT, provider });
    } catch (err) {
      thrown = err;
    }

    expect(thrown).toBeInstanceOf(StructuredLlmCallError);
    const e = thrown as StructuredLlmCallError;
    expect(e.detail.firstError.kind).toBe('json-parse');
    expect(e.detail.retryError?.kind).toBe('zod-schema');
  });
});

// ─── 7. retryOn selector: only-zod skips parse retry ──────────────────

describe('structuredLlmCall — retryOn=[zod-schema] skips parse retry', () => {
  it('throws on JSON-parse failure without firing a retry', async () => {
    const streamFn = vi.fn(streamOf(PARSE_INVALID));
    const provider = mockProvider(streamFn);

    await expect(
      structuredLlmCall<TestShape>({
        ...BASE_INPUT,
        provider,
        retryOn: ['zod-schema'],
      }),
    ).rejects.toBeInstanceOf(StructuredLlmCallError);
    expect(streamFn).toHaveBeenCalledTimes(1);
  });
});

// ─── 8. maxStructuralAttempts=1 disables retry ────────────────────────

describe('structuredLlmCall — maxStructuralAttempts=1 disables retry', () => {
  it('throws on Zod failure without firing a retry', async () => {
    const streamFn = vi.fn(streamOf(SCHEMA_INVALID));
    const provider = mockProvider(streamFn);

    await expect(
      structuredLlmCall<TestShape>({
        ...BASE_INPUT,
        provider,
        maxStructuralAttempts: 1,
      }),
    ).rejects.toBeInstanceOf(StructuredLlmCallError);
    expect(streamFn).toHaveBeenCalledTimes(1);
  });
});

// ─── 9. Empty response throws immediately ─────────────────────────────

describe('structuredLlmCall — empty response', () => {
  it('throws StructuredLlmCallError with no retry even when retry would otherwise fire', async () => {
    const streamFn = vi.fn(streamOf('   '));
    const provider = mockProvider(streamFn);

    await expect(
      structuredLlmCall<TestShape>({ ...BASE_INPUT, provider }),
    ).rejects.toBeInstanceOf(StructuredLlmCallError);
    expect(streamFn).toHaveBeenCalledTimes(1);
  });
});

// ─── 10. buildRetryAddendum output appears in retry system message ────

describe('structuredLlmCall — buildRetryAddendum', () => {
  it('appends the caller-provided addendum to the system message on retry', async () => {
    const customAddendum =
      'RETRY: The field `count` must be a number, not a string. Fix the type.';
    const addendumBuilder = vi.fn(() => customAddendum);

    const streamFn = vi
      .fn()
      .mockImplementationOnce(streamOf(SCHEMA_INVALID))
      .mockImplementationOnce(streamOf(JSON.stringify(VALID)));
    const provider = mockProvider(streamFn as never);

    await structuredLlmCall<TestShape>({
      ...BASE_INPUT,
      provider,
      buildRetryAddendum: addendumBuilder,
    });

    // addendum was built once (for the retry)
    expect(addendumBuilder).toHaveBeenCalledTimes(1);
    // first call received the base system message only
    const firstCallParams = streamFn.mock.calls[0][0] as { system: string };
    expect(firstCallParams.system).toBe(BASE_INPUT.system);
    expect(firstCallParams.system).not.toContain(customAddendum);
    // retry call received base + addendum
    const retryCallParams = streamFn.mock.calls[1][0] as { system: string };
    expect(retryCallParams.system).toContain(BASE_INPUT.system);
    expect(retryCallParams.system).toContain(customAddendum);
  });

  it('passes the first-attempt error to the addendum builder', async () => {
    let capturedError: { kind: string; issues?: unknown } | null = null;
    const addendumBuilder = (err: unknown): string => {
      capturedError = err as { kind: string; issues?: unknown };
      return 'RETRY hint';
    };

    const streamFn = vi
      .fn()
      .mockImplementationOnce(streamOf(SCHEMA_INVALID))
      .mockImplementationOnce(streamOf(JSON.stringify(VALID)));
    const provider = mockProvider(streamFn as never);

    await structuredLlmCall<TestShape>({
      ...BASE_INPUT,
      provider,
      buildRetryAddendum: addendumBuilder,
    });

    expect(capturedError).not.toBeNull();
    expect(capturedError!.kind).toBe('zod-schema');
    expect(Array.isArray(capturedError!.issues)).toBe(true);
  });
});
