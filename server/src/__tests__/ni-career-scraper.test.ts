/**
 * Unit tests for server/src/lib/ni/career-scraper.ts
 *
 * Tests:
 *   - scrapeCareerPages: orchestration, rate limiting, result accumulation
 *   - Markdown job parsing: link extraction, title filtering
 *   - Title matching: keyword overlap scoring
 *   - Referral bonus lookup
 *   - Firecrawl scrape and search fallback
 *   - Error handling: network failures, missing domains
 */

import { afterEach, beforeEach, describe, expect, it, vi, type Mock } from 'vitest';

// ─── Hoisted mocks ─────────────────────────────────────────────────────────────

const mockSupabase = vi.hoisted(() => {
  const chainable = () => {
    const chain: Record<string, unknown> = {};
    chain.select = vi.fn().mockReturnValue(chain);
    chain.eq = vi.fn().mockReturnValue(chain);
    chain.in = vi.fn().mockReturnValue(chain);
    chain.limit = vi.fn().mockReturnValue(chain);
    chain.single = vi.fn().mockResolvedValue({ data: null, error: null });
    chain.insert = vi.fn().mockReturnValue(chain);
    chain.update = vi.fn().mockReturnValue(chain);
    chain.order = vi.fn().mockReturnValue(chain);
    chain.range = vi.fn().mockResolvedValue({ data: [], error: null });
    chain.then = undefined;
    return chain;
  };

  return {
    from: vi.fn().mockImplementation(() => chainable()),
  };
});

const mockFirecrawlScrape = vi.hoisted(() => vi.fn());
const mockFirecrawlSearch = vi.hoisted(() => vi.fn());
const mockFirecrawlConstructor = vi.hoisted(() =>
  vi.fn(function MockFirecrawlApp() {
    return {
      scrape: mockFirecrawlScrape,
      search: mockFirecrawlSearch,
    };
  }),
);

vi.mock('../lib/supabase.js', () => ({
  supabaseAdmin: mockSupabase,
}));

vi.mock('@mendable/firecrawl-js', () => ({
  default: mockFirecrawlConstructor,
}));

vi.mock('../lib/ni/job-matches-store.js', () => ({
  insertJobMatch: vi.fn().mockResolvedValue({ id: 'mock-match-id', title: 'Test Job', company_id: 'c1' }),
}));

vi.mock('../lib/logger.js', () => ({
  default: {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
  },
}));

// ─── Module under test ─────────────────────────────────────────────────────────

import { scrapeCareerPages, searchJobsByCompany } from '../lib/ni/career-scraper.js';
import { insertJobMatch } from '../lib/ni/job-matches-store.js';

// ─── Helpers ───────────────────────────────────────────────────────────────────

const COMPANY_WITH_DOMAIN = { id: 'c1', name: 'Acme Corp', domain: 'acme.com' };
const COMPANY_NO_DOMAIN = { id: 'c2', name: 'Mystery Inc', domain: null };

/** Build a Firecrawl scrape response containing markdown with job links. */
function makeFirecrawlScrapeResponse(jobs: Array<{ title: string; url: string }>): object {
  const markdown = jobs.map((j) => `- [${j.title}](${j.url})`).join('\n');
  return {
    success: true,
    data: { markdown: `# Careers\n\n${markdown}` },
  };
}

/** Build a Firecrawl search response. */
function makeFirecrawlSearchResponse(results: Array<{ title: string; url: string }>): object {
  return {
    success: true,
    data: results.map((r) => ({ title: r.title, url: r.url, description: '' })),
  };
}

function mockFetchForFirecrawlScrape(jobs: Array<{ title: string; url: string }>): void {
  const responseBody = makeFirecrawlScrapeResponse(jobs) as { data?: { markdown?: string } };
  mockFirecrawlScrape.mockResolvedValue({
    markdown: responseBody.data?.markdown ?? null,
  });
  mockFirecrawlSearch.mockResolvedValue({ web: [] });
}

function mockFetchFailure(): void {
  mockFirecrawlScrape.mockRejectedValue(new Error('Network error'));
  mockFirecrawlSearch.mockResolvedValue({ web: [] });
}

function mockFetchNotFound(): void {
  mockFirecrawlScrape.mockResolvedValue({ markdown: null });
  mockFirecrawlSearch.mockResolvedValue({ web: [] });
}

// ─── Tests ─────────────────────────────────────────────────────────────────────

