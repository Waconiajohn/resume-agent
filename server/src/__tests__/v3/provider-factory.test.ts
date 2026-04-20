// Factory precedence + deep-writer hybrid fallback tests.
//
// Covers the contract in server/src/v3/providers/factory.ts:
//   RESUME_V3_<CAP>_BACKEND  >  RESUME_V3_PROVIDER  >  default
// and the deep-writer-on-openai fallback behavior.
//
// Tests use environment-variable manipulation and the factory cache reset;
// no real LLM calls are made. The fallback test mocks the underlying
// provider classes via vi.mock() to force errors and observe behavior.

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  _resetProviderCache,
  getProvider,
  resolveBackend,
  type Backend,
  type Capability,
} from '../../v3/providers/factory.js';
import * as llmProvider from '../../lib/llm-provider.js';

// Capture original env so tests can restore state cleanly.
const SAVED: Record<string, string | undefined> = {};
const ENV_KEYS = [
  'RESUME_V3_PROVIDER',
  'RESUME_V3_STRONG_REASONING_BACKEND',
  'RESUME_V3_FAST_WRITER_BACKEND',
  'RESUME_V3_DEEP_WRITER_BACKEND',
  'RESUME_V3_STRONG_REASONING_MODEL',
  'RESUME_V3_STRONG_REASONING_MODEL_OPENAI',
  'RESUME_V3_FAST_WRITER_MODEL',
  'RESUME_V3_FAST_WRITER_MODEL_OPENAI',
  'RESUME_V3_DEEP_WRITER_MODEL',
  'RESUME_V3_DEEP_WRITER_MODEL_OPENAI',
  'VERTEX_PROJECT',
  'GCP_PROJECT',
  'OpenAI_API_KEY',
  'OPENAI_API_KEY',
  'DEEPSEEK_API_KEY',
  'DEEPINFRA_API_KEY',
];

beforeEach(() => {
  for (const key of ENV_KEYS) {
    SAVED[key] = process.env[key];
    delete process.env[key];
  }
  _resetProviderCache();
});

afterEach(() => {
  for (const key of ENV_KEYS) {
    if (SAVED[key] === undefined) {
      delete process.env[key];
    } else {
      process.env[key] = SAVED[key];
    }
  }
  _resetProviderCache();
  vi.restoreAllMocks();
});

// -----------------------------------------------------------------------------
// resolveBackend — precedence tests (no provider instantiation required)
// -----------------------------------------------------------------------------

describe('resolveBackend precedence', () => {
  it('uses default when no env vars set (post-2026-04-20 all-OpenAI flip)', () => {
    // Defaults flipped 2026-04-20 pm (commit 171cb7be) from the earlier
    // vertex/vertex/openai hybrid to all-OpenAI.
    expect(resolveBackend('strong-reasoning')).toBe('openai');
    expect(resolveBackend('fast-writer')).toBe('openai');
    expect(resolveBackend('deep-writer')).toBe('openai');
  });

  it('RESUME_V3_PROVIDER overrides defaults for all capabilities', () => {
    process.env.RESUME_V3_PROVIDER = 'anthropic';
    expect(resolveBackend('strong-reasoning')).toBe('anthropic');
    expect(resolveBackend('fast-writer')).toBe('anthropic');
    expect(resolveBackend('deep-writer')).toBe('anthropic');
  });

  it('per-capability env var beats global env var', () => {
    process.env.RESUME_V3_PROVIDER = 'vertex';
    process.env.RESUME_V3_DEEP_WRITER_BACKEND = 'openai';
    expect(resolveBackend('strong-reasoning')).toBe('vertex');
    expect(resolveBackend('fast-writer')).toBe('vertex');
    expect(resolveBackend('deep-writer')).toBe('openai');
  });

  it('per-capability env var works without global env var', () => {
    process.env.RESUME_V3_STRONG_REASONING_BACKEND = 'anthropic';
    expect(resolveBackend('strong-reasoning')).toBe('anthropic');
    // fast-writer + deep-writer fall back to the post-flip default (openai).
    expect(resolveBackend('fast-writer')).toBe('openai');
    expect(resolveBackend('deep-writer')).toBe('openai');
  });

  it('accepts mixed-case env values', () => {
    process.env.RESUME_V3_DEEP_WRITER_BACKEND = 'Vertex';
    expect(resolveBackend('deep-writer')).toBe('vertex');
  });

  it('throws on unknown backend value', () => {
    process.env.RESUME_V3_DEEP_WRITER_BACKEND = 'gemini';
    expect(() => resolveBackend('deep-writer')).toThrow(/unknown backend "gemini"/);
  });
});

// -----------------------------------------------------------------------------
// getProvider — model resolution per backend
// -----------------------------------------------------------------------------

