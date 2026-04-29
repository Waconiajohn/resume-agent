import { describe, expect, it } from 'vitest';
import { markdownToHtml } from '../markdown';

describe('markdownToHtml', () => {
  it('restores collapsed report headings before rendering', () => {
    const html = markdownToHtml(
      '# Full Interview Prep Report **Candidate:** Lisa Slagle ## Company Research Overview text ## 3-2-1 Rule: - Proof point',
    );

    expect(html).toContain('<h1>Full Interview Prep Report</h1>');
    expect(html).toContain('<strong>Candidate:</strong>');
    expect(html).toContain('<h2>Company Research Overview text</h2>');
    expect(html).toContain('<h2>3-2-1 Rule:</h2>');
    expect(html).toContain('<ul><li>Proof point</li></ul>');
  });
});
