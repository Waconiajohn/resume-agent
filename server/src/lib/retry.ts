const TRANSIENT_STATUSES = new Set([408, 425, 429, 500, 502, 503, 504, 529]);
const TRANSIENT_ERROR_CODES = new Set([
  'ECONNRESET',
  'ECONNREFUSED',
  'EHOSTUNREACH',
  'ENETUNREACH',
  'ETIMEDOUT',
  'ECONNABORTED',
  'EAI_AGAIN',
  'UND_ERR_CONNECT_TIMEOUT',
  'UND_ERR_HEADERS_TIMEOUT',
  'UND_ERR_BODY_TIMEOUT',
]);
const TRANSIENT_PATTERNS = [
  'rate limit',
  'rate_limit',
  'too many requests',
  'overloaded',
  'temporarily unavailable',
  'aborted due to timeout',
  'timeout',
  'socket hang up',
  'fetch failed',
  'network error',
  'service unavailable',
  'gateway timeout',
  'bad gateway',
];

type HeaderBag = Headers | Record<string, string | undefined>;

function readHeader(headers: HeaderBag | undefined, name: string): string | null {
  if (!headers) return null;
  if (headers instanceof Headers) {
    return headers.get(name);
  }
  const key = Object.keys(headers).find((k) => k.toLowerCase() === name.toLowerCase());
  const value = key ? headers[key] : undefined;
  return typeof value === 'string' ? value : null;
}

function getStatusCode(error: unknown): number | null {
  const fromTopLevel = (error as { status?: unknown; statusCode?: unknown }) ?? {};
  const topStatus = typeof fromTopLevel.status === 'number'
    ? fromTopLevel.status
    : (typeof fromTopLevel.statusCode === 'number' ? fromTopLevel.statusCode : null);
  if (topStatus != null) return topStatus;

  const responseStatus = (error as { response?: { status?: unknown } })?.response?.status;
  if (typeof responseStatus === 'number') return responseStatus;
  return null;
}

function getErrorCode(error: unknown): string | null {
  const code = (error as { code?: unknown })?.code;
  return typeof code === 'string' ? code.toUpperCase() : null;
}

function isTransient(error: Error, rawError?: unknown): boolean {
  const candidate = rawError ?? error;
  const status = getStatusCode(candidate);
  if (status != null && TRANSIENT_STATUSES.has(status)) return true;

  const code = getErrorCode(candidate);
  if (code && TRANSIENT_ERROR_CODES.has(code)) return true;

  const msg = error.message.toLowerCase();
  if (TRANSIENT_PATTERNS.some((p) => msg.includes(p))) return true;

  // Catch status text embedded in message ("Request failed with status 429")
  if (/\b(408|425|429|500|502|503|504|529)\b/.test(msg)) return true;
  return false;
}

/**
 * Extract Retry-After delay from Anthropic API error headers.
 * Returns delay in milliseconds, or 0 if not present.
 */
function getRetryAfterMs(error: unknown): number {
  // SDK errors may attach headers directly or under response.headers.
  const topHeaders = (error as { headers?: HeaderBag })?.headers;
  const responseHeaders = (error as { response?: { headers?: HeaderBag } })?.response?.headers;
  const retryAfter = readHeader(topHeaders, 'retry-after') ?? readHeader(responseHeaders, 'retry-after');
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

      if (attempt >= maxAttempts || !isTransient(lastError, err)) {
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