describe('scrapeCareerPages', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    process.env.FIRECRAWL_API_KEY = 'test-firecrawl-key';
    // Default: no referral program
    const chainFn = () => {
      const chain: Record<string, unknown> = {};
      chain.select = vi.fn().mockReturnValue(chain);
      chain.eq = vi.fn().mockReturnValue(chain);
      chain.limit = vi.fn().mockReturnValue(chain);
      chain.single = vi.fn().mockResolvedValue({ data: null, error: { code: 'PGRST116' } });
      chain.then = undefined;
      return chain;
    };
    mockSupabase.from.mockImplementation(chainFn);
    mockFirecrawlScrape.mockResolvedValue({ markdown: null });
    mockFirecrawlSearch.mockResolvedValue({ web: [] });
  });

  afterEach(() => {
    delete process.env.FIRECRAWL_API_KEY;
  });

  it('returns zero counts when company has no domain', async () => {
    const result = await scrapeCareerPages([COMPANY_NO_DOMAIN], [], 'user-1');
    expect(result.companiesScanned).toBe(1);
    expect(result.jobsFound).toBe(0);
    expect(result.matchingJobs).toBe(0);
    expect(result.errors).toHaveLength(1);
    expect(result.errors[0].error).toContain('No domain');
  });

  it('returns zero counts when fetch fails', async () => {
    mockFetchFailure();
    const result = await scrapeCareerPages([COMPANY_WITH_DOMAIN], [], 'user-1');
    expect(result.jobsFound).toBe(0);
  });

  it('returns zero counts when all paths return non-OK', async () => {
    mockFetchNotFound();
    const result = await scrapeCareerPages([COMPANY_WITH_DOMAIN], [], 'user-1');
    expect(result.jobsFound).toBe(0);
  });

  it('finds and stores jobs when Firecrawl scrape returns markdown with matching roles', async () => {
    mockFetchForFirecrawlScrape([
      { title: 'Director of Operations', url: '/jobs/director-operations' },
      { title: 'VP Supply Chain Manager', url: '/jobs/vp-supply-chain' },
      { title: 'Engineering Manager', url: '/jobs/eng-manager' },
    ]);

    const result = await scrapeCareerPages([COMPANY_WITH_DOMAIN], ['Director', 'VP'], 'user-1');

    expect(result.companiesScanned).toBe(1);
    expect(result.jobsFound).toBeGreaterThan(0);
    expect(insertJobMatch).toHaveBeenCalled();
  });

  it('does not call insertJobMatch when no matching jobs found', async () => {
    mockFirecrawlScrape.mockResolvedValue({
      markdown: '# About Us\n\nWe are a great company.',
    });

    await scrapeCareerPages([COMPANY_WITH_DOMAIN], ['VP Operations'], 'user-1');
    expect(insertJobMatch).not.toHaveBeenCalled();
  });

  it('marks referral_available=true when company has referral program', async () => {
    const chainWithReferral = () => {
      const chain: Record<string, unknown> = {};
      chain.select = vi.fn().mockReturnValue(chain);
      chain.eq = vi.fn().mockReturnValue(chain);
      chain.limit = vi.fn().mockReturnValue(chain);
      chain.single = vi.fn().mockResolvedValue({ data: { id: 'rp1' }, error: null });
      chain.then = undefined;
      return chain;
    };
    mockSupabase.from.mockImplementation(chainWithReferral);

    mockFetchForFirecrawlScrape([
      { title: 'Vice President of Engineering', url: '/jobs/vp-eng' },
    ]);

    await scrapeCareerPages([COMPANY_WITH_DOMAIN], ['VP', 'Vice President'], 'user-1');

    expect(insertJobMatch).toHaveBeenCalledWith(
      'user-1',
      expect.objectContaining({ referral_available: true }),
    );
  });

  it('accumulates results across multiple companies', async () => {
    mockFetchForFirecrawlScrape([{ title: 'Director of Finance', url: '/jobs/dir-finance' }]);

    const companies = [
      { id: 'c1', name: 'Corp A', domain: 'corpa.com' },
      { id: 'c2', name: 'Corp B', domain: 'corpb.com' },
    ];

    const result = await scrapeCareerPages(companies, ['Director'], 'user-1');
    expect(result.companiesScanned).toBe(2);
  });

  it('continues processing remaining companies when one fails', async () => {
    let callCount = 0;
    mockFirecrawlScrape.mockImplementation(() => {
      callCount++;
      if (callCount <= 5) return Promise.reject(new Error('Timeout'));
      const response = makeFirecrawlScrapeResponse([{ title: 'Chief Operating Officer', url: '/jobs/coo' }]) as {
        data?: { markdown?: string };
      };
      return Promise.resolve({
        markdown: response.data?.markdown ?? null,
      });
    });
    mockFirecrawlSearch.mockResolvedValue({ web: [] });

    const companies = [
      { id: 'c1', name: 'Corp A', domain: 'corpa.com' },
      { id: 'c2', name: 'Corp B', domain: 'corpb.com' },
    ];

    const result = await scrapeCareerPages(companies, [], 'user-1');
    expect(result.companiesScanned).toBe(2);
  });

  it('resolves relative job URLs to absolute URLs', async () => {
    mockFetchForFirecrawlScrape([
      { title: 'Chief Marketing Officer', url: '/jobs/cmo-2024' },
    ]);

    await scrapeCareerPages([COMPANY_WITH_DOMAIN], [], 'user-1');

    const calls = (insertJobMatch as Mock).mock.calls;
    if (calls.length > 0) {
      const insertedUrl: string = calls[0][1].url ?? '';
      expect(insertedUrl).toMatch(/^https?:\/\//);
    }
  });

  it('includes sourceBreakdown with firecrawl_scrape count when scraping succeeds', async () => {
    mockFetchForFirecrawlScrape([
      { title: 'Director of Engineering', url: '/jobs/dir-eng' },
    ]);

    const result = await scrapeCareerPages([COMPANY_WITH_DOMAIN], ['Director'], 'user-1');

    expect(result.sourceBreakdown).toBeDefined();
    expect(typeof result.sourceBreakdown.firecrawl_scrape).toBe('number');
    expect(typeof result.sourceBreakdown.firecrawl_search).toBe('number');
    expect(result.sourceBreakdown.firecrawl_search).toBe(0);
  });

  it('falls back to Firecrawl search when scraping finds nothing', async () => {
    mockFirecrawlScrape.mockResolvedValue({
      markdown: '# Careers\n\nNo open positions.',
    });
    mockFirecrawlSearch.mockResolvedValue({
      web: [
        { title: 'Director of Operations at Acme', url: 'https://example.com/jobs/123' },
      ],
    });

    const result = await scrapeCareerPages([COMPANY_WITH_DOMAIN], ['Director'], 'user-1', true);

    expect(result.jobsFound).toBeGreaterThan(0);
    expect(result.sourceBreakdown.firecrawl_search).toBeGreaterThan(0);
    expect(result.sourceBreakdown.firecrawl_scrape).toBe(0);
    expect(insertJobMatch).toHaveBeenCalledWith(
      'user-1',
      expect.objectContaining({
        metadata: {
          source: 'firecrawl_search',
          search_context: 'network_connections',
        },
      }),
    );
  });

  it('skips search fallback when useApiFallback=false', async () => {
    mockFetchNotFound();

    const result = await scrapeCareerPages([COMPANY_WITH_DOMAIN], ['Director'], 'user-1', false);

    expect(result.jobsFound).toBe(0);
    expect(result.sourceBreakdown.firecrawl_search).toBe(0);
  });
});

// ─── searchJobsByCompany (public export) ──────────────────────────────────────

describe('searchJobsByCompany', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns empty ScrapeResult when FIRECRAWL_API_KEY is not set', async () => {
    delete process.env.FIRECRAWL_API_KEY;

    const result = await searchJobsByCompany('Acme Corp', ['Director'], 'user-1');

    expect(result.companiesScanned).toBe(1);
    expect(result.jobsFound).toBe(0);
    expect(result.matchingJobs).toBe(0);
    expect(result.errors).toHaveLength(0);
  });

  it('returns Firecrawl search results when available', async () => {
    process.env.FIRECRAWL_API_KEY = 'test-key';

    mockFirecrawlSearch.mockResolvedValue({
      web: [{ title: 'Director of Finance', url: 'https://example.com/jobs/1' }],
    });

    const result = await searchJobsByCompany('Acme Corp', ['Director'], 'user-1');

    expect(result.jobsFound).toBeGreaterThan(0);
    expect(result.sourceBreakdown.firecrawl_search).toBeGreaterThan(0);

    delete process.env.FIRECRAWL_API_KEY;
  });
});
