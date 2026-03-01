/**
 * usage-persistence.ts
 *
 * Flushes in-memory token usage accumulators to the `user_usage` table in
 * Supabase. Called periodically from `llm-provider.ts` and on final
 * `stopUsageTracking()`.
 *
 * Design notes:
 * - Uses delta flushing: tracks the "last flushed" watermarks per session so
 *   each flush only writes the tokens accumulated since the prior flush.
 * - The `user_usage` table has a UNIQUE(user_id, period_start) constraint.
 *   We call the `increment_user_usage` RPC which uses INSERT ... ON CONFLICT
 *   DO UPDATE SET col = col + EXCLUDED.col for atomic server-side accumulation.
 *   (Client-side upsert replaced deltas instead of accumulating them.)
 * - Flush is fail-open: a DB error is logged but never rethrows, so the
 *   pipeline is never interrupted by a billing write failure.
 */

import logger from './logger.js';

// Lazy import to avoid throwing at module load time when SUPABASE_URL /
// SUPABASE_SERVICE_ROLE_KEY are not set (e.g. in unit tests that don't mock
// supabase.js but do vi.resetModules()).
async function getSupabaseAdmin() {
  const { supabaseAdmin } = await import('./supabase.js');
  return supabaseAdmin;
}

// ─── Watermark tracking ──────────────────────────────────────────────────────

/**
 * Tracks how many tokens were already written to DB for each (sessionId).
 * Key: sessionId, Value: { input_tokens, output_tokens } already flushed.
 */
const flushWatermarks = new Map<string, { input_tokens: number; output_tokens: number }>();

/**
 * Returns the start and end of the current monthly billing period (UTC).
 * Period start = first day of current month at midnight UTC.
 * Period end   = first day of next month at midnight UTC (exclusive).
 */
function currentBillingPeriod(): { period_start: string; period_end: string } {
  const now = new Date();
  const periodStart = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
  const periodEnd = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 1));
  return {
    period_start: periodStart.toISOString(),
    period_end: periodEnd.toISOString(),
  };
}

/**
 * Flush accumulated token deltas for a single session to the `user_usage` table.
 *
 * Retrieves the current accumulator from the provided totals, subtracts the
 * last-flushed watermark, and upserts only the delta. After a successful
 * upsert the watermark is advanced to the current totals.
 *
 * @param sessionId  The pipeline session identifier (used for logging).
 * @param userId     The authenticated user's UUID (PK in `user_usage`).
 * @param totals     Current in-memory accumulator snapshot
 *                   (a shallow copy is fine — only integers are read).
 */
export async function flushUsageToDb(
  sessionId: string,
  userId: string,
  totals: { input_tokens: number; output_tokens: number },
): Promise<void> {
  const watermark = flushWatermarks.get(sessionId) ?? { input_tokens: 0, output_tokens: 0 };

  const deltaInput = totals.input_tokens - watermark.input_tokens;
  const deltaOutput = totals.output_tokens - watermark.output_tokens;

  // Nothing new to flush.
  if (deltaInput <= 0 && deltaOutput <= 0) return;

  const { period_start, period_end } = currentBillingPeriod();

  try {
    const supabaseAdmin = await getSupabaseAdmin();
    const { error } = await supabaseAdmin.rpc('increment_user_usage', {
      p_user_id: userId,
      p_period_start: period_start,
      p_period_end: period_end,
      p_input_tokens: deltaInput,
      p_output_tokens: deltaOutput,
      p_sessions: 0,
      p_cost: 0,
    });

    if (error) {
      logger.warn(
        { session_id: sessionId, user_id: userId, error: error.message },
        'usage-persistence: rpc increment_user_usage failed',
      );
      // Do not advance watermark — retry on next flush cycle.
      return;
    }

    // Advance watermark only on success.
    flushWatermarks.set(sessionId, {
      input_tokens: totals.input_tokens,
      output_tokens: totals.output_tokens,
    });
  } catch (err) {
    logger.warn(
      {
        session_id: sessionId,
        user_id: userId,
        error: err instanceof Error ? err.message : String(err),
      },
      'usage-persistence: unexpected error during flush',
    );
    // Fail-open: do not rethrow.
  }
}

/**
 * Remove the watermark for a session. Called after the final flush so memory
 * does not grow indefinitely between pipeline runs.
 */
export function clearUsageWatermark(sessionId: string): void {
  flushWatermarks.delete(sessionId);
}

/**
 * Exposed for tests only. Returns a snapshot of current watermarks.
 * @internal
 */
export function getFlushWatermarks(): ReadonlyMap<string, { input_tokens: number; output_tokens: number }> {
  return flushWatermarks;
}
