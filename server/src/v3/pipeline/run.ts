// v3 pipeline orchestrator — fires extract → classify → strategize → write →
// verify, emitting one stage_start + one stage_complete per stage plus a
// final pipeline_complete event.
//
// Cleanly separate from the shadow worker (server/src/v3/shadow/run.ts):
//   - shadow runs silently after v2, writes to resume_v3_shadow_runs table
//   - this runs as the primary user-facing pipeline, emits SSE for live UI
// Both share the same v3 stage functions; only the delivery mechanism differs.

import { extract } from '../extract/index.js';
import { classifyWithTelemetry } from '../classify/index.js';
import { benchmarkWithTelemetry } from '../benchmark/index.js';
import { strategizeWithTelemetry } from '../strategize/index.js';
import { writeWithTelemetry } from '../write/index.js';
import { verifyWithTelemetry } from '../verify/index.js';
import { costOf } from '../shadow/costs.js';
import { createV3Logger } from '../observability/logger.js';
import { createMasterFromClassify, fetchDefaultMaster } from '../master/load.js';
import type { V3SSEEmitter, V3StageCosts, V3StageTimings } from './types.js';

const log = createV3Logger('pipeline');

export interface RunV3PipelineInput {
  sessionId: string;
  userId: string | null;
  resumeText: string;
  jobDescription: {
    text: string;
    title?: string;
    company?: string;
  };
  emit: V3SSEEmitter;
  signal?: AbortSignal;
}

export interface RunV3PipelineResult {
  success: boolean;
  timings: V3StageTimings;
  costs: V3StageCosts;
  errorStage?: 'extract' | 'classify' | 'benchmark' | 'strategize' | 'write' | 'verify';
  errorMessage?: string;
}

function ts() {
  return new Date().toISOString();
}

/**
 * Run the full v3 pipeline with SSE streaming. Emits events for every stage
 * boundary and a final pipeline_complete event with the bundled outputs.
 *
 * Never throws — errors are reported via a pipeline_error event and
 * reflected in the returned result. The caller should close the SSE
 * connection and persist whatever state it needs.
 */
