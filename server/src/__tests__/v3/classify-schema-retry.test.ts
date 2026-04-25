// Classify structural retry tests (Fix 5, 2026-04-20 pm; JSON-parse retry
// enabled after the 2026-04-25 live VP Ops validation).
//
// The 2026-04-20 am 19-fixture validation (commit b43686b6) showed
// gpt-5.4-mini produces schema-invalid classify output on two distinct
// patterns: required-field omission (fixture-17 dates) and required-field
// type-confusion (fixture-12 confidence: true vs number). A prompt fix
// closes the first; a retry path handles the general class.
//
// These tests exercise the retry wiring itself — the state machine is
//   first attempt valid                    → no retry, single call
//   first schema-invalid, retry valid      → two calls, second output returned
//   first malformed JSON, retry valid      → two calls, second output returned
//   first invalid, retry also invalid      → throws with both errors
//
// The LLM is mocked at the provider factory so the tests are deterministic.

import { beforeEach, afterEach, describe, expect, it, vi } from 'vitest';
import { _resetProviderCache } from '../../v3/providers/factory.js';
import type { ExtractResult } from '../../v3/types.js';

// Minimum valid StructuredResume JSON. Adjust here once — used by every
// test case that needs a "valid response" stream.
const VALID_RESUME = {
  contact: { fullName: 'Test Candidate' },
  discipline: 'software engineering',
  positions: [
    {
      title: 'Senior Engineer',
      company: 'Acme',
      dates: { start: '2020', end: '2024', raw: '2020 – 2024' },
      bullets: [
        {
          text: 'Shipped the thing.',
          is_new: false,
          evidence_found: true,
          confidence: 0.9,
        },
      ],
      confidence: 0.95,
    },
  ],
  education: [],
  certifications: [],
  skills: [],
  careerGaps: [],
  crossRoleHighlights: [],
  customSections: [],
  pronoun: null,
  flags: [],
  overallConfidence: 0.92,
};

// Invalid variant — mirrors the fixture-12 joel-hough failure: confidence
// emitted as a boolean instead of a number.
const INVALID_RESUME_BOOLEAN_CONFIDENCE = {
  ...VALID_RESUME,
  positions: [
    {
      ...VALID_RESUME.positions[0],
      bullets: [
        {
          ...VALID_RESUME.positions[0].bullets[0],
          confidence: true, // <-- type confusion: boolean where a number 0-1 is required
        },
      ],
    },
  ],
};

const MALFORMED_JSON = JSON.stringify(VALID_RESUME).replace(
  '"careerGaps":[]',
  '"careerGaps":[',
);

const EXTRACT_INPUT: ExtractResult = {
  plaintext: 'Test Candidate\n\nSenior Engineer at Acme 2020-2024\nShipped the thing.',
  format: 'text',
  warnings: [],
};

function streamOf(text: string, usage = { input_tokens: 1000, output_tokens: 500 }) {
  return async function* () {
    yield { type: 'text' as const, text };
    yield { type: 'done' as const, usage };
  };
}

