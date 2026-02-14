const locks = new Map<string, Promise<void>>();

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

  try {
    return await fn();
  } finally {
    resolve!();
    // Only clean up if this is still the current lock
    if (locks.get(sessionId) === lock) {
      locks.delete(sessionId);
    }
  }
}
