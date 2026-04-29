/**
 * Unit tests for server/src/lib/ni/serper-job-search.ts
 *
 * Verifies Serper query construction and result parsing.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../lib/logger.js', () => ({
  default: {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
  },
}));

import { searchJobsViaSerper } from '../lib/ni/serper-job-search.js';

describe('searchJobsViaSerper', () => {
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

  it('builds query with icims.com in site clause', async () => {
    let capturedBody: string | undefined;
    globalThis.fetch = vi.fn().mockImplementation((_url: unknown, init: RequestInit) => {
      capturedBody = init.body as string;
      return Promise.resolve({ ok: true, json: () => Promise.resolve({ organic: [] }) });
    });

    await searchJobsViaSerper('Acme Corp', ['Director']);

    expect(capturedBody).toBeDefined();
    const parsed = JSON.parse(capturedBody!);
    expect(parsed.q).toContain('site:icims.com');
  });

  it('does not include the word "careers" in the query', async () => {
    let capturedBody: string | undefined;
    globalThis.fetch = vi.fn().mockImplementation((_url: unknown, init: RequestInit) => {
      capturedBody = init.body as string;
      return Promise.resolve({ ok: true, json: () => Promise.resolve({ organic: [] }) });
    });

    await searchJobsViaSerper('Acme Corp', ['VP Engineering']);

    const parsed = JSON.parse(capturedBody!);
    expect(parsed.q).not.toMatch(/\bcareers\b/i);
  });

  it('does not produce double spaces when no target title', async () => {
    let capturedBody: string | undefined;
    globalThis.fetch = vi.fn().mockImplementation((_url: unknown, init: RequestInit) => {
      capturedBody = init.body as string;
      return Promise.resolve({ ok: true, json: () => Promise.resolve({ organic: [] }) });
    });

    await searchJobsViaSerper('TestCo', []);

    const parsed = JSON.parse(capturedBody!);
    expect(parsed.q).not.toContain('  ');
  });

  it('includes the shared public ATS site clauses', async () => {
    let capturedBody: string | undefined;
    globalThis.fetch = vi.fn().mockImplementation((_url: unknown, init: RequestInit) => {
      capturedBody = init.body as string;
      return Promise.resolve({ ok: true, json: () => Promise.resolve({ organic: [] }) });
    });

    await searchJobsViaSerper('TestCo', []);

    const parsed = JSON.parse(capturedBody!);
    expect(parsed.q).toContain('site:boards.greenhouse.io');
    expect(parsed.q).toContain('site:jobs.lever.co');
    expect(parsed.q).toContain('site:myworkdayjobs.com');
    expect(parsed.q).toContain('site:jobs.ashbyhq.com');
    expect(parsed.q).toContain('site:icims.com');
    expect(parsed.q).toContain('site:apply.workable.com');
    expect(parsed.q).toContain('site:jobs.smartrecruiters.com');
    expect(parsed.q).toContain('site:bamboohr.com');
    expect(parsed.q).toContain('site:jobvite.com');
    expect(parsed.q).toContain('site:oraclecloud.com');
    expect(parsed.q).toContain('site:successfactors.com');
  });

  it('quotes company name and target title', async () => {
    let capturedBody: string | undefined;
    globalThis.fetch = vi.fn().mockImplementation((_url: unknown, init: RequestInit) => {
      capturedBody = init.body as string;
      return Promise.resolve({ ok: true, json: () => Promise.resolve({ organic: [] }) });
    });

    await searchJobsViaSerper('Acme Corp', ['VP of Engineering']);

    const parsed = JSON.parse(capturedBody!);
    expect(parsed.q).toContain('"Acme Corp"');
    expect(parsed.q).toContain('"VP of Engineering"');
  });

  it('includes radius intent when location and radius are provided', async () => {
    let capturedBody: string | undefined;
    globalThis.fetch = vi.fn().mockImplementation((_url: unknown, init: RequestInit) => {
      capturedBody = init.body as string;
      return Promise.resolve({ ok: true, json: () => Promise.resolve({ organic: [] }) });
    });

    await searchJobsViaSerper('Acme Corp', ['VP Operations'], 'Dallas, TX', 7, 50);

    const parsed = JSON.parse(capturedBody!);
    expect(parsed.q).toContain('within 50 miles of "Dallas, TX"');
    expect(parsed.tbs).toBe('qdr:w');
  });

  it.each([
    [1, 'qdr:d'],
    [3, 'qdr:d3'],
    [7, 'qdr:w'],
    [14, 'qdr:w2'],
    [30, 'qdr:m'],
  ])('uses the expected Serper freshness filter for %i day(s)', async (maxDaysOld, expectedTbs) => {
    let capturedBody: string | undefined;
    globalThis.fetch = vi.fn().mockImplementation((_url: unknown, init: RequestInit) => {
      capturedBody = init.body as string;
      return Promise.resolve({ ok: true, json: () => Promise.resolve({ organic: [] }) });
    });

    await searchJobsViaSerper('Acme Corp', ['VP Operations'], undefined, maxDaysOld);

    const parsed = JSON.parse(capturedBody!);
    expect(parsed.tbs).toBe(expectedTbs);
  });

  it('adds explicit work-mode intent to the fallback query', async () => {
    let capturedBody: string | undefined;
    globalThis.fetch = vi.fn().mockImplementation((_url: unknown, init: RequestInit) => {
      capturedBody = init.body as string;
      return Promise.resolve({ ok: true, json: () => Promise.resolve({ organic: [] }) });
    });

    await searchJobsViaSerper('Acme Corp', ['VP Operations'], 'Dallas, TX', 30, 25, ['hybrid']);

    const parsed = JSON.parse(capturedBody!);
    expect(parsed.q).toContain('"VP Operations" hybrid within 25 miles of "Dallas, TX"');
    expect(parsed.tbs).toBe('qdr:m');
  });

  it('filters results to known ATS domains only', async () => {
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({
        organic: [
          { title: 'Director at Acme - Greenhouse', link: 'https://boards.greenhouse.io/acme/jobs/123', snippet: 'Great role' },
          { title: 'Director at Acme - Blog', link: 'https://blog.acme.com/hiring', snippet: 'We are hiring' },
          { title: 'Nurse Manager - iCIMS', link: 'https://careers-acme.icims.com/jobs/456/nurse-manager/job', snippet: 'Healthcare role' },
          { title: 'Product Lead - SmartRecruiters', link: 'https://jobs.smartrecruiters.com/acme/123-product-lead', snippet: 'Product role' },
        ],
      }),
    });

    const jobs = await searchJobsViaSerper('Acme Corp', ['Director']);

    // Blog link should be filtered out; ATS-hosted links should be kept.
    expect(jobs).toHaveLength(3);
    expect(jobs[0].source).toBe('serper');
    expect(jobs[0].url).toContain('greenhouse.io');
    expect(jobs[1].url).toContain('icims.com');
    expect(jobs[2].url).toContain('smartrecruiters.com');
  });

  it('extracts a readable posted date from Serper organic metadata', async () => {
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({
        organic: [
          {
            title: 'Director at Acme - Greenhouse',
            link: 'https://boards.greenhouse.io/acme/jobs/123',
            snippet: 'Great role',
            date: '3 days ago',
          },
        ],
      }),
    });

    const jobs = await searchJobsViaSerper('Acme Corp', ['Director']);

    expect(jobs).toHaveLength(1);
    expect(jobs[0].postedOn).toEqual(expect.any(String));
  });

  it('extracts a readable posted date from a result snippet when metadata is missing', async () => {
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({
        organic: [
          {
            title: 'Director at Acme - Greenhouse',
            link: 'https://boards.greenhouse.io/acme/jobs/123',
            snippet: 'Posted 2 days ago · Dallas, TX · Great role',
          },
        ],
      }),
    });

    const jobs = await searchJobsViaSerper('Acme Corp', ['Director']);

    expect(jobs).toHaveLength(1);
    expect(jobs[0].postedOn).toEqual(expect.any(String));
  });

  it('returns empty array when SERPER_API_KEY is not set', async () => {
    delete process.env.SERPER_API_KEY;
    globalThis.fetch = vi.fn();

    const jobs = await searchJobsViaSerper('Acme', ['Director']);

    expect(jobs).toEqual([]);
    expect(globalThis.fetch).not.toHaveBeenCalled();
  });
});
