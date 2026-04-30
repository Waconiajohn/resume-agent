/**
 * Unit tests for server/src/lib/ni/career-scraper.ts
 *
 * Tests the three-tier ATS-native job scanning strategy:
 *   - Tier 1: ATS API dispatch (Lever, Greenhouse, Workday, Ashby)
 *   - Tier 2: Structured public listing search
 *   - Tier 3: Supplemental web/ATS search fallback
 *   - Title matching: keyword overlap scoring
 *   - Referral bonus detection
 *   - Error handling
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
    chain.single = vi.fn().mockResolvedValue({ data: null, error: { code: 'PGRST116' } });
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

const mockFetchFromATS = vi.hoisted(() => vi.fn());
const mockSearchViaSerpApi = vi.hoisted(() => vi.fn());
const mockSearchViaSerper = vi.hoisted(() => vi.fn());
const mockExtractJobsFromCareerPage = vi.hoisted(() => vi.fn().mockResolvedValue([]));

vi.mock('../lib/supabase.js', () => ({
  supabaseAdmin: mockSupabase,
}));

vi.mock('../lib/ni/ats-clients.js', () => ({
  fetchFromATS: mockFetchFromATS,
}));

vi.mock('../lib/ni/serpapi-job-search.js', () => ({
  searchCompanyJobsViaSerpApi: mockSearchViaSerpApi,
}));

vi.mock('../lib/ni/serper-job-search.js', () => ({
  searchJobsViaSerper: mockSearchViaSerper,
}));

vi.mock('../lib/ni/json-ld-extractor.js', () => ({
  extractJobsFromCareerPage: mockExtractJobsFromCareerPage,
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

import { scrapeCareerPages, searchJobsByCompany, computeMatchScore, titleMatchesTargets } from '../lib/ni/career-scraper.js';
import { insertJobMatch } from '../lib/ni/job-matches-store.js';
import type { ATSJob } from '../lib/ni/types.js';

// ─── Helpers ───────────────────────────────────────────────────────────────────

const COMPANY_WITH_ATS = { id: 'c1', name: 'Acme Corp', domain: 'acme.com', ats_platform: 'greenhouse' as const, ats_slug: 'acme' };
const COMPANY_ICIMS = { id: 'c4', name: 'Big Healthcare', domain: 'bighealthcare.com', ats_platform: 'icims' as const, ats_slug: 'bighealthcare' };
const COMPANY_NO_ATS = { id: 'c2', name: 'Mystery Inc', domain: 'mystery.com', ats_platform: null, ats_slug: null };
const COMPANY_NO_DOMAIN = { id: 'c3', name: 'Unknown Co', domain: null };

function makeATSJobs(titles: string[], source: ATSJob['source'] = 'greenhouse'): ATSJob[] {
  return titles.map((title) => ({
    title,
    url: `https://example.com/jobs/${title.toLowerCase().replace(/\s/g, '-')}`,
    location: 'San Francisco, CA',
    salaryRange: null,
    descriptionSnippet: null,
    postedOn: new Date().toISOString(),
    source,
  }));
}

// ─── Tests ─────────────────────────────────────────────────────────────────────

describe('scrapeCareerPages', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockFetchFromATS.mockResolvedValue([]);
    mockSearchViaSerpApi.mockResolvedValue([]);
    mockSearchViaSerper.mockResolvedValue([]);
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
  });

  it('uses ATS API when company has ats_platform and ats_slug', async () => {
    mockFetchFromATS.mockResolvedValue(makeATSJobs(['Director of Operations']));

    const result = await scrapeCareerPages([COMPANY_WITH_ATS], ['Director'], 'user-1');

    expect(mockFetchFromATS).toHaveBeenCalledWith('greenhouse', 'acme');
    expect(result.companiesScanned).toBe(1);
    expect(result.jobsFound).toBeGreaterThan(0);
    expect(insertJobMatch).toHaveBeenCalled();
  });

  it('dispatches to iCIMS when company has ats_platform=icims', async () => {
    mockFetchFromATS.mockResolvedValue(makeATSJobs(['Clinical Director'], 'icims'));

    const result = await scrapeCareerPages([COMPANY_ICIMS], ['Clinical Director'], 'user-1');

    expect(mockFetchFromATS).toHaveBeenCalledWith('icims', 'bighealthcare');
    expect(result.companiesScanned).toBe(1);
    expect(result.jobsFound).toBeGreaterThan(0);
  });

  it('uses structured listings when iCIMS returns zero jobs', async () => {
    mockFetchFromATS.mockResolvedValue([]);
    mockSearchViaSerpApi.mockResolvedValue(makeATSJobs(['Nurse Manager'], 'serpapi'));

    const result = await scrapeCareerPages([COMPANY_ICIMS], ['Nurse Manager'], 'user-1');

    expect(mockFetchFromATS).toHaveBeenCalledWith('icims', 'bighealthcare');
    expect(mockSearchViaSerpApi).toHaveBeenCalled();
    expect(mockSearchViaSerper).not.toHaveBeenCalled();
    expect(result.jobsFound).toBeGreaterThan(0);
    expect(result.sourceBreakdown.serpapi).toBeGreaterThan(0);
  });

  it('falls back to supplemental search when company has no ATS info and structured listings find nothing', async () => {
    mockSearchViaSerper.mockResolvedValue(makeATSJobs(['VP of Engineering'], 'serper'));

    const result = await scrapeCareerPages([COMPANY_NO_ATS], ['VP'], 'user-1');

    expect(mockFetchFromATS).not.toHaveBeenCalled();
    expect(mockSearchViaSerpApi).toHaveBeenCalledWith(COMPANY_NO_ATS, ['VP'], { remote_only: false, max_days_old: 7 });
    // scrapeCareerPages passes filter details through to the supplemental fallback.
    expect(mockSearchViaSerper).toHaveBeenCalledWith('Mystery Inc', ['VP'], undefined, 7, undefined, undefined);
    expect(result.jobsFound).toBeGreaterThan(0);
  });

  it('falls back to supplemental search when ATS API and structured listings return zero jobs', async () => {
    mockFetchFromATS.mockResolvedValue([]);
    mockSearchViaSerper.mockResolvedValue(makeATSJobs(['Director of Finance'], 'serper'));

    const result = await scrapeCareerPages([COMPANY_WITH_ATS], ['Director'], 'user-1');

    expect(mockFetchFromATS).toHaveBeenCalled();
    expect(mockSearchViaSerpApi).toHaveBeenCalled();
    expect(mockSearchViaSerper).toHaveBeenCalled();
    expect(result.jobsFound).toBeGreaterThan(0);
  });

  it('returns zero counts when both tiers find nothing', async () => {
    const result = await scrapeCareerPages([COMPANY_NO_DOMAIN], ['Director'], 'user-1');

    expect(result.companiesScanned).toBe(1);
    expect(result.jobsFound).toBe(0);
    expect(result.matchingJobs).toBe(0);
  });

  it('filters jobs by target title match', async () => {
    mockFetchFromATS.mockResolvedValue(makeATSJobs([
      'Director of Operations',
      'Software Engineer',
      'Supply Chain Manager',
    ]));

    const result = await scrapeCareerPages([COMPANY_WITH_ATS], ['Director of Operations', 'Supply Chain Manager'], 'user-1');

    // Director + Supply Chain match, Software Engineer does not
    expect(result.matchingJobs).toBe(2);
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
    mockFetchFromATS.mockResolvedValue(makeATSJobs(['Vice President of Engineering']));

    await scrapeCareerPages([COMPANY_WITH_ATS], ['VP', 'Vice President'], 'user-1');

    expect(insertJobMatch).toHaveBeenCalledWith(
      'user-1',
      expect.objectContaining({ referral_available: true }),
    );
  });

  it('accumulates results across multiple companies', async () => {
    mockFetchFromATS.mockResolvedValue(makeATSJobs(['Director of Finance']));

    const companies = [
      { ...COMPANY_WITH_ATS, id: 'c1', name: 'Corp A' },
      { ...COMPANY_WITH_ATS, id: 'c2', name: 'Corp B', ats_slug: 'corpb' },
    ];

    const result = await scrapeCareerPages(companies, ['Director'], 'user-1');
    expect(result.companiesScanned).toBe(2);
  });

  it('continues processing remaining companies when one ATS call fails', async () => {
    let callCount = 0;
    mockFetchFromATS.mockImplementation(() => {
      callCount++;
      if (callCount === 1) throw new Error('Network error');
      return Promise.resolve(makeATSJobs(['Director of Ops']));
    });

    const companies = [
      { ...COMPANY_WITH_ATS, id: 'c1', name: 'Corp A' },
      { ...COMPANY_WITH_ATS, id: 'c2', name: 'Corp B', ats_slug: 'corpb' },
    ];

    const result = await scrapeCareerPages(companies, ['Director'], 'user-1');
    // Both companies scanned — first one falls through to supplemental search after ATS error
    expect(result.companiesScanned).toBe(2);
    // Second company found jobs via ATS
    expect(result.matchingJobs).toBeGreaterThan(0);
  });

  it('includes source in sourceBreakdown', async () => {
    mockFetchFromATS.mockResolvedValue(makeATSJobs(['Director of Engineering']));

    const result = await scrapeCareerPages([COMPANY_WITH_ATS], ['Director'], 'user-1');

    expect(result.sourceBreakdown).toBeDefined();
    expect(result.sourceBreakdown.greenhouse).toBeGreaterThan(0);
  });

  it('filters city/state without treating state abbreviations as substrings', async () => {
    mockFetchFromATS.mockResolvedValue([
      {
        title: 'VP Operations',
        url: 'https://example.com/jobs/portland',
        location: 'Portland, OR',
        salaryRange: null,
        descriptionSnippet: null,
        postedOn: new Date().toISOString(),
        source: 'greenhouse',
      },
      {
        title: 'VP Operations',
        url: 'https://example.com/jobs/new-york',
        location: 'New York, NY',
        salaryRange: null,
        descriptionSnippet: null,
        postedOn: new Date().toISOString(),
        source: 'greenhouse',
      },
      {
        title: 'VP Operations',
        url: 'https://example.com/jobs/orlando',
        location: 'Orlando, FL',
        salaryRange: null,
        descriptionSnippet: null,
        postedOn: new Date().toISOString(),
        source: 'greenhouse',
      },
      {
        title: 'VP Operations',
        url: 'https://example.com/jobs/remote',
        location: 'Remote',
        salaryRange: null,
        descriptionSnippet: null,
        postedOn: new Date().toISOString(),
        source: 'greenhouse',
      },
      {
        title: 'VP Operations',
        url: 'https://example.com/jobs/location-unknown',
        location: null,
        salaryRange: null,
        descriptionSnippet: null,
        postedOn: new Date().toISOString(),
        source: 'greenhouse',
      },
    ] satisfies ATSJob[]);

    const result = await scrapeCareerPages(
      [COMPANY_WITH_ATS],
      ['VP Operations'],
      'user-1',
      'network_connections',
      undefined,
      { location: 'Portland, OR', radius_miles: 25, remote_only: false, max_days_old: 7 },
    );

    const insertedLocations = vi.mocked(insertJobMatch).mock.calls.map(([, match]) => match.location);
    expect(result.matchingJobs).toBe(2);
    expect(insertedLocations).toContain('Portland, OR');
    expect(insertedLocations).toContain('Remote');
    expect(insertedLocations).not.toContain('New York, NY');
    expect(insertedLocations).not.toContain('Orlando, FL');
    expect(insertedLocations).not.toContain(null);
  });

  it('filters jobs by explicit hybrid work mode during the scan', async () => {
    mockFetchFromATS.mockResolvedValue([
      {
        title: 'VP Operations - Remote',
        url: 'https://example.com/jobs/remote',
        location: 'Remote',
        salaryRange: null,
        descriptionSnippet: 'Fully remote operations leadership role.',
        postedOn: new Date().toISOString(),
        source: 'greenhouse',
      },
      {
        title: 'VP Operations - Hybrid',
        url: 'https://example.com/jobs/hybrid',
        location: 'Dallas, TX',
        salaryRange: null,
        descriptionSnippet: 'Hybrid schedule with 3 days in-office.',
        postedOn: new Date().toISOString(),
        source: 'greenhouse',
      },
      {
        title: 'VP Operations - On-site',
        url: 'https://example.com/jobs/onsite',
        location: 'Dallas, TX',
        salaryRange: null,
        descriptionSnippet: 'On-site role with relocation assistance.',
        postedOn: new Date().toISOString(),
        source: 'greenhouse',
      },
      {
        title: 'VP Operations - Unknown',
        url: 'https://example.com/jobs/unknown',
        location: 'Dallas, TX',
        salaryRange: null,
        descriptionSnippet: null,
        postedOn: new Date().toISOString(),
        source: 'greenhouse',
      },
    ] satisfies ATSJob[]);

    const result = await scrapeCareerPages(
      [COMPANY_WITH_ATS],
      ['VP Operations'],
      'user-1',
      'network_connections',
      undefined,
      { remote_only: false, work_modes: ['hybrid'], max_days_old: 7 },
    );

    const insertedTitles = vi.mocked(insertJobMatch).mock.calls.map(([, match]) => match.title);
    expect(result.matchingJobs).toBe(1);
    expect(insertedTitles).toEqual(['VP Operations - Hybrid']);
  });

  it('requires a readable posting date for posted-within filters', async () => {
    const now = Date.now();
    mockFetchFromATS.mockResolvedValue([
      {
        title: 'VP Operations - Current',
        url: 'https://example.com/jobs/current',
        location: 'Dallas, TX',
        salaryRange: null,
        descriptionSnippet: null,
        postedOn: new Date(now - 2 * 24 * 60 * 60 * 1000).toISOString(),
        source: 'greenhouse',
      },
      {
        title: 'VP Operations - Old',
        url: 'https://example.com/jobs/old',
        location: 'Dallas, TX',
        salaryRange: null,
        descriptionSnippet: null,
        postedOn: new Date(now - 21 * 24 * 60 * 60 * 1000).toISOString(),
        source: 'greenhouse',
      },
      {
        title: 'VP Operations - Unknown',
        url: 'https://example.com/jobs/unknown',
        location: 'Dallas, TX',
        salaryRange: null,
        descriptionSnippet: null,
        postedOn: null,
        source: 'greenhouse',
      },
    ] satisfies ATSJob[]);

    const result = await scrapeCareerPages(
      [COMPANY_WITH_ATS],
      ['VP Operations'],
      'user-1',
      'network_connections',
      undefined,
      { remote_only: false, max_days_old: 7 },
    );

    const insertedTitles = vi.mocked(insertJobMatch).mock.calls.map(([, match]) => match.title);
    expect(result.matchingJobs).toBe(1);
    expect(insertedTitles).toEqual(['VP Operations - Current']);
  });
});

// ─── Title matching ─────────────────────────────────────────────────────────

describe('title matching', () => {
  it('returns 50 when no target titles provided', () => {
    expect(computeMatchScore('Director of Operations', [])).toBe(50);
  });

  it('scores exact match at 100', () => {
    expect(computeMatchScore('Director of Operations', ['Director of Operations'])).toBe(100);
  });

  it('scores partial overlap', () => {
    // "operations" overlaps, "strategy" does not — 1/2 target words = 50%
    const score = computeMatchScore('VP of Operations and Strategy', ['VP Operations Manager']);
    expect(score).toBeGreaterThan(0);
    expect(score).toBeLessThan(100);
  });

  it('scores zero when no overlap', () => {
    expect(computeMatchScore('Software Engineer', ['VP Operations'])).toBe(0);
  });

  it('titleMatchesTargets returns true at 40% threshold', () => {
    expect(titleMatchesTargets('Director of Operations', ['Director'])).toBe(true);
  });

  it('titleMatchesTargets returns true with empty targets', () => {
    expect(titleMatchesTargets('Anything', [])).toBe(true);
  });
});

// ─── searchJobsByCompany ─────────────────────────────────────────────────────

describe('searchJobsByCompany', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns empty result when Serper finds nothing', async () => {
    mockSearchViaSerper.mockResolvedValue([]);

    const result = await searchJobsByCompany('Acme Corp', ['Director'], 'user-1');

    expect(result.companiesScanned).toBe(1);
    expect(result.jobsFound).toBe(0);
  });

  it('returns matching results from Serper', async () => {
    mockSearchViaSerper.mockResolvedValue(makeATSJobs(['Director of Finance'], 'serper'));

    const result = await searchJobsByCompany('Acme Corp', ['Director'], 'user-1');

    expect(result.jobsFound).toBeGreaterThan(0);
    expect(result.sourceBreakdown.serper).toBeGreaterThan(0);
  });
});
