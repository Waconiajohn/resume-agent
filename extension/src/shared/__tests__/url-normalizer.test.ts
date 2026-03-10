import { describe, it, expect } from 'vitest';
import { normalizeJobUrl, detectPlatform, isJobApplicationPage } from '../url-normalizer.js';

// ─── normalizeJobUrl ───────────────────────────────────────────

describe('normalizeJobUrl', () => {
  it('strips UTM parameters', () => {
    const url = 'https://boards.greenhouse.io/acme/jobs/123?utm_source=linkedin&utm_campaign=spring';
    const result = normalizeJobUrl(url);
    expect(result).not.toContain('utm_source');
    expect(result).not.toContain('utm_campaign');
  });

  it('strips tracking parameters (trk, ref, fbclid)', () => {
    const url = 'https://www.linkedin.com/jobs/view/1234567?trk=homepage&ref=email&fbclid=abc123';
    const result = normalizeJobUrl(url);
    expect(result).not.toContain('trk=');
    expect(result).not.toContain('ref=');
    expect(result).not.toContain('fbclid=');
  });

  it('strips trailing slash from pathname', () => {
    const url = 'https://jobs.lever.co/acme/abc-def-123/apply/';
    const result = normalizeJobUrl(url);
    expect(result).not.toMatch(/\/$/);
  });

  it('lowercases the hostname', () => {
    const url = 'https://BOARDS.GREENHOUSE.IO/acme/jobs/42';
    const result = normalizeJobUrl(url);
    expect(result).toMatch(/^https:\/\/boards\.greenhouse\.io\//);
  });

  it('strips hash fragment', () => {
    const url = 'https://www.indeed.com/viewjob?jk=abc123#section';
    const result = normalizeJobUrl(url);
    expect(result).not.toContain('#');
  });

  it('returns raw URL unchanged on invalid input', () => {
    const badUrl = 'not-a-valid-url';
    expect(normalizeJobUrl(badUrl)).toBe(badUrl);
  });

  it('normalizes LinkedIn job URL to canonical form', () => {
    const url = 'https://www.linkedin.com/jobs/view/9876543210?trk=foo&refId=bar';
    const result = normalizeJobUrl(url);
    expect(result).toBe('https://www.linkedin.com/jobs/view/9876543210');
  });

  it('normalizes Indeed URL keeping only jk param', () => {
    const url = 'https://www.indeed.com/viewjob?jk=abc123&utm_source=google&from=serp';
    const result = normalizeJobUrl(url);
    expect(result).toContain('jk=abc123');
    expect(result).not.toContain('utm_source');
    expect(result).not.toContain('from=');
  });

  it('strips all query params from Greenhouse URLs', () => {
    const url = 'https://boards.greenhouse.io/acme/jobs/999?gh_src=abc&gh_jid=xyz';
    const result = normalizeJobUrl(url);
    expect(result).toBe('https://boards.greenhouse.io/acme/jobs/999');
  });

  it('strips /apply suffix from Lever URLs', () => {
    const url = 'https://jobs.lever.co/acme/abc-def-123/apply?lever-source=linkedin';
    const result = normalizeJobUrl(url);
    expect(result).toBe('https://jobs.lever.co/acme/abc-def-123');
  });

  it('strips query params from Workday URLs', () => {
    const url = 'https://acme.myworkdayjobs.com/en-US/External/job/Remote/Sr-Engineer_R-1234?source=linkedin';
    const result = normalizeJobUrl(url);
    expect(result).not.toContain('source=');
  });

  it('preserves non-tracking query params on unknown platforms', () => {
    const url = 'https://example.com/jobs?id=42&title=engineer';
    const result = normalizeJobUrl(url);
    expect(result).toContain('id=42');
    expect(result).toContain('title=engineer');
  });
});

// ─── detectPlatform ────────────────────────────────────────────

describe('detectPlatform', () => {
  it('detects Greenhouse', () => {
    expect(detectPlatform('https://boards.greenhouse.io/acme/jobs/123')).toBe('GREENHOUSE');
  });

  it('detects Lever', () => {
    expect(detectPlatform('https://jobs.lever.co/acme/abc-123/apply')).toBe('LEVER');
  });

  it('detects LinkedIn', () => {
    expect(detectPlatform('https://www.linkedin.com/jobs/view/123456789')).toBe('LINKEDIN');
  });

  it('detects Indeed', () => {
    expect(detectPlatform('https://www.indeed.com/viewjob?jk=abc123')).toBe('INDEED');
  });

  it('detects Workday (myworkdayjobs.com)', () => {
    expect(detectPlatform('https://acme.myworkdayjobs.com/en-US/External/job/Sr-Eng_R1')).toBe('WORKDAY');
  });

  it('detects Workday (myworkday.com subdomain)', () => {
    expect(detectPlatform('https://wd5.myworkday.com/acme/d/inst/15$6007/9925$15.htmld')).toBe('WORKDAY');
  });

  it('detects iCIMS', () => {
    expect(detectPlatform('https://careers.icims.com/jobs/1234/job')).toBe('ICIMS');
  });

  it('returns UNKNOWN for unrecognized domains', () => {
    expect(detectPlatform('https://careers.example.com/jobs/42')).toBe('UNKNOWN');
  });

  it('returns UNKNOWN for invalid URLs', () => {
    expect(detectPlatform('not-a-url')).toBe('UNKNOWN');
  });
});

// ─── isJobApplicationPage ──────────────────────────────────────

describe('isJobApplicationPage', () => {
  it('returns true for Greenhouse application URL', () => {
    expect(isJobApplicationPage('https://boards.greenhouse.io/acme/applications/new?token=abc')).toBe(true);
  });

  it('returns true for Lever job posting URL with UUID', () => {
    expect(isJobApplicationPage('https://jobs.lever.co/acme/a1b2c3d4-e5f6-7890-abcd-ef1234567890')).toBe(true);
  });

  it('returns true for LinkedIn job view URL', () => {
    expect(isJobApplicationPage('https://www.linkedin.com/jobs/view/9876543210')).toBe(true);
  });

  it('returns true for Indeed viewjob URL', () => {
    expect(isJobApplicationPage('https://www.indeed.com/viewjob?jk=abc123')).toBe(true);
  });

  it('returns true for any Workday URL', () => {
    expect(isJobApplicationPage('https://acme.myworkdayjobs.com/en-US/External/job/Sr-Eng_R1')).toBe(true);
  });

  it('returns true for iCIMS jobs URL', () => {
    expect(isJobApplicationPage('https://careers.icims.com/jobs/1234/software-engineer/job')).toBe(true);
  });

  it('returns false for LinkedIn non-job URL', () => {
    expect(isJobApplicationPage('https://www.linkedin.com/feed/')).toBe(false);
  });

  it('returns false for Indeed home page', () => {
    expect(isJobApplicationPage('https://www.indeed.com/')).toBe(false);
  });

  it('returns false for unknown domain', () => {
    expect(isJobApplicationPage('https://example.com/careers/apply')).toBe(false);
  });

  it('returns false for invalid URL', () => {
    expect(isJobApplicationPage('not-a-url')).toBe(false);
  });
});
