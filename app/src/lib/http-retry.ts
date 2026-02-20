const MIN_RETRY_DELAY_MS = 100;
const MAX_RETRY_DELAY_MS = 5_000;

function clampDelay(ms: number): number {
  return Math.max(MIN_RETRY_DELAY_MS, Math.min(MAX_RETRY_DELAY_MS, ms));
}

export function retryDelayMsFromHeaders(headers: Headers, fallbackMs = 300): number {
  const raw = headers.get('Retry-After');
  if (!raw) return clampDelay(fallbackMs);

  const asSeconds = Number.parseFloat(raw);
  if (Number.isFinite(asSeconds) && asSeconds >= 0) {
    return clampDelay(Math.round(asSeconds * 1000));
  }

  const asDateMs = Date.parse(raw);
  if (Number.isFinite(asDateMs)) {
    return clampDelay(Math.max(0, asDateMs - Date.now()));
  }

  return clampDelay(fallbackMs);
}
