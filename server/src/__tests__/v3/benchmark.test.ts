// Benchmark stage tests — schema validation + happy-path orchestration.
//
// The LLM call itself is mocked; we're testing the wiring between the
// prompt loader, provider factory, streaming parser, and Zod schema,
// plus the shape of the BenchmarkResult telemetry.

import { beforeEach, describe, expect, it, vi } from 'vitest';
import { BenchmarkProfileSchema } from '../../v3/benchmark/schema.js';
import { _resetProviderCache } from '../../v3/providers/factory.js';

const SAMPLE_BENCHMARK = {
  roleProblemHypothesis:
    'The SaaS business is past product-market fit but the revenue team has plateaued. They need forecasting discipline on a sales org that grew through hustle.',
  idealProfileSummary:
    'A strong candidate has led a 20-50 person revenue operations team at a $100M-$500M ARR SaaS business with forecasting accuracy held within 5 percent for six consecutive quarters.',
  directMatches: [
    {
      jdRequirement: 'Build and own quarterly forecasting process',
      candidateEvidence: 'Led forecasting for $180M ARR product line at Acme; ±4% accuracy 5 quarters',
      strength: 'strong' as const,
    },
  ],
  gapAssessment: [
    {
      gap: 'No direct SaaS-specific operator experience (prior role was B2B services)',
      severity: 'manageable' as const,
      bridgingStrategy:
        'Lead with the forecasting-discipline evidence and treat the industry gap as transferable revenue-operations craft.',
    },
  ],
  positioningFrame:
    'Frame this candidate as the operator who has already done the hard part — imposing measurement discipline on a scaling revenue org — in an adjacent B2B services context, and can bring that muscle to the SaaS motion without needing to re-learn the craft.',
  hiringManagerObjections: [
    {
      objection: 'Candidate is from services, not SaaS — worry about pace and product fluency',
      neutralizationStrategy:
        'Open the summary with the forecasting-accuracy streak; subordinate the industry; surface the CRM migration as proof of technical-operations chops.',
    },
  ],
};

describe('BenchmarkProfileSchema', () => {
  it('accepts a well-formed benchmark output', () => {
    const result = BenchmarkProfileSchema.safeParse(SAMPLE_BENCHMARK);
    expect(result.success).toBe(true);
  });

  it('rejects gapAssessment severity outside the enum', () => {
    const bad = {
      ...SAMPLE_BENCHMARK,
      gapAssessment: [
        {
          gap: 'x',
          severity: 'catastrophic',
          bridgingStrategy: 'x',
        },
      ],
    };
    const result = BenchmarkProfileSchema.safeParse(bad);
    expect(result.success).toBe(false);
  });

  it('rejects empty directMatches array (requires min 1)', () => {
    const bad = { ...SAMPLE_BENCHMARK, directMatches: [] };
    const result = BenchmarkProfileSchema.safeParse(bad);
    expect(result.success).toBe(false);
  });

  it('rejects missing required field (positioningFrame)', () => {
    const bad = { ...SAMPLE_BENCHMARK } as Record<string, unknown>;
    delete bad.positioningFrame;
    const result = BenchmarkProfileSchema.safeParse(bad);
    expect(result.success).toBe(false);
  });
});

describe('benchmarkWithTelemetry', () => {
  // Simulate the provider factory returning a stub provider that streams our
  // sample output. We're testing that the runner loads the prompt, calls the
  // provider, parses JSON, validates schema, and produces a well-formed
  // BenchmarkResult.
  //
  // To avoid needing the full factory/prompts integration, we bypass with
  // vi.mock and assert happy path only.

  beforeEach(() => {
    _resetProviderCache();
    // Required env to avoid factory throwing.
    process.env.OpenAI_API_KEY = 'sk-test';
    process.env.RESUME_V3_STRONG_REASONING_BACKEND = 'openai';
    process.env.RESUME_V3_STRONG_REASONING_MODEL_OPENAI = 'gpt-5.4-mini';
  });

  it('parses a valid LLM output into a BenchmarkProfile', async () => {
    // Mock the provider factory + prompt loader chain via vi.mock.
    vi.resetModules();

    vi.doMock('../../v3/prompts/loader.js', () => ({
      loadPrompt: vi.fn().mockReturnValue({
        systemMessage: 'You are the benchmark agent.',
        userMessageTemplate: 'JD: {{jd_text}}\nResume: {{resume_json}}',
        version: '1.0',
        capability: 'strong-reasoning',
        temperature: 0.2,
      }),
    }));

    vi.doMock('../../v3/providers/factory.js', () => ({
      getProvider: vi.fn().mockReturnValue({
        provider: {
          name: 'mock',
          async *stream() {
            yield { type: 'text', text: JSON.stringify(SAMPLE_BENCHMARK) };
            yield { type: 'done', usage: { input_tokens: 1500, output_tokens: 600 } };
          },
          async chat() {
            throw new Error('chat not used');
          },
        },
        model: 'gpt-5.4-mini',
        capability: 'strong-reasoning',
        backend: 'openai',
      }),
      _resetProviderCache: vi.fn(),
    }));

    const { benchmarkWithTelemetry } = await import('../../v3/benchmark/index.js');

    const result = await benchmarkWithTelemetry(
      {
        contact: { fullName: 'Test Candidate' },
        discipline: 'revenue operations',
        positions: [],
        education: [],
        certifications: [],
        skills: [],
        customSections: [],
        crossRoleHighlights: [],
        careerGaps: [],
        pronoun: null,
      } as never,
      { text: 'Test JD text' },
    );

    expect(result.benchmark.roleProblemHypothesis).toBe(SAMPLE_BENCHMARK.roleProblemHypothesis);
    expect(result.benchmark.directMatches).toHaveLength(1);
    expect(result.benchmark.directMatches[0]!.strength).toBe('strong');
    expect(result.benchmark.gapAssessment[0]!.severity).toBe('manageable');
    expect(result.telemetry.model).toBe('gpt-5.4-mini');
    expect(result.telemetry.backend).toBe('openai');
    expect(result.telemetry.inputTokens).toBe(1500);
    expect(result.telemetry.outputTokens).toBe(600);
  });

  it('throws BenchmarkError when LLM returns invalid JSON', async () => {
    vi.resetModules();

    vi.doMock('../../v3/prompts/loader.js', () => ({
      loadPrompt: vi.fn().mockReturnValue({
        systemMessage: 'x',
        userMessageTemplate: '{{jd_text}} {{resume_json}}',
        version: '1.0',
        capability: 'strong-reasoning',
        temperature: 0.2,
      }),
    }));

    vi.doMock('../../v3/providers/factory.js', () => ({
      getProvider: vi.fn().mockReturnValue({
        provider: {
          name: 'mock',
          async *stream() {
            yield { type: 'text', text: 'not valid JSON at all' };
            yield { type: 'done', usage: { input_tokens: 100, output_tokens: 10 } };
          },
          async chat() {
            throw new Error('unused');
          },
        },
        model: 'gpt-5.4-mini',
        capability: 'strong-reasoning',
        backend: 'openai',
      }),
      _resetProviderCache: vi.fn(),
    }));

    const { benchmarkWithTelemetry, BenchmarkError } = await import('../../v3/benchmark/index.js');

    await expect(
      benchmarkWithTelemetry(
        { positions: [], customSections: [], crossRoleHighlights: [] } as never,
        { text: 'jd' },
      ),
    ).rejects.toBeInstanceOf(BenchmarkError);
  });
});
