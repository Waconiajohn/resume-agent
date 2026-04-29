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

import { SerperJobsAdapter } from '../lib/job-search/adapters/serper-jobs.js';

describe('SerperJobsAdapter', () => {
  const originalFetch = globalThis.fetch;
  const originalApiKey = process.env.SERPER_API_KEY;

  beforeEach(() => {
    vi.clearAllMocks();
    process.env.SERPER_API_KEY = 'test-key';
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
    if (originalApiKey !== undefined) {
      process.env.SERPER_API_KEY = originalApiKey;
    } else {
      delete process.env.SERPER_API_KEY;
    }
  });

  it('adds the requested work mode to the Serper query', async () => {
    let capturedBody: string | undefined;
    globalThis.fetch = vi.fn().mockImplementation((_url: unknown, init: RequestInit) => {
      capturedBody = init.body as string;
      return Promise.resolve({ ok: true, json: () => Promise.resolve({ jobs: [] }) });
    });

    await new SerperJobsAdapter().search(
      'VP Operations',
      'Dallas, TX',
      { datePosted: '30d', remoteType: 'hybrid' },
    );

    expect(capturedBody).toBeDefined();
    const body = JSON.parse(capturedBody!);
    expect(body.q).toContain('VP Operations hybrid jobs');
    expect(body.q).toContain('near "Dallas, TX"');
    expect(body.q).toContain('site:boards.greenhouse.io');
    expect(body.q).toContain('site:jobs.smartrecruiters.com');
    expect(body.q).toContain('site:oraclecloud.com');
    expect(body.location).toBe('Dallas, TX');
    expect(body.tbs).toBe('qdr:m');
  });

  it('parses ATS job pages from Serper organic search results', async () => {
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({
        organic: [
          {
            title: 'Job Application for Director of Product at Acme Software',
            link: 'https://boards.greenhouse.io/acmesoftware/jobs/123',
            snippet: 'Posted 2 days ago. Remote position leading Salesforce product work.',
            date: '2 days ago',
          },
          {
            title: 'Acme Software homepage',
            link: 'https://example.com/acme',
            snippet: 'Not a job page.',
          },
          {
            title: 'Senior Product Manager - SmartRecruiters',
            link: 'https://jobs.smartrecruiters.com/acme/456-senior-product-manager',
            snippet: 'Posted 1 day ago. Hybrid product role.',
            date: '1 day ago',
          },
        ],
      }),
    });

    const jobs = await new SerperJobsAdapter().search(
      'Director of Product Salesforce',
      'New York, NY',
      { datePosted: '7d', remoteType: 'remote' },
    );

    expect(jobs).toHaveLength(2);
    expect(jobs[0]).toMatchObject({
      title: 'Director of Product',
      company: 'Acme Software',
      apply_url: 'https://boards.greenhouse.io/acmesoftware/jobs/123',
      source: 'serper:google search',
    });
    expect(jobs[0].posted_date).toEqual(expect.any(String));
    expect(jobs[1]).toMatchObject({
      title: 'Senior Product Manager',
      apply_url: 'https://jobs.smartrecruiters.com/acme/456-senior-product-manager',
    });
  });

  it('does not treat role suffixes as company names for Oracle-hosted ATS results', async () => {
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({
        organic: [
          {
            title: 'Lead Software Engineer - Java/AWS/Kafka',
            link: 'https://jpmc.fa.oraclecloud.com/hcmUI/CandidateExperience/en/sites/cx_1001/job/210739998',
            snippet: 'Posted 1 day ago. New York, NY.',
            date: '1 day ago',
          },
        ],
      }),
    });

    const jobs = await new SerperJobsAdapter().search(
      'Software Engineer',
      'New York, NY',
      { datePosted: '7d', remoteType: 'any' },
    );

    expect(jobs).toHaveLength(1);
    expect(jobs[0]).toMatchObject({
      title: 'Lead Software Engineer',
      company: 'JPMC',
    });
  });

  it.each([
    ['24h', 'qdr:d'],
    ['3d', 'qdr:d3'],
    ['7d', 'qdr:w'],
    ['14d', 'qdr:w2'],
    ['30d', 'qdr:m'],
  ] as const)('uses the expected Google freshness parameter for %s', async (datePosted, expectedTbs) => {
    let capturedBody: string | undefined;
    globalThis.fetch = vi.fn().mockImplementation((_url: unknown, init: RequestInit) => {
      capturedBody = init.body as string;
      return Promise.resolve({ ok: true, json: () => Promise.resolve({ jobs: [] }) });
    });

    await new SerperJobsAdapter().search(
      'VP Operations',
      '',
      { datePosted, remoteType: 'any' },
    );

    expect(capturedBody).toBeDefined();
    expect(JSON.parse(capturedBody!).tbs).toBe(expectedTbs);
  });

  it('excludes jobs without a readable posted date when a freshness filter is active', async () => {
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({
        jobs: [
          {
            title: 'VP Operations',
            companyName: 'Acme',
            location: 'Dallas, TX',
            link: 'https://example.com/current',
            date: '2 days ago',
          },
          {
            title: 'VP Operations',
            companyName: 'Acme',
            location: 'Dallas, TX',
            link: 'https://example.com/old',
            date: '21 days ago',
          },
          {
            title: 'VP Operations',
            companyName: 'Acme',
            location: 'Dallas, TX',
            link: 'https://example.com/unknown',
          },
        ],
      }),
    });

    const jobs = await new SerperJobsAdapter().search(
      'VP Operations',
      '',
      { datePosted: '7d', remoteType: 'any' },
    );

    expect(jobs.map((job) => job.apply_url)).toEqual(['https://example.com/current']);
    expect(jobs[0].posted_date).toEqual(expect.any(String));
  });

  it('classifies work mode labels returned by Serper', async () => {
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({
        jobs: [
          {
            title: 'VP Operations',
            companyName: 'Acme',
            location: 'Remote',
            link: 'https://example.com/remote',
            snippet: 'Fully remote role.',
            extensions: ['Full-time', 'Remote'],
            date: '1 day ago',
          },
          {
            title: 'VP Operations',
            companyName: 'Acme',
            location: 'Dallas, TX',
            link: 'https://example.com/hybrid',
            snippet: 'Hybrid schedule with 3 days in-office.',
            extensions: ['Full-time'],
            date: '2 days ago',
          },
        ],
      }),
    });

    const jobs = await new SerperJobsAdapter().search(
      'VP Operations',
      '',
      { datePosted: '7d', remoteType: 'any' },
    );

    expect(jobs.map((job) => job.remote_type)).toEqual(['remote', 'hybrid']);
  });
});
