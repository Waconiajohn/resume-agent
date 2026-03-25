/**
 * Firecrawl Adapter — Web search powered job discovery via Firecrawl.
 *
 * API: https://api.firecrawl.dev/v1/search
 * Auth: Authorization Bearer header from FIRECRAWL_API_KEY env var
 * Returns empty array on missing key or any network/parse error.
 */

import logger from '../../logger.js';
import type { SearchAdapter, SearchFilters, JobResult } from '../types.js';

const FIRECRAWL_BASE_URL = 'https://api.firecrawl.dev/v1';
const REQUEST_TIMEOUT_MS = 30_000;

interface FirecrawlSearchResult {
  url?: string;
  title?: string;
  description?: string;
}

interface FirecrawlSearchResponse {
  success?: boolean;
  data?: FirecrawlSearchResult[];
}

/**
 * Try to extract a company name from a search result's URL or title.
 * Falls back to the domain name when no "at Company" pattern is found.
 */
function extractCompanyFromResult(result: FirecrawlSearchResult): string {
  // Try "at Company" pattern in the title
  const atMatch = result.title?.match(/\bat\s+(.+?)(?:\s*[-–|]|\s*$)/i);
  if (atMatch) return atMatch[1].trim();

  // Try "Company - Title" pattern (common on job boards)
  const dashMatch = result.title?.match(/^(.+?)\s*[-–|]\s*.+/);
  if (dashMatch && dashMatch[1].length < 60) return dashMatch[1].trim();

  // Fall back to domain
  if (result.url) {
    try {
      const hostname = new URL(result.url).hostname.replace(/^(www|jobs|careers|boards)\./i, '');
      const name = hostname.split('.')[0];
      if (name) return name.charAt(0).toUpperCase() + name.slice(1);
    } catch {
      // fall through
    }
  }

  return 'Unknown Company';
}

export class FirecrawlAdapter implements SearchAdapter {
  readonly name = 'firecrawl';

  async search(query: string, location: string, _filters: SearchFilters): Promise<JobResult[]> {
    const apiKey = process.env.FIRECRAWL_API_KEY;
    if (!apiKey) {
      logger.warn({ adapter: this.name }, 'FIRECRAWL_API_KEY not set — skipping adapter');
      return [];
    }

    try {
      const searchQuery = location ? `${query} jobs in ${location}` : `${query} jobs`;

      const response = await fetch(`${FIRECRAWL_BASE_URL}/search`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${apiKey}`,
        },
        body: JSON.stringify({ query: searchQuery, limit: 20 }),
        signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
      });

      if (!response.ok) {
        const body = await response.text().catch(() => '');
        logger.warn(
          { adapter: this.name, status: response.status, body: body.slice(0, 200) },
          'Firecrawl search API returned non-OK status',
        );
        return [];
      }

      const data = (await response.json()) as FirecrawlSearchResponse;
      if (!data.success || !data.data) return [];

      return data.data
        .filter((r) => r.title && r.url)
        .map(
          (r, i): JobResult => ({
            external_id: `firecrawl_${Date.now()}_${i}`,
            title: r.title ?? 'Unknown Title',
            company: extractCompanyFromResult(r),
            location: null,
            salary_min: null,
            salary_max: null,
            description: r.description ?? null,
            posted_date: new Date().toISOString(),
            apply_url: r.url ?? null,
            source: this.name,
            remote_type: null,
            employment_type: null,
            required_skills: null,
          }),
        );
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      logger.warn({ adapter: this.name, error: message }, 'Firecrawl adapter error');
      return [];
    }
  }
}
