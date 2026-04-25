// v3 pipeline orchestrator tests.
//
// Verifies the event sequence contract: one stage_start + one stage_complete
// per stage, followed by pipeline_complete. If any stage throws, emission
// stops at pipeline_error for that stage and no subsequent stages fire.
//
// All v3 stages are mocked — we test orchestration shape, not LLM behavior.

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { V3PipelineSSEEvent } from '../../v3/pipeline/types.js';

// Mock the stage functions before importing the orchestrator so the mocks
// are in place when run.ts resolves them.
// Supabase admin client is transitively imported by pipeline/run.ts via the
// master-resume module. The real client throws at module load if
// SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY aren't set; we don't hit it in
// these tests because we only exercise the happy-path LLM orchestration.
vi.mock('../../lib/supabase.js', () => ({
  supabaseAdmin: {
    from: () => ({
      select: () => ({ eq: () => ({ eq: () => ({ order: () => ({ limit: () => ({ maybeSingle: () => Promise.resolve({ data: null, error: null }) }) }) }) }) }),
    }),
    rpc: () => Promise.resolve({ data: null, error: null }),
  },
}));

vi.mock('../../v3/extract/index.js', () => ({
  extract: vi.fn(),
}));
vi.mock('../../v3/classify/index.js', () => ({
  classifyWithTelemetry: vi.fn(),
}));
vi.mock('../../v3/benchmark/index.js', () => ({
  benchmarkWithTelemetry: vi.fn(),
}));
vi.mock('../../v3/strategize/index.js', () => ({
  strategizeWithTelemetry: vi.fn(),
}));
vi.mock('../../v3/write/index.js', () => ({
  writeWithTelemetry: vi.fn(),
}));
vi.mock('../../v3/verify/index.js', () => ({
  verifyWithTelemetry: vi.fn(),
}));

import { extract } from '../../v3/extract/index.js';
import { classifyWithTelemetry } from '../../v3/classify/index.js';
import { benchmarkWithTelemetry } from '../../v3/benchmark/index.js';
import { strategizeWithTelemetry } from '../../v3/strategize/index.js';
import { writeWithTelemetry } from '../../v3/write/index.js';
import { verifyWithTelemetry } from '../../v3/verify/index.js';
import { runV3Pipeline } from '../../v3/pipeline/run.js';

const extractMock = vi.mocked(extract);
const classifyMock = vi.mocked(classifyWithTelemetry);
const benchmarkMock = vi.mocked(benchmarkWithTelemetry);
const strategizeMock = vi.mocked(strategizeWithTelemetry);
const writeMock = vi.mocked(writeWithTelemetry);
const verifyMock = vi.mocked(verifyWithTelemetry);

// Baseline mock outputs shaped to match the real types loosely; tests use
// `as never` casts where needed since we don't need field-level accuracy.
function setupHappyPathMocks() {
  extractMock.mockResolvedValue({
    plaintext: 'resume text',
    format: 'text',
    warnings: [],
  } as never);
  classifyMock.mockResolvedValue({
    resume: { contact: { fullName: 'Test' }, positions: [] } as never,
    telemetry: { durationMs: 100, model: 'deepseek-ai/deepseek-v3.2-maas', inputTokens: 1000, outputTokens: 500 } as never,
  });
  benchmarkMock.mockResolvedValue({
    benchmark: { roleProblemHypothesis: 'x', idealProfileSummary: 'y', directMatches: [], gapAssessment: [], positioningFrame: 'z', hiringManagerObjections: [] } as never,
    telemetry: { durationMs: 150, model: 'gpt-4.1', inputTokens: 1500, outputTokens: 600 } as never,
  });
  strategizeMock.mockResolvedValue({
    strategy: { positioningFrame: 'test frame' } as never,
    telemetry: { durationMs: 200, model: 'gpt-4.1', inputTokens: 2000, outputTokens: 800 } as never,
  });
  writeMock.mockResolvedValue({
    written: { summary: 'Test summary', positions: [] } as never,
    telemetry: {
      durationMs: 300,
      totalInputTokens: 10000,
      totalOutputTokens: 3000,
      sections: {
        summary: { model: 'deepseek-ai/deepseek-v3.2-maas', inputTokens: 1000, outputTokens: 200 },
        accomplishments: { model: 'deepseek-ai/deepseek-v3.2-maas', inputTokens: 1000, outputTokens: 200 },
        competencies: { model: 'deepseek-ai/deepseek-v3.2-maas', inputTokens: 1000, outputTokens: 200 },
        positions: [
          { model: 'gpt-5.4-mini', inputTokens: 2000, outputTokens: 500 },
          { model: 'gpt-5.4-mini', inputTokens: 2000, outputTokens: 500 },
        ],
        customSections: [],
      },
    } as never,
  });
  verifyMock.mockResolvedValue({
    result: { passed: true, issues: [] } as never,
    telemetry: { durationMs: 50, model: 'gpt-4.1', inputTokens: 800, outputTokens: 100 } as never,
  });
}