describe('getProvider model resolution', () => {
  it('uses vertex default model when backend is vertex with no env override', () => {
    process.env.VERTEX_PROJECT = 'test-project';
    process.env.RESUME_V3_STRONG_REASONING_BACKEND = 'vertex';
    const resolved = getProvider('strong-reasoning');
    expect(resolved.backend).toBe('vertex');
    expect(resolved.model).toBe('deepseek-ai/deepseek-v3.2-maas');
  });

  it('RESUME_V3_*_MODEL env var overrides the vertex default', () => {
    process.env.VERTEX_PROJECT = 'test-project';
    process.env.RESUME_V3_STRONG_REASONING_BACKEND = 'vertex';
    process.env.RESUME_V3_STRONG_REASONING_MODEL = 'custom-vertex-model';
    const resolved = getProvider('strong-reasoning');
    expect(resolved.model).toBe('custom-vertex-model');
  });

  it('uses openai default model when backend is openai (gpt-5.4-mini since Phase 4.13)', () => {
    process.env.OpenAI_API_KEY = 'sk-test';
    process.env.RESUME_V3_STRONG_REASONING_BACKEND = 'openai';
    const resolved = getProvider('strong-reasoning');
    expect(resolved.backend).toBe('openai');
    expect(resolved.model).toBe('gpt-5.4-mini');
  });

  it('RESUME_V3_*_MODEL_OPENAI overrides the openai default', () => {
    process.env.OpenAI_API_KEY = 'sk-test';
    process.env.RESUME_V3_STRONG_REASONING_BACKEND = 'openai';
    process.env.RESUME_V3_STRONG_REASONING_MODEL_OPENAI = 'gpt-5';
    const resolved = getProvider('strong-reasoning');
    expect(resolved.model).toBe('gpt-5');
  });

  it('fast-writer openai default is gpt-5.4-mini (Phase 4.13)', () => {
    process.env.OpenAI_API_KEY = 'sk-test';
    process.env.RESUME_V3_FAST_WRITER_BACKEND = 'openai';
    const resolved = getProvider('fast-writer');
    expect(resolved.model).toBe('gpt-5.4-mini');
  });

  it('deep-writer defaults to openai backend with gpt-5.4-mini model (Phase 4.13)', () => {
    process.env.VERTEX_PROJECT = 'test-project';
    process.env.OpenAI_API_KEY = 'sk-test';
    const resolved = getProvider('deep-writer');
    expect(resolved.backend).toBe('openai');
    expect(resolved.model).toBe('gpt-5.4-mini');
    // Wrapper strips extraParams; no thinking on the primary path.
    expect(resolved.extraParams).toBeUndefined();
  });

  it('deep-writer on vertex backend sets thinking: true', () => {
    process.env.VERTEX_PROJECT = 'test-project';
    process.env.RESUME_V3_DEEP_WRITER_BACKEND = 'vertex';
    const resolved = getProvider('deep-writer');
    expect(resolved.backend).toBe('vertex');
    expect(resolved.extraParams?.thinking).toBe(true);
  });

  it('throws when vertex backend requested without VERTEX_PROJECT', () => {
    process.env.RESUME_V3_STRONG_REASONING_BACKEND = 'vertex';
    expect(() => getProvider('strong-reasoning')).toThrow(/VERTEX_PROJECT/);
  });

  it('throws when openai backend requested without OpenAI_API_KEY', () => {
    process.env.RESUME_V3_STRONG_REASONING_BACKEND = 'openai';
    expect(() => getProvider('strong-reasoning')).toThrow(/OpenAI_API_KEY/);
  });
});

// -----------------------------------------------------------------------------
// deep-writer hybrid fallback — OpenAI primary, Vertex-thinking fallback
// -----------------------------------------------------------------------------

