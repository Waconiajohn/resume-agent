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
    expect(body.q).toBe('VP Operations hybrid');
    expect(body.location).toBe('Dallas, TX');
    expect(body.tbs).toBe('qdr:m');
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
          },
          {
            title: 'VP Operations',
            companyName: 'Acme',
            location: 'Dallas, TX',
            link: 'https://example.com/hybrid',
            snippet: 'Hybrid schedule with 3 days in-office.',
            extensions: ['Full-time'],
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