describe('runV3Pipeline', () => {
  beforeEach(() => {
    extractMock.mockReset();
    classifyMock.mockReset();
    benchmarkMock.mockReset();
    strategizeMock.mockReset();
    writeMock.mockReset();
    verifyMock.mockReset();
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it('emits start+complete for every stage in order, plus pipeline_complete', async () => {
    setupHappyPathMocks();
    const events: V3PipelineSSEEvent[] = [];
    const result = await runV3Pipeline({
      sessionId: 'test-1',
      userId: 'user-1',
      resumeText: 'resume text here, at least fifty characters long blah blah blah',
      jobDescription: { text: 'jd text here' },
      emit: (e) => events.push(e),
    });

    expect(result.success).toBe(true);
    expect(result.errorStage).toBeUndefined();

    // Expected sequence:
    // stage_start extract, stage_complete extract,
    // stage_start classify, stage_complete classify,
    // stage_start benchmark, stage_complete benchmark,
    // stage_start strategize, stage_complete strategize,
    // stage_start write, stage_complete write,
    // stage_start verify, stage_complete verify,
    // pipeline_complete
    expect(events).toHaveLength(13);
    const types = events.map((e) => `${e.type}/${'stage' in e ? e.stage : ''}`);
    expect(types).toEqual([
      'stage_start/extract',
      'stage_complete/extract',
      'stage_start/classify',
      'stage_complete/classify',
      'stage_start/benchmark',
      'stage_complete/benchmark',
      'stage_start/strategize',
      'stage_complete/strategize',
      'stage_start/write',
      'stage_complete/write',
      'stage_start/verify',
      'stage_complete/verify',
      'pipeline_complete/',
    ]);

    const final = events[12];
    expect(final.type).toBe('pipeline_complete');
    if (final.type === 'pipeline_complete') {
      expect(final.verify.passed).toBe(true);
      expect(final.costs.total).toBeGreaterThan(0);
      expect(final.timings.totalMs).toBeGreaterThanOrEqual(0);
    }
  });

  it('carries discovery answers through the final payload', async () => {
    setupHappyPathMocks();
    const discoveryAnswers = [
      {
        requirement: 'Industry 4.0 / smart manufacturing technologies',
        question: 'Have you led predictive-maintenance or smart-manufacturing work?',
        answer: 'Sponsored a CMMS sensor-alert pilot using downtime data for preventive maintenance.',
        level: 'candidate_discovery_needed' as const,
        risk: 'high' as const,
        recommendedFraming: 'Frame as smart-manufacturing exposure, not full digital twin ownership.',
      },
    ];
    const events: V3PipelineSSEEvent[] = [];
    const result = await runV3Pipeline({
      sessionId: 'test-discovery',
      userId: 'user-1',
      resumeText: 'resume text here, at least fifty characters long blah blah blah',
      discoveryAnswers,
      jobDescription: { text: 'jd text here' },
      emit: (e) => events.push(e),
    });

    expect(result.success).toBe(true);
    const final = events.find((e) => e.type === 'pipeline_complete');
    expect(final?.type).toBe('pipeline_complete');
    if (final?.type === 'pipeline_complete') {
      expect(final.discoveryAnswers).toEqual(discoveryAnswers);
    }
  });

  it('computes write-stage cost as sum of all sub-sections on the correct models', async () => {
    setupHappyPathMocks();
    const events: V3PipelineSSEEvent[] = [];
    await runV3Pipeline({
      sessionId: 't2',
      userId: 'u',
      resumeText: 'x'.repeat(100),
      jobDescription: { text: 'y'.repeat(100) },
      emit: (e) => events.push(e),
    });

    const final = events.find((e) => e.type === 'pipeline_complete');
    expect(final).toBeTruthy();
    if (final && final.type === 'pipeline_complete') {
      // DeepSeek: 3 sections × 1K input × $0.14/M = $0.00042; × 3 sections × 200 output × $0.28/M = $0.000168
      // Each DeepSeek section cost: (1000/1e6 * 0.14) + (200/1e6 * 0.28) = 0.00014 + 0.000056 = 0.000196
      // Three sections: 3 * 0.000196 = 0.000588
      // Two gpt-5.4-mini positions: 2 * ((2000/1e6 * 0.75) + (500/1e6 * 4.5)) = 2 * (0.0015 + 0.00225) = 2 * 0.00375 = 0.0075
      // Total write = ~0.000588 + 0.0075 ≈ 0.008
      expect(final.costs.write).toBeGreaterThan(0.005);
      expect(final.costs.write).toBeLessThan(0.015);
      // Strategize on gpt-4.1: (2000/1e6 * 2.0) + (800/1e6 * 8.0) = 0.004 + 0.0064 = 0.0104
      expect(final.costs.strategize).toBeCloseTo(0.0104, 3);
      // Verify on gpt-4.1: (800/1e6 * 2.0) + (100/1e6 * 8.0) = 0.0016 + 0.0008 = 0.0024
      expect(final.costs.verify).toBeCloseTo(0.0024, 3);
    }
  });

  it('emits pipeline_error and stops when a stage throws', async () => {
    setupHappyPathMocks();
    strategizeMock.mockRejectedValueOnce(new Error('strategize boom'));

    const events: V3PipelineSSEEvent[] = [];
    const result = await runV3Pipeline({
      sessionId: 'fail',
      userId: 'u',
      resumeText: 'x'.repeat(100),
      jobDescription: { text: 'y'.repeat(100) },
      emit: (e) => events.push(e),
    });

    expect(result.success).toBe(false);
    expect(result.errorStage).toBe('strategize');
    expect(result.errorMessage).toContain('strategize boom');

    // Sequence through classify/benchmark complete + strategize_start + pipeline_error
    const types = events.map((e) => `${e.type}/${'stage' in e ? e.stage : ''}`);
    expect(types).toEqual([
      'stage_start/extract',
      'stage_complete/extract',
      'stage_start/classify',
      'stage_complete/classify',
      'stage_start/benchmark',
      'stage_complete/benchmark',
      'stage_start/strategize',
      'pipeline_error/strategize',
    ]);
    // Subsequent stages must NOT fire.
    expect(writeMock).not.toHaveBeenCalled();
    expect(verifyMock).not.toHaveBeenCalled();
  });

  it('emits verify errors as stage_complete payload rather than pipeline_error', async () => {
    setupHappyPathMocks();
    verifyMock.mockResolvedValueOnce({
      result: {
        passed: false,
        issues: [{ severity: 'error', section: 'summary', message: 'bad claim' }],
      } as never,
      telemetry: { durationMs: 50, model: 'gpt-4.1', inputTokens: 800, outputTokens: 200 } as never,
    });

    const events: V3PipelineSSEEvent[] = [];
    const result = await runV3Pipeline({
      sessionId: 'bad-verify',
      userId: 'u',
      resumeText: 'x'.repeat(100),
      jobDescription: { text: 'y'.repeat(100) },
      emit: (e) => events.push(e),
    });

    // Verify returning passed:false is STILL a successful pipeline — the
    // issues are payload for the UI to display, not an execution error.
    expect(result.success).toBe(true);
    const final = events[events.length - 1];
    expect(final.type).toBe('pipeline_complete');
    if (final.type === 'pipeline_complete') {
      expect(final.verify.passed).toBe(false);
      expect(final.verify.issues).toHaveLength(1);
    }
  });

  it('passes the abort signal through to all stages', async () => {
    setupHappyPathMocks();
    const controller = new AbortController();
    const events: V3PipelineSSEEvent[] = [];
    await runV3Pipeline({
      sessionId: 'abort-test',
      userId: 'u',
      resumeText: 'x'.repeat(100),
      jobDescription: { text: 'y'.repeat(100) },
      emit: (e) => events.push(e),
      signal: controller.signal,
    });

    // Each stage that accepts a signal should have received controller.signal.
    expect(classifyMock.mock.calls[0]![1]).toMatchObject({ signal: controller.signal });
    expect(benchmarkMock.mock.calls[0]![2]).toMatchObject({ signal: controller.signal });
    expect(strategizeMock.mock.calls[0]![2]).toMatchObject({ signal: controller.signal });
    expect(writeMock.mock.calls[0]![2]).toMatchObject({ signal: controller.signal });
    expect(verifyMock.mock.calls[0]![3]).toMatchObject({ signal: controller.signal });
  });
});
