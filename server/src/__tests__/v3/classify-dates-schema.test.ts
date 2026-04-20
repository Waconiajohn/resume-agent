// Regression test for the fixture-17 davidchicks classify-schema failure
// (surfaced 2026-04-20 morning, commit b43686b6).
//
// gpt-5.4-mini on classify omitted the `dates` object entirely on a
// position whose source had no explicit date range (the "Additional
// experiences → Microsoft Corporation" early-career entry). DeepSeek did
// not have this failure. Classify Rule 7 in classify.v1.md v1.4 now
// explicitly instructs the model to emit `dates: { start: null, end: null,
// raw: "<section label>" }` for such cases.
//
// These schema-level tests pin the contract so that if anyone tries to
// "fix" the regression by making `dates` optional in the schema (which
// would silently allow null-less output), the test fails — the prompt
// fix is the correct path, not schema relaxation.

import { describe, expect, it } from 'vitest';
import { StructuredResumeSchema } from '../../v3/classify/schema.js';

const baseResume = {
  contact: { fullName: 'Test Candidate' },
  discipline: 'software engineering',
  positions: [],
  education: [],
  certifications: [],
  skills: [],
  careerGaps: [],
  crossRoleHighlights: [],
  customSections: [],
  pronoun: null,
  flags: [],
  overallConfidence: 1.0,
};

function positionWithDates(dates: unknown) {
  return {
    title: 'Software Design Engineer',
    company: 'Microsoft Corporation',
    location: 'Redmond, WA',
    dates,
    bullets: [
      {
        text: 'Built infrastructure enabling large-scale automated testing.',
        is_new: false,
        evidence_found: true,
        confidence: 0.9,
      },
    ],
    confidence: 0.6,
  };
}

describe('classify schema — dates contract for no-date-source positions', () => {
  it('FAILS validation when `dates` object is omitted entirely (reproduces fixture-17 regression)', () => {
    const resume = {
      ...baseResume,
      positions: [
        {
          title: 'Software Engineer',
          company: 'Microsoft',
          bullets: [],
          confidence: 0.6,
          // dates omitted on purpose
        },
      ],
    };
    const result = StructuredResumeSchema.safeParse(resume);
    expect(result.success).toBe(false);
    if (!result.success) {
      const paths = result.error.issues.map((i) => i.path.join('.'));
      expect(paths).toContain('positions.0.dates');
    }
  });

  it('PASSES when the fix shape is used — start/end null, raw carries the section label', () => {
    const resume = {
      ...baseResume,
      positions: [
        positionWithDates({
          start: null,
          end: null,
          raw: 'Additional experiences — early career, dates not specified',
        }),
      ],
    };
    const result = StructuredResumeSchema.safeParse(resume);
    expect(result.success).toBe(true);
  });

  it('PASSES with just a descriptive raw like "Early career"', () => {
    const resume = {
      ...baseResume,
      positions: [
        positionWithDates({ start: null, end: null, raw: 'Early career' }),
      ],
    };
    const result = StructuredResumeSchema.safeParse(resume);
    expect(result.success).toBe(true);
  });

  it('FAILS when raw is null — raw must be a non-empty string per the schema', () => {
    const resume = {
      ...baseResume,
      positions: [
        positionWithDates({ start: null, end: null, raw: null }),
      ],
    };
    const result = StructuredResumeSchema.safeParse(resume);
    expect(result.success).toBe(false);
  });

  it('PASSES with normal start+end strings (baseline, no regression)', () => {
    const resume = {
      ...baseResume,
      positions: [
        positionWithDates({ start: 'Dec 2019', end: 'Oct 2025', raw: 'Dec 2019 - Oct 2025' }),
      ],
    };
    const result = StructuredResumeSchema.safeParse(resume);
    expect(result.success).toBe(true);
  });

  it('PASSES with end=null for a current position (common case)', () => {
    const resume = {
      ...baseResume,
      positions: [
        positionWithDates({ start: '2022', end: null, raw: '2022 – Present' }),
      ],
    };
    const result = StructuredResumeSchema.safeParse(resume);
    expect(result.success).toBe(true);
  });
});