describe('deep-writer hybrid fallback', () => {
  it('falls back to vertex when the openai stream throws', async () => {
    process.env.VERTEX_PROJECT = 'test-project';
    process.env.OpenAI_API_KEY = 'sk-test';

    // Mock OpenAIProvider.stream to throw, and VertexProvider.stream to yield a result.
    // We mock at the class prototype level to intercept all instances.
    const primaryErr = new Error('openai down');
    const openaiStreamSpy = vi
      .spyOn(llmProvider.OpenAIProvider.prototype, 'stream')
      .mockImplementation(async function* () {
        throw primaryErr;
      });
    const vertexStreamSpy = vi
      .spyOn(llmProvider.VertexProvider.prototype, 'stream')
      .mockImplementation(async function* () {
        yield { type: 'text', text: 'from-vertex' };
        yield { type: 'done', usage: { input_tokens: 1, output_tokens: 1 } };
      });

    const resolved = getProvider('deep-writer');
    expect(resolved.backend).toBe('openai');

    const events: llmProvider.StreamEvent[] = [];
    for await (const e of resolved.provider.stream({
      model: resolved.model,
      system: 'sys',
      messages: [{ role: 'user', content: 'hi' }],
      max_tokens: 10,
    })) {
      events.push(e);
    }

    expect(openaiStreamSpy).toHaveBeenCalledTimes(1);
    expect(vertexStreamSpy).toHaveBeenCalledTimes(1);
    // Verify fallback params propagated the thinking flag
    const vertexCall = vertexStreamSpy.mock.calls[0][0];
    expect(vertexCall.thinking).toBe(true);
    expect(vertexCall.model).toBe('deepseek-ai/deepseek-v3.2-maas');
    // Verify we actually got the fallback's output
    const textEvents = events.filter((e) => e.type === 'text') as Array<{ type: 'text'; text: string }>;
    expect(textEvents.some((e) => e.text === 'from-vertex')).toBe(true);
  });

  it('does NOT fall back on abort errors', async () => {
    process.env.VERTEX_PROJECT = 'test-project';
    process.env.OpenAI_API_KEY = 'sk-test';

    const abortErr = new Error('user aborted');
    abortErr.name = 'AbortError';
    const openaiStreamSpy = vi
      .spyOn(llmProvider.OpenAIProvider.prototype, 'stream')
      .mockImplementation(async function* () {
        throw abortErr;
      });
    const vertexStreamSpy = vi
      .spyOn(llmProvider.VertexProvider.prototype, 'stream')
      .mockImplementation(async function* () {
        yield { type: 'text', text: 'should-not-fire' };
      });

    const resolved = getProvider('deep-writer');
    const stream = resolved.provider.stream({
      model: resolved.model,
      system: 'sys',
      messages: [{ role: 'user', content: 'hi' }],
      max_tokens: 10,
    });

    await expect(async () => {
      for await (const _e of stream) { /* consume */ }
    }).rejects.toThrow('user aborted');
    expect(openaiStreamSpy).toHaveBeenCalledTimes(1);
    expect(vertexStreamSpy).not.toHaveBeenCalled();
  });

  it('strips thinking flag from primary (OpenAI) call', async () => {
    process.env.VERTEX_PROJECT = 'test-project';
    process.env.OpenAI_API_KEY = 'sk-test';

    const openaiStreamSpy = vi
      .spyOn(llmProvider.OpenAIProvider.prototype, 'stream')
      .mockImplementation(async function* () {
        yield { type: 'text', text: 'ok' };
        yield { type: 'done', usage: { input_tokens: 1, output_tokens: 1 } };
      });

    const resolved = getProvider('deep-writer');
    const events: llmProvider.StreamEvent[] = [];
    for await (const e of resolved.provider.stream({
      model: resolved.model,
      system: 'sys',
      messages: [{ role: 'user', content: 'hi' }],
      max_tokens: 10,
      thinking: true, // caller accidentally passed this; wrapper strips
    })) {
      events.push(e);
    }

    expect(openaiStreamSpy).toHaveBeenCalledTimes(1);
    const call = openaiStreamSpy.mock.calls[0][0];
    expect(call.thinking).toBeUndefined();
  });

  it('strong-reasoning on openai does NOT fall back on failure (only deep-writer does)', async () => {
    process.env.VERTEX_PROJECT = 'test-project';
    process.env.OpenAI_API_KEY = 'sk-test';
    process.env.RESUME_V3_STRONG_REASONING_BACKEND = 'openai';

    const openaiStreamSpy = vi
      .spyOn(llmProvider.OpenAIProvider.prototype, 'stream')
      .mockImplementation(async function* () {
        throw new Error('openai down');
      });
    const vertexStreamSpy = vi
      .spyOn(llmProvider.VertexProvider.prototype, 'stream')
      .mockImplementation(async function* () {
        yield { type: 'text', text: 'should-not-fire' };
      });

    const resolved = getProvider('strong-reasoning');
    expect(resolved.backend).toBe('openai');

    const stream = resolved.provider.stream({
      model: resolved.model,
      system: 'sys',
      messages: [{ role: 'user', content: 'hi' }],
      max_tokens: 10,
    });

    await expect(async () => {
      for await (const _e of stream) { /* consume */ }
    }).rejects.toThrow('openai down');
    expect(openaiStreamSpy).toHaveBeenCalledTimes(1);
    expect(vertexStreamSpy).not.toHaveBeenCalled();
  });
});

// -----------------------------------------------------------------------------
// Caching
// -----------------------------------------------------------------------------

describe('getProvider caching', () => {
  it('caches the same capability across calls', () => {
    process.env.VERTEX_PROJECT = 'test-project';
    process.env.RESUME_V3_STRONG_REASONING_BACKEND = 'vertex';
    const a = getProvider('strong-reasoning');
    const b = getProvider('strong-reasoning');
    expect(a).toBe(b);
  });

  it('_resetProviderCache forces re-resolution', () => {
    process.env.VERTEX_PROJECT = 'test-project';
    process.env.RESUME_V3_STRONG_REASONING_BACKEND = 'vertex';
    const a = getProvider('strong-reasoning');
    _resetProviderCache();
    const b = getProvider('strong-reasoning');
    expect(a).not.toBe(b);
  });
});

// Type-level assertion to make sure Capability/Backend unions stay narrow.
const _typecheck_cap: Capability = 'strong-reasoning';
const _typecheck_backend: Backend = 'vertex';
void _typecheck_cap;
void _typecheck_backend;
