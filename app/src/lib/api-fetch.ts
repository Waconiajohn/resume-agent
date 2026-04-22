/**
 * apiFetch — thin shared wrapper around global fetch.
 *
 * Sprint C7 — the 2026-04-21 UX audit found several silent 404/429/500
 * responses sitting in the console that never surfaced to the user. The
 * existing call sites each do their own fetch + ad-hoc error handling; most
 * treat non-2xx as "set error: string, carry on quietly."
 *
 * This helper keeps that default (it doesn't pop a toast automatically) but
 * provides one optional escape hatch for call sites that want errors to be
 * visible: set `toastOnError: true` (or call `reportApiError` directly) and
 * the helper dispatches a `careeriq:api-error` window event. The
 * `ApiErrorToaster` component mounted in App subscribes to that event and
 * shows the user a toast.
 *
 * Designed for incremental adoption — existing fetch calls keep working
 * unchanged.
 */
import { API_BASE } from './api';

export interface ApiFetchOptions extends RequestInit {
  /** Prepend API_BASE ('/api' in dev, the Railway URL in prod) to the path. */
  prefixBase?: boolean;
  /** Bearer token. Shortcut for setting Authorization: `Bearer ${token}`. */
  accessToken?: string | null;
  /**
   * When true and the response is a client/server error (>=400), dispatch
   * a `careeriq:api-error` window event so ApiErrorToaster can surface it.
   * Default false — preserves existing silent-failure behavior for call
   * sites that haven't opted in.
   */
  toastOnError?: boolean;
  /**
   * Human-readable context for the toast ("Save application", "Load resume").
   * Without this, toasts fall back to the URL tail.
   */
  errorContext?: string;
}

export interface ApiErrorDetail {
  /** Full URL the request was made to. */
  url: string;
  /** HTTP status. 0 for network failures. */
  status: number;
  /** Human-readable context supplied by the caller. */
  context?: string;
  /** Short message pulled from the response body when parseable. */
  message?: string;
}

const API_ERROR_EVENT = 'careeriq:api-error';

/** Dispatch an API-error notification on the window. Pure side-effect. */
export function reportApiError(detail: ApiErrorDetail): void {
  if (typeof window === 'undefined') return;
  window.dispatchEvent(new CustomEvent<ApiErrorDetail>(API_ERROR_EVENT, { detail }));
}

/** Subscribe to API-error notifications. Returns an unsubscribe function. */
export function subscribeApiErrors(handler: (detail: ApiErrorDetail) => void): () => void {
  if (typeof window === 'undefined') return () => undefined;
  const listener = (event: Event) => {
    const detail = (event as CustomEvent<ApiErrorDetail>).detail;
    if (detail) handler(detail);
  };
  window.addEventListener(API_ERROR_EVENT, listener);
  return () => window.removeEventListener(API_ERROR_EVENT, listener);
}

/**
 * Fetch with optional auth + error-event support.
 *
 * Returns the raw Response so callers can still branch on status and parse
 * bodies the way they already do. The only side effect is the optional
 * error event for `toastOnError: true` and >=400 responses.
 */
export async function apiFetch(path: string, options: ApiFetchOptions = {}): Promise<Response> {
  const {
    prefixBase = true,
    accessToken,
    toastOnError = false,
    errorContext,
    headers,
    ...rest
  } = options;

  const url = prefixBase && !path.startsWith('http') ? `${API_BASE}${path}` : path;
  const mergedHeaders = new Headers(headers);
  if (accessToken && !mergedHeaders.has('Authorization')) {
    mergedHeaders.set('Authorization', `Bearer ${accessToken}`);
  }

  let res: Response;
  try {
    res = await fetch(url, { ...rest, headers: mergedHeaders });
  } catch (err) {
    if (toastOnError) {
      reportApiError({
        url,
        status: 0,
        context: errorContext,
        message: err instanceof Error ? err.message : 'Network error',
      });
    }
    throw err;
  }

  if (toastOnError && res.status >= 400) {
    let message: string | undefined;
    try {
      const body = (await res.clone().json()) as { error?: string; message?: string };
      message = body?.error ?? body?.message;
    } catch {
      // non-JSON response; leave message undefined
    }
    reportApiError({ url, status: res.status, context: errorContext, message });
  }

  return res;
}
