/**
 * Job Search Core — unit tests for searchAllSources() and extractPrimaryQuery().
 *
 * Sprint 57, Story: Job Command Center backend tests.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

// ─── Mocks — hoisted before imports ──────────────────────────────────────────

vi.mock('../lib/logger.js', () => ({
  default: {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
    child: vi.fn().mockReturnThis(),
  },
}));

// ─── Imports (after mocks) ────────────────────────────────────────────────────

import { searchAllSources, extractPrimaryQuery } from '../lib/job-search/index.js';
import type { SearchAdapter, SearchFilters, JobResult } from '../lib/job-search/types.js';

// ─── Helpers ──────────────────────────────────────────────────────────────────

function makeJob(overrides: Partial<JobResult> = {}): JobResult {
  return {
    external_id: 'test_abc123',
    title: 'Software Engineer',
    company: 'Acme Corp',
    location: 'San Francisco, CA',
    salary_min: null,
    salary_max: null,
    description: null,
    posted_date: new Date().toISOString(),
    apply_url: null,
    source: 'test',
    remote_type: null,
    employment_type: null,
    required_skills: null,
    ...overrides,
  };
}

function makeAdapter(name: string, results: JobResult[] | Error): SearchAdapter {
  return {
    name,
    search: results instanceof Error
      ? vi.fn().mockRejectedValue(results)
      : vi.fn().mockResolvedValue(results),
  };
}

const baseFilters: SearchFilters = { datePosted: '7d' };

// ─── Tests: extractPrimaryQuery ───────────────────────────────────────────────

describe('extractPrimaryQuery', () => {
  it('extracts first title from (title1 OR title2) pattern', () => {
    expect(extractPrimaryQuery('(VP of Engineering OR CTO OR Director of Engineering)')).toBe('VP of Engineering');
  });

  it('extracts first title from single-item group', () => {
    expect(extractPrimaryQuery('(Director of Product)')).toBe('Director of Product');
  });

  it('returns original query when no parentheses group is present', () => {
    expect(extractPrimaryQuery('Software Engineer')).toBe('Software Engineer');
  });

  it('handles empty string without throwing', () => {
    expect(extractPrimaryQuery('')).toBe('');
  });

  it('handles query with AND after OR group', () => {
    const result = extractPrimaryQuery('(CTO OR VP Engineering) AND remote');
    expect(result).toBe('CTO');
  });

  it('handles case-insensitive OR separator', () => {
    expect(extractPrimaryQuery('(Frontend or Backend)')).toBe('Frontend');
  });
});

// ─── Tests: searchAllSources ──────────────────────────────────────────────────

describe('searchAllSources', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns combined results from multiple adapters', async () => {
    const jobA = makeJob({ external_id: 'a_1', title: 'CTO', company: 'Alpha', location: 'NYC', source: 'a' });
    const jobB = makeJob({ external_id: 'b_1', title: 'VP Eng', company: 'Beta', location: 'SF', source: 'b' });
    const adapterA = makeAdapter('adapterA', [jobA]);
    const adapterB = makeAdapter('adapterB', [jobB]);

    const result = await searchAllSources('CTO', 'US', baseFilters, [adapterA, adapterB]);

    expect(result.jobs).toHaveLength(2);
    expect(result.sources_queried).toEqual(['adapterA', 'adapterB']);
  });

  it('deduplicates jobs with same title, company, and location', async () => {
    const dup = makeJob({ title: 'CTO', company: 'Acme', location: 'NYC' });
    const adapterA = makeAdapter('a', [dup]);
    const adapterB = makeAdapter('b', [{ ...dup, external_id: 'b_dup', source: 'b' }]);

    const result = await searchAllSources('CTO', 'NYC', baseFilters, [adapterA, adapterB]);

    expect(result.jobs).toHaveLength(1);
    expect(result.jobs[0]!.external_id).toBe(dup.external_id);
  });

  it('handles an adapter failure gracefully — other adapter still returns results', async () => {
    const goodJob = makeJob({ external_id: 'good_1', source: 'good' });
    const goodAdapter = makeAdapter('good', [goodJob]);
    const badAdapter = makeAdapter('bad', new Error('Network timeout'));

    const result = await searchAllSources('Director', 'US', baseFilters, [goodAdapter, badAdapter]);

    expect(result.jobs).toHaveLength(1);
    expect(result.jobs[0]!.external_id).toBe('good_1');
    expect(result.sources_queried).toEqual(['good', 'bad']);
  });

  it('returns empty jobs array when all adapters fail', async () => {
    const adapterA = makeAdapter('a', new Error('timeout'));
    const adapterB = makeAdapter('b', new Error('forbidden'));

    const result = await searchAllSources('Engineer', 'Remote', baseFilters, [adapterA, adapterB]);

    expect(result.jobs).toHaveLength(0);
    expect(result.sources_queried).toEqual(['a', 'b']);
  });

  it('returns empty jobs and empty sources when no adapters are provided', async () => {
    const result = await searchAllSources('Engineer', 'NYC', baseFilters, []);

    expect(result.jobs).toHaveLength(0);
    expect(result.sources_queried).toHaveLength(0);
    expect(result.empty_reason).toMatch(/no job-search provider/i);
  });

  it('does not expose provider names in user-facing empty reasons', async () => {
    const adapter: SearchAdapter = {
      name: 'private_provider_name',
      search: vi.fn().mockResolvedValue([]),
      getDiagnostics: () => [
        {
          provider: 'private_provider_name',
          status: 'missing_key' as const,
          message: 'Private Provider X is not configured.',
          jobs_returned: 0,
        },
      ],
    };

    const result = await searchAllSources('Engineer', 'NYC', baseFilters, [adapter]);

    expect(result.empty_reason).toMatch(/not fully configured/i);
    expect(result.empty_reason).not.toMatch(/Private Provider|private_provider_name/i);
  });

  it('includes executionTimeMs in the response', async () => {
    const adapter = makeAdapter('fast', [makeJob()]);

    const result = await searchAllSources('Engineer', 'NYC', baseFilters, [adapter]);

    expect(typeof result.executionTimeMs).toBe('number');
    expect(result.executionTimeMs).toBeGreaterThanOrEqual(0);
  });

  it('passes the primary query (not the raw OR query) to each adapter', async () => {
    const adapter = makeAdapter('a', []);
    await searchAllSources('(CTO OR VP) AND remote', 'US', baseFilters, [adapter]);

    expect(adapter.search).toHaveBeenCalledWith('CTO', 'US', baseFilters);
  });

  it('passes the raw query to adapters that opt into raw query mode', async () => {
    const adapter = {
      ...makeAdapter('structured', []),
      queryMode: 'raw' as const,
    };

    await searchAllSources('(CTO OR VP) AND remote', 'US', baseFilters, [adapter]);

    expect(adapter.search).toHaveBeenCalledWith('(CTO OR VP) AND remote', 'US', baseFilters);
  });

  it('enforces a requested remoteType across adapters', async () => {
    const remoteJob = makeJob({
      external_id: 'remote_1',
      title: 'VP Operations',
      remote_type: 'remote',
    });
    const hybridJob = makeJob({
      external_id: 'hybrid_1',
      title: 'VP Operations',
      remote_type: 'hybrid',
    });
    const unknownJob = makeJob({
      external_id: 'unknown_1',
      title: 'VP Operations',
      remote_type: null,
    });
    const adapter = makeAdapter('a', [remoteJob, hybridJob, unknownJob]);

    const result = await searchAllSources(
      'VP Operations',
      'Dallas, TX',
      { datePosted: '7d', remoteType: 'hybrid' },
      [adapter],
    );

    expect(result.jobs).toEqual([hybridJob]);
  });

  it('excludes stale and unknown-date jobs when a freshness filter is active', async () => {
    const recentJob = makeJob({
      external_id: 'recent_1',
      posted_date: new Date(Date.now() - 2 * 24 * 60 * 60 * 1000).toISOString(),
    });
    const oldJob = makeJob({
      external_id: 'old_1',
      posted_date: new Date(Date.now() - 15 * 24 * 60 * 60 * 1000).toISOString(),
    });
    const unknownDateJob = makeJob({
      external_id: 'unknown_1',
      posted_date: null,
    });
    const adapter = makeAdapter('a', [recentJob, oldJob, unknownDateJob]);

    const result = await searchAllSources('VP Operations', 'Dallas, TX', { datePosted: '7d' }, [adapter]);

    expect(result.jobs).toEqual([recentJob]);
    expect(result.filter_stats?.filtered_by_freshness).toBe(2);
  });

  it('explains when all provider results are removed by freshness filtering', async () => {
    const oldJob = makeJob({
      external_id: 'old_1',
      posted_date: new Date(Date.now() - 15 * 24 * 60 * 60 * 1000).toISOString(),
    });
    const adapter = makeAdapter('a', [oldJob]);

    const result = await searchAllSources('VP Operations', 'Dallas, TX', { datePosted: '7d' }, [adapter]);

    expect(result.jobs).toEqual([]);
    expect(result.empty_reason).toMatch(/readable posting date inside 7d/i);
  });

  it('excludes unknown-date jobs even at the widest freshness window', async () => {
    const unknownDateJob = makeJob({
      external_id: 'unknown_1',
      posted_date: null,
    });
    const adapter = makeAdapter('a', [unknownDateJob]);

    const result = await searchAllSources('VP Operations', 'Dallas, TX', { datePosted: '30d' }, [adapter]);

    expect(result.jobs).toEqual([]);
    expect(result.filter_stats?.filtered_by_freshness).toBe(1);
  });

  it('deduplication is case-insensitive for title/company/location', async () => {
    const jobA = makeJob({ title: 'CTO', company: 'ACME CORP', location: 'New York', source: 'a' });
    const jobB = makeJob({ title: 'cto', company: 'Acme Corp', location: 'new york', source: 'b', external_id: 'b_2' });
    const adapterA = makeAdapter('a', [jobA]);
    const adapterB = makeAdapter('b', [jobB]);

    const result = await searchAllSources('CTO', 'NYC', baseFilters, [adapterA, adapterB]);

    expect(result.jobs).toHaveLength(1);
  });
});
