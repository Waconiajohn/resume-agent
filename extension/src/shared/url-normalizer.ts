import type { ATSPlatform } from './types.js';

const STRIP_PARAMS = [
  'utm_source', 'utm_medium', 'utm_campaign', 'utm_term', 'utm_content',
  'ref', 'refId', 'trk', 'trkInfo', 'trackingId',
  'src', 'source', 'referrer',
  'fbclid', 'gclid', 'msclkid',
  'sid', 'sessionId',
  '_ga', '_gl',
];

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
  if (host.includes('greenhouse.io')) { url.search = ''; }
  if (host.includes('lever.co')) {
    url.search = '';
    url.pathname = url.pathname.replace(/\/apply$/, '');
  }
  if (host.includes('myworkdayjobs.com') || host.includes('myworkday.com')) {
    url.search = '';
  }
  return url;
}

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
