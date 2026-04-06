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
      return c.json({ error: 'Could not reach the job posting URL. Check the URL and try again.' }, 400);
    }

    if (!html || html.length < 200) {
      return c.json({ error: 'Could not extract job description from URL' }, 400);
    }

    // M-3: Strip script/style/noscript block content before removing remaining tags
    html = html.replace(/<script[\s\S]*?<\/script>/gi, ' ');
    html = html.replace(/<style[\s\S]*?<\/style>/gi, ' ');
    html = html.replace(/<noscript[\s\S]*?<\/noscript>/gi, ' ');

    const strippedText = html.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();

    if (strippedText.length <= 200) {
      return c.json({ error: 'Could not extract job description from URL' }, 400);
    }

    const title = extractTitleFromHTML(html);

    logger.info(
      { userId: user.id, url: rawUrl, textLength: strippedText.length, title },
      'discovery-jd-fetch: success',
    );

    return c.json({
      text: strippedText.slice(0, 15000),
      title,
    });
  },
);
