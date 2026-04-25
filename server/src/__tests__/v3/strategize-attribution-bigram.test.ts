// Unit tests for Fix 2 of 2026-04-20 pm — phrase-aware attribution matching.
//
// The word-level `missingWords` check in checkStrategizeAttribution (Phase
// 4.6) cannot catch a class of leak where the JD's role-title bigram
// ("Account Manager") is lifted into a framing field by a candidate whose
// source resume contains "account" and "manager" separately but never the
// bigram. This file tests that behavior is now caught by the bigram-aware
// `leakedPhrases` check when a JD is passed to checkStrategizeAttribution.
//
// Motivating data: the 19-fixture validation of 2026-04-20 morning
// (docs/v3-rebuild/reports/all-openai-19-fixture-validation.md) surfaced
// this failure mode on 5 cross-domain fixtures — bshook, jay-alger,
// joel-hough, lutz, steve-alexander — all of whom silently lifted
// "Account Manager" into targetDisciplinePhrase when paired against the
// under-armour account-manager-wholesale JD.

import { describe, expect, it } from 'vitest';
import { checkStrategizeAttribution } from '../../v3/verify/attribution.js';
import type { JobDescription, Strategy, StructuredResume } from '../../v3/types.js';

function resume(
  positions: Array<{ title: string; company: string; bullets: string[] }>,
  overrides: Partial<StructuredResume> = {},
): StructuredResume {
  return {
    contact: { fullName: 'Test Candidate' },
    discipline: 'test discipline',
    positions: positions.map((p) => ({
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
    ...overrides,
  };
}

function strategy(
  positioningFrame: string,
  targetDisciplinePhrase: string,
): Strategy {
  return {
    positioningFrame,
    targetDisciplinePhrase,
    emphasizedAccomplishments: [],
    objections: [],
    positionEmphasis: [],
  };
}

const UA_JD: JobDescription = {
  text: `Under Armour Account Manager, Wholesale — Mall. Responsibilities include
managing wholesale accounts at specialty sporting goods retailers (Finish Line,
JD Sports, Hibbett). The Account Manager will own channel strategy, forecasting,
and in-season sell-through analysis across the mall-based retail account
portfolio. Experience in wholesale account management is required.`,
  title: 'Account Manager, Wholesale',
  company: 'Under Armour',
};

describe('bigram leak detection — the bshook pattern', () => {
  it('FAILS when "Account Manager" is in JD and NOT in source (word-level match cannot catch)', () => {
    // bshook-shaped fixture: source has "account" (in "account teams") and
    // "manager" (in his own "Project Controls Manager" title) separately,
    // but never the bigram "Account Manager". The bigram is the JD role
    // title and must not be lifted into framing fields.
    const src = resume([
      {
        title: 'Senior Project Controls Manager',
        company: 'Eclipse Automation',
        bullets: [
          'Directed commercial management of intercompany work.',
          'Mentored 26 PMs and project teams across multiple customer accounts.',
        ],
      },
    ]);
    const strat = strategy(
      'commercial operations leader',
      'Account Manager, Commercial Programs',
    );

    const result = checkStrategizeAttribution(strat, src, UA_JD);
    const targetField = result.fields.find((f) => f.field === 'targetDisciplinePhrase');

    expect(targetField).toBeDefined();
    expect(targetField!.verified).toBe(false);
    expect(targetField!.leakedPhrases).toContain('account manager');
  });

  it('PASSES when the candidate legitimately held an Account Manager role (source contains the bigram)', () => {
    // fixture-02 blas-ortiz shape: source has "Sales Account Manager" as a
    // held title. "Account Manager" bigram is in source → passes even
    // though the JD also contains it.
    const src = resume([
      {
        title: 'Sales Account Manager',
        company: 'Diamond Tools',
        bullets: [
          'Owned territory account management for oil and gas customers.',
          'Developed wholesale distribution partnerships.',
        ],
      },
    ]);
    const strat = strategy(
      'sales account manager',
      'Sales Account Manager, Oil and Gas Technical Sales',
    );

    const result = checkStrategizeAttribution(strat, src, UA_JD);
    const targetField = result.fields.find((f) => f.field === 'targetDisciplinePhrase');

    expect(targetField).toBeDefined();
    expect(targetField!.leakedPhrases).not.toContain('account manager');
  });

  it('FAILS when "wholesale" is in JD and candidate has no wholesale experience', () => {
    const src = resume([
      {
        title: 'Product Manager',
        company: 'SaaS Startup',
        bullets: ['Launched product-led growth initiatives for enterprise SaaS customers.'],
      },
    ]);
    const strat = strategy(
      'product growth and wholesale leader',
      'Product Manager, Wholesale SaaS',
    );
    const result = checkStrategizeAttribution(strat, src, UA_JD);
    const posField = result.fields.find((f) => f.field === 'positioningFrame');
    const targetField = result.fields.find((f) => f.field === 'targetDisciplinePhrase');

    // Both should be flagged — "wholesale" comes from JD, not source.
    expect(posField!.verified).toBe(false);
    expect(targetField!.verified).toBe(false);
  });

  it('PASSES pure role-shape bigrams like "senior manager" even if not verbatim in source', () => {
    // If the JD says "senior manager" and the source doesn't, that's fine —
    // both words are in the role-shape allowlist. This test ensures the
    // allowlist is wired.
    const jdWithSenior: JobDescription = {
      text: 'We are hiring a Senior Manager for our operations team.',
      title: 'Senior Manager, Operations',
      company: 'Test',
    };
    const src = resume([
      {
        title: 'Operations Director',
        company: 'Test Co',
        bullets: ['Managed operations across 3 sites.'],
      },
    ]);
    const strat = strategy('operations leader', 'Senior Manager, Operations');
    const result = checkStrategizeAttribution(strat, src, jdWithSenior);
    const targetField = result.fields.find((f) => f.field === 'targetDisciplinePhrase');

    // "senior manager" is pure role-shape (both words in ROLE_SHAPE_STOPWORDS)
    // → allowlisted, no leak flag.
    expect(targetField!.leakedPhrases).not.toContain('senior manager');
  });

  it('PASSES VP/Vice President equivalence and comma-separated discipline lists', () => {
    const atlasJd: JobDescription = {
      text: `Vice President of Operations for Atlas Manufacturing Group. Lead operations
      across manufacturing facilities, supply chain, distribution, quality, and
      continuous improvement.`,
      title: 'Vice President of Operations',
      company: 'Atlas Manufacturing Group',
    };
    const src = resume([
      {
        title: 'VP Operations',
        company: 'Northstar Components',
        bullets: [
          'Led manufacturing operations, supply chain, and distribution across three plants.',
        ],
      },
    ]);
    const strat = strategy(
      'manufacturing operations leader',
      'Vice President of Operations, Manufacturing, Supply Chain, and Distribution',
    );

    const result = checkStrategizeAttribution(strat, src, atlasJd);
    const targetField = result.fields.find((f) => f.field === 'targetDisciplinePhrase');

    expect(targetField).toBeDefined();
    expect(targetField!.verified).toBe(true);
    expect(targetField!.missingWords).not.toContain('vice');
    expect(targetField!.leakedPhrases).not.toContain('operations manufacturing');
    expect(targetField!.leakedPhrases).not.toContain('manufacturing supply');
  });

  it('PASSES hyphenated scope when source and strategy use equivalent spacing', () => {
    const jdWithMultiSite: JobDescription = {
      text: 'Seeking a multi-site manufacturing operations executive for five facilities.',
      title: 'VP Operations',
      company: 'Atlas',
    };
    const src = resume([
      {
        title: 'Vice President of Operations',
        company: 'Manufacturing Co',
        bullets: [
          'Led multi-site manufacturing operations across 3 facilities with 420 employees.',
        ],
      },
    ]);
    const strat = strategy(
      'multi site manufacturing operations',
      'Manufacturing Operations',
    );
    const result = checkStrategizeAttribution(strat, src, jdWithMultiSite);
    const posField = result.fields.find((f) => f.field === 'positioningFrame');

    expect(posField!.verified).toBe(true);
    expect(posField!.missingWords).not.toContain('multi');
    expect(posField!.leakedPhrases).not.toContain('multi site');
  });

  it('PASSES supportable multi-site inference when source proves multiple facilities', () => {
    const jdWithMultiSite: JobDescription = {
      text: 'Seeking a multi-site manufacturing operations executive to lead standardized plant performance.',
      title: 'VP Operations',
      company: 'Atlas',
    };
    const src = resume([
      {
        title: 'Vice President of Operations',
        company: 'Manufacturing Co',
        bullets: [
          'Led operations across 3 manufacturing facilities with 420 employees.',
        ],
      },
    ]);
    const strat = strategy(
      'multi-site manufacturing operations',
      'Multi-Site Manufacturing Operations Leader',
    );
    const result = checkStrategizeAttribution(strat, src, jdWithMultiSite);
    const posField = result.fields.find((f) => f.field === 'positioningFrame');
    const targetField = result.fields.find((f) => f.field === 'targetDisciplinePhrase');

    expect(posField!.verified).toBe(true);
    expect(targetField!.verified).toBe(true);
    expect(posField!.missingWords).toEqual([]);
    expect(targetField!.missingWords).toEqual([]);
    expect(posField!.leakedPhrases).not.toContain('multi site');
    expect(targetField!.leakedPhrases).not.toContain('multi site');
  });

  it('still FAILS unsupported multi-site inference when source lacks multi-location proof', () => {
    const jdWithMultiSite: JobDescription = {
      text: 'Seeking a multi-site manufacturing operations executive to lead standardized plant performance.',
      title: 'VP Operations',
      company: 'Atlas',
    };
    const src = resume([
      {
        title: 'Vice President of Operations',
        company: 'Manufacturing Co',
        bullets: [
          'Led operations for a manufacturing facility with 420 employees.',
        ],
      },
    ]);
    const strat = strategy(
      'multi-site manufacturing operations',
      'Multi-Site Manufacturing Operations Leader',
    );
    const result = checkStrategizeAttribution(strat, src, jdWithMultiSite);
    const posField = result.fields.find((f) => f.field === 'positioningFrame');

    expect(posField!.verified).toBe(false);
    expect(posField!.leakedPhrases).toContain('multi site');
  });

  it('does NOT flag a bigram when not present in the JD (falls through to word-level only)', () => {
    const src = resume([
      {
        title: 'Test Engineer',
        company: 'Test Co',
        bullets: ['Built test frameworks for mission-critical systems.'],
      },
    ]);
    // "mission critical" is in the candidate's source AND not in the JD.
    const strat = strategy('mission critical leader', 'Senior Test Engineer');
    const result = checkStrategizeAttribution(strat, src, UA_JD);
    const posField = result.fields.find((f) => f.field === 'positioningFrame');

    // Word-level check: "mission" is in source. Bigram "mission critical" is
    // not in JD, so no leak flag either way.
    expect(posField!.leakedPhrases).toEqual([]);
  });

  it('word-level check is preserved — missing word still flagged', () => {
    const src = resume([
      {
        title: 'Software Engineer',
        company: 'Enterprise Co',
        bullets: ['Built distributed systems at scale.'],
      },
    ]);
    // "hospitality" is neither in source nor in JD — should be flagged as
    // missingWord (the classic Phase 4.6 behavior, should still work).
    const strat = strategy('hospitality leader', 'test');
    const result = checkStrategizeAttribution(strat, src, UA_JD);
    const posField = result.fields.find((f) => f.field === 'positioningFrame');

    expect(posField!.verified).toBe(false);
    expect(posField!.missingWords).toContain('hospitality');
  });

  it('backwards-compatible: when JD is NOT passed, bigram check is skipped', () => {
    // Tests that old callers (no JD param) get exactly the pre-Fix-2
    // behavior — word-level only, leakedPhrases always empty.
    const src = resume([
      {
        title: 'Project Manager',
        company: 'Test Co',
        bullets: ['Managed accounts and delivery schedules.'],
      },
    ]);
    const strat = strategy(
      'account manager',
      'Account Manager, Commercial Programs',
    );

    // Call without JD — bigram check not performed.
    const result = checkStrategizeAttribution(strat, src);
    const targetField = result.fields.find((f) => f.field === 'targetDisciplinePhrase');

    expect(targetField!.leakedPhrases).toEqual([]);
  });

  // Fix 7 (2026-04-20 pm) — stopword filter. Bigrams containing any
  // FRAME_STOPWORD ("and", "of", "the", "for", "to", "with", etc.) are
  // syntactic glue, not content phrases, and must not be flagged as
  // JD-vocabulary leaks even when they coincidentally appear in both
  // the JD and not in the candidate's source. Fixture-13 lisa-slagle's
  // v3 hard-fail on "and product" motivated this.

  it('stopword-containing bigram passes: "and product" is glue, not a leak', () => {
    // JD has "and product" (in "sales channels and product categories").
    // Candidate source doesn't contain that exact bigram verbatim. Pre-Fix-7
    // this would have been flagged as a leak; post-Fix-7 the stopword
    // "and" short-circuits detection.
    const jdWithAndProduct: JobDescription = {
      text: 'Account Manager role covering sales channels and product categories across wholesale partners.',
      title: 'Account Manager, Wholesale',
      company: 'Test',
    };
    const src = resume([
      {
        title: 'Business Systems Consultant',
        company: 'Financial Services Co',
        bullets: [
          'Led business systems and product ownership initiatives across enterprise CRM.',
        ],
      },
    ]);
    const strat = strategy(
      'business systems and product ownership',
      'Business Systems Consultant and Product Owner',
    );
    const result = checkStrategizeAttribution(strat, src, jdWithAndProduct);
    const posField = result.fields.find((f) => f.field === 'positioningFrame');
    expect(posField!.leakedPhrases).not.toContain('and product');
    expect(posField!.leakedPhrases).not.toContain('systems and');
  });

  it('lisa-slagle v3 reproduction: exact emitted frame no longer hard-fails', () => {
    const jdWithAndProduct: JobDescription = {
      text: 'sales channels and product categories across mall-based retail accounts',
      title: 'Account Manager, Wholesale',
      company: 'Test',
    };
    const src = resume(
      [
        {
          title: 'Sr Business Systems Consultant',
          company: 'Test Co',
          bullets: ['Supported Salesforce CRM and requirements engineering.'],
        },
      ],
      {
        discipline:
          'business systems analysis, product ownership, and requirements engineering for enterprise CRM and regulated financial services environments',
      },
    );
    // Exact v3 positioningFrame from fixture-13's snapshot.
    const strat = strategy(
      'business systems and product ownership',
      'Business Systems Consultant and Product Owner',
    );
    const result = checkStrategizeAttribution(strat, src, jdWithAndProduct);
    const posField = result.fields.find((f) => f.field === 'positioningFrame');
    // No leakedPhrases; field verified.
    expect(posField!.leakedPhrases).toEqual([]);
  });

  it('multi-stopword bigram always passes: "of the" in both texts', () => {
    const jdWithOfThe: JobDescription = {
      text: 'Head of the Wholesale Team',
      title: 'Head of Wholesale',
      company: 'Test',
    };
    const src = resume([
      { title: 'Director', company: 'Test Co', bullets: ['Managed of the accounts team.'] },
    ]);
    // "head of" and "of the" are both stopword-laden — neither should ever
    // be flagged regardless of JD/source composition.
    const strat = strategy('head of the team', 'Director of Operations');
    const result = checkStrategizeAttribution(strat, src, jdWithOfThe);
    const posField = result.fields.find((f) => f.field === 'positioningFrame');
    expect(
      posField!.leakedPhrases.some((p) => p === 'of the' || p === 'head of'),
    ).toBe(false);
  });

  it('regression guard: real "Account Manager" leak on bshook-shape still FAILS after Fix 7', () => {
    // Same bshook pattern from the top of this file. "account manager" has
    // NO stopword in it — Fix 7 should not short-circuit this. The
    // guardrail continues to catch genuine role-title leaks.
    const src = resume([
      {
        title: 'Senior Project Controls Manager',
        company: 'Eclipse Automation',
        bullets: [
          'Directed commercial management of intercompany work.',
          'Mentored 26 PMs across customer accounts.',
        ],
      },
    ]);
    const strat = strategy(
      'commercial operations leader',
      'Account Manager, Commercial Programs',
    );
    const result = checkStrategizeAttribution(strat, src, UA_JD);
    const targetField = result.fields.find((f) => f.field === 'targetDisciplinePhrase');
    expect(targetField!.verified).toBe(false);
    expect(targetField!.leakedPhrases).toContain('account manager');
  });

  it('de-duplicates overlapping trigram when a flagged bigram already covers it', () => {
    // "account manager wholesale" trigram and "account manager" bigram both
    // leak the same underlying issue. Bigram wins; trigram should not be
    // double-reported.
    const src = resume([
      {
        title: 'Project Controls Manager',
        company: 'Test Co',
        bullets: ['Managed commercial aspects of engineering delivery.'],
      },
    ]);
    const strat = strategy(
      'commercial leader',
      'Account Manager, Wholesale Delivery',
    );
    const result = checkStrategizeAttribution(strat, src, UA_JD);
    const targetField = result.fields.find((f) => f.field === 'targetDisciplinePhrase');

    expect(targetField!.leakedPhrases).toContain('account manager');
    // The trigram "account manager wholesale" shouldn't appear separately
    // since every word of the trigram is already covered by the flagged
    // bigram + a different flagged bigram / missingWord.
    const trigramDupes = targetField!.leakedPhrases.filter(
      (p) => p.split(' ').length === 3 && p.includes('account manager'),
    );
    expect(trigramDupes).toEqual([]);
  });
});
