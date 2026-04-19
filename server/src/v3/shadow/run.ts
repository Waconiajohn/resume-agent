// v3 shadow runner — orchestrates the full 5-stage pipeline for a shadow
// comparison against a completed v2 run. Called from the v2 pipeline's
// post-response hook when FF_V3_SHADOW_ENABLED is on.
//
// Philosophy: fire-and-forget. Never throws into the v2 request path; caller
// wraps in try/catch; this function itself logs + swallows unexpected errors
// beyond the pipeline stages (those are surfaced as row.v3_pipeline_error).

import { extract } from '../extract/index.js';
import { classifyWithTelemetry } from '../classify/index.js';
import { benchmarkWithTelemetry } from '../benchmark/index.js';
import { strategizeWithTelemetry } from '../strategize/index.js';
import { writeWithTelemetry } from '../write/index.js';
import { verifyWithTelemetry } from '../verify/index.js';
import type { WrittenResume, VerifyResult } from '../types.js';
import { costOf } from './costs.js';
import { createV3Logger } from '../observability/logger.js';

const log = createV3Logger('shadow');

export interface ShadowInput {
  sessionId: string;
  userId: string | null;
  resumeText: string;
  jdTitle?: string;
  jdCompany?: string;
  jdText: string;
  /**
   * Hard wall-clock ceiling. If the full pipeline hasn't finished by this
   * deadline, the caller's timeout cancels AbortSignal and the shadow
   * result includes whatever stage failed.
   */
  signal?: AbortSignal;
}

export interface ShadowStageTimings {
  classifyMs?: number;
  benchmarkMs?: number;
  strategizeMs?: number;
  writeMs?: number;
  verifyMs?: number;
  totalMs: number;
}

export interface ShadowStageCosts {
  classify: number;
  benchmark: number;
  strategize: number;
  write: number;       // sum of summary + accomplishments + competencies + positions[] + customSections[]
  verify: number;
  total: number;
}

export interface ShadowResult {
  written?: WrittenResume;
  verify?: VerifyResult;
  timings: ShadowStageTimings;
  costs: ShadowStageCosts;
  errorMessage?: string;
  errorStage?: 'extract' | 'classify' | 'benchmark' | 'strategize' | 'write' | 'verify' | 'unknown';
}

/**
 * Run the full v3 pipeline. Returns a result object with either a complete
 * output or an error-populated row. Never throws.
 */
export async function runShadow(input: ShadowInput): Promise<ShadowResult> {
  const started = Date.now();
  const timings: ShadowStageTimings = { totalMs: 0 };
  const costs: ShadowStageCosts = { classify: 0, benchmark: 0, strategize: 0, write: 0, verify: 0, total: 0 };

  let stage: ShadowResult['errorStage'] = 'unknown';

  try {
    // Stage 1 — extract. Shadow always receives text (v2 inputs are text), so
    // extract is a lightweight normalization; no LLM cost.
    stage = 'extract';
    const extractResult = await extract({ text: input.resumeText });

    // Stage 2 — classify (cached fast-writer-tier on Vertex; cheap).
    stage = 'classify';
    const c = await classifyWithTelemetry(extractResult, { signal: input.signal });
    timings.classifyMs = c.telemetry.durationMs;
    costs.classify = costOf(c.telemetry.model, c.telemetry.inputTokens, c.telemetry.outputTokens);

    // Stage 3a — benchmark (strong-reasoning).
    stage = 'benchmark';
    const bench = await benchmarkWithTelemetry(
      c.resume,
      { title: input.jdTitle, company: input.jdCompany, text: input.jdText },
      { signal: input.signal },
    );
    timings.benchmarkMs = bench.telemetry.durationMs;
    costs.benchmark = costOf(bench.telemetry.model, bench.telemetry.inputTokens, bench.telemetry.outputTokens);

    // Stage 3 — strategize (strong-reasoning; gpt-4.1 in production).
    stage = 'strategize';
    const s = await strategizeWithTelemetry(
      c.resume,
      { title: input.jdTitle, company: input.jdCompany, text: input.jdText },
      { signal: input.signal },
    );
    timings.strategizeMs = s.telemetry.durationMs;
    costs.strategize = costOf(s.telemetry.model, s.telemetry.inputTokens, s.telemetry.outputTokens);

    // Stage 4 — write (parallel; fast-writer on Vertex + deep-writer on OpenAI).
    stage = 'write';
    const w = await writeWithTelemetry(c.resume, s.strategy, { signal: input.signal });
    timings.writeMs = w.telemetry.durationMs;
    // Sum section costs across summary + accomplishments + competencies + positions + customSections.
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

    // Stage 5 — verify (strong-reasoning; gpt-4.1 in production).
    stage = 'verify';
    const v = await verifyWithTelemetry(w.written, c.resume, s.strategy, { signal: input.signal });
    timings.verifyMs = v.telemetry.durationMs;
    costs.verify = costOf(v.telemetry.model, v.telemetry.inputTokens, v.telemetry.outputTokens);

    costs.total = costs.classify + costs.benchmark + costs.strategize + costs.write + costs.verify;
    timings.totalMs = Date.now() - started;

    log.info(
      {
        sessionId: input.sessionId,
        passed: v.result.passed,
        errors: v.result.issues.filter((i) => i.severity === 'error').length,
        warnings: v.result.issues.filter((i) => i.severity === 'warning').length,
        totalMs: timings.totalMs,
        costUsd: costs.total,
      },
      'shadow run complete',
    );

    return {
      written: w.written,
      verify: v.result,
      timings,
      costs,
    };
  } catch (err) {
    timings.totalMs = Date.now() - started;
    const errorMessage = err instanceof Error ? `${err.name}: ${err.message}` : String(err);
    log.error(
      {
        sessionId: input.sessionId,
        stage,
        err: errorMessage,
        totalMs: timings.totalMs,
      },
      'shadow run failed (non-blocking)',
    );
    costs.total = costs.classify + costs.benchmark + costs.strategize + costs.write + costs.verify;
    return {
      timings,
      costs,
      errorMessage,
      errorStage: stage,
    };
  }
}
