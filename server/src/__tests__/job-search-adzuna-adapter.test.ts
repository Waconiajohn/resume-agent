/**
 * Adzuna Adapter — unit tests for AdzunaAdapter.search().
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

import { AdzunaAdapter } from '../lib/job-search/adapters/adzuna.js';
import type { SearchFilters } from '../lib/job-search/types.js';

// ─── Helpers ──────────────────────────────────────────────────────────────────

const baseFilters: SearchFilters = { datePosted: '7d' };

function makeAdzunaJob(overrides: Record<string, unknown> = {}) {
  return {
    id: 'az-789',
    title: 'VP of Product',
    company: { display_name: 'Beta Inc' },
    location: { display_name: 'New York, NY' },
    salary_min: 180000,
    salary_max: 250000,
    description: 'Lead product strategy.',
    created: '2026-03-02T00:00:00Z',
    redirect_url: 'https://adzuna.com/apply/az-789',
    contract_type: 'permanent',
    category: { tag: 'it-jobs' },
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

describe('AdzunaAdapter', () => {
  const originalEnv = { ...process.env };

  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    process.env = { ...originalEnv };
  });

  it('returns empty array when both credentials are missing', async () => {
    delete process.env.ADZUNA_APP_ID;
    delete process.env.ADZUNA_API_KEY;
    const adapter = new AdzunaAdapter();

    const result = await adapter.search('Engineer', 'NYC', baseFilters);

    expect(result).toEqual([]);
  });

  it('returns empty array when only ADZUNA_APP_ID is missing', async () => {
    delete process.env.ADZUNA_APP_ID;
    process.env.ADZUNA_API_KEY = 'key-only';
    const adapter = new AdzunaAdapter();

    const result = await adapter.search('Engineer', 'NYC', baseFilters);

    expect(result).toEqual([]);
  });

  it('returns empty array when only ADZUNA_API_KEY is missing', async () => {
    process.env.ADZUNA_APP_ID = 'id-only';
    delete process.env.ADZUNA_API_KEY;
    const adapter = new AdzunaAdapter();

    const result = await adapter.search('Engineer', 'NYC', baseFilters);

    expect(result).toEqual([]);
  });

  it('maps Adzuna API response to JobResult format correctly', async () => {
    process.env.ADZUNA_APP_ID = 'app-id';
    process.env.ADZUNA_API_KEY = 'api-key';
    const job = makeAdzunaJob();
    global.fetch = mockFetch(200, { results: [job] });

    const adapter = new AdzunaAdapter();
    const results = await adapter.search('VP Product', 'New York', baseFilters);

    expect(results).toHaveLength(1);
    const r = results[0]!;
    expect(r.external_id).toBe('adzuna_az-789');
    expect(r.title).toBe('VP of Product');
    expect(r.company).toBe('Beta Inc');
    expect(r.location).toBe('New York, NY');
    expect(r.salary_min).toBe(180000);
    expect(r.salary_max).toBe(250000);
    expect(r.apply_url).toBe('https://adzuna.com/apply/az-789');
    expect(r.source).toBe('adzuna');
    expect(r.employment_type).toBe('full-time');
    expect(r.required_skills).toBeNull();
  });

  it('handles API error responses gracefully', async () => {
    process.env.ADZUNA_APP_ID = 'app-id';
    process.env.ADZUNA_API_KEY = 'api-key';
    global.fetch = mockFetch(401, { error: 'Unauthorized' });

    const adapter = new AdzunaAdapter();
    const result = await adapter.search('Engineer', 'NYC', baseFilters);

    expect(result).toEqual([]);
  });

  it('handles network error gracefully', async () => {
    process.env.ADZUNA_APP_ID = 'app-id';
    process.env.ADZUNA_API_KEY = 'api-key';
    global.fetch = vi.fn().mockRejectedValue(new Error('Connection refused'));

    const adapter = new AdzunaAdapter();
    const result = await adapter.search('Engineer', 'NYC', baseFilters);

    expect(result).toEqual([]);
  });

  it('applies date filter correctly — 7d maps to max_days_old=7', async () => {
    process.env.ADZUNA_APP_ID = 'app-id';
    process.env.ADZUNA_API_KEY = 'api-key';
    global.fetch = mockFetch(200, { results: [] });

    const adapter = new AdzunaAdapter();
    await adapter.search('Engineer', 'NYC', { datePosted: '7d' });

    const url = (global.fetch as ReturnType<typeof vi.fn>).mock.calls[0][0] as string;
    expect(url).toContain('max_days_old=7');
  });

  it('omits max_days_old param when datePosted is "any"', async () => {
    process.env.ADZUNA_APP_ID = 'app-id';
    process.env.ADZUNA_API_KEY = 'api-key';
    global.fetch = mockFetch(200, { results: [] });

    const adapter = new AdzunaAdapter();
    await adapter.search('Engineer', 'NYC', { datePosted: 'any' });

    const url = (global.fetch as ReturnType<typeof vi.fn>).mock.calls[0][0] as string;
    expect(url).not.toContain('max_days_old');
  });

  it('maps remote type from job title containing "remote"', async () => {
    process.env.ADZUNA_APP_ID = 'app-id';
    process.env.ADZUNA_API_KEY = 'api-key';
    const job = makeAdzunaJob({ title: 'Remote Senior Engineer' });
    global.fetch = mockFetch(200, { results: [job] });

    const adapter = new AdzunaAdapter();
    const results = await adapter.search('Engineer', '', baseFilters);

    expect(results[0]!.remote_type).toBe('remote');
  });

  it('maps remote type from description containing "fully remote"', async () => {
    process.env.ADZUNA_APP_ID = 'app-id';
    process.env.ADZUNA_API_KEY = 'api-key';
    const job = makeAdzunaJob({ description: 'This is a fully remote position.' });
    global.fetch = mockFetch(200, { results: [job] });

    const adapter = new AdzunaAdapter();
    const results = await adapter.search('Engineer', '', baseFilters);

    expect(results[0]!.remote_type).toBe('remote');
  });

  it('maps hybrid remote type from title', async () => {
    process.env.ADZUNA_APP_ID = 'app-id';
    process.env.ADZUNA_API_KEY = 'api-key';
    const job = makeAdzunaJob({ title: 'Hybrid Software Engineer' });
    global.fetch = mockFetch(200, { results: [job] });

    const adapter = new AdzunaAdapter();
    const results = await adapter.search('Engineer', '', baseFilters);

    expect(results[0]!.remote_type).toBe('hybrid');
  });

  it('maps contract employment type correctly', async () => {
    process.env.ADZUNA_APP_ID = 'app-id';
    process.env.ADZUNA_API_KEY = 'api-key';
    const job = makeAdzunaJob({ contract_type: 'contract' });
    global.fetch = mockFetch(200, { results: [job] });

    const adapter = new AdzunaAdapter();
    const results = await adapter.search('Engineer', '', baseFilters);

    expect(results[0]!.employment_type).toBe('contract');
  });

  it('handles missing optional fields gracefully', async () => {
    process.env.ADZUNA_APP_ID = 'app-id';
    process.env.ADZUNA_API_KEY = 'api-key';
    const minimalJob = { id: 'min-1' };
    global.fetch = mockFetch(200, { results: [minimalJob] });

    const adapter = new AdzunaAdapter();
    const results = await adapter.search('Engineer', 'NYC', baseFilters);

    expect(results).toHaveLength(1);
    expect(results[0]!.title).toBe('Unknown Title');
    expect(results[0]!.company).toBe('Unknown Company');
    expect(results[0]!.location).toBeNull();
  });

  it('returns empty array when results field is missing from response', async () => {
    process.env.ADZUNA_APP_ID = 'app-id';
    process.env.ADZUNA_API_KEY = 'api-key';
    global.fetch = mockFetch(200, {});

    const adapter = new AdzunaAdapter();
    const results = await adapter.search('Engineer', 'NYC', baseFilters);

    expect(results).toEqual([]);
  });

  it('adapter name is "adzuna"', () => {
    const adapter = new AdzunaAdapter();
    expect(adapter.name).toBe('adzuna');
  });
});
