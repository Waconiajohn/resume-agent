/**
 * URL Normalizer — Unit Tests
 *
 * Coverage:
 *  1. Tracking parameter stripping
 *  2. Platform-specific normalization (LinkedIn, Indeed, Greenhouse, Lever, Workday)
 *  3. detectPlatform — all 6 platforms + UNKNOWN
 *  4. isJobApplicationPage — all 6 platforms + generic URL
 *  5. Invalid / unparseable URL handling
 */

import { describe, it, expect } from 'vitest';
import { normalizeJobUrl, detectPlatform, isJobApplicationPage } from '../lib/url-normalizer.js';

// ─── normalizeJobUrl ──────────────────────────────────────────────────────────

describe('normalizeJobUrl', () => {
  it('strips utm_source', () => {
    const result = normalizeJobUrl('https://example.com/jobs/123?utm_source=google');
    expect(result).not.toContain('utm_source');
    expect(result).toContain('/jobs/123');
  });

  it('strips all standard tracking params', () => {
    const url = 'https://example.com/job?utm_source=g&utm_medium=cpc&utm_campaign=spring&fbclid=abc&gclid=xyz&_ga=1.2&ref=home&src=email';
    const result = normalizeJobUrl(url);
    expect(result).toBe('https://example.com/job');
  });

  it('lowercases hostname', () => {
    const result = normalizeJobUrl('https://EXAMPLE.COM/jobs/view/123');
    expect(result).toContain('example.com');
  });

  it('removes trailing slash from pathname', () => {
    const result = normalizeJobUrl('https://example.com/jobs/123/');
    expect(result).not.toMatch(/\/$/);
  });

  it('strips hash fragment', () => {
    const result = normalizeJobUrl('https://example.com/jobs/123#section');
    expect(result).not.toContain('#');
  });

  it('returns rawUrl unchanged when URL is unparseable', () => {
    const bad = 'not a url at all';
    expect(normalizeJobUrl(bad)).toBe(bad);
  });

  it('preserves unrelated query params', () => {
    const result = normalizeJobUrl('https://example.com/jobs?jk=abc123&utm_source=google');
    expect(result).toContain('jk=abc123');
    expect(result).not.toContain('utm_source');
  });

  // LinkedIn
  it('normalizes LinkedIn job URL to /jobs/view/:id with no query', () => {
    const result = normalizeJobUrl('https://www.linkedin.com/jobs/view/1234567890?trk=somevalue&refId=abc');
    expect(result).toBe('https://www.linkedin.com/jobs/view/1234567890');
  });

  it('does not alter LinkedIn URL without /jobs/view/ pattern', () => {
    const result = normalizeJobUrl('https://www.linkedin.com/company/acme/?utm_source=google');
    expect(result).toContain('linkedin.com/company/acme');
    expect(result).not.toContain('utm_source');
  });

  // Indeed
  it('normalizes Indeed URL to only keep jk param', () => {
    const result = normalizeJobUrl('https://www.indeed.com/viewjob?jk=abc123&utm_source=jobs&from=search');
    expect(result).toContain('jk=abc123');
    expect(result).not.toContain('utm_source');
    expect(result).not.toContain('from=');
  });

  it('strips only tracking params from Indeed URL when no jk param is present', () => {
    const result = normalizeJobUrl('https://www.indeed.com/jobs?q=engineer&utm_source=google');
    expect(result).not.toContain('utm_source');
    // q= is not a tracking param, so it is preserved
    expect(result).toContain('q=engineer');
  });

  // Greenhouse
  it('strips all query params for Greenhouse URLs', () => {
    const result = normalizeJobUrl('https://boards.greenhouse.io/acme/jobs/12345?gh_src=1a2b3c');
    expect(result).toBe('https://boards.greenhouse.io/acme/jobs/12345');
  });

  // Lever
  it('strips query params and /apply suffix for Lever URLs', () => {
    const result = normalizeJobUrl('https://jobs.lever.co/acme/abc-def-123/apply?lever-source=linkedin');
    expect(result).toBe('https://jobs.lever.co/acme/abc-def-123');
  });

  it('does not alter Lever URL without /apply suffix', () => {
    const result = normalizeJobUrl('https://jobs.lever.co/acme/abc-def-123?lever-source=linkedin');
    expect(result).toBe('https://jobs.lever.co/acme/abc-def-123');
  });

  // Workday
  it('strips all query params for Workday URLs', () => {
    const result = normalizeJobUrl('https://acme.myworkdayjobs.com/en-US/Jobs/job/Engineer_12345?source=linkedin');
    expect(result).toBe('https://acme.myworkdayjobs.com/en-US/Jobs/job/Engineer_12345');
  });
});

