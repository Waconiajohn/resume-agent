// Semantic diff utility tests.
// Exercises the Phase 4-prep thresholds from the Phase 3 review message:
// - counts of positions/edu/certs/gaps/crossRoleHighlights changing -> real
// - discipline primary-domain change -> real
// - pronoun change -> real
// - overallConfidence >0.1 -> real
// - wording variance ±15% length no polarity change -> noise
// - polarity change -> real

import { describe, expect, it } from 'vitest';
import { diffClassifySnapshots } from '../../v3/test-fixtures/classify-diff.js';
import type { StructuredResume } from '../../v3/types.js';

function baseResume(): StructuredResume {
  return {
    contact: { fullName: 'test' },
    discipline: 'quality engineering and DevOps transformation leadership',
    positions: [],
    education: [],
    certifications: [],
    skills: [],
    careerGaps: [],
    crossRoleHighlights: [],
    pronoun: null,
    flags: [],
    overallConfidence: 1,
  };
}

describe('diffClassifySnapshots', () => {
  it('returns ok when two outputs are identical', () => {
    const { overall, findings } = diffClassifySnapshots(baseResume(), baseResume());
    expect(overall).toBe('ok');
    expect(findings).toEqual([]);
  });

  it('flags a position count change as real', () => {
    const a = baseResume();
    const b = baseResume();
    b.positions = [
      {
        title: 'Engineer',
        company: 'Acme',
        dates: { start: '2020', end: null, raw: '2020 –' },
        bullets: [],
        confidence: 1,
      },
    ];
    const { overall, findings } = diffClassifySnapshots(a, b);
    expect(overall).toBe('real');
    expect(findings.find((f) => f.field === 'positions')?.severity).toBe('real');
  });

  it('flags crossRoleHighlights count change as real', () => {
    const a = baseResume();
    const b = baseResume();
    b.crossRoleHighlights = [
      { text: 'Built 85-person team', sourceContext: 'Career Highlights', confidence: 0.9 },
    ];
    const { overall } = diffClassifySnapshots(a, b);
    expect(overall).toBe('real');
  });

  it('flags a pronoun change as real', () => {
    const a = baseResume();
    const b = baseResume();
    b.pronoun = 'she/her';
    const { overall, findings } = diffClassifySnapshots(a, b);
    expect(overall).toBe('real');
    expect(findings.find((f) => f.field === 'pronoun')?.severity).toBe('real');
  });

  it('tolerates overallConfidence shift within ±0.1', () => {
    const a = baseResume();
    a.overallConfidence = 0.9;
    const b = baseResume();
    b.overallConfidence = 0.85;
    const { overall } = diffClassifySnapshots(a, b);
    expect(overall).toBe('ok');
  });

  it('flags overallConfidence shift beyond ±0.1 as real', () => {
    const a = baseResume();
    a.overallConfidence = 0.9;
    const b = baseResume();
    b.overallConfidence = 0.7;
    const { overall, findings } = diffClassifySnapshots(a, b);
    expect(overall).toBe('real');
    expect(findings.find((f) => f.field === 'overallConfidence')?.severity).toBe('real');
  });

  it('treats discipline paraphrase (same primary domain) as noise when within length tolerance', () => {
    const a = baseResume();
    a.discipline = 'quality engineering and devops transformation';
    const b = baseResume();
    b.discipline = 'quality engineering plus devops transformation'; // similar length
    const { overall, findings } = diffClassifySnapshots(a, b);
    expect(overall).toBe('noise');
    expect(findings.find((f) => f.field === 'discipline')?.severity).toBe('noise');
  });

  it('flags a substantive discipline change as real', () => {
    const a = baseResume();
    a.discipline = 'quality engineering and devops transformation leadership';
    const b = baseResume();
    b.discipline = 'software engineering management in biotech';
    const { overall, findings } = diffClassifySnapshots(a, b);
    expect(overall).toBe('real');
    expect(findings.find((f) => f.field === 'discipline')?.severity).toBe('real');
  });

  it('flags wording with a polarity change as real', () => {
    const a = baseResume();
    a.positions = [
      {
        title: 'Led team rebuilding legacy systems',
        company: 'Acme',
        dates: { start: '2020', end: null, raw: '2020 –' },
        bullets: [],
        confidence: 1,
      },
    ];
    const b = baseResume();
    b.positions = [
      {
        title: 'Led team not rebuilding legacy systems', // same length, polarity flip
        company: 'Acme',
        dates: { start: '2020', end: null, raw: '2020 –' },
        bullets: [],
        confidence: 1,
      },
    ];
    const { overall } = diffClassifySnapshots(a, b);
    expect(overall).toBe('real');
  });

  it('flags wording whose length change exceeds 15% as real', () => {
    const a = baseResume();
    a.positions = [
      {
        title: 'Director of Engineering',
        company: 'Acme',
        dates: { start: '2020', end: null, raw: '2020 –' },
        bullets: [],
        confidence: 1,
      },
    ];
    const b = baseResume();
    b.positions = [
      {
        title: 'VP', // much shorter
        company: 'Acme',
        dates: { start: '2020', end: null, raw: '2020 –' },
        bullets: [],
        confidence: 1,
      },
    ];
    const { overall } = diffClassifySnapshots(a, b);
    expect(overall).toBe('real');
  });
});
