/**
 * Discovery JD Fetch — POST /api/discovery/fetch-jd
 *
 * Accepts a job posting URL, fetches the HTML, strips tags, and returns the
 * plain-text job description plus the page title. Used by the DropZone so
 * users can paste a URL instead of copy-pasting the full JD text.
 *
 * Rate-limited to 10 requests per minute per user.
 */

import { Hono } from 'hono';
import FirecrawlApp from '@mendable/firecrawl-js';
import { authMiddleware } from '../middleware/auth.js';
import { rateLimitMiddleware } from '../middleware/rate-limit.js';
import { parseJsonBodyWithLimit } from '../lib/http-body-guard.js';
import logger from '../lib/logger.js';

export const discoveryJdFetchRoutes = new Hono();

// ─── Helpers ──────────────────────────────────────────────────────────────────

// C-1: SSRF — Block private/internal hostnames before any fetch attempt.
function isPrivateHost(hostname: string): boolean {
  // Block loopback
  if (hostname === 'localhost' || hostname === '127.0.0.1' || hostname === '::1') return true;
  // Block bare hostnames (no dots — likely internal)
  if (!hostname.includes('.')) return true;
  // Block RFC-1918 and link-local
  const parts = hostname.split('.').map(Number);
  if (parts.length === 4 && parts.every(n => !isNaN(n))) {
    const [a, b] = parts;
    if (a === 10) return true;                         // 10.0.0.0/8
    if (a === 172 && b >= 16 && b <= 31) return true;  // 172.16.0.0/12
    if (a === 192 && b === 168) return true;            // 192.168.0.0/16
    if (a === 169 && b === 254) return true;            // 169.254.0.0/16 (AWS IMDS)
    if (a === 127) return true;                         // 127.0.0.0/8
    if (a === 0) return true;                           // 0.0.0.0/8
  }
  return false;
}

