/**
 * URL Normalizer — Canonical job URL utilities for the Chrome Extension API.
 *
 * Strips tracking parameters, lowercases hostnames, removes trailing slashes,
 * and applies platform-specific normalization for major ATS providers.
 */

// ─── Constants ────────────────────────────────────────────────────────────────

const STRIP_PARAMS = [
  'utm_source', 'utm_medium', 'utm_campaign', 'utm_term', 'utm_content',
  'ref', 'refId', 'trk', 'trkInfo', 'trackingId',
  'src', 'source', 'referrer',
  'fbclid', 'gclid', 'msclkid',
  'sid', 'sessionId',
  '_ga', '_gl',
];

// ─── Types ────────────────────────────────────────────────────────────────────

export type ATSPlatform =
  | 'GREENHOUSE'
  | 'LEVER'
  | 'LINKEDIN'
  | 'INDEED'
  | 'WORKDAY'
  | 'ICIMS'
  | 'UNKNOWN';

// ─── Internal helpers ─────────────────────────────────────────────────────────

function platformSpecificNormalize(url: URL): URL {
  const host = url.hostname;

  if (host.includes('linkedin.com')) {
    const jobIdMatch = url.pathname.match(/\/jobs\/view\/(\d+)/);
    if (jobIdMatch) {
      url.pathname = `/jobs/view/${jobIdMatch[1]}`;
      url.search = '';
    }
  }

  if (host.includes('indeed.com')) {
    const jk = url.searchParams.get('jk');
    if (jk) {
      url.search = '';
      url.searchParams.set('jk', jk);
    }
  }

  if (host.includes('greenhouse.io')) {
    url.search = '';
  }

  if (host.includes('lever.co')) {
    url.search = '';
    url.pathname = url.pathname.replace(/\/apply$/, '');
  }

  if (host.includes('myworkdayjobs.com') || host.includes('myworkday.com')) {
    url.search = '';
  }

  return url;
}

// ─── Exports ──────────────────────────────────────────────────────────────────

/**
 * Returns a canonical URL string for use as a deduplication key.
 * Strips tracking parameters, normalizes hostname casing, removes trailing
 * slash from pathname, strips the fragment, and applies platform-specific rules.
 *
 * Returns `rawUrl` unchanged if parsing fails.
 */
export function normalizeJobUrl(rawUrl: string): string {
  try {
    const url = new URL(rawUrl);
    STRIP_PARAMS.forEach(p => url.searchParams.delete(p));
    url.hostname = url.hostname.toLowerCase();
    url.pathname = url.pathname.replace(/\/$/, '');
    url.hash = '';
    const normalized = platformSpecificNormalize(url);
    return normalized.toString();
  } catch {
    return rawUrl;
  }
}

/**
 * Identifies the ATS platform from a job URL.
 * Returns 'UNKNOWN' for unrecognized hosts or unparseable URLs.
 */
export function detectPlatform(url: string): ATSPlatform {
  try {
    const { hostname } = new URL(url);
    if (hostname.includes('greenhouse.io')) return 'GREENHOUSE';
    if (hostname.includes('lever.co')) return 'LEVER';
    if (hostname.includes('linkedin.com')) return 'LINKEDIN';
    if (hostname.includes('indeed.com')) return 'INDEED';
    if (hostname.includes('myworkdayjobs.com') || hostname.includes('myworkday.com')) return 'WORKDAY';
    if (hostname.includes('icims.com')) return 'ICIMS';
    return 'UNKNOWN';
  } catch {
    return 'UNKNOWN';
  }
}

/**
 * Returns true when the URL points to a page that typically contains a
 * specific job listing (as opposed to a search results page or company
 * overview).
 *
 * Returns false for unparseable URLs.
 */
export function isJobApplicationPage(url: string): boolean {
  try {
    const { hostname, pathname } = new URL(url);
    if (hostname.includes('greenhouse.io') && pathname.includes('/applications')) return true;
    if (hostname.includes('lever.co') && /\/[^/]+\/[a-f0-9-]{36}/.test(pathname)) return true;
    if (hostname.includes('linkedin.com') && pathname.includes('/jobs/view/')) return true;
    if (hostname.includes('indeed.com') && pathname.includes('/viewjob')) return true;
    if (hostname.includes('myworkdayjobs.com')) return true;
    if (hostname.includes('icims.com') && pathname.includes('/jobs/')) return true;
    return false;
  } catch {
    return false;
  }
}
