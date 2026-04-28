import { describe, expect, it } from 'vitest';
import { isLikelyJobPostingResult } from '../lib/job-search/adapters/firecrawl.js';

describe('Firecrawl job result filtering', () => {
  it('rejects search-result, salary, and aggregate pages that cannot tailor a resume', () => {
    expect(isLikelyJobPostingResult(
      'Chief Operating Officer jobs in Cincinnati, OH - Indeed',
      'https://www.indeed.com/q-chief-operating-officer-l-cincinnati,-oh-jobs.html',
    )).toBe(false);
    expect(isLikelyJobPostingResult(
      '2026 COO (Chief Operating Officer) Salary in Cincinnati, OH | Built In',
      'https://builtin.com/salaries/us/cincinnati-oh/coo-chief-operating-officer',
    )).toBe(false);
    expect(isLikelyJobPostingResult(
      '119 Chief Operating Officer jobs in Cincinnati, Ohio, United States',
      'https://www.linkedin.com/jobs/chief-operating-officer-jobs-cincinnati-oh',
    )).toBe(false);
  });

  it('keeps likely job-detail pages', () => {
    expect(isLikelyJobPostingResult(
      'Chief Operating Officer',
      'https://www.linkedin.com/jobs/view/1234567890',
    )).toBe(true);
    expect(isLikelyJobPostingResult(
      'VP of Manufacturing (Consumer Goods) - Cincinnati, OH',
      'https://www.jrgpartners.com/jobs/vp-manufacturing-consumer-goods-cincinnati-oh/',
    )).toBe(true);
    expect(isLikelyJobPostingResult(
      'Product Director',
      'https://boards.greenhouse.io/acme/jobs/12345',
    )).toBe(true);
  });
});
