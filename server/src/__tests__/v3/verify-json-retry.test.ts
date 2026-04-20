// Verify stage JSON/schema retry tests (Fix 8, 2026-04-20 pm).
//
// The v3 revalidation (docs/v3-rebuild/reports/all-openai-19-fixture-
// validation-v3.md) surfaced a new gpt-5.4-mini failure mode on verify:
// fixture-07 diana-downs produced 34 output tokens and the stream ended
// with an unterminated string, breaking JSON.parse. Verify had no retry
// path. Fix 8 adds one, mirroring the classify Fix 5 pattern.
//
// The state machine tested here:
//   first attempt valid                 → no retry, single call
//   first invalid (JSON), retry valid   → two calls, second output returned
//   first invalid, retry also invalid   → throws with both errors
//   disableJsonRetry=true               → throws on first failure (test escape)
//
// translate.ts is mocked to a no-op so the retry-path tests aren't
// dependent on the translate stage's own LLM call.

import { beforeEach, afterEach, describe, expect, it, vi } from 'vitest';
import { _resetProviderCache } from '../../v3/providers/factory.js';
import type {
  Strategy,
  StructuredResume,
  VerifyResult,
  WrittenResume,
} from '../../v3/types.js';

// Minimum valid VerifyResult — schema only cares about passed + issues shape.
const VALID_VERIFY: VerifyResult = {
  passed: true,
  issues: [],
};

// Truncated-string JSON (reproduces fixture-07 shape — stream ended mid-string).
const TRUNCATED_JSON = '{"passed": true, "issues": [{"severity": "warning"';

