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

function extractTitleFromHTML(html: string): string {
  const match = html.match(/<title[^>]*>([^<]*)<\/title>/i);
  if (!match) return '';
  // Decode common HTML entities and trim whitespace
  return match[1]
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&nbsp;/g, ' ')
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

      html = await res.text();
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      logger.warn({ userId: user.id, url: rawUrl, error: message }, 'discovery-jd-fetch: fetch failed');
      return c.json({ error: 'Could not reach the job posting URL. Check the URL and try again.' }, 400);
    }

    if (!html || html.length < 200) {
      return c.json({ error: 'Could not extract job description from URL' }, 400);
    }

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
