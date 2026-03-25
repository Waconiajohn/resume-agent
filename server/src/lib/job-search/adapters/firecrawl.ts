/**
 * Firecrawl Adapter — Web search powered job discovery via Firecrawl SDK.
 *
 * Uses @mendable/firecrawl-js SDK for search.
 * Auth: FIRECRAWL_API_KEY env var.
 * Returns empty array on missing key or any error.
 */

import FirecrawlApp from '@mendable/firecrawl-js';
import logger from '../../logger.js';
import type { SearchAdapter, SearchFilters, JobResult } from '../types.js';

/**
 * Try to extract a company name from a search result's URL or title.
 */
function extractCompanyFromResult(title: string, url: string): string {
  const atMatch = title.match(/\bat\s+(.+?)(?:\s*[-–|]|\s*$)/i);
  if (atMatch) return atMatch[1].trim();

  const dashMatch = title.match(/^(.+?)\s*[-–|]\s*.+/);
  if (dashMatch && dashMatch[1].length < 60) return dashMatch[1].trim();

  try {
    const hostname = new URL(url).hostname.replace(/^(www|jobs|careers|boards)\./i, '');
    const name = hostname.split('.')[0];
    if (name) return name.charAt(0).toUpperCase() + name.slice(1);
  } catch {
    // fall through
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
      const fc = new FirecrawlApp({ apiKey });
      const searchQuery = location ? `${query} jobs in ${location}` : `${query} jobs`;

      const result = await fc.search(searchQuery, { limit: 20 });
      const webResults = (result.web ?? []) as Array<{ url?: string; title?: string; description?: string }>;

      return webResults
        .filter((r) => r.title && r.url)
        .map(
          (r, i): JobResult => ({
            external_id: `firecrawl_${Date.now()}_${i}`,
            title: r.title ?? 'Unknown Title',
            company: extractCompanyFromResult(r.title ?? '', r.url ?? ''),
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
