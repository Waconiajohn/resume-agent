import { describe, expect, it } from 'vitest';
import { prepareResumeForWriting } from '../../v3/write/employment-status.js';
import type { StructuredResume } from '../../v3/types.js';

function baseResume(): StructuredResume {
  return {
    contact: { fullName: 'Michael Donovan' },
    discipline: 'manufacturing operations',
    positions: [
      {
        title: 'Vice President of Operations',
        company: 'Northstar Components',
        dates: { start: '2018', end: null, raw: '2018-Present' },
        bullets: [
          {
            text: 'Led operations across 3 manufacturing facilities.',
            is_new: false,
            evidence_found: true,
            confidence: 1,
          },
        ],
        confidence: 0.95,
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
    overallConfidence: 0.95,
  };
}

describe('prepareResumeForWriting employment-status handling', () => {
  it('keeps a normal current role unchanged', () => {
    const resume = baseResume();

    const prepared = prepareResumeForWriting(resume);

    expect(prepared).toBe(resume);
    expect(prepared.positions[0].dates).toEqual({
      start: '2018',
      end: null,
      raw: '2018-Present',
    });
  });

  it('turns Present into Recent when classify preserved a layoff/current-search transition', () => {
    const resume = {
      ...baseResume(),
      careerGaps: [
        {
          description:
            'Recently laid off after private-equity ownership consolidated two divisions; currently seeking next VP Operations role.',
          confidence: 0.95,
        },
      ],
      flags: [
        {
          field: 'positions[0].dates',
          reason:
            'The most recent role is marked Present, but the resume also says he was recently laid off and is seeking the next role.',
          severity: 'medium' as const,
        },
      ],
    };

    const prepared = prepareResumeForWriting(resume);

    expect(prepared).not.toBe(resume);
    expect(prepared.positions[0].dates).toEqual({
      start: '2018',
      end: 'recent',
      raw: '2018-Recent',
    });
    expect(resume.positions[0].dates).toEqual({
      start: '2018',
      end: null,
      raw: '2018-Present',
    });
  });

  it('falls back to the first present role when the transition note is present but not field-specific', () => {
    const resume = {
      ...baseResume(),
      careerGaps: [
        {
          description: 'Currently seeking next operations leadership role after position eliminated.',
          confidence: 0.9,
        },
      ],
    };

    const prepared = prepareResumeForWriting(resume);

    expect(prepared.positions[0].dates.end).toBe('recent');
    expect(prepared.positions[0].dates.raw).toBe('2018-Recent');
  });
});
