import { supabaseAdmin } from './supabase.js';
import logger from './logger.js';

const POLL_INTERVAL_MS = 500;
const MAX_WAIT_MS = 30_000;
const LOCK_EXPIRY_MS = 2 * 60 * 1000; // 2 minutes (reduced from 6 to minimize crash-induced wait)

/** Track lock IDs acquired by this process instance so we only release our own. */
const instanceOwnedLocks = new Map<string, string>(); // session_id -> locked_at timestamp

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
  const lockedAt = new Date().toISOString();
  const { error } = await supabaseAdmin
    .from('session_locks')
    .insert({
      session_id: sessionId,
      locked_at: lockedAt,
      expires_at: new Date(Date.now() + LOCK_EXPIRY_MS).toISOString(),
    });

  if (!error) {
    instanceOwnedLocks.set(sessionId, lockedAt);
    return true;
  }

  // 23505 = unique_violation — lock is held by another instance
  if (error.code === '23505') return false;

  // For any other error (table missing, network issue, etc.), bubble up so
  // callers can fail fast instead of treating outages as "lock is busy."
  logger.error({ sessionId, error: error.message, code: error.code }, 'Failed to acquire session lock');
  throw new Error(`Lock acquisition failed: ${error.message}`);
}

/**
 * Releases the distributed session lock.
 */
async function releaseLock(sessionId: string): Promise<void> {
  const lockedAt = instanceOwnedLocks.get(sessionId);
  instanceOwnedLocks.delete(sessionId);
  let query = supabaseAdmin
    .from('session_locks')
    .delete()
    .eq('session_id', sessionId);
  if (lockedAt) {
    query = query.eq('locked_at', lockedAt);
  }
  const { error } = await query;

  if (error) {
    logger.error({ sessionId, error: error.message }, 'Failed to release session lock');
  }
}

/**
 * Release only session locks that were acquired by this server instance.
 * Called during graceful shutdown to avoid releasing locks held by other pods.
 */
export async function releaseAllLocks(): Promise<void> {
  const lockEntries = Array.from(instanceOwnedLocks.entries());
  const lockIds = lockEntries.map(([sessionId]) => sessionId);
  if (lockIds.length === 0) {
    logger.info('No instance-owned session locks to release');
    return;
  }

  logger.info({ count: lockIds.length, sessions: lockIds }, 'Releasing instance-owned session locks');
  let released = 0;
  for (const [sessionId, lockedAt] of lockEntries) {
    const { error } = await supabaseAdmin
      .from('session_locks')
      .delete()
      .eq('session_id', sessionId)
      .eq('locked_at', lockedAt);
    if (error) {
      logger.error({ sessionId, error: error.message }, 'Failed to release instance-owned session lock on shutdown');
      continue;
    }
    instanceOwnedLocks.delete(sessionId);
    released += 1;
  }
  logger.info({ released, attempted: lockIds.length }, 'Released instance-owned session locks');
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
 * Renews the session lock by extending its expiry.
 * Called periodically to prevent lock expiry during long-running operations.
 */
async function renewLock(sessionId: string): Promise<void> {
  const lockedAt = instanceOwnedLocks.get(sessionId);
  if (!lockedAt) return;
  const { data, error } = await supabaseAdmin
    .from('session_locks')
    .update({ expires_at: new Date(Date.now() + LOCK_EXPIRY_MS).toISOString() })
    .eq('session_id', sessionId)
    .eq('locked_at', lockedAt)
    .select('session_id');
  if (error) {
    logger.warn({ sessionId, error: error.message }, 'Failed to renew session lock');
    return;
  }
  if (!data || data.length === 0) {
    // Lock no longer owned (expired and replaced) — stop trying to renew it.
    instanceOwnedLocks.delete(sessionId);
    logger.warn({ sessionId }, 'Session lock no longer owned by this instance during renew');
  }
}

/**
 * Executes fn() while holding a distributed session lock.
 * Automatically renews the lock every 60s to prevent expiry during long operations.
 */
export async function withSessionLock<T>(
  sessionId: string,
  fn: () => Promise<T>,
): Promise<T> {
  await waitForLock(sessionId);
  const renewInterval = setInterval(() => renewLock(sessionId), 60_000);

  try {
    return await fn();
  } finally {
    clearInterval(renewInterval);
    await releaseLock(sessionId);
  }
}
