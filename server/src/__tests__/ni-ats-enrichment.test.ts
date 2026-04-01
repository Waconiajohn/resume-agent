/**
 * Unit tests for server/src/lib/ni/ats-enrichment.ts
 *
 * Tests URL parsing, single-company enrichment, and bulk enrichment.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// ─── Hoisted mocks ─────────────────────────────────────────────────────────────

const mockSupabase = vi.hoisted(() => {
  const chainable = () => {
    const chain: Record<string, unknown> = {};
    chain.select = vi.fn().mockReturnValue(chain);
    chain.eq = vi.fn().mockReturnValue(chain);
    chain.in = vi.fn().mockReturnValue(chain);
    chain.is = vi.fn().mockReturnValue(chain);
    chain.not = vi.fn().mockReturnValue(chain);
    chain.limit = vi.fn().mockReturnValue(chain);
    chain.update = vi.fn().mockReturnValue(chain);
    chain.then = undefined;
    return chain;
  };

  return {
    from: vi.fn().mockImplementation(() => chainable()),
  };
});

vi.mock('../lib/supabase.js', () => ({
  supabaseAdmin: mockSupabase,
}));

vi.mock('../lib/logger.js', () => ({
  default: {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
  },
}));

import { parseATSFromUrl, enrichCompanyATS, runBulkEnrichment } from '../lib/ni/ats-enrichment.js';

// ─── parseATSFromUrl ──────────────────────────────────────────────────────────

describe('parseATSFromUrl', () => {
  it('parses Greenhouse URL', () => {
    const result = parseATSFromUrl('https://boards.greenhouse.io/acme/jobs/123');
    expect(result).toEqual({ platform: 'greenhouse', slug: 'acme' });
  });

  it('parses Lever URL', () => {
    const result = parseATSFromUrl('https://jobs.lever.co/netflix/abc-123');
    expect(result).toEqual({ platform: 'lever', slug: 'netflix' });
  });

  it('parses Ashby URL', () => {
    const result = parseATSFromUrl('https://jobs.ashbyhq.com/notion');
    expect(result).toEqual({ platform: 'ashby', slug: 'notion' });
  });

  it('parses Workday CXS URL', () => {
    const result = parseATSFromUrl('https://microsoft.wd5.myworkdayjobs.com/wday/cxs/microsoft/MSFTCareers/jobs');
    expect(result).toEqual({ platform: 'workday', slug: 'microsoft/MSFTCareers' });
  });

  it('parses Workday direct URL with language code', () => {
    const result = parseATSFromUrl('https://microsoft.wd5.myworkdayjobs.com/en-US/MSFTCareers');
    expect(result).toEqual({ platform: 'workday', slug: 'microsoft/MSFTCareers' });
  });

  it('parses iCIMS careers- prefix URL', () => {
    const result = parseATSFromUrl('https://careers-acme.icims.com/jobs/456/nurse-manager/job');
    expect(result).toEqual({ platform: 'icims', slug: 'acme' });
  });

  it('parses iCIMS jobs- prefix URL', () => {
    const result = parseATSFromUrl('https://jobs-fishercareers.icims.com/jobs/search');
    expect(result).toEqual({ platform: 'icims', slug: 'fishercareers' });
  });

  it('parses iCIMS bare subdomain URL', () => {
    const result = parseATSFromUrl('https://global-nyu.icims.com/jobs/search');
    expect(result).toEqual({ platform: 'icims', slug: 'global-nyu' });
  });

  it('returns null for non-ATS URL', () => {
    expect(parseATSFromUrl('https://www.google.com')).toBeNull();
    expect(parseATSFromUrl('https://acme.com/careers')).toBeNull();
    expect(parseATSFromUrl('https://linkedin.com/jobs/view/123')).toBeNull();
  });

  it('returns null for invalid URL', () => {
    expect(parseATSFromUrl('not-a-url')).toBeNull();
    expect(parseATSFromUrl('')).toBeNull();
  });

  it('returns null for www.icims.com', () => {
    expect(parseATSFromUrl('https://www.icims.com/company')).toBeNull();
  });

  it('returns null for Workday URL with no site segment', () => {
    // Tenant-only slug is unusable by fetchWorkdayJobs (requires {tenant}/{site})
    expect(parseATSFromUrl('https://microsoft.wd5.myworkdayjobs.com/')).toBeNull();
  });

  it('handles Greenhouse URL with no path segments beyond slug', () => {
    const result = parseATSFromUrl('https://boards.greenhouse.io/stripe');
    expect(result).toEqual({ platform: 'greenhouse', slug: 'stripe' });
  });
});

// ─── enrichCompanyATS ────────────────────────────────────────────────────────

describe('enrichCompanyATS', () => {
  const originalFetch = globalThis.fetch;
  const originalEnv = process.env.SERPER_API_KEY;

  beforeEach(() => {
    vi.clearAllMocks();
    process.env.SERPER_API_KEY = 'test-key';
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
    if (originalEnv !== undefined) {
      process.env.SERPER_API_KEY = originalEnv;
    } else {
      delete process.env.SERPER_API_KEY;
    }
  });

  it('enriches company when Serper returns ATS URL', async () => {
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({
        organic: [
          { link: 'https://boards.greenhouse.io/acme/jobs/123', title: 'Director' },
        ],
      }),
    });

    // Mock supabase update to succeed
    const updateChain: Record<string, unknown> = {};
    updateChain.eq = vi.fn().mockResolvedValue({ error: null });
    updateChain.update = vi.fn().mockReturnValue(updateChain);
    mockSupabase.from.mockReturnValue(updateChain);

    const result = await enrichCompanyATS('c1', 'Acme Corp');

    expect(result).toEqual({ enriched: true, platform: 'greenhouse', slug: 'acme' });
    expect(updateChain.update).toHaveBeenCalledWith({
      ats_platform: 'greenhouse',
      ats_slug: 'acme',
    });
  });

  it('returns not enriched when no ATS URL in results', async () => {
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({
        organic: [
          { link: 'https://acme.com/careers', title: 'Careers at Acme' },
        ],
      }),
    });

    const result = await enrichCompanyATS('c1', 'Acme Corp');

    expect(result.enriched).toBe(false);
    expect(result.reason).toBe('No ATS URL found in search results');
  });

  it('returns not enriched when SERPER_API_KEY missing', async () => {
    delete process.env.SERPER_API_KEY;

    const result = await enrichCompanyATS('c1', 'Acme Corp');

    expect(result.enriched).toBe(false);
    expect(result.reason).toBe('SERPER_API_KEY not configured');
  });

  it('returns not enriched when Serper returns non-OK', async () => {
    globalThis.fetch = vi.fn().mockResolvedValue({ ok: false, status: 429 });

    const result = await enrichCompanyATS('c1', 'Acme Corp');

    expect(result.enriched).toBe(false);
    expect(result.reason).toContain('429');
  });

  it('returns not enriched when fetch throws', async () => {
    globalThis.fetch = vi.fn().mockRejectedValue(new Error('Network timeout'));

    const result = await enrichCompanyATS('c1', 'Acme Corp');

    expect(result.enriched).toBe(false);
    expect(result.reason).toBe('Network timeout');
  });

  it('skips first non-ATS result and uses second ATS result', async () => {
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({
        organic: [
          { link: 'https://acme.com/about', title: 'About Acme' },
          { link: 'https://jobs.lever.co/acme/job-123', title: 'Director at Acme' },
        ],
      }),
    });

    const updateChain: Record<string, unknown> = {};
    updateChain.eq = vi.fn().mockResolvedValue({ error: null });
    updateChain.update = vi.fn().mockReturnValue(updateChain);
    mockSupabase.from.mockReturnValue(updateChain);

    const result = await enrichCompanyATS('c1', 'Acme Corp');

    expect(result).toEqual({ enriched: true, platform: 'lever', slug: 'acme' });
  });
});

// ─── runBulkEnrichment ──────────────────────────────────────────────────────

describe('runBulkEnrichment', () => {
  const originalFetch = globalThis.fetch;
  const originalEnv = process.env.SERPER_API_KEY;

  beforeEach(() => {
    vi.clearAllMocks();
    process.env.SERPER_API_KEY = 'test-key';
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
    if (originalEnv !== undefined) {
      process.env.SERPER_API_KEY = originalEnv;
    } else {
      delete process.env.SERPER_API_KEY;
    }
  });

  it('enriches companies with null ats_platform', async () => {
    // Mock: client_connections query returns 2 company IDs
    const connectionsChain: Record<string, unknown> = {};
    connectionsChain.select = vi.fn().mockReturnValue(connectionsChain);
    connectionsChain.eq = vi.fn().mockReturnValue(connectionsChain);
    connectionsChain.not = vi.fn().mockResolvedValue({
      data: [{ company_id: 'c1' }, { company_id: 'c2' }],
      error: null,
    });

    // Mock: company_directory query returns 2 companies needing enrichment
    const companiesChain: Record<string, unknown> = {};
    companiesChain.select = vi.fn().mockReturnValue(companiesChain);
    companiesChain.in = vi.fn().mockReturnValue(companiesChain);
    companiesChain.is = vi.fn().mockReturnValue(companiesChain);
    companiesChain.limit = vi.fn().mockResolvedValue({
      data: [
        { id: 'c1', name_display: 'Acme Corp' },
        { id: 'c2', name_display: 'Beta Inc' },
      ],
      error: null,
    });

    // Mock: update calls succeed
    const updateChain: Record<string, unknown> = {};
    updateChain.eq = vi.fn().mockResolvedValue({ error: null });
    updateChain.update = vi.fn().mockReturnValue(updateChain);

    let callCount = 0;
    mockSupabase.from.mockImplementation((table: string) => {
      if (table === 'client_connections') return connectionsChain;
      if (table === 'company_directory') {
        callCount++;
        // First call is the SELECT, subsequent are UPDATEs
        if (callCount === 1) return companiesChain;
        return updateChain;
      }
      return updateChain;
    });

    // Mock: Serper returns ATS URLs for both companies
    globalThis.fetch = vi.fn()
      .mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({
          organic: [{ link: 'https://boards.greenhouse.io/acme/jobs/1' }],
        }),
      })
      .mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({
          organic: [{ link: 'https://jobs.lever.co/beta/job-2' }],
        }),
      });

    const result = await runBulkEnrichment('user-1');

    expect(result.enriched).toBe(2);
    expect(result.total).toBe(2);
    expect(result.skipped).toBe(0);
    expect(result.errors).toBe(0);
  });

  it('returns zeros when user has no connections', async () => {
    const connectionsChain: Record<string, unknown> = {};
    connectionsChain.select = vi.fn().mockReturnValue(connectionsChain);
    connectionsChain.eq = vi.fn().mockReturnValue(connectionsChain);
    connectionsChain.not = vi.fn().mockResolvedValue({
      data: [],
      error: null,
    });

    mockSupabase.from.mockReturnValue(connectionsChain);

    const result = await runBulkEnrichment('user-1');

    expect(result).toEqual({ enriched: 0, skipped: 0, errors: 0, total: 0 });
  });

  it('returns zeros when all companies already have ATS info', async () => {
    const connectionsChain: Record<string, unknown> = {};
    connectionsChain.select = vi.fn().mockReturnValue(connectionsChain);
    connectionsChain.eq = vi.fn().mockReturnValue(connectionsChain);
    connectionsChain.not = vi.fn().mockResolvedValue({
      data: [{ company_id: 'c1' }],
      error: null,
    });

    const companiesChain: Record<string, unknown> = {};
    companiesChain.select = vi.fn().mockReturnValue(companiesChain);
    companiesChain.in = vi.fn().mockReturnValue(companiesChain);
    companiesChain.is = vi.fn().mockReturnValue(companiesChain);
    companiesChain.limit = vi.fn().mockResolvedValue({
      data: [],
      error: null,
    });

    mockSupabase.from.mockImplementation((table: string) => {
      if (table === 'client_connections') return connectionsChain;
      return companiesChain;
    });

    const result = await runBulkEnrichment('user-1');

    expect(result).toEqual({ enriched: 0, skipped: 0, errors: 0, total: 0 });
  });

  it('counts skipped when Serper finds no ATS URL', async () => {
    const connectionsChain: Record<string, unknown> = {};
    connectionsChain.select = vi.fn().mockReturnValue(connectionsChain);
    connectionsChain.eq = vi.fn().mockReturnValue(connectionsChain);
    connectionsChain.not = vi.fn().mockResolvedValue({
      data: [{ company_id: 'c1' }],
      error: null,
    });

    const companiesChain: Record<string, unknown> = {};
    companiesChain.select = vi.fn().mockReturnValue(companiesChain);
    companiesChain.in = vi.fn().mockReturnValue(companiesChain);
    companiesChain.is = vi.fn().mockReturnValue(companiesChain);
    companiesChain.limit = vi.fn().mockResolvedValue({
      data: [{ id: 'c1', name_display: 'No ATS Co' }],
      error: null,
    });

    mockSupabase.from.mockImplementation((table: string) => {
      if (table === 'client_connections') return connectionsChain;
      return companiesChain;
    });

    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({
        organic: [{ link: 'https://noats.com/careers' }],
      }),
    });

    const result = await runBulkEnrichment('user-1');

    expect(result.enriched).toBe(0);
    expect(result.skipped).toBe(1);
    expect(result.total).toBe(1);
  });
});
