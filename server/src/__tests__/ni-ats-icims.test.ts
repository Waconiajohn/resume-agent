/**
 * Unit tests for iCIMS client in server/src/lib/ni/ats-clients.ts
 *
 * Tests fetchICIMSJobs and the HTML/JSON-LD extraction strategies.
 * iCIMS has no public JSON API — the client scrapes portal HTML.
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

import { fetchICIMSJobs, fetchFromATS } from '../lib/ni/ats-clients.js';

// ─── Helpers ───────────────────────────────────────────────────────────────────

const JSON_LD_JOB_POSTING = JSON.stringify({
  '@context': 'https://schema.org/',
  '@type': 'JobPosting',
  title: 'Senior Software Engineer',
  url: 'https://careers-acme.icims.com/jobs/12345/senior-software-engineer/job',
  description: '<p>We are looking for a talented engineer to join our team.</p>',
  jobLocation: {
    '@type': 'Place',
    address: {
      '@type': 'PostalAddress',
      addressLocality: 'San Francisco',
      addressRegion: 'CA',
    },
  },
});

const JSON_LD_ITEM_LIST = JSON.stringify({
  '@context': 'https://schema.org/',
  '@type': 'ItemList',
  itemListElement: [
    {
      '@type': 'ListItem',
      item: {
        '@type': 'JobPosting',
        title: 'Product Manager',
        url: 'https://careers-acme.icims.com/jobs/100/product-manager/job',
        description: 'Lead product strategy.',
        jobLocation: {
          '@type': 'Place',
          address: {
            '@type': 'PostalAddress',
            addressLocality: 'New York',
            addressRegion: 'NY',
          },
        },
      },
    },
    {
      '@type': 'ListItem',
      item: {
        '@type': 'JobPosting',
        title: 'Data Analyst',
        url: 'https://careers-acme.icims.com/jobs/101/data-analyst/job',
        description: 'Analyze business data.',
      },
    },
  ],
});

function buildHtmlWithJsonLd(jsonLd: string): string {
  return `<!DOCTYPE html><html><head>
<script type="application/ld+json">${jsonLd}</script>
</head><body><div>iCIMS Portal</div></body></html>`;
}

function buildHtmlWithJobLinks(): string {
  return `<!DOCTYPE html><html><body>
<div class="iCIMS_JobsTable">
  <a href="/jobs/200/director-of-ops/job" class="iCIMS_Anchor">Director of Operations</a>
  <a href="/jobs/201/vp-engineering/job" class="iCIMS_Anchor">VP of Engineering</a>
  <a href="/jobs/search?category=all" class="iCIMS_Anchor">Search</a>
</div>
</body></html>`;
}

// ─── Tests ─────────────────────────────────────────────────────────────────────

describe('fetchICIMSJobs', () => {
  const originalFetch = globalThis.fetch;

  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
  });

  it('extracts jobs from JSON-LD JobPosting', async () => {
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      text: () => Promise.resolve(buildHtmlWithJsonLd(JSON_LD_JOB_POSTING)),
    });

    const jobs = await fetchICIMSJobs('acme');

    expect(jobs).toHaveLength(1);
    expect(jobs[0].title).toBe('Senior Software Engineer');
    expect(jobs[0].url).toBe('https://careers-acme.icims.com/jobs/12345/senior-software-engineer/job');
    expect(jobs[0].location).toBe('San Francisco, CA');
    expect(jobs[0].source).toBe('icims');
    expect(jobs[0].descriptionSnippet).toContain('talented engineer');
  });

  it('extracts jobs from JSON-LD ItemList wrapper', async () => {
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      text: () => Promise.resolve(buildHtmlWithJsonLd(JSON_LD_ITEM_LIST)),
    });

    const jobs = await fetchICIMSJobs('acme');

    expect(jobs).toHaveLength(2);
    expect(jobs[0].title).toBe('Product Manager');
    expect(jobs[0].location).toBe('New York, NY');
    expect(jobs[1].title).toBe('Data Analyst');
    expect(jobs[1].location).toBeNull();
  });

  it('falls back to HTML link parsing when no JSON-LD present', async () => {
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      text: () => Promise.resolve(buildHtmlWithJobLinks()),
    });

    const jobs = await fetchICIMSJobs('acme');

    expect(jobs).toHaveLength(2);
    expect(jobs[0].title).toBe('Director of Operations');
    expect(jobs[0].url).toContain('/jobs/200/');
    expect(jobs[1].title).toBe('VP of Engineering');
    expect(jobs[0].source).toBe('icims');
    // "Search" link should be filtered out
    expect(jobs.find((j) => j.title === 'Search')).toBeUndefined();
  });

  it('returns empty array when fetch fails', async () => {
    globalThis.fetch = vi.fn().mockRejectedValue(new Error('Network error'));

    const jobs = await fetchICIMSJobs('nonexistent');
    expect(jobs).toEqual([]);
  });

  it('returns empty array when all URL patterns return non-OK', async () => {
    globalThis.fetch = vi.fn().mockResolvedValue({ ok: false, status: 404 });

    const jobs = await fetchICIMSJobs('badslug');
    expect(jobs).toEqual([]);
  });

  it('returns empty array for minimal HTML with no jobs', async () => {
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      text: () => Promise.resolve('<html><body><p>No open positions.</p></body></html>'),
    });

    const jobs = await fetchICIMSJobs('nojobs');
    expect(jobs).toEqual([]);
  });

  it('tries multiple URL patterns', async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce({ ok: false, status: 404 }) // careers-slug pattern fails
      .mockResolvedValueOnce({ ok: false, status: 404 }) // jobs-slug pattern fails
      .mockResolvedValueOnce({                            // slug-only pattern succeeds
        ok: true,
        text: () => Promise.resolve(buildHtmlWithJsonLd(JSON_LD_JOB_POSTING)),
      });
    globalThis.fetch = fetchMock;

    const jobs = await fetchICIMSJobs('acme');

    expect(fetchMock).toHaveBeenCalledTimes(3);
    expect(jobs).toHaveLength(1);
    expect(jobs[0].title).toBe('Senior Software Engineer');
  });

  it('strips HTML from description snippets', async () => {
    const jsonLd = JSON.stringify({
      '@type': 'JobPosting',
      title: 'Manager',
      url: 'https://careers-acme.icims.com/jobs/999/manager/job',
      description: '<p><strong>About the role:</strong> We need a <em>great</em> manager.</p><ul><li>Lead teams</li></ul>',
    });
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      text: () => Promise.resolve(buildHtmlWithJsonLd(jsonLd)),
    });

    const jobs = await fetchICIMSJobs('acme');

    expect(jobs[0].descriptionSnippet).not.toContain('<');
    expect(jobs[0].descriptionSnippet).toContain('About the role');
  });
});

describe('fetchFromATS dispatcher — iCIMS', () => {
  const originalFetch = globalThis.fetch;

  afterEach(() => {
    globalThis.fetch = originalFetch;
  });

  it('dispatches icims to fetchICIMSJobs', async () => {
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      text: () => Promise.resolve(buildHtmlWithJsonLd(JSON_LD_JOB_POSTING)),
    });

    const jobs = await fetchFromATS('icims', 'acme');

    expect(jobs).toHaveLength(1);
    expect(jobs[0].source).toBe('icims');
  });
});
