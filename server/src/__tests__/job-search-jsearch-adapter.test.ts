/**
 * JSearch Adapter — unit tests for JSearchAdapter.search().
 *
 * Sprint 57, Story: Job Command Center backend tests.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// ─── Mocks — hoisted before imports ──────────────────────────────────────────

vi.mock('../../lib/logger.js', () => ({
  default: {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
    child: vi.fn().mockReturnThis(),
  },
}));

// ─── Imports (after mocks) ────────────────────────────────────────────────────

import { JSearchAdapter } from '../lib/job-search/adapters/jsearch.js';
import type { SearchFilters } from '../lib/job-search/types.js';

// ─── Helpers ──────────────────────────────────────────────────────────────────

const baseFilters: SearchFilters = { datePosted: '7d' };

function makeJSearchJob(overrides: Record<string, unknown> = {}) {
  return {
    job_id: 'abc123',
    job_title: 'Senior Software Engineer',
    employer_name: 'Tech Corp',
    job_city: 'San Francisco',
    job_state: 'CA',
    job_country: 'US',
    job_min_salary: 150000,
    job_max_salary: 200000,
    job_description: 'Build great things.',
    job_posted_at_datetime_utc: '2026-03-01T00:00:00Z',
    job_apply_link: 'https://jobs.example.com/apply',
    job_is_remote: false,
    job_employment_type: 'FULLTIME',
    job_required_skills: ['TypeScript', 'Node.js'],
    ...overrides,
  };
}

function mockFetch(status: number, body: unknown) {
  return vi.fn().mockResolvedValue({
    ok: status >= 200 && status < 300,
    status,
    json: vi.fn().mockResolvedValue(body),
    text: vi.fn().mockResolvedValue(JSON.stringify(body)),
  });
}

// ─── Tests ────────────────────────────────────────────────────────────────────

describe('JSearchAdapter', () => {
  const originalEnv = { ...process.env };

  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    process.env = { ...originalEnv };
  });

  it('returns empty array when JSEARCH_API_KEY is missing', async () => {
    delete process.env.JSEARCH_API_KEY;
    const adapter = new JSearchAdapter();

    const result = await adapter.search('Engineer', 'NYC', baseFilters);

    expect(result).toEqual([]);
  });

  it('maps JSearch API response to JobResult format correctly', async () => {
    process.env.JSEARCH_API_KEY = 'test-key';
    const job = makeJSearchJob();
    global.fetch = mockFetch(200, { data: [job] });

    const adapter = new JSearchAdapter();
    const results = await adapter.search('Engineer', 'NYC', baseFilters);

    expect(results).toHaveLength(1);
    const r = results[0]!;
    expect(r.external_id).toBe('jsearch_abc123');
    expect(r.title).toBe('Senior Software Engineer');
    expect(r.company).toBe('Tech Corp');
    expect(r.location).toBe('San Francisco, CA, US');
    expect(r.salary_min).toBe(150000);
    expect(r.salary_max).toBe(200000);
    expect(r.apply_url).toBe('https://jobs.example.com/apply');
    expect(r.source).toBe('jsearch');
    expect(r.remote_type).toBe('onsite');
    expect(r.employment_type).toBe('full-time');
    expect(r.required_skills).toEqual(['TypeScript', 'Node.js']);
  });

  it('sets remote_type to "remote" when job_is_remote is true', async () => {
    process.env.JSEARCH_API_KEY = 'test-key';
    const job = makeJSearchJob({ job_is_remote: true });
    global.fetch = mockFetch(200, { data: [job] });

    const adapter = new JSearchAdapter();
    const results = await adapter.search('Engineer', '', baseFilters);

    expect(results[0]!.remote_type).toBe('remote');
  });

  it('sets remote_type to null when job_is_remote is undefined', async () => {
    process.env.JSEARCH_API_KEY = 'test-key';
    const job = makeJSearchJob({ job_is_remote: undefined });
    global.fetch = mockFetch(200, { data: [job] });

    const adapter = new JSearchAdapter();
    const results = await adapter.search('Engineer', '', baseFilters);

    expect(results[0]!.remote_type).toBeNull();
  });

  it('handles API error responses gracefully', async () => {
    process.env.JSEARCH_API_KEY = 'test-key';
    global.fetch = mockFetch(403, { message: 'Unauthorized' });

    const adapter = new JSearchAdapter();
    const result = await adapter.search('Engineer', 'NYC', baseFilters);

    expect(result).toEqual([]);
  });

  it('handles network error gracefully', async () => {
    process.env.JSEARCH_API_KEY = 'test-key';
    global.fetch = vi.fn().mockRejectedValue(new Error('Network failure'));

    const adapter = new JSearchAdapter();
    const result = await adapter.search('Engineer', 'NYC', baseFilters);

    expect(result).toEqual([]);
  });

  it('applies date filter correctly — maps 7d to week', async () => {
    process.env.JSEARCH_API_KEY = 'test-key';
    global.fetch = mockFetch(200, { data: [] });

    const adapter = new JSearchAdapter();
    await adapter.search('Engineer', 'NYC', { datePosted: '7d' });

    const url = (global.fetch as ReturnType<typeof vi.fn>).mock.calls[0][0] as string;
    expect(url).toContain('date_posted=week');
  });

  it('omits date_posted param when filter is "any"', async () => {
    process.env.JSEARCH_API_KEY = 'test-key';
    global.fetch = mockFetch(200, { data: [] });

    const adapter = new JSearchAdapter();
    await adapter.search('Engineer', 'NYC', { datePosted: 'any' });

    const url = (global.fetch as ReturnType<typeof vi.fn>).mock.calls[0][0] as string;
    expect(url).not.toContain('date_posted');
  });

  it('applies remote filter when remoteType is "remote"', async () => {
    process.env.JSEARCH_API_KEY = 'test-key';
    global.fetch = mockFetch(200, { data: [] });

    const adapter = new JSearchAdapter();
    await adapter.search('Engineer', 'NYC', { datePosted: 'any', remoteType: 'remote' });

    const url = (global.fetch as ReturnType<typeof vi.fn>).mock.calls[0][0] as string;
    expect(url).toContain('remote_jobs_only=true');
  });

  it('does not set remote filter for non-remote remoteType', async () => {
    process.env.JSEARCH_API_KEY = 'test-key';
    global.fetch = mockFetch(200, { data: [] });

    const adapter = new JSearchAdapter();
    await adapter.search('Engineer', 'NYC', { datePosted: 'any', remoteType: 'onsite' });

    const url = (global.fetch as ReturnType<typeof vi.fn>).mock.calls[0][0] as string;
    expect(url).not.toContain('remote_jobs_only');
  });

  it('handles missing optional job fields gracefully', async () => {
    process.env.JSEARCH_API_KEY = 'test-key';
    const minimalJob = { job_id: 'min1' };
    global.fetch = mockFetch(200, { data: [minimalJob] });

    const adapter = new JSearchAdapter();
    const results = await adapter.search('Engineer', 'NYC', baseFilters);

    expect(results).toHaveLength(1);
    expect(results[0]!.title).toBe('Unknown Title');
    expect(results[0]!.company).toBe('Unknown Company');
    expect(results[0]!.location).toBeNull();
  });

  it('returns empty array when data field is missing from response', async () => {
    process.env.JSEARCH_API_KEY = 'test-key';
    global.fetch = mockFetch(200, {});

    const adapter = new JSearchAdapter();
    const results = await adapter.search('Engineer', 'NYC', baseFilters);

    expect(results).toEqual([]);
  });

  it('adapter name is "jsearch"', () => {
    const adapter = new JSearchAdapter();
    expect(adapter.name).toBe('jsearch');
  });
});
