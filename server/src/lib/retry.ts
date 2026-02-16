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

/**
 * Extract Retry-After delay from Anthropic API error headers.
 * Returns delay in milliseconds, or 0 if not present.
 */
function getRetryAfterMs(error: unknown): number {
  // Anthropic SDK attaches headers to the error object
  const headers = (error as { headers?: Record<string, string> })?.headers;
  const retryAfter = headers?.['retry-after'];
  if (!retryAfter) return 0;

  const seconds = parseFloat(retryAfter);
  if (!isNaN(seconds) && seconds > 0) {
    // Cap at 60s to prevent absurd waits
    return Math.min(seconds, 60) * 1000;
  }
  return 0;
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

      // Prefer server-specified Retry-After delay; fall back to exponential backoff
      const retryAfterMs = getRetryAfterMs(err);
      const delay = retryAfterMs > 0
        ? retryAfterMs
        : baseDelay * Math.pow(2, attempt - 1) * (0.5 + Math.random());
      await new Promise((resolve) => setTimeout(resolve, delay));
    }
  }

  throw lastError;
}
