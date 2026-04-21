// Write-stage schema retry integration test. Reproduces the 2026-04-20
// production incident where gpt-5.4-mini on write-position emitted
// `bullets[n].confidence: true` (a boolean) instead of a number, tripping
// Zod validation and hard-failing the whole pipeline with no retry path.
//
// After commit 1 of the structured-llm migration plan (primitive +
// runSection migration), the primitive's schema retry catches this and
// re-invokes the LLM with a targeted addendum that names the failing Zod
// path. These tests pin that behavior at the stage level.
//
// Mocks are prompt-aware — writeWithTelemetry fires all five section
// types in parallel, so we dispatch responses by inspecting the system
// message (which contains the prompt's name).

import { beforeEach, afterEach, describe, expect, it, vi } from 'vitest';
import { _resetProviderCache } from '../../v3/providers/factory.js';
import type { Strategy, StructuredResume } from '../../v3/types.js';

// Valid shapes per section schema.
const VALID_SUMMARY = { summary: 'Test summary prose.' };
const VALID_ACCOMPLISHMENTS = {
  selectedAccomplishments: ['Accomplishment one.', 'Accomplishment two.'],
};
const VALID_COMPETENCIES = {
  coreCompetencies: ['Operations', 'Strategy', 'Execution'],
};
const VALID_POSITION = {
  positionIndex: 0,
  title: 'Sr Project Controls Manager',
  company: 'Acme',
  dates: { start: '2020', end: '2024', raw: '2020 – 2024' },
  scope: null,
  bullets: [
    {
      text: 'Shipped a thing.',
      is_new: true,
      source: 'positions[0].bullets[0]',
      evidence_found: true,
      confidence: 0.9,
    },
  ],
};

// Reproduces the production failure: confidence emitted as a boolean.
const INVALID_POSITION_BOOLEAN_CONFIDENCE = {
  ...VALID_POSITION,
  bullets: [
    {
      ...VALID_POSITION.bullets[0],
      confidence: true, // <-- type error; Zod expects number 0-1
    },
  ],
};

