// Unit tests for checkStrategizeAttribution (Phase 4.6).
//
// Covers the core contract: summaries are verified iff every claim token
// (dollar amount, percentage, number+unit, proper noun, acronym, or
// "by/through ..." framing phrase) appears as a substring in the candidate
// resume's full-resume haystack (any position's bullets/scope + custom
// sections + crossRoleHighlights).
//
// The fixture-09 case is reproduced in the final test as the canonical
// regression this work was designed to catch.

import { describe, expect, it } from 'vitest';
import { checkStrategizeAttribution, extractClaimTokens } from '../../v3/verify/attribution.js';
import type { Strategy, StructuredResume } from '../../v3/types.js';

function resume(positions: Array<{ title: string; company: string; bullets: string[] }>): StructuredResume {
  return {
    contact: { fullName: 'Test Candidate' },
    discipline: 'test discipline',
    positions: positions.map((p, i) => ({
      title: p.title,
      company: p.company,
      dates: { start: '2020', end: '2023', raw: '2020-2023' },
      bullets: p.bullets.map((t) => ({
        text: t,
        is_new: false,
        evidence_found: true,
        confidence: 1.0,
      })),
      confidence: 1.0,
    })),
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
}

function strategy(summaries: Array<{ positionIndex: number | null; summary: string }>): Strategy {
  return {
    positioningFrame: 'test frame',
    targetDisciplinePhrase: 'test role',
    emphasizedAccomplishments: summaries.map((s) => ({
      positionIndex: s.positionIndex,
      summary: s.summary,
      rationale: 'test rationale',
    })),
    objections: [],
    positionEmphasis: [],
  };
}

describe('checkStrategizeAttribution', () => {
  it('returns verified:true when every claim token is in source', () => {
    const src = resume([
      { title: 'Director', company: 'Acme', bullets: ['Delivered $26M in automation ROI via CI/CD pipelines.'] },
    ]);
    const strat = strategy([{ positionIndex: 0, summary: 'Delivered $26M in automation ROI via CI/CD.' }]);
    const result = checkStrategizeAttribution(strat, src);
    expect(result.summaries[0].verified).toBe(true);
    expect(result.summary.unverifiedCount).toBe(0);
  });

  it('flags a missing dollar metric', () => {
    const src = resume([{ title: 'Director', company: 'Acme', bullets: ['Delivered $26M in automation ROI.'] }]);
    // Strategize invented $40M — not in source.
    const strat = strategy([{ positionIndex: 0, summary: 'Delivered $40M in savings.' }]);
    const result = checkStrategizeAttribution(strat, src);
    expect(result.summaries[0].verified).toBe(false);
    expect(result.summaries[0].missingTokens).toContain('$40M');
  });

  it('flags a paraphrased "by [verb]-ing" framing phrase the source does not state', () => {
    const src = resume([
      { title: 'Director', company: 'Acme', bullets: ['Secured 20+ multi-year contracts with a combined value of $200M with higher margins by promoting the performance and reliability of products.'] },
    ]);
    const strat = strategy([
      { positionIndex: 0, summary: 'Secured over $200M in multi-year contracts by developing pricing strategies and negotiating favorable terms.' },
    ]);
    const result = checkStrategizeAttribution(strat, src);
    expect(result.summaries[0].verified).toBe(false);
    // The framing phrase should appear in missingTokens
    const missing = result.summaries[0].missingTokens.join(' | ');
    expect(missing.toLowerCase()).toContain('by developing');
  });

  it('accepts a "by [verb]-ing" phrase that IS in the source', () => {
    const src = resume([
      { title: 'Director', company: 'Acme', bullets: ['Reduced churn 18% by developing retention playbooks across three customer tiers.'] },
    ]);
    const strat = strategy([
      { positionIndex: 0, summary: 'Reduced churn 18% by developing retention playbooks across three customer tiers.' },
    ]);
    const result = checkStrategizeAttribution(strat, src);
    expect(result.summaries[0].verified).toBe(true);
  });

  it('checks against resume-wide haystack (positionIndex=null cross-role summaries)', () => {
    const src = resume([
      { title: 'Director', company: 'Acme', bullets: ['Led team.'] },
      { title: 'VP', company: 'Beta', bullets: ['Delivered $15M in savings.'] },
    ]);
    // Cross-role summary citing a metric from position[1] but strategy positionIndex=null
    const strat = strategy([{ positionIndex: null, summary: 'Delivered $15M in savings across career.' }]);
    const result = checkStrategizeAttribution(strat, src);
    expect(result.summaries[0].verified).toBe(true);
  });

  it('normalizes dashes and case during matching', () => {
    // Source uses en-dash and a specific Proper Noun phrase; summary uses
    // hyphen-minus and different case for the same phrase. Dashes and case
    // should be normalized during comparison so no token is flagged missing.
    const src = resume([
      { title: 'Director', company: 'Acme', bullets: ['Led SAP S/4HANA rollout across 2020 – 2023 with 12 teams.'] },
    ]);
    const strat = strategy([
      // hyphen-minus + different case on the acronym
      { positionIndex: 0, summary: 'Led sap s/4hana rollout across 2020-2023 with 12 teams.' },
    ]);
    const result = checkStrategizeAttribution(strat, src);
    expect(result.summaries[0].verified).toBe(true);
  });

  it('returns empty result when no emphasizedAccomplishments', () => {
    const src = resume([{ title: 'Director', company: 'Acme', bullets: ['Test.'] }]);
    const strat = strategy([]);
    const result = checkStrategizeAttribution(strat, src);
    expect(result.summary.totalSummaries).toBe(0);
  });

  it('reproduces the fixture-09 fabrication pattern', () => {
    // Source: the actual fixture-09 position[4] bullet that started the chain.
    const src = resume([
      {
        title: 'Business Development Sales Manager',
        company: 'Collins Aerospace',
        bullets: [
          'Secured 20+ multi-year contracts with a combined value of $200M with higher margins and favorable terms and conditions by promoting the performance and reliability of products, and investing time in key customer relationship development.',
        ],
      },
    ]);
    // Strategize's actual embellished summary from Phase 4.5.
    const strat = strategy([
      {
        positionIndex: 0,
        summary: 'Secured over $200M in multi-year contracts by developing pricing strategies, writing proposals, and negotiating favorable terms, directly showcasing B2B enterprise growth.',
      },
    ]);
    const result = checkStrategizeAttribution(strat, src);
    expect(result.summaries[0].verified).toBe(false);
    const missing = result.summaries[0].missingTokens.join(' | ').toLowerCase();
    // The fabricated framing phrase should be flagged.
    expect(missing).toContain('by developing');
  });
});

describe('extractClaimTokens — Phase 4.6 additions', () => {
  it('captures "by [verb]-ing X" framing phrases', () => {
    const tokens = extractClaimTokens('Secured deals by developing pricing strategies.');
    const joined = tokens.join(' | ').toLowerCase();
    expect(joined).toContain('by developing');
  });

  it('captures "through [verb]-ing X" framing phrases', () => {
    const tokens = extractClaimTokens('Improved throughput through leveraging automation tools.');
    const joined = tokens.join(' | ').toLowerCase();
    expect(joined).toContain('through leveraging');
  });

  it('does not explode on text with no claim tokens', () => {
    const tokens = extractClaimTokens('Generic prose without specifics.');
    expect(Array.isArray(tokens)).toBe(true);
  });
});
