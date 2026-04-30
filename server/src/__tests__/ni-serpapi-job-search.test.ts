import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const mockAdapterSearch = vi.hoisted(() => vi.fn());

vi.mock('../lib/job-search/adapters/serpapi-google-jobs.js', () => ({
  SerpApiGoogleJobsAdapter: class {
    search = mockAdapterSearch;
  },
}));

import { searchCompanyJobsViaSerpApi } from '../lib/ni/serpapi-job-search.js';
import type { CompanyInfo } from '../lib/ni/types.js';
import type { JobResult } from '../lib/job-search/types.js';

const originalApiKey = process.env.SERPAPI_API_KEY;

const company: CompanyInfo = {
  id: 'company-1',
  name: 'Acme Corp',
  domain: 'acme.com',
  ats_platform: null,
  ats_slug: null,
};

function makeJob(overrides: Partial<JobResult> = {}): JobResult {
  return {
    external_id: 'job-1',
    title: 'Cloud Operations Manager',
    company: 'Acme Corp',
    location: 'Anywhere',
    salary_min: 120000,
    salary_max: 150000,
    description: 'Lead cloud operations.',
    posted_date: new Date().toISOString(),
    apply_url: 'https://jobs.acme.com/cloud-ops',
    source: 'serpapi:direct',
    remote_type: 'remote',
    employment_type: 'full-time',
    required_skills: null,
    ...overrides,
  };
}

describe('searchCompanyJobsViaSerpApi', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    process.env.SERPAPI_API_KEY = 'test-serpapi-key';
    mockAdapterSearch.mockResolvedValue([]);
  });

  afterEach(() => {
    if (originalApiKey) {
      process.env.SERPAPI_API_KEY = originalApiKey;
    } else {
      delete process.env.SERPAPI_API_KEY;
    }
  });

  it('uses remote search without city bias and caps freshness at 30 days', async () => {
    mockAdapterSearch.mockResolvedValue([makeJob()]);

    const jobs = await searchCompanyJobsViaSerpApi(
      company,
      ['Cloud Operations Manager'],
      {
        location: 'New York, NY',
        radius_miles: 25,
        remote_only: true,
        work_modes: ['remote'],
        max_days_old: 90,
      },
    );

    expect(mockAdapterSearch).toHaveBeenCalledWith(
      'Acme Corp Cloud Operations Manager',
      '',
      { datePosted: '30d', remoteType: 'remote' },
    );
    expect(jobs).toHaveLength(1);
    expect(jobs[0]).toMatchObject({
      title: 'Cloud Operations Manager',
      source: 'serpapi',
      url: 'https://jobs.acme.com/cloud-ops',
      salaryRange: '$120k-$150k',
    });
  });

  it('keeps only jobs that match the selected company by name or domain', async () => {
    mockAdapterSearch.mockResolvedValue([
      makeJob({ external_id: 'job-1', company: 'Acme Corporation', apply_url: 'https://jobs.acme.com/cloud-ops' }),
      makeJob({ external_id: 'job-2', company: 'Other Company', apply_url: 'https://jobs.other.com/cloud-ops' }),
    ]);

    const jobs = await searchCompanyJobsViaSerpApi(
      company,
      ['Cloud Operations Manager'],
      {
        remote_only: false,
        work_modes: ['hybrid'],
        max_days_old: 7,
      },
    );

    expect(jobs).toHaveLength(1);
    expect(jobs[0]?.url).toBe('https://jobs.acme.com/cloud-ops');
    expect(mockAdapterSearch).toHaveBeenCalledWith(
      'Acme Corp Cloud Operations Manager',
      '',
      { datePosted: '7d', remoteType: 'hybrid' },
    );
  });

  it('drops company matches outside the capped freshness window', async () => {
    mockAdapterSearch.mockResolvedValue([
      makeJob({
        external_id: 'fresh-job',
        posted_date: new Date().toISOString(),
      }),
      makeJob({
        external_id: 'stale-job',
        posted_date: new Date(Date.now() - 45 * 24 * 60 * 60 * 1000).toISOString(),
        apply_url: 'https://jobs.acme.com/stale-cloud-ops',
      }),
      makeJob({
        external_id: 'unknown-date-job',
        posted_date: null,
        apply_url: 'https://jobs.acme.com/unknown-cloud-ops',
      }),
    ]);

    const jobs = await searchCompanyJobsViaSerpApi(
      company,
      ['Cloud Operations Manager'],
      {
        remote_only: false,
        max_days_old: 30,
      },
    );

    expect(jobs).toHaveLength(1);
    expect(jobs[0]?.url).toBe('https://jobs.acme.com/cloud-ops');
  });

  it('does nothing when the structured listing key is not configured', async () => {
    delete process.env.SERPAPI_API_KEY;

    const jobs = await searchCompanyJobsViaSerpApi(
      company,
      ['Cloud Operations Manager'],
      {
        remote_only: false,
        max_days_old: 7,
      },
    );

    expect(jobs).toEqual([]);
    expect(mockAdapterSearch).not.toHaveBeenCalled();
  });
});
