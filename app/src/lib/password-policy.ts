/**
 * Password policy — shared by AuthGate (signup) and ResetPassword.
 *
 * Two layers:
 *
 * 1. Synchronous policy check — length, simple sanity. Rejects on submit
 *    before even hitting the network.
 *
 * 2. HIBP k-anonymity breached-password check — async, fetches a 5-char
 *    SHA-1 prefix range from api.pwnedpasswords.com and searches for the
 *    remaining 35-char suffix locally. Only the prefix leaves the browser;
 *    the full password is never transmitted. See
 *    https://haveibeenpwned.com/API/v3#PwnedPasswords for the protocol.
 *
 * The Supabase project's auth.config.password_min_length is set to match
 * MIN_PASSWORD_LENGTH so server-side validation kicks in even if a client
 * bypasses the synchronous check.
 */

export const MIN_PASSWORD_LENGTH = 12;

export interface PolicyResult {
  ok: boolean;
  reasons: string[];
}

/**
 * Synchronous policy check. Does not hit the network. Returns reasons the
 * UI can render verbatim (one per line).
 */
export function validatePasswordPolicy(password: string): PolicyResult {
  const reasons: string[] = [];
  if (password.length < MIN_PASSWORD_LENGTH) {
    reasons.push(`Password must be at least ${MIN_PASSWORD_LENGTH} characters.`);
  }
  // Defense against the most trivial fillers: "aaaaaaaaaaaa" passes length but
  // is single-character. Reject if there's only one unique character.
  if (password.length > 0 && new Set(password).size === 1) {
    reasons.push('Password cannot be a single character repeated.');
  }
  return { ok: reasons.length === 0, reasons };
}

/**
 * SHA-1 the password and return uppercase hex. SHA-1 is required by the HIBP
 * protocol — it is NOT used as a security primitive here, only as a
 * one-way bucket key the API can respond to without learning the password.
 */
async function sha1Hex(input: string): Promise<string> {
  if (typeof crypto === 'undefined' || !crypto.subtle) {
    throw new Error('Web Crypto unavailable in this environment');
  }
  const data = new TextEncoder().encode(input);
  const digest = await crypto.subtle.digest('SHA-1', data);
  const bytes = new Uint8Array(digest);
  let hex = '';
  for (let i = 0; i < bytes.length; i += 1) {
    hex += bytes[i].toString(16).padStart(2, '0');
  }
  return hex.toUpperCase();
}

export interface BreachedResult {
  breached: boolean;
  count: number;
}

/**
 * HIBP k-anonymity breached-password lookup. Sends the first 5 SHA-1 chars
 * to api.pwnedpasswords.com, gets back ~600 SUFFIX:COUNT lines, scans for
 * the remaining 35 chars locally. Network call only; no PII or password
 * material leaves the browser.
 *
 * Returns { breached: false } on network failure — fail-open, because the
 * UX cost of "your password might be breached but we couldn't check" is
 * worse than the security cost of letting one rare-but-breached password
 * through during a transient HIBP outage. The synchronous policy check
 * still applies; this is just one extra layer.
 */
export async function checkPasswordBreached(
  password: string,
  options: { fetchImpl?: typeof fetch; signal?: AbortSignal } = {},
): Promise<BreachedResult> {
  const fetchImpl = options.fetchImpl ?? fetch;
  let hash: string;
  try {
    hash = await sha1Hex(password);
  } catch {
    return { breached: false, count: 0 };
  }
  const prefix = hash.slice(0, 5);
  const suffix = hash.slice(5);

  try {
    const res = await fetchImpl(
      `https://api.pwnedpasswords.com/range/${prefix}`,
      {
        method: 'GET',
        headers: { 'Add-Padding': 'true' }, // pads response to constant length to mitigate timing attacks
        signal: options.signal,
      },
    );
    if (!res.ok) return { breached: false, count: 0 };
    const text = await res.text();
    const lines = text.split('\n');
    for (const line of lines) {
      const [lineSuffix, countStr] = line.trim().split(':');
      if (lineSuffix === suffix) {
        const count = Number(countStr) || 0;
        // The Add-Padding response includes synthetic 0-count rows. Treat
        // count<=0 as "not actually breached" even when the suffix matches.
        return count > 0 ? { breached: true, count } : { breached: false, count: 0 };
      }
    }
    return { breached: false, count: 0 };
  } catch {
    return { breached: false, count: 0 };
  }
}