export async function runV3Pipeline(
  input: RunV3PipelineInput,
): Promise<RunV3PipelineResult> {
  const started = Date.now();
  const timings: V3StageTimings = { totalMs: 0 };
  const costs: V3StageCosts = {
    classify: 0,
    benchmark: 0,
    strategize: 0,
    write: 0,
    verify: 0,
    total: 0,
  };

  const emitError = (
    stage: RunV3PipelineResult['errorStage'],
    err: unknown,
  ): RunV3PipelineResult => {
    const message = err instanceof Error ? `${err.name}: ${err.message}` : String(err);
    timings.totalMs = Date.now() - started;
    input.emit({
      type: 'pipeline_error',
      stage: stage ?? 'extract',
      message,
      timestamp: ts(),
    });
    log.error(
      { sessionId: input.sessionId, stage, err: message, totalMs: timings.totalMs },
      'v3 pipeline failed',
    );
    return { success: false, timings, costs, errorStage: stage, errorMessage: message };
  };

  // ─── Stage 1 — extract ────────────────────────────────────────────────
  input.emit({ type: 'stage_start', stage: 'extract', timestamp: ts() });
  let extractOutput;
  try {
    const t0 = Date.now();
    extractOutput = await extract({ text: input.resumeText });
    timings.extractMs = Date.now() - t0;
    input.emit({
      type: 'stage_complete',
      stage: 'extract',
      durationMs: timings.extractMs,
      output: extractOutput,
      timestamp: ts(),
    });
  } catch (err) {
    return emitError('extract', err);
  }

  // ─── Stage 2 — classify ───────────────────────────────────────────────
  input.emit({ type: 'stage_start', stage: 'classify', timestamp: ts() });
  let structured;
  try {
    const c = await classifyWithTelemetry(extractOutput, { signal: input.signal });
    timings.classifyMs = c.telemetry.durationMs;
    costs.classify = costOf(c.telemetry.model, c.telemetry.inputTokens, c.telemetry.outputTokens);
    structured = c.resume;
    input.emit({
      type: 'stage_complete',
      stage: 'classify',
      durationMs: timings.classifyMs,
      output: structured,
      timestamp: ts(),
    });
  } catch (err) {
    return emitError('classify', err);
  }

  // ─── Auto-init master resume (first-run vault seed) ───────────────────
  // Fire-and-forget so it never blocks the pipeline on Supabase. If the
  // user has no master yet, we initialize one from classify output. If
  // they already have one, this is a no-op. The frontend doesn't surface
  // the auto-init state — it's silent vault accumulation.
  if (input.userId) {
    void (async () => {
      try {
        const existing = await fetchDefaultMaster(input.userId!);
        if (existing) return;
        await createMasterFromClassify({
          userId: input.userId!,
          resume: structured,
          sessionId: input.sessionId,
        });
      } catch (err) {
        log.warn(
          {
            sessionId: input.sessionId,
            userId: input.userId,
            err: err instanceof Error ? err.message : String(err),
          },
          'master auto-init skipped (non-blocking)',
        );
      }
    })();
  }

  // ─── Stage 3a — benchmark ─────────────────────────────────────────────
  // Ideal-candidate reference for the role. Runs before strategize so
  // strategize can anti-calibrate against poorly-written JDs.
  input.emit({ type: 'stage_start', stage: 'benchmark', timestamp: ts() });
  let benchmarkProfile;
  try {
    const b = await benchmarkWithTelemetry(structured, input.jobDescription, { signal: input.signal });
    timings.benchmarkMs = b.telemetry.durationMs;
    costs.benchmark = costOf(b.telemetry.model, b.telemetry.inputTokens, b.telemetry.outputTokens);
    benchmarkProfile = b.benchmark;
    input.emit({
      type: 'stage_complete',
      stage: 'benchmark',
      durationMs: timings.benchmarkMs,
      output: benchmarkProfile,
      timestamp: ts(),
    });
  } catch (err) {
    return emitError('benchmark', err);
  }

  // ─── Stage 3 — strategize ─────────────────────────────────────────────
  input.emit({ type: 'stage_start', stage: 'strategize', timestamp: ts() });
  let strategy;
  try {
    const s = await strategizeWithTelemetry(structured, input.jobDescription, { signal: input.signal });
    timings.strategizeMs = s.telemetry.durationMs;
    costs.strategize = costOf(s.telemetry.model, s.telemetry.inputTokens, s.telemetry.outputTokens);
    strategy = s.strategy;
    input.emit({
      type: 'stage_complete',
      stage: 'strategize',
      durationMs: timings.strategizeMs,
      output: strategy,
      timestamp: ts(),
    });
  } catch (err) {
    return emitError('strategize', err);
  }

  // ─── Stage 4 — write ──────────────────────────────────────────────────
  input.emit({ type: 'stage_start', stage: 'write', timestamp: ts() });
  let written;
  try {
    const w = await writeWithTelemetry(structured, strategy, { signal: input.signal });
    timings.writeMs = w.telemetry.durationMs;
    // Sum across every section (summary + accomplishments + competencies + positions[] + customSections[])
    let writeCost = 0;
    const section = w.telemetry.sections;
    writeCost += costOf(section.summary.model, section.summary.inputTokens, section.summary.outputTokens);
    writeCost += costOf(section.accomplishments.model, section.accomplishments.inputTokens, section.accomplishments.outputTokens);
    writeCost += costOf(section.competencies.model, section.competencies.inputTokens, section.competencies.outputTokens);
    for (const p of section.positions) {
      writeCost += costOf(p.model, p.inputTokens, p.outputTokens);
    }
    for (const cs of section.customSections) {
      writeCost += costOf(cs.model, cs.inputTokens, cs.outputTokens);
    }
    costs.write = writeCost;
    written = w.written;
    input.emit({
      type: 'stage_complete',
      stage: 'write',
      durationMs: timings.writeMs,
      output: written,
      timestamp: ts(),
    });
  } catch (err) {
    return emitError('write', err);
  }

  // ─── Stage 5 — verify ─────────────────────────────────────────────────
  input.emit({ type: 'stage_start', stage: 'verify', timestamp: ts() });
  let verify;
  try {
    const v = await verifyWithTelemetry(written, structured, strategy, { signal: input.signal });
    timings.verifyMs = v.telemetry.durationMs;
    costs.verify = costOf(v.telemetry.model, v.telemetry.inputTokens, v.telemetry.outputTokens);
    verify = v.result;
    input.emit({
      type: 'stage_complete',
      stage: 'verify',
      durationMs: timings.verifyMs,
      output: verify,
      timestamp: ts(),
    });
  } catch (err) {
    return emitError('verify', err);
  }

  costs.total = costs.classify + costs.benchmark + costs.strategize + costs.write + costs.verify;
  timings.totalMs = Date.now() - started;

  input.emit({
    type: 'pipeline_complete',
    structured,
    benchmark: benchmarkProfile,
    strategy,
    written,
    verify,
    timings,
    costs,
    timestamp: ts(),
  });

  log.info(
    {
      sessionId: input.sessionId,
      passed: verify.passed,
      errors: verify.issues.filter((i) => i.severity === 'error').length,
      warnings: verify.issues.filter((i) => i.severity === 'warning').length,
      totalMs: timings.totalMs,
      costUsd: costs.total,
    },
    'v3 pipeline complete',
  );

  return { success: true, timings, costs };
}
