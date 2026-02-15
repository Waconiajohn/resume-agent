import { supabaseAdmin } from './supabase.js';
import logger from './logger.js';

const POLL_INTERVAL_MS = 500;
const MAX_WAIT_MS = 30_000;

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
      expires_at: new Date(Date.now() + 6 * 60 * 1000).toISOString(),
    });

  if (!error) return true;

  // 23505 = unique_violation — lock is held by another instance
  if (error.code === '23505') return false;

  logger.error({ sessionId, error: error.message }, 'Failed to acquire session lock');
  return false;
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
 * Waits until the session lock can be acquired, polling every 500ms.
 * Throws if the lock cannot be acquired within MAX_WAIT_MS.
 */
async function waitForLock(sessionId: string): Promise<void> {
  const deadline = Date.now() + MAX_WAIT_MS;

  while (Date.now() < deadline) {
    const acquired = await acquireLock(sessionId);
    if (acquired) return;

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