// ─── detectPlatform ───────────────────────────────────────────────────────────

describe('detectPlatform', () => {
  it('detects GREENHOUSE', () => {
    expect(detectPlatform('https://boards.greenhouse.io/acme/jobs/123')).toBe('GREENHOUSE');
  });

  it('detects LEVER', () => {
    expect(detectPlatform('https://jobs.lever.co/acme/abc-def-123')).toBe('LEVER');
  });

  it('detects LINKEDIN', () => {
    expect(detectPlatform('https://www.linkedin.com/jobs/view/1234567890')).toBe('LINKEDIN');
  });

  it('detects INDEED', () => {
    expect(detectPlatform('https://www.indeed.com/viewjob?jk=abc123')).toBe('INDEED');
  });

  it('detects WORKDAY (myworkdayjobs.com)', () => {
    expect(detectPlatform('https://acme.myworkdayjobs.com/en-US/Jobs/job/Eng')).toBe('WORKDAY');
  });

  it('detects WORKDAY (myworkday.com)', () => {
    expect(detectPlatform('https://acme.myworkday.com/wday/cxs/acme/Careers')).toBe('WORKDAY');
  });

  it('detects ICIMS', () => {
    expect(detectPlatform('https://acme.icims.com/jobs/1234/job')).toBe('ICIMS');
  });

  it('returns UNKNOWN for unrecognized host', () => {
    expect(detectPlatform('https://careers.example.com/jobs/eng')).toBe('UNKNOWN');
  });

  it('returns UNKNOWN for unparseable URL', () => {
    expect(detectPlatform('not a url')).toBe('UNKNOWN');
  });
});

// ─── isJobApplicationPage ─────────────────────────────────────────────────────

describe('isJobApplicationPage', () => {
  it('returns true for Greenhouse /applications path', () => {
    expect(isJobApplicationPage('https://boards.greenhouse.io/acme/applications/123')).toBe(true);
  });

  it('returns false for Greenhouse non-application path', () => {
    expect(isJobApplicationPage('https://boards.greenhouse.io/acme/jobs')).toBe(false);
  });

  it('returns true for Lever UUID path', () => {
    expect(isJobApplicationPage('https://jobs.lever.co/acme/a1b2c3d4-e5f6-7890-abcd-ef1234567890')).toBe(true);
  });

  it('returns false for Lever non-UUID path', () => {
    expect(isJobApplicationPage('https://jobs.lever.co/acme')).toBe(false);
  });

  it('returns true for LinkedIn /jobs/view/ path', () => {
    expect(isJobApplicationPage('https://www.linkedin.com/jobs/view/1234567890')).toBe(true);
  });

  it('returns false for LinkedIn non-job path', () => {
    expect(isJobApplicationPage('https://www.linkedin.com/feed/')).toBe(false);
  });

  it('returns true for Indeed /viewjob path', () => {
    expect(isJobApplicationPage('https://www.indeed.com/viewjob?jk=abc123')).toBe(true);
  });

  it('returns false for Indeed search page', () => {
    expect(isJobApplicationPage('https://www.indeed.com/jobs?q=engineer')).toBe(false);
  });

  it('returns true for any Workday jobs domain', () => {
    expect(isJobApplicationPage('https://acme.myworkdayjobs.com/en-US/Jobs/job/Eng')).toBe(true);
  });

  it('returns true for iCIMS /jobs/ path', () => {
    expect(isJobApplicationPage('https://acme.icims.com/jobs/1234/job')).toBe(true);
  });

  it('returns false for iCIMS non-jobs path', () => {
    expect(isJobApplicationPage('https://acme.icims.com/home')).toBe(false);
  });

  it('returns false for unrecognized URL', () => {
    expect(isJobApplicationPage('https://careers.example.com/eng-role')).toBe(false);
  });

  it('returns false for unparseable URL', () => {
    expect(isJobApplicationPage('not a url')).toBe(false);
  });
});
