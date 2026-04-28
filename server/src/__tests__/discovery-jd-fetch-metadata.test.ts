import { describe, expect, it, vi } from 'vitest';

vi.mock('../middleware/auth.js', () => ({
  authMiddleware: vi.fn(),
}));

vi.mock('../middleware/rate-limit.js', () => ({
  rateLimitMiddleware: () => vi.fn(),
}));

vi.mock('../lib/logger.js', () => ({
  default: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));

import { extractJobMetadataFromTitle } from '../routes/discovery-jd-fetch.js';

describe('discovery JD metadata extraction', () => {
  it('separates LinkedIn hiring page titles into company and role', () => {
    expect(
      extractJobMetadataFromTitle(
        'ADT hiring IT Manager - Cloud Operations in Irving, TX | LinkedIn',
        'https://www.linkedin.com/jobs/view/123',
      ),
    ).toEqual({
      company: 'ADT',
      title: 'IT Manager - Cloud Operations',
    });
  });

  it('falls back to ATS slugs when the page title has only a role', () => {
    expect(
      extractJobMetadataFromTitle(
        'Senior Director, Operations',
        'https://jobs.lever.co/coventry-industrial/abc123',
      ),
    ).toEqual({
      company: 'Coventry Industrial',
      title: 'Senior Director, Operations',
    });
  });
});
