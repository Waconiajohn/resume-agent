import { describe, expect, it } from 'vitest';

import { mapTruthVerificationOutputToEvidenceItems } from '../contracts/shared-evidence.js';

describe('shared-evidence truth claim mapping', () => {
  it('does not crash when a malformed truth claim arrives with a non-string claim value', () => {
    const items = mapTruthVerificationOutputToEvidenceItems([
      {
        claim: { text: 'bad shape' } as unknown as string,
        section: 'executive_summary',
        source_found: true,
        source_text: 'Led product delivery and launch planning.',
        confidence: 'plausible',
      },
    ]);

    expect(items).toHaveLength(1);
    expect(items[0].statement).toBe('Led product delivery and launch planning.');
    expect(items[0].supports).toEqual(['executive_summary']);
  });
});
