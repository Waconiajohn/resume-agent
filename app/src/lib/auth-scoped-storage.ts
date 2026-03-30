const ANONYMOUS_STORAGE_SCOPE = 'anon';

export function normalizeStorageUserId(userId: string | null | undefined): string {
  const trimmed = typeof userId === 'string' ? userId.trim() : '';
  return trimmed || ANONYMOUS_STORAGE_SCOPE;
}

export function buildAuthScopedStorageKey(
  namespace: string,
  userId: string | null | undefined,
  itemId?: string,
): string {
  const segments = [namespace, normalizeStorageUserId(userId)];
  if (itemId) segments.push(itemId);
  return segments.join(':');
}

export function readJsonFromLocalStorage<T>(key: string): T | null {
  if (typeof window === 'undefined') return null;
  try {
    const raw = window.localStorage.getItem(key);
    if (!raw) return null;
    return JSON.parse(raw) as T;
  } catch {
    return null;
  }
}

export function writeJsonToLocalStorage(key: string, value: unknown): void {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(key, JSON.stringify(value));
  } catch {
    // Best effort only
  }
}

export function removeLocalStorageKey(key: string): void {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.removeItem(key);
  } catch {
    // Best effort only
  }
}

function decodeBase64Url(segment: string): string | null {
  const normalized = segment.replace(/-/g, '+').replace(/_/g, '/');
  const padded = normalized.padEnd(normalized.length + ((4 - (normalized.length % 4)) % 4), '=');
  try {
    if (typeof window !== 'undefined' && typeof window.atob === 'function') {
      return window.atob(padded);
    }
    return atob(padded);
  } catch {
    return null;
  }
}

export function decodeUserIdFromAccessToken(accessToken: string | null | undefined): string | null {
  if (!accessToken) return null;
  const parts = accessToken.split('.');
  if (parts.length < 2) return null;

  const decoded = decodeBase64Url(parts[1] ?? '');
  if (!decoded) return null;

  try {
    const parsed = JSON.parse(decoded) as { sub?: unknown };
    return typeof parsed.sub === 'string' && parsed.sub.trim() ? parsed.sub : null;
  } catch {
    return null;
  }
}

