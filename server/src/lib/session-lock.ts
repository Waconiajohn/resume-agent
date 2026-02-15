const locks = new Map<string, Promise<void>>();
const LOCK_TIMEOUT_MS = 6 * 60 * 1000; // 6 minutes — exceeds the 5-min loop timeout

export async function withSessionLock<T>(
  sessionId: string,
  fn: () => Promise<T>,
): Promise<T> {
  // Wait for any existing lock on this session
  const existing = locks.get(sessionId);
  if (existing) {
    await existing;
  }

  let resolve: () => void;
  const lock = new Promise<void>((r) => {
    resolve = r;
  });
  locks.set(sessionId, lock);

  // Safety timeout: auto-release lock if fn() hangs past the loop timeout
  const timer = setTimeout(() => {
    console.error(`[session-lock] Lock timeout for session ${sessionId} after ${LOCK_TIMEOUT_MS}ms — force-releasing`);
    resolve!();
    if (locks.get(sessionId) === lock) {
      locks.delete(sessionId);
    }
  }, LOCK_TIMEOUT_MS);

  try {
    return await fn();
  } finally {
    clearTimeout(timer);
    resolve!();
    // Only clean up if this is still the current lock
    if (locks.get(sessionId) === lock) {
      locks.delete(sessionId);
    }
  }
}