const SOURCE: StructuredResume = {
  contact: { fullName: 'Test Candidate' },
  discipline: 'test',
  positions: [
    {
      title: 'Sr Project Controls Manager',
      company: 'Acme',
      dates: { start: '2020', end: '2024', raw: '2020 – 2024' },
      bullets: [
        {
          text: 'Shipped a thing.',
          is_new: false,
          evidence_found: true,
          confidence: 1.0,
        },
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
  positioningFrame: 'test',
  targetDisciplinePhrase: 'Test Phrase',
  emphasizedAccomplishments: [],
  objections: [],
  positionEmphasis: [{ positionIndex: 0, weight: 'primary', rationale: 'most recent' }],
};

// Prompt-aware mock: the stream function looks at the system message to
// decide which section's response shape to return. This sidesteps the
// parallel-fire ordering problem.
function promptAwareStream(
  positionResponses: unknown[],
): ReturnType<typeof vi.fn> {
  let positionCallIndex = 0;
  const streamFn = vi.fn(async function* (params: unknown) {
    const p = params as { system: string };
    let body: unknown;
    if (p.system.includes('write-summary')) body = VALID_SUMMARY;
    else if (p.system.includes('write-accomplishments')) body = VALID_ACCOMPLISHMENTS;
    else if (p.system.includes('write-competencies')) body = VALID_COMPETENCIES;
    else if (p.system.includes('write-position')) {
      body = positionResponses[positionCallIndex] ?? VALID_POSITION;
      positionCallIndex += 1;
    } else if (p.system.includes('write-custom-section')) {
      body = { title: 'Test', entries: [] };
    } else {
      body = {};
    }
    yield { type: 'text' as const, text: JSON.stringify(body) };
    yield {
      type: 'done' as const,
      usage: { input_tokens: 100, output_tokens: 50 },
    };
  });
  return streamFn;
}

describe('write stage — boolean-confidence schema retry', () => {
  beforeEach(() => {
    _resetProviderCache();
    process.env.OpenAI_API_KEY = 'sk-test';
    process.env.RESUME_V3_DEEP_WRITER_BACKEND = 'openai';
    process.env.RESUME_V3_FAST_WRITER_BACKEND = 'openai';
    process.env.RESUME_V3_STRONG_REASONING_BACKEND = 'openai';
    vi.resetModules();
  });

  afterEach(() => {
    vi.doUnmock('../../v3/prompts/loader.js');
    vi.doUnmock('../../v3/providers/factory.js');
  });

  function installMocks(streamFn: ReturnType<typeof vi.fn>) {
    // loadPrompt returns a prompt object with the promptName baked into the
    // system message so the stream mock can discriminate.
    vi.doMock('../../v3/prompts/loader.js', () => ({
      loadPrompt: vi.fn((name: string) => ({
        systemMessage: `You are the ${name} agent.`,
        userMessageTemplate:
          'Strategy: {{strategy_json}}\nResume: {{resume_json}}\nPosition: {{position_json}}\nIndex: {{position_index}}\nSection: {{section_json}}',
        version: '1.0',
        capability: name.startsWith('write-position') || name.startsWith('write-bullet')
          ? 'deep-writer'
          : 'fast-writer',
        temperature: 0.4,
      })),
    }));
    vi.doMock('../../v3/providers/factory.js', () => ({
      getProvider: vi.fn().mockReturnValue({
        provider: { name: 'mock', stream: streamFn },
        model: 'gpt-5.4-mini',
        backend: 'openai',
        capability: 'deep-writer',
        extraParams: undefined,
      }),
      _resetProviderCache: vi.fn(),
    }));
  }

  it('production-failure reproduction: boolean confidence on a bullet triggers primitive schema retry and succeeds on retry', async () => {
    // Position call #1: invalid (boolean confidence — the fixture-12 pattern).
    // Position call #2: valid.
    const streamFn = promptAwareStream([
      INVALID_POSITION_BOOLEAN_CONFIDENCE,
      VALID_POSITION,
    ]);
    installMocks(streamFn);

    const mod = await import('../../v3/write/index.js');
    const result = await mod.writeWithTelemetry(SOURCE, STRATEGY, { variant: 'v1' });

    // Retry surfaces the valid second output.
    expect(result.written.positions[0].bullets[0].confidence).toBe(0.9);
    expect(result.written.positions[0].bullets[0].text).toBe('Shipped a thing.');
    // Telemetry records that the retry fired on the position section.
    expect(result.telemetry.sections.positions[0].schemaRetryFired).toBe(true);
    // Other sections were clean — no retry on them.
    expect(result.telemetry.sections.summary.schemaRetryFired).toBe(false);
    expect(result.telemetry.sections.accomplishments.schemaRetryFired).toBe(false);
    expect(result.telemetry.sections.competencies.schemaRetryFired).toBe(false);
  });

  it('both attempts fail on the same schema issue → write throws WriteError with "failed on BOTH"', async () => {
    // Both position attempts return the invalid shape.
    const streamFn = promptAwareStream([
      INVALID_POSITION_BOOLEAN_CONFIDENCE,
      INVALID_POSITION_BOOLEAN_CONFIDENCE,
    ]);
    installMocks(streamFn);

    const mod = await import('../../v3/write/index.js');
    await expect(
      mod.writeWithTelemetry(SOURCE, STRATEGY, { variant: 'v1' }),
    ).rejects.toMatchObject({
      name: 'WriteError',
      message: expect.stringContaining('failed on BOTH'),
    });
  });

  it('preserves the original error class (WriteError) so callers catching by name still work', async () => {
    const streamFn = promptAwareStream([
      INVALID_POSITION_BOOLEAN_CONFIDENCE,
      INVALID_POSITION_BOOLEAN_CONFIDENCE,
    ]);
    installMocks(streamFn);

    const mod = await import('../../v3/write/index.js');
    try {
      await mod.writeWithTelemetry(SOURCE, STRATEGY, { variant: 'v1' });
      expect.fail('writeWithTelemetry should have thrown WriteError');
    } catch (err) {
      // Named WriteError, not StructuredLlmCallError.
      expect((err as Error).name).toBe('WriteError');
      // Detail should carry validationIssues so v3 error logging can
      // surface the specific path. (Path shape can vary across Zod versions;
      // just check the array is present.)
      const detail = (err as { detail?: { validationIssues?: unknown } }).detail;
      expect(detail?.validationIssues).toBeDefined();
    }
  });
});
