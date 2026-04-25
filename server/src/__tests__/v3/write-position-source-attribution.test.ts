import { describe, expect, it } from 'vitest';
import {
  buildPositionSourceAttributionRetryAddendum,
  checkPositionSourceAttribution,
  parseSourceBulletIndexes,
} from '../../v3/write/source-attribution.js';
import type { StructuredResume, WrittenPosition } from '../../v3/types.js';

function resume(positionBullets: string[], scope: string | null = null): StructuredResume {
  return {
    contact: { fullName: 'Test Candidate' },
    discipline: 'manufacturing operations',
    positions: [
      {
        title: 'Plant Manager',
        company: 'Continental Manufacturing Corp',
        dates: { start: '2016', end: '2018', raw: '2016-2018' },
        scope,
        bullets: positionBullets.map((text) => ({
          text,
          is_new: false,
          evidence_found: true,
          confidence: 1,
        })),
        confidence: 1,
      },
    ],
    education: [],
    certifications: [],
    skills: [],
    careerGaps: [],
    crossRoleHighlights: [],
    customSections: [],
    pronoun: null,
    flags: [],
    overallConfidence: 1,
  };
}

function writtenPosition(text: string, source: string | null): WrittenPosition {
  return {
    positionIndex: 0,
    title: 'Plant Manager',
    company: 'Continental Manufacturing Corp',
    dates: { start: '2016', end: '2018', raw: '2016-2018' },
    bullets: [{
      text,
      source,
      is_new: true,
      evidence_found: true,
      confidence: 0.9,
    }],
  };
}

describe('write-position source-hint attribution', () => {
  it('parses source bullet locators from free-form source hints', () => {
    expect(parseSourceBulletIndexes('positions[0].bullets[3] + bullets[1]')).toEqual([1, 3]);
  });

  it('flags metric migration from a different source bullet', () => {
    const source = resume([
      'Supported facility expansion across two production lines.',
      'Managed $4.5M annual procurement budget for metals and fabrication suppliers.',
    ]);
    const written = writtenPosition(
      'Supported $4.5M facility expansion across two production lines.',
      'bullets[0]',
    );

    const result = checkPositionSourceAttribution(written, source);

    expect(result.verified).toBe(false);
    expect(result.issues).toHaveLength(1);
    expect(result.issues[0]!.missingTokens).toContain('$4.5M');
  });

  it('allows a metric when the cited source bullet explicitly links it to the accomplishment', () => {
    const source = resume([
      'Managed $4.5M facility expansion across two production lines.',
      'Managed annual procurement budget for metals and fabrication suppliers.',
    ]);
    const written = writtenPosition(
      'Managed $4.5M facility expansion across two production lines.',
      'bullets[0]',
    );

    const result = checkPositionSourceAttribution(written, source);

    expect(result.verified).toBe(true);
    expect(result.issues).toEqual([]);
  });

  it('uses role scope as shared support for scope metrics', () => {
    const source = resume(
      ['Directed lean manufacturing and safety improvements.'],
      '3 manufacturing facilities; 420 employees; $175M combined output',
    );
    const written = writtenPosition(
      'Directed lean manufacturing and safety improvements across 3 manufacturing facilities and 420 employees.',
      'bullets[0]',
    );

    const result = checkPositionSourceAttribution(written, source);

    expect(result.verified).toBe(true);
  });

  it('builds a targeted retry addendum for unsupported source-hint claims', () => {
    const source = resume([
      'Supported facility expansion across two production lines.',
      'Managed $4.5M annual procurement budget.',
    ]);
    const result = checkPositionSourceAttribution(
      writtenPosition('Supported $4.5M facility expansion.', 'bullets[0]'),
      source,
    );

    const addendum = buildPositionSourceAttributionRetryAddendum(result);

    expect(addendum).toContain('moved claim tokens away from their cited source bullet');
    expect(addendum).toContain('$4.5M facility expansion');
    expect(addendum).toContain('"$4.5M"');
  });
});
