import { supabaseAdmin } from './supabase.js';
import logger from './logger.js';

const POLL_INTERVAL_MS = 500;
const MAX_WAIT_MS = 30_000;
const LOCK_EXPIRY_MS = 2 * 60 * 1000; // 2 minutes (reduced from 6 to minimize crash-induced wait)

/**
 * Acquires a distributed session lock backed by the session_locks DB table.
 * Returns true if acquired, false if the lock is held by another instance.
 */
async function acquireLock(sessionId: string): Promise<boolean> {
  // Clean up expired locks first
  await supabaseAdmin
    .from('session_locks')
    .delete()
    .lt('expires_at', new Date().toISOString());

  // Try to insert a lock row — unique violation means the lock is held
  const { error } = await supabaseAdmin
    .from('session_locks')
    .insert({
      session_id: sessionId,
      locked_at: new Date().toISOString(),
      expires_at: new Date(Date.now() + LOCK_EXPIRY_MS).toISOString(),
    });

  if (!error) return true;

  // 23505 = unique_violation — lock is held by another instance
  if (error.code === '23505') return false;

  // For any other error (table missing, network issue, etc.), log and proceed
  // rather than blocking the session forever. The lock is a best-effort safeguard.
  logger.error({ sessionId, error: error.message, code: error.code }, 'Failed to acquire session lock, proceeding without lock');
  return true;
}

/**
 * Releases the distributed session lock.
 */
async function releaseLock(sessionId: string): Promise<void> {
  const { error } = await supabaseAdmin
    .from('session_locks')
    .delete()
    .eq('session_id', sessionId);

  if (error) {
    logger.error({ sessionId, error: error.message }, 'Failed to release session lock');
  }
}

/**
 * Release all session locks on this server instance (called during shutdown).
 */
export async function releaseAllLocks(): Promise<void> {
  const { error } = await supabaseAdmin
    .from('session_locks')
    .delete()
    .neq('session_id', '');

  if (error) {
    logger.error({ error: error.message }, 'Failed to release all session locks on shutdown');
  } else {
    logger.info('Released all session locks');
  }
}

/**
 * Waits until the session lock can be acquired, polling every 500ms.
 * Throws if the lock cannot be acquired within MAX_WAIT_MS.
 * Fails fast on consecutive DB errors to avoid masking outages.
 */
async function waitForLock(sessionId: string): Promise<void> {
  const deadline = Date.now() + MAX_WAIT_MS;
  let consecutiveErrors = 0;

  while (Date.now() < deadline) {
    try {
      const acquired = await acquireLock(sessionId);
      if (acquired) return;
      consecutiveErrors = 0;
    } catch (err) {
      consecutiveErrors++;
      logger.error({ sessionId, error: err instanceof Error ? err.message : err, consecutiveErrors }, 'Lock acquisition DB error');
      if (consecutiveErrors >= 3) {
        throw new Error(`Database unavailable after ${consecutiveErrors} consecutive lock errors`);
      }
    }

    logger.debug({ sessionId }, 'Session is locked, waiting...');
    await new Promise((resolve) => setTimeout(resolve, POLL_INTERVAL_MS));
  }

  throw new Error(
    `[session-lock] Timed out waiting for lock on session ${sessionId} after ${MAX_WAIT_MS}ms`,
  );
}

/**
 * Executes fn() while holding a distributed session lock.
 * Drop-in replacement for the previous in-memory lock.
 */
export async function withSessionLock<T>(
  sessionId: string,
  fn: () => Promise<T>,
): Promise<T> {
  await waitForLock(sessionId);

  try {
    return await fn();
  } finally {
    await releaseLock(sessionId);
  }
}
