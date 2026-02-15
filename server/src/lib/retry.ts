const TRANSIENT_PATTERNS = [
  'rate_limit',
  'overloaded',
  '529',
  '500',
  '502',
  '503',
  '504',
];

function isTransient(error: Error): boolean {
  const msg = error.message.toLowerCase();
  return TRANSIENT_PATTERNS.some((p) => msg.includes(p));
}

export async function withRetry<T>(
  fn: () => Promise<T>,
  options?: {
    maxAttempts?: number;
    baseDelay?: number;
    onRetry?: (attempt: number, error: Error) => void;
  },
): Promise<T> {
  const maxAttempts = options?.maxAttempts ?? 3;
  const baseDelay = options?.baseDelay ?? 1000;

  let lastError: Error | undefined;

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      return await fn();
    } catch (err) {
      lastError = err instanceof Error ? err : new Error(String(err));

      if (attempt >= maxAttempts || !isTransient(lastError)) {
        throw lastError;
      }

      options?.onRetry?.(attempt, lastError);

      const delay = baseDelay * Math.pow(2, attempt - 1) * (0.5 + Math.random());
      await new Promise((resolve) => setTimeout(resolve, delay));
    }
  }

  throw lastError;
}
