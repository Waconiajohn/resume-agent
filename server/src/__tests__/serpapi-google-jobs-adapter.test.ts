import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../lib/logger.js', () => ({
  default: {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
    child: vi.fn().mockReturnThis(),
  },
}));

import { SerpApiGoogleJobsAdapter } from '../lib/job-search/adapters/serpapi-google-jobs.js';

describe('SerpApiGoogleJobsAdapter', () => {
  const originalFetch = globalThis.fetch;
  const originalApiKey = process.env.SERPAPI_API_KEY;
  const originalMaxPages = process.env.SERPAPI_GOOGLE_JOBS_MAX_PAGES;

  beforeEach(() => {
    vi.clearAllMocks();
    process.env.SERPAPI_API_KEY = 'test-serpapi-key';
    delete process.env.SERPAPI_GOOGLE_JOBS_MAX_PAGES;
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
    if (originalApiKey !== undefined) {
      process.env.SERPAPI_API_KEY = originalApiKey;
    } else {
      delete process.env.SERPAPI_API_KEY;
    }
    if (originalMaxPages !== undefined) {
      process.env.SERPAPI_GOOGLE_JOBS_MAX_PAGES = originalMaxPages;
    } else {
      delete process.env.SERPAPI_GOOGLE_JOBS_MAX_PAGES;
    }
  });

  it('reports a missing key without calling SerpApi', async () => {
    delete process.env.SERPAPI_API_KEY;
    globalThis.fetch = vi.fn();

    const adapter = new SerpApiGoogleJobsAdapter();
    const jobs = await adapter.search('Cloud Operations Manager', '', { datePosted: '30d', remoteType: 'remote' });

    expect(jobs).toEqual([]);
    expect(globalThis.fetch).not.toHaveBeenCalled();
    expect(adapter.getDiagnostics()).toEqual([
      expect.objectContaining({
        provider: 'serpapi_google_jobs',
        status: 'missing_key',
        jobs_returned: 0,
      }),
    ]);
  });

  it('builds a structured Google Jobs remote search without city bias', async () => {
    let capturedUrl: string | undefined;
    globalThis.fetch = vi.fn().mockImplementation((url: URL) => {
      capturedUrl = url.toString();
      return Promise.resolve({
        ok: true,
        json: () => Promise.resolve({ jobs_results: [] }),
      });
    });

    await new SerpApiGoogleJobsAdapter().search(
      'Cloud Operations Manager',
      'New York, NY',
      { datePosted: '30d', remoteType: 'remote' },
    );

    expect(capturedUrl).toBeDefined();
    const url = new URL(capturedUrl!);
    expect(url.searchParams.get('engine')).toBe('google_jobs');
    expect(url.searchParams.get('q')).toBe('Cloud Operations Manager remote jobs in the last month');
    expect(url.searchParams.get('gl')).toBe('us');
    expect(url.searchParams.get('hl')).toBe('en');
    expect(url.searchParams.get('ltype')).toBe('1');
    expect(url.searchParams.has('location')).toBe(false);
  });

  it('passes city-level location for non-remote searches', async () => {
    let capturedUrl: string | undefined;
    globalThis.fetch = vi.fn().mockImplementation((url: URL) => {
      capturedUrl = url.toString();
      return Promise.resolve({
        ok: true,
        json: () => Promise.resolve({ jobs_results: [] }),
      });
    });

    await new SerpApiGoogleJobsAdapter().search(
      'Director of Product',
      'Austin, Texas, United States',
      { datePosted: '7d', remoteType: 'hybrid' },
    );

    const url = new URL(capturedUrl!);
    expect(url.searchParams.get('q')).toBe('Director of Product jobs in the last week');
    expect(url.searchParams.get('location')).toBe('Austin, Texas, United States');
    expect(url.searchParams.has('ltype')).toBe(false);
  });

  it('maps Google Jobs results and prefers direct apply options', async () => {
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({
        jobs_results: [
          {
            title: 'Director of Product',
            company_name: 'Acme Software',
            location: 'Remote',
            via: 'LinkedIn',
            extensions: ['2 days ago', 'Work from home', 'Full-time', '125K–155K a year'],
            detected_extensions: {
              posted_at: '2 days ago',
              schedule_type: 'Full-time',
              salary: '125K–155K a year',
              work_from_home: true,
            },
            description: 'Lead Salesforce product strategy for a distributed team.',
            apply_options: [
              { title: 'LinkedIn', link: 'https://www.linkedin.com/jobs/view/123' },
              { title: 'Acme Careers', link: 'https://jobs.lever.co/acme/abc-123' },
            ],
            job_id: 'google-job-id-1',
          },
          {
            title: 'Barista',
            company_name: 'Coffee Co',
            location: 'Austin, TX',
            via: 'Indeed',
            extensions: ['4 days ago', '16.25–18.44 an hour', 'Part-time'],
            detected_extensions: {
              posted_at: '4 days ago',
              schedule_type: 'Part-time',
              salary: '16.25–18.44 an hour',
            },
            description: 'Prepare drinks.',
            apply_options: [
              { title: 'Indeed', link: 'https://www.indeed.com/viewjob?jk=abc' },
              { title: 'Coffee Co', link: 'https://coffee.example/jobs/barista' },
            ],
            job_id: 'google-job-id-2',
          },
        ],
      }),
    });

    const jobs = await new SerpApiGoogleJobsAdapter().search(
      'serpapi adapter mapping unique',
      '',
      { datePosted: '30d', remoteType: 'any' },
    );

    expect(jobs).toHaveLength(2);
    expect(jobs[0]).toMatchObject({
      title: 'Director of Product',
      company: 'Acme Software',
      apply_url: 'https://jobs.lever.co/acme/abc-123',
      source: 'serpapi:linkedin',
      remote_type: 'remote',
      employment_type: 'full-time',
      salary_min: 125000,
      salary_max: 155000,
    });
    expect(jobs[0].posted_date).toEqual(expect.any(String));
    expect(jobs[1]).toMatchObject({
      title: 'Barista',
      apply_url: 'https://coffee.example/jobs/barista',
      employment_type: 'part-time',
      salary_min: 16.25,
      salary_max: 18.44,
    });
  });

  it('uses next_page_token only when the monthly-budget guard allows more pages', async () => {
    process.env.SERPAPI_GOOGLE_JOBS_MAX_PAGES = '2';
    const urls: string[] = [];
    globalThis.fetch = vi.fn().mockImplementation((url: URL) => {
      urls.push(url.toString());
      return Promise.resolve({
        ok: true,
        json: () => Promise.resolve(
          urls.length === 1
            ? { jobs_results: [], serpapi_pagination: { next_page_token: 'next-token' } }
            : { jobs_results: [] },
        ),
      });
    });

    await new SerpApiGoogleJobsAdapter().search(
      'serpapi pagination unique',
      'Dallas, TX',
      { datePosted: 'any', remoteType: 'any' },
    );

    expect(urls).toHaveLength(2);
    expect(new URL(urls[1]!).searchParams.get('next_page_token')).toBe('next-token');
  });
});
