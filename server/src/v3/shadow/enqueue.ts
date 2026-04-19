// Post-v2-response hook: enqueues a v3 shadow run for every v2 completion
// when FF_V3_SHADOW_ENABLED is on.
//
// Zero impact on v2 response latency: enqueue uses setImmediate to defer the
// work to the next tick, after the v2 response has been flushed.
//
// Shadow failures are logged loudly via pino but NEVER thrown. The v2
// response has already been returned to the user by the time this runs.

import { supabaseAdmin } from '../../lib/supabase.js';
import logger from '../../lib/logger.js';
import { FF_V3_SHADOW_ENABLED } from '../../lib/feature-flags.js';
import { runShadow, type ShadowInput } from './run.js';

export interface EnqueueShadowParams {
  sessionId: string;
  userId: string | null;
  resumeText: string;
  jobDescription: string;
  jdTitle?: string;
  jdCompany?: string;
  /** v2's final resume JSON — stored alongside v3 output for admin review. */
  v2OutputJson: unknown;
  /** v2 wall-clock duration. Useful for side-by-side latency comparison. */
  v2DurationMs?: number;
}

/** Default shadow wall-clock ceiling (90 seconds per Phase 5 spec). */
const SHADOW_TIMEOUT_MS = 90_000;

/**
 * Fire-and-forget shadow run. Returns immediately; does not await.
 *
 * If FF_V3_SHADOW_ENABLED is false, this is a no-op.
 */
export function enqueueShadow(params: EnqueueShadowParams): void {
  if (!FF_V3_SHADOW_ENABLED) return;

  // setImmediate defers to next event-loop tick, ensuring v2 response flush
  // is fully complete before shadow work starts touching CPU.
  setImmediate(() => {
    void runAndPersist(params).catch((err: unknown) => {
      // Last line of defense. runAndPersist has its own try/catch; this
      // exists to guard against rejection from a Supabase error in the
      // persist path that somehow escapes.
      logger.error(
        {
          sessionId: params.sessionId,
          err: err instanceof Error ? err.message : String(err),
        },
        'v3 shadow enqueue: unexpected unhandled error (non-blocking)',
      );
    });
  });
}

async function runAndPersist(params: EnqueueShadowParams): Promise<void> {
  const abortController = new AbortController();
  const timeoutHandle = setTimeout(() => abortController.abort(), SHADOW_TIMEOUT_MS);

  const shadowInput: ShadowInput = {
    sessionId: params.sessionId,
    userId: params.userId,
    resumeText: params.resumeText,
    jdText: params.jobDescription,
    jdTitle: params.jdTitle,
    jdCompany: params.jdCompany,
    signal: abortController.signal,
  };

  try {
    const result = await runShadow(shadowInput);

    const row = {
      request_id: params.sessionId,
      candidate_id: params.userId,
      v2_output_json: params.v2OutputJson ?? null,
      v2_duration_ms: params.v2DurationMs ?? null,
      v3_output_json: result.written ?? null,
      v3_verify_result_json: result.verify ?? null,
      v3_stage_timings_json: result.timings,
      v3_stage_costs_json: result.costs,
      v3_duration_ms: result.timings.totalMs,
      v3_pipeline_error: result.errorMessage ?? null,
      v3_pipeline_error_stage: result.errorStage ?? null,
      comparison_status: 'pending_review' as const,
    };

    const { error } = await supabaseAdmin.from('resume_v3_shadow_runs').insert(row);
    if (error) {
      logger.error(
        {
          sessionId: params.sessionId,
          err: error.message,
          code: error.code,
        },
        'v3 shadow: Supabase insert failed (non-blocking)',
      );
    }
  } finally {
    clearTimeout(timeoutHandle);
  }
}
