/**
 * Discovery Session Store — database-backed persistence for DiscoverySessionState.
 *
 * Replaces the in-memory Map<string, DiscoverySessionState> that previously lived
 * in routes/discovery.ts. All reads and writes go through the `discovery_sessions`
 * table using the admin client (service key, bypasses RLS).
 *
 * Three operations are intentionally narrow:
 *   getDiscoverySession   — load active session by id
 *   saveDiscoverySession  — upsert full session state
 *   deleteDiscoverySession — mark session as complete (audit trail preserved)
 */

import { supabaseAdmin } from './supabase.js';
import logger from './logger.js';
import type { DiscoverySessionState } from '../agents/discovery/types.js';

// ─── getDiscoverySession ──────────────────────────────────────────────────────

/**
 * Loads an active discovery session from the database by session_id.
 * Returns null if the session does not exist, is not active, or a query error occurs.
 */
export async function getDiscoverySession(sessionId: string): Promise<DiscoverySessionState | null> {
  try {
    const { data, error } = await supabaseAdmin
      .from('discovery_sessions')
      .select('session_state')
      .eq('id', sessionId)
      .eq('status', 'active')
      .single();

    if (error) {
      if (error.code === 'PGRST116') {
        // PostgREST "no rows" error — session not found; this is expected, not a fault
        return null;
      }
      logger.error({ error: error.message, sessionId }, 'getDiscoverySession: query failed');
      return null;
    }

    if (!data?.session_state) return null;

    return data.session_state as DiscoverySessionState;
  } catch (err) {
    logger.error(
      { error: err instanceof Error ? err.message : String(err), sessionId },
      'getDiscoverySession: unexpected error',
    );
    return null;
  }
}

// ─── saveDiscoverySession ─────────────────────────────────────────────────────

/**
 * Upserts the full session state into the database.
 * On conflict (same id) the row is updated; the status remains 'active'.
 * Returns true on success, false on error.
 */
export async function saveDiscoverySession(state: DiscoverySessionState): Promise<boolean> {
  try {
    const { error } = await supabaseAdmin
      .from('discovery_sessions')
      .upsert(
        {
          id: state.session_id,
          user_id: state.user_id,
          session_state: state as unknown as Record<string, unknown>,
          status: 'active',
          updated_at: new Date().toISOString(),
        },
        { onConflict: 'id' },
      );

    if (error) {
      logger.error({ error: error.message, sessionId: state.session_id }, 'saveDiscoverySession: upsert failed');
      return false;
    }

    return true;
  } catch (err) {
    logger.error(
      { error: err instanceof Error ? err.message : String(err), sessionId: state.session_id },
      'saveDiscoverySession: unexpected error',
    );
    return false;
  }
}

// ─── deleteDiscoverySession ───────────────────────────────────────────────────

/**
 * Marks a discovery session as complete. The row is retained for audit purposes.
 * Silently ignores missing sessions (idempotent).
 */
export async function deleteDiscoverySession(sessionId: string): Promise<void> {
  try {
    const { error } = await supabaseAdmin
      .from('discovery_sessions')
      .update({ status: 'complete', updated_at: new Date().toISOString() })
      .eq('id', sessionId);

    if (error) {
      logger.error({ error: error.message, sessionId }, 'deleteDiscoverySession: update failed');
    }
  } catch (err) {
    logger.error(
      { error: err instanceof Error ? err.message : String(err), sessionId },
      'deleteDiscoverySession: unexpected error',
    );
  }
}
