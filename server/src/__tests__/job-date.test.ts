import { describe, expect, it } from 'vitest';

import {
  findPostedDateText,
  googleTbsForFreshnessDays,
  isWithinFreshnessWindow,
  normalizeJobPostedDate,
} from '../lib/job-date.js';

const NOW = new Date('2026-04-28T12:00:00.000Z');

describe('job posting date helpers', () => {
  it('maps supported freshness windows to Google time filters', () => {
    expect(googleTbsForFreshnessDays(1)).toBe('qdr:d');
    expect(googleTbsForFreshnessDays(3)).toBeNull();
    expect(googleTbsForFreshnessDays(7)).toBe('qdr:w');
    expect(googleTbsForFreshnessDays(14)).toBeNull();
    expect(googleTbsForFreshnessDays(30)).toBe('qdr:m');
    expect(googleTbsForFreshnessDays(null)).toBeNull();
  });

  it('normalizes structured, direct, and relative posting dates', () => {
    expect(normalizeJobPostedDate('2026-04-27', NOW)?.toISOString()).toBe(
      '2026-04-27T00:00:00.000Z',
    );
    expect(normalizeJobPostedDate('today', NOW)?.toISOString()).toBe(NOW.toISOString());
    expect(normalizeJobPostedDate('yesterday', NOW)?.toISOString()).toBe(
      '2026-04-27T12:00:00.000Z',
    );
    expect(normalizeJobPostedDate('Posted 3 days ago', NOW)?.toISOString()).toBe(
      '2026-04-25T12:00:00.000Z',
    );
  });

  it('treats unknown posting ages as ineligible when a freshness window is active', () => {
    expect(isWithinFreshnessWindow('Posted 6 days ago', 7, NOW)).toBe(true);
    expect(isWithinFreshnessWindow('Posted 8 days ago', 7, NOW)).toBe(false);
    expect(isWithinFreshnessWindow(null, 7, NOW)).toBe(false);
    expect(isWithinFreshnessWindow('not a posting date', 7, NOW)).toBe(false);
    expect(isWithinFreshnessWindow(null, null, NOW)).toBe(true);
  });

  it('finds explicit posting age text in organic snippets', () => {
    expect(findPostedDateText('Senior role. Posted 2 days ago. Apply now.')).toBe(
      'Posted 2 days ago',
    );
    expect(findPostedDateText('This company is hiring now.')).toBeNull();
  });
});
