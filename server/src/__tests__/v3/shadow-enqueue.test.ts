// Phase 5 Week 0 shadow enqueue tests.
//
// Covers the contract in server/src/v3/shadow/enqueue.ts:
//  - FF_V3_SHADOW_ENABLED off: no-op (no runShadow call, no Supabase insert).
//  - FF_V3_SHADOW_ENABLED on + v3 succeeds: Supabase row populated with v3 output.
//  - FF_V3_SHADOW_ENABLED on + v3 errors: Supabase row populated with error fields.
//  - enqueue returns synchronously (zero blocking on the caller).
//
// Uses vi.mock to stub:
//  - runShadow (so we don't hit real LLM endpoints)
//  - supabaseAdmin (so we can observe insert args)
//  - feature-flags (so we can flip FF_V3_SHADOW_ENABLED per test)
//
// Since FF_V3_SHADOW_ENABLED is resolved at module import time (envBool), we
// use vi.doMock + dynamic import to re-read the flag per test.

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { ShadowResult } from '../../v3/shadow/run.js';

const insertMock = vi.fn();
const runShadowMock = vi.fn<(input: unknown) => Promise<ShadowResult>>();

vi.mock('../../lib/supabase.js', () => ({
  supabaseAdmin: {
    from: vi.fn().mockImplementation(() => ({ insert: insertMock })),
  },
}));

vi.mock('../../v3/shadow/run.js', () => ({
  runShadow: runShadowMock,
}));

// Helper: dynamically import enqueue with a given FF_V3_SHADOW_ENABLED value.
async function importEnqueueWithFlag(enabled: boolean) {
  vi.resetModules();
  vi.doMock('../../lib/feature-flags.js', () => ({
    FF_V3_SHADOW_ENABLED: enabled,
  }));
  const mod = await import('../../v3/shadow/enqueue.js');
  return mod.enqueueShadow;
}

// Helper: flush setImmediate queue so the scheduled work actually runs.
function flushSetImmediate(): Promise<void> {
  return new Promise((resolve) => setImmediate(resolve));
}

describe('v3 shadow enqueue', () => {
  const baseParams = {
    sessionId: 'sess_123',
    userId: 'user_abc',
    resumeText: 'Resume text here',
    jobDescription: 'JD text here',
    v2OutputJson: { header: { name: 'Test' } },
    v2DurationMs: 12_000,
  };

  beforeEach(() => {
    insertMock.mockReset().mockResolvedValue({ error: null });
    runShadowMock.mockReset();
  });

  afterEach(() => {
    vi.doUnmock('../../lib/feature-flags.js');
  });

  it('is a no-op when FF_V3_SHADOW_ENABLED=false', async () => {
    const enqueue = await importEnqueueWithFlag(false);
    enqueue(baseParams);
    await flushSetImmediate();
    await flushSetImmediate();

    expect(runShadowMock).not.toHaveBeenCalled();
    expect(insertMock).not.toHaveBeenCalled();
  });

  it('persists a full row when FF_V3_SHADOW_ENABLED=true and v3 succeeds', async () => {
    runShadowMock.mockResolvedValueOnce({
      written: { summary: 'Test summary' } as never,
      verify: { passed: true, issues: [] } as never,
      timings: { classifyMs: 10, strategizeMs: 20, writeMs: 30, verifyMs: 40, totalMs: 100 },
      costs: { classify: 0.001, strategize: 0.02, write: 0.05, verify: 0.02, total: 0.091 },
    });

    const enqueue = await importEnqueueWithFlag(true);
    enqueue(baseParams);
    await flushSetImmediate();
    // Give runShadow's awaited promise a tick to resolve and downstream insert to fire.
    await new Promise((r) => setTimeout(r, 0));

    expect(runShadowMock).toHaveBeenCalledTimes(1);
    expect(insertMock).toHaveBeenCalledTimes(1);

    const row = insertMock.mock.calls[0]![0] as Record<string, unknown>;
    expect(row.request_id).toBe('sess_123');
    expect(row.candidate_id).toBe('user_abc');
    expect(row.v2_output_json).toEqual({ header: { name: 'Test' } });
    expect(row.v2_duration_ms).toBe(12_000);
    expect(row.v3_output_json).toEqual({ summary: 'Test summary' });
    expect(row.v3_verify_result_json).toEqual({ passed: true, issues: [] });
    expect(row.v3_duration_ms).toBe(100);
    expect(row.v3_pipeline_error).toBeNull();
    expect(row.v3_pipeline_error_stage).toBeNull();
    expect(row.comparison_status).toBe('pending_review');
  });

  it('persists an error row when v3 fails inside a pipeline stage', async () => {
    runShadowMock.mockResolvedValueOnce({
      timings: { classifyMs: 5, totalMs: 5 },
      costs: { classify: 0.001, strategize: 0, write: 0, verify: 0, total: 0.001 },
      errorMessage: 'ClassifyError: JSON parse failed',
      errorStage: 'classify',
    });

    const enqueue = await importEnqueueWithFlag(true);
    enqueue(baseParams);
    await flushSetImmediate();
    await new Promise((r) => setTimeout(r, 0));

    expect(insertMock).toHaveBeenCalledTimes(1);
    const row = insertMock.mock.calls[0]![0] as Record<string, unknown>;
    expect(row.v3_output_json).toBeNull();
    expect(row.v3_verify_result_json).toBeNull();
    expect(row.v3_pipeline_error).toBe('ClassifyError: JSON parse failed');
    expect(row.v3_pipeline_error_stage).toBe('classify');
    expect(row.comparison_status).toBe('pending_review');
  });

  it('returns synchronously — does not block the caller on shadow work', async () => {
    // Make runShadow take a "long time" (100ms simulated).
    runShadowMock.mockImplementationOnce(
      () =>
        new Promise<ShadowResult>((resolve) => {
          setTimeout(
            () =>
              resolve({
                written: { summary: 'late' } as never,
                verify: { passed: true, issues: [] } as never,
                timings: { totalMs: 100 },
                costs: { classify: 0, strategize: 0, write: 0, verify: 0, total: 0 },
              }),
            100,
          );
        }),
    );

    const enqueue = await importEnqueueWithFlag(true);
    const callStart = Date.now();
    enqueue(baseParams);
    const callDuration = Date.now() - callStart;

    // enqueue should return in << 10ms even though runShadow takes 100ms.
    expect(callDuration).toBeLessThan(10);
    // Supabase insert hasn't fired yet because setImmediate + await hasn't run.
    expect(insertMock).not.toHaveBeenCalled();
  });

  it('logs loudly but does not throw when Supabase insert returns an error', async () => {
    insertMock.mockResolvedValueOnce({
      error: { message: 'duplicate key', code: '23505' },
    });
    runShadowMock.mockResolvedValueOnce({
      written: { summary: 's' } as never,
      verify: { passed: true, issues: [] } as never,
      timings: { totalMs: 1 },
      costs: { classify: 0, strategize: 0, write: 0, verify: 0, total: 0 },
    });

    const enqueue = await importEnqueueWithFlag(true);
    // Must not throw.
    expect(() => enqueue(baseParams)).not.toThrow();
    await flushSetImmediate();
    await new Promise((r) => setTimeout(r, 0));

    expect(insertMock).toHaveBeenCalledTimes(1);
  });
});