// Minimal source/strategy/written fixtures — verify doesn't care about their
// content for these tests since we mock the LLM.
const SOURCE: StructuredResume = {
  contact: { fullName: 'Test Candidate' },
  discipline: 'test',
  positions: [
    {
      title: 'Engineer',
      company: 'Co',
      dates: { start: '2020', end: '2024', raw: '2020-2024' },
      bullets: [
        { text: 'Built stuff.', is_new: false, evidence_found: true, confidence: 1.0 },
      ],
      confidence: 1.0,
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
  overallConfidence: 1.0,
};

const STRATEGY: Strategy = {
  positioningFrame: 'engineer',
  targetDisciplinePhrase: 'Senior Engineer',
  emphasizedAccomplishments: [],
  objections: [],
  positionEmphasis: [],
};

const WRITTEN: WrittenResume = {
  summary: 'A senior engineer.',
  selectedAccomplishments: [],
  coreCompetencies: [],
  positions: [
    {
      positionIndex: 0,
      title: 'Engineer',
      company: 'Co',
      dates: { start: '2020', end: '2024', raw: '2020-2024' },
      scope: null,
      bullets: [
        { text: 'Built stuff.', is_new: false, evidence_found: true, confidence: 1.0 },
      ],
    },
  ],
  customSections: [],
};

function streamOf(text: string, usage = { input_tokens: 1000, output_tokens: 500 }) {
  return async function* () {
    yield { type: 'text' as const, text };
    yield { type: 'done' as const, usage };
  };
}

describe('verify JSON/schema retry', () => {
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
    vi.doUnmock('../../v3/verify/translate.js');
  });

  function mockAllDeps(streamFn: ReturnType<typeof vi.fn>) {
    vi.doMock('../../v3/prompts/loader.js', () => ({
      loadPrompt: vi.fn().mockReturnValue({
        systemMessage: 'You are the verify agent.',
        userMessageTemplate:
          'Strategy: {{strategy_json}}\nSource: {{resume_json}}\nWritten: {{written_json}}\nAttribution: {{attribution_json}}',
        version: '1.3',
        capability: 'strong-reasoning',
        temperature: 0.1,
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
    // Translate runs as a sidecar after verify; stub it so these tests only
    // exercise the retry loop, not the translate LLM path.
    vi.doMock('../../v3/verify/translate.js', () => ({
      translateVerifyIssues: vi.fn().mockResolvedValue({
        translated: undefined,
        telemetry: undefined,
      }),
    }));
  }

  it('first-attempt valid: does NOT fire retry, single provider call', async () => {
    const streamFn = vi.fn(streamOf(JSON.stringify(VALID_VERIFY)));
    mockAllDeps(streamFn);

    const mod = await import('../../v3/verify/index.js');
    const { telemetry } = await mod.verifyWithTelemetry(WRITTEN, SOURCE, STRATEGY);

    expect(telemetry.jsonRetryFired).toBe(false);
    expect(streamFn).toHaveBeenCalledTimes(1);
  });

  it('truncated first, valid retry: fires retry, returns the valid second output', async () => {
    const streamFn = vi
      .fn()
      .mockImplementationOnce(streamOf(TRUNCATED_JSON))
      .mockImplementationOnce(streamOf(JSON.stringify(VALID_VERIFY)));
    mockAllDeps(streamFn);

    const mod = await import('../../v3/verify/index.js');
    const { result, telemetry } = await mod.verifyWithTelemetry(WRITTEN, SOURCE, STRATEGY);

    expect(result.passed).toBe(true);
    expect(telemetry.jsonRetryFired).toBe(true);
    expect(streamFn).toHaveBeenCalledTimes(2);

    // Token accumulator should span both attempts.
    expect(telemetry.inputTokens).toBe(2000);
    expect(telemetry.outputTokens).toBe(1000);

    // Retry system message must include the retry addendum naming the parse
    // failure. Check non-silent.
    const retrySystem = streamFn.mock.calls[1][0].system as string;
    expect(retrySystem).toMatch(/RETRY/);
    expect(retrySystem).toMatch(/not valid JSON/i);
  });

  it('truncated both attempts: throws with "BOTH" in message', async () => {
    const streamFn = vi
      .fn()
      .mockImplementationOnce(streamOf(TRUNCATED_JSON))
      .mockImplementationOnce(streamOf(TRUNCATED_JSON));
    mockAllDeps(streamFn);

    const mod = await import('../../v3/verify/index.js');
    await expect(
      mod.verifyWithTelemetry(WRITTEN, SOURCE, STRATEGY),
    ).rejects.toThrow(/failed on BOTH/i);

    expect(streamFn).toHaveBeenCalledTimes(2);
  });

  it('disableJsonRetry=true: throws immediately on first failure, no retry', async () => {
    const streamFn = vi.fn(streamOf(TRUNCATED_JSON));
    mockAllDeps(streamFn);

    const mod = await import('../../v3/verify/index.js');
    await expect(
      mod.verifyWithTelemetry(WRITTEN, SOURCE, STRATEGY, { disableJsonRetry: true }),
    ).rejects.toThrow(/not valid JSON/i);

    expect(streamFn).toHaveBeenCalledTimes(1);
  });

  it('schema-invalid first, valid retry: addendum names the Zod error, not the JSON error', async () => {
    // passed: 'yes' (string, not boolean) — parses as JSON but fails schema.
    const SCHEMA_INVALID = '{"passed": "yes", "issues": []}';
    const streamFn = vi
      .fn()
      .mockImplementationOnce(streamOf(SCHEMA_INVALID))
      .mockImplementationOnce(streamOf(JSON.stringify(VALID_VERIFY)));
    mockAllDeps(streamFn);

    const mod = await import('../../v3/verify/index.js');
    const { telemetry } = await mod.verifyWithTelemetry(WRITTEN, SOURCE, STRATEGY);

    expect(telemetry.jsonRetryFired).toBe(true);
    expect(streamFn).toHaveBeenCalledTimes(2);

    const retrySystem = streamFn.mock.calls[1][0].system as string;
    expect(retrySystem).toMatch(/schema validation/i);
  });
});