describe('classify schema retry', () => {
  beforeEach(() => {
    _resetProviderCache();
    process.env.OpenAI_API_KEY = 'sk-test';
    process.env.RESUME_V3_STRONG_REASONING_BACKEND = 'openai';
    process.env.RESUME_V3_STRONG_REASONING_MODEL_OPENAI = 'gpt-5.4-mini';
    vi.resetModules();
  });

  afterEach(() => {
    vi.doUnmock('../../v3/prompts/loader.js');
    vi.doUnmock('../../v3/providers/factory.js');
  });

  it('first-attempt valid: does NOT fire retry, single provider call', async () => {
    const streamFn = vi.fn(streamOf(JSON.stringify(VALID_RESUME)));

    vi.doMock('../../v3/prompts/loader.js', () => ({
      loadPrompt: vi.fn().mockReturnValue({
        systemMessage: 'You are the classify agent.',
        userMessageTemplate: 'Resume: {{resume_text}}',
        version: '1.4',
        capability: 'strong-reasoning',
        temperature: 0.2,
      }),
    }));
    vi.doMock('../../v3/providers/factory.js', () => ({
      getProvider: vi.fn().mockReturnValue({
        provider: { name: 'mock', stream: streamFn },
        model: 'gpt-5.4-mini',
        backend: 'openai',
        capability: 'strong-reasoning',
      }),
      _resetProviderCache: vi.fn(),
    }));

    const mod = await import('../../v3/classify/index.js');
    const { resume, telemetry } = await mod.classifyWithTelemetry(EXTRACT_INPUT);

    expect(resume.positions[0].bullets[0].confidence).toBe(0.9);
    expect(telemetry.schemaRetryFired).toBe(false);
    expect(streamFn).toHaveBeenCalledTimes(1);
  });

  it('invalid-first-valid-retry: fires retry, returns the valid second output', async () => {
    const streamFn = vi
      .fn()
      // First attempt: invalid (boolean confidence — the joel-hough pattern).
      .mockImplementationOnce(streamOf(JSON.stringify(INVALID_RESUME_BOOLEAN_CONFIDENCE)))
      // Second attempt: valid.
      .mockImplementationOnce(streamOf(JSON.stringify(VALID_RESUME)));

    vi.doMock('../../v3/prompts/loader.js', () => ({
      loadPrompt: vi.fn().mockReturnValue({
        systemMessage: 'You are the classify agent.',
        userMessageTemplate: 'Resume: {{resume_text}}',
        version: '1.4',
        capability: 'strong-reasoning',
        temperature: 0.2,
      }),
    }));
    vi.doMock('../../v3/providers/factory.js', () => ({
      getProvider: vi.fn().mockReturnValue({
        provider: { name: 'mock', stream: streamFn },
        model: 'gpt-5.4-mini',
        backend: 'openai',
        capability: 'strong-reasoning',
      }),
      _resetProviderCache: vi.fn(),
    }));

    const mod = await import('../../v3/classify/index.js');
    const { resume, telemetry } = await mod.classifyWithTelemetry(EXTRACT_INPUT);

    expect(resume.positions[0].bullets[0].confidence).toBe(0.9);
    expect(telemetry.schemaRetryFired).toBe(true);
    expect(streamFn).toHaveBeenCalledTimes(2);

    // Token accumulator should include both attempts (1000+1000 in + 500+500 out).
    expect(telemetry.inputTokens).toBe(2000);
    expect(telemetry.outputTokens).toBe(1000);

    // Second call's system message MUST include the retry addendum naming the
    // specific Zod issue (boolean confidence). Check that the addendum is
    // present and not a silent no-op.
    const retrySystemMessage = streamFn.mock.calls[1][0].system as string;
    expect(retrySystemMessage).toMatch(/RETRY/);
    expect(retrySystemMessage).toMatch(/confidence/i);
  });

  it('malformed-json-first-valid-retry: fires retry, returns the valid second output', async () => {
    const streamFn = vi
      .fn()
      // First attempt: malformed JSON — the live VP Ops v1.5 failure class.
      .mockImplementationOnce(streamOf(MALFORMED_JSON))
      // Second attempt: valid.
      .mockImplementationOnce(streamOf(JSON.stringify(VALID_RESUME)));

    vi.doMock('../../v3/prompts/loader.js', () => ({
      loadPrompt: vi.fn().mockReturnValue({
        systemMessage: 'You are the classify agent.',
        userMessageTemplate: 'Resume: {{resume_text}}',
        version: '1.5',
        capability: 'strong-reasoning',
        temperature: 0.2,
      }),
    }));
    vi.doMock('../../v3/providers/factory.js', () => ({
      getProvider: vi.fn().mockReturnValue({
        provider: { name: 'mock', stream: streamFn },
        model: 'gpt-5.4-mini',
        backend: 'openai',
        capability: 'strong-reasoning',
      }),
      _resetProviderCache: vi.fn(),
    }));

    const mod = await import('../../v3/classify/index.js');
    const { resume, telemetry } = await mod.classifyWithTelemetry(EXTRACT_INPUT);

    expect(resume.positions[0].bullets[0].confidence).toBe(0.9);
    expect(telemetry.schemaRetryFired).toBe(true);
    expect(streamFn).toHaveBeenCalledTimes(2);

    const retrySystemMessage = streamFn.mock.calls[1][0].system as string;
    expect(retrySystemMessage).toMatch(/RETRY/);
    expect(retrySystemMessage).toMatch(/not valid JSON/i);
    expect(retrySystemMessage).toMatch(/Return ONLY the complete StructuredResume JSON object/);
  });

  it('invalid-both: throws a specific error naming both attempts', async () => {
    const streamFn = vi
      .fn()
      .mockImplementationOnce(streamOf(JSON.stringify(INVALID_RESUME_BOOLEAN_CONFIDENCE)))
      .mockImplementationOnce(streamOf(JSON.stringify(INVALID_RESUME_BOOLEAN_CONFIDENCE)));

    vi.doMock('../../v3/prompts/loader.js', () => ({
      loadPrompt: vi.fn().mockReturnValue({
        systemMessage: 'You are the classify agent.',
        userMessageTemplate: 'Resume: {{resume_text}}',
        version: '1.4',
        capability: 'strong-reasoning',
        temperature: 0.2,
      }),
    }));
    vi.doMock('../../v3/providers/factory.js', () => ({
      getProvider: vi.fn().mockReturnValue({
        provider: { name: 'mock', stream: streamFn },
        model: 'gpt-5.4-mini',
        backend: 'openai',
        capability: 'strong-reasoning',
      }),
      _resetProviderCache: vi.fn(),
    }));

    const mod = await import('../../v3/classify/index.js');
    await expect(mod.classifyWithTelemetry(EXTRACT_INPUT)).rejects.toThrow(
      /structural validation failed on BOTH/i,
    );

    expect(streamFn).toHaveBeenCalledTimes(2);
  });

  it('disableSchemaRetry=true: throws on first failure without attempting a retry (test escape hatch)', async () => {
    const streamFn = vi.fn(streamOf(JSON.stringify(INVALID_RESUME_BOOLEAN_CONFIDENCE)));

    vi.doMock('../../v3/prompts/loader.js', () => ({
      loadPrompt: vi.fn().mockReturnValue({
        systemMessage: 'You are the classify agent.',
        userMessageTemplate: 'Resume: {{resume_text}}',
        version: '1.4',
        capability: 'strong-reasoning',
        temperature: 0.2,
      }),
    }));
    vi.doMock('../../v3/providers/factory.js', () => ({
      getProvider: vi.fn().mockReturnValue({
        provider: { name: 'mock', stream: streamFn },
        model: 'gpt-5.4-mini',
        backend: 'openai',
        capability: 'strong-reasoning',
      }),
      _resetProviderCache: vi.fn(),
    }));

    const mod = await import('../../v3/classify/index.js');
    await expect(
      mod.classifyWithTelemetry(EXTRACT_INPUT, { disableSchemaRetry: true }),
    ).rejects.toThrow(/did not match the StructuredResume schema/i);

    // Only the first call fired; no retry.
    expect(streamFn).toHaveBeenCalledTimes(1);
  });
});