function extractTitleFromHTML(html: string): string {
  const match = html.match(/<title[^>]*>([^<]*)<\/title>/i);
  if (!match) return '';
  // Decode common HTML entities and trim whitespace (L-1: numeric entities added)
  return match[1]
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&nbsp;/g, ' ')
    .replace(/&#x([0-9a-fA-F]+);/g, (_, hex) => String.fromCharCode(parseInt(hex, 16)))
    .replace(/&#(\d+);/g, (_, dec) => String.fromCharCode(parseInt(dec, 10)))
    .trim();
}

function titleCaseSlug(value: string): string {
  return value
    .split(/[-_\s]+/)
    .filter(Boolean)
    .map((part) => part.length <= 3 ? part.toUpperCase() : `${part[0]?.toUpperCase() ?? ''}${part.slice(1)}`)
    .join(' ')
    .trim();
}

function cleanTitleSegment(value: string): string {
  return value
    .replace(/\s*\|\s*(LinkedIn|Indeed|Glassdoor|Greenhouse|Lever|Workday|Careers).*$/i, '')
    .replace(/\s+-\s*(LinkedIn|Indeed|Glassdoor|Greenhouse|Lever|Workday|Careers).*$/i, '')
    .replace(/\s+/g, ' ')
    .trim();
}

function decodeHtmlEntities(value: string): string {
  return value
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&nbsp;/g, ' ')
    .replace(/&#x([0-9a-fA-F]+);/g, (_, hex) => String.fromCharCode(parseInt(hex, 16)))
    .replace(/&#(\d+);/g, (_, dec) => String.fromCharCode(parseInt(dec, 10)));
}

const JOB_TEXT_START_PATTERNS = [
  /^about the job$/i,
  /^job description$/i,
  /^description$/i,
  /^position summary$/i,
  /^the role$/i,
  /^responsibilities$/i,
  /^what you'?ll do$/i,
];

const JOB_TEXT_STOP_PATTERNS = [
  /^similar jobs$/i,
  /^people also viewed$/i,
  /^recommended jobs$/i,
  /^more jobs from/i,
  /^job alerts?$/i,
  /^privacy policy$/i,
  /^user agreement$/i,
  /^cookie policy$/i,
  /^linkedin/i,
  /^show more jobs/i,
  /^see who .* has hired/i,
];

const JOB_TEXT_NOISE_PATTERNS = [
  /^sign in$/i,
  /^join now$/i,
  /^save job$/i,
  /^apply now$/i,
  /^easy apply$/i,
  /^show more$/i,
  /^show less$/i,
  /^show all$/i,
  /^you may also apply directly/i,
  /^your job alert/i,
  /^create job alert/i,
  /^get notified/i,
  /^back to jobs/i,
  /^share this job/i,
  /^report this job/i,
  /^promoted$/i,
  /^be among the first/i,
  /^no longer accepting applications/i,
  /^this button displays/i,
  /^we're unlocking community knowledge/i,
  /^expertise from forbes councils/i,
  /^by creating this job alert/i,
  /^agree & join linkedin/i,
  /^new to linkedin/i,
  /^already on linkedin/i,
  /^forgot password/i,
  /^continue with google/i,
];

function cleanExtractedJobText(html: string): string {
  const withBreaks = html
    .replace(/<(br|p|div|li|h[1-6]|section|article|tr|td|th)\b[^>]*>/gi, '\n')
    .replace(/<\/(p|div|li|h[1-6]|section|article|tr|td|th)>/gi, '\n')
    .replace(/<[^>]+>/g, ' ');

  const lines = decodeHtmlEntities(withBreaks)
    .split(/\n+/)
    .map((line) => line.replace(/\s+/g, ' ').trim())
    .filter(Boolean);

  const startIndex = lines.findIndex((line) => JOB_TEXT_START_PATTERNS.some((pattern) => pattern.test(line)));
  const scopedLines = startIndex >= 0 ? lines.slice(startIndex + 1) : lines;
  const stopIndex = scopedLines.findIndex((line) => JOB_TEXT_STOP_PATTERNS.some((pattern) => pattern.test(line)));
  const candidateLines = stopIndex >= 0 ? scopedLines.slice(0, stopIndex) : scopedLines;

  const cleanedLines: string[] = [];
  const seen = new Set<string>();
  for (const line of candidateLines) {
    if (JOB_TEXT_NOISE_PATTERNS.some((pattern) => pattern.test(line))) continue;
    if (/^(like|comment|repost|send)$/i.test(line)) continue;
    if (/^\d+\s+(applicants?|followers?|connections?)$/i.test(line)) continue;
    const key = line.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    cleanedLines.push(line);
  }

  return cleanedLines.join('\n').replace(/\n{3,}/g, '\n\n').trim();
}

export function extractJobMetadataFromTitle(title: string, rawUrl: string): { title: string; company: string } {
  const cleaned = cleanTitleSegment(title);
  let roleTitle = cleaned;
  let company = '';

  const linkedinHiring = cleaned.match(/^(.+?)\s+hiring\s+(.+?)(?:\s+in\s+.+)?$/i);
  if (linkedinHiring) {
    company = linkedinHiring[1].trim();
    roleTitle = linkedinHiring[2].trim();
  }

  const jobApplication = cleaned.match(/^Job Application for\s+(.+?)\s+at\s+(.+)$/i);
  if (!company && jobApplication) {
    roleTitle = jobApplication[1].trim();
    company = jobApplication[2].trim();
  }

  const roleAtCompany = cleaned.match(/^(.+?)\s+at\s+(.+)$/i);
  if (!company && roleAtCompany) {
    roleTitle = roleAtCompany[1].trim();
    company = roleAtCompany[2].trim();
  }

  if (!company) {
    try {
      const url = new URL(rawUrl);
      const greenhouse = url.hostname === 'boards.greenhouse.io' || url.hostname.endsWith('.greenhouse.io')
        ? url.pathname.split('/').filter(Boolean)[0]
        : '';
      const lever = url.hostname === 'jobs.lever.co'
        ? url.pathname.split('/').filter(Boolean)[0]
        : '';
      company = titleCaseSlug(greenhouse || lever || '');
    } catch {
      company = '';
    }
  }

  return {
    title: cleanTitleSegment(roleTitle || title),
    company: cleanTitleSegment(company),
  };
}

async function fetchJobDescriptionViaFirecrawl(
  rawUrl: string,
  userId: string,
  reason: string,
): Promise<{ text: string; title?: string; company?: string } | null> {
  const apiKey = process.env.FIRECRAWL_API_KEY;
  if (!apiKey) return null;

  try {
    const fc = new FirecrawlApp({ apiKey });
    const result = await fc.scrape(rawUrl, {
      formats: ['markdown'],
      onlyMainContent: true,
      timeout: 15_000,
    }) as {
      success?: boolean;
      markdown?: string;
      html?: string;
      metadata?: { title?: string; ogTitle?: string; sourceURL?: string };
      error?: string;
    };

    if (result.success === false) {
      logger.warn({ userId, url: rawUrl, reason, error: result.error }, 'discovery-jd-fetch: Firecrawl fallback returned error');
      return null;
    }

    const rawText = result.markdown || result.html || '';
    const text = cleanExtractedJobText(rawText);
    if (text.length <= 200) {
      logger.warn({ userId, url: rawUrl, reason, textLength: text.length }, 'discovery-jd-fetch: Firecrawl fallback text too short');
      return null;
    }

    const pageTitle = result.metadata?.title || result.metadata?.ogTitle || '';
    const metadata = extractJobMetadataFromTitle(pageTitle, rawUrl);
    logger.info(
      { userId, url: rawUrl, reason, textLength: text.length, title: metadata.title, company: metadata.company },
      'discovery-jd-fetch: Firecrawl fallback success',
    );

    return {
      text: text.slice(0, 15000),
      title: metadata.title || pageTitle || undefined,
      company: metadata.company || undefined,
    };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    logger.warn({ userId, url: rawUrl, reason, error: message }, 'discovery-jd-fetch: Firecrawl fallback failed');
    return null;
  }
}

// ─── POST /fetch-jd ───────────────────────────────────────────────────────────

discoveryJdFetchRoutes.post(
  '/fetch-jd',
  authMiddleware,
  rateLimitMiddleware(10, 60_000),
  async (c) => {
    const user = c.get('user');

    const parsedBody = await parseJsonBodyWithLimit(c, 2_000);
    if (!parsedBody.ok) return parsedBody.response;

    const body = parsedBody.data as Record<string, unknown>;
    const rawUrl = typeof body.url === 'string' ? body.url.trim() : '';

    if (!rawUrl) {
      return c.json({ error: 'url is required' }, 400);
    }

    // Validate URL format
    let parsedUrl: URL;
    try {
      parsedUrl = new URL(rawUrl);
    } catch {
      return c.json({ error: 'Invalid URL format' }, 400);
    }

    // Only allow http/https
    if (parsedUrl.protocol !== 'http:' && parsedUrl.protocol !== 'https:') {
      return c.json({ error: 'Only http and https URLs are supported' }, 400);
    }

    // C-1: Block SSRF — reject private/internal addresses before any network call
    if (isPrivateHost(parsedUrl.hostname)) {
      return c.json({ error: 'URL points to a private or internal address' }, 400);
    }

    logger.info({ userId: user.id, url: rawUrl }, 'discovery-jd-fetch: fetching job URL');

    let html: string;
    try {
      const res = await fetch(rawUrl, {
        headers: {
          Accept: 'text/html',
          'User-Agent': 'Mozilla/5.0 (compatible; CareerIQ/1.0)',
        },
        signal: AbortSignal.timeout(10_000),
      });

      if (!res.ok) {
        logger.warn({ userId: user.id, url: rawUrl, status: res.status }, 'discovery-jd-fetch: upstream returned non-2xx');
        const firecrawl = await fetchJobDescriptionViaFirecrawl(rawUrl, user.id, `direct_http_${res.status}`);
        if (firecrawl) return c.json(firecrawl);
        return c.json({ error: 'Could not fetch the job posting. The page may require a login or is unavailable.' }, 400);
      }

      // H-1: Cap response body at 2 MB before reading into memory
      const MAX_HTML_BYTES = 2_000_000;
      const reader = res.body?.getReader();
      if (!reader) return c.json({ error: 'No response body' }, 502);

      const chunks: Uint8Array[] = [];
      let totalBytes = 0;
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        totalBytes += value.byteLength;
        if (totalBytes > MAX_HTML_BYTES) {
          reader.cancel();
          break;
        }
        chunks.push(value);
      }
      html = new TextDecoder().decode(Buffer.concat(chunks));
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      logger.warn({ userId: user.id, url: rawUrl, error: message }, 'discovery-jd-fetch: fetch failed');
      const firecrawl = await fetchJobDescriptionViaFirecrawl(rawUrl, user.id, 'direct_fetch_failed');
      if (firecrawl) return c.json(firecrawl);
      return c.json({ error: 'Could not reach the job posting URL. Check the URL and try again.' }, 400);
    }

    if (!html || html.length < 200) {
      const firecrawl = await fetchJobDescriptionViaFirecrawl(rawUrl, user.id, 'direct_html_too_short');
      if (firecrawl) return c.json(firecrawl);
      return c.json({ error: 'Could not extract job description from URL' }, 400);
    }

    // M-3: Strip script/style/noscript block content before removing remaining tags
    html = html.replace(/<script[\s\S]*?<\/script>/gi, ' ');
    html = html.replace(/<style[\s\S]*?<\/style>/gi, ' ');
    html = html.replace(/<noscript[\s\S]*?<\/noscript>/gi, ' ');

    const strippedText = cleanExtractedJobText(html);

    if (strippedText.length <= 200) {
      const firecrawl = await fetchJobDescriptionViaFirecrawl(rawUrl, user.id, 'direct_text_too_short');
      if (firecrawl) return c.json(firecrawl);
      return c.json({ error: 'Could not extract job description from URL' }, 400);
    }

    const pageTitle = extractTitleFromHTML(html);
    const metadata = extractJobMetadataFromTitle(pageTitle, rawUrl);

    logger.info(
      { userId: user.id, url: rawUrl, textLength: strippedText.length, title: metadata.title, company: metadata.company },
      'discovery-jd-fetch: success',
    );

    return c.json({
      text: strippedText.slice(0, 15000),
      title: metadata.title || pageTitle,
      company: metadata.company || undefined,
    });
  },
);
