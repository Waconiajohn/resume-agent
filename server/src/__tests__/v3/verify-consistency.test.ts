// Unit tests for checkIntraResumeConsistency (2026-04-19).
// Motivating case: fixture-12 joel-hough summary said "three facilities"
// while selectedAccomplishments said "four distribution centers" — same
// canonical noun (location), different numbers. Verify never caught it.
//
// The check is mechanical, not LLM-driven. Scope is deliberately narrow:
// summary + selectedAccomplishments only. Position bullets are NOT in scope.

import { describe, expect, it } from 'vitest';
import { checkIntraResumeConsistency } from '../../v3/verify/consistency.js';
import type { WrittenResume } from '../../v3/types.js';

function written(opts: {
  summary?: string;
  selectedAccomplishments?: string[];
}): WrittenResume {
  return {
    summary: opts.summary ?? '',
    selectedAccomplishments: opts.selectedAccomplishments ?? [],
    coreCompetencies: [],
    positions: [],
    customSections: [],
  };
}

describe('checkIntraResumeConsistency — motivating case', () => {
  it('flags "three facilities" (summary) vs "four distribution centers" (accomplishment)', () => {
    const w = written({
      summary:
        'Multi-site leader with a distribution center network spanning three facilities.',
      selectedAccomplishments: [
        'Directed operations across a network of four distribution centers and fourteen stores.',
      ],
    });
    const issues = checkIntraResumeConsistency(w);
    expect(issues).toHaveLength(1);
    expect(issues[0].severity).toBe('error');
    expect(issues[0].message).toMatch(/location/);
    expect(issues[0].message).toMatch(/3/);
    expect(issues[0].message).toMatch(/4/);
    expect(issues[0].message).toMatch(/summary/);
    expect(issues[0].message).toMatch(/selectedAccomplishments\[0\]/);
  });
});

describe('checkIntraResumeConsistency — no false positives', () => {
  it('same noun, same number across sections → no issue', () => {
    const w = written({
      summary: 'Led an 85 person engineering organization.',
      selectedAccomplishments: [
        'Scaled engineering to 85 staff across three continents.',
      ],
    });
    const issues = checkIntraResumeConsistency(w);
    expect(issues).toHaveLength(0);
  });

  it('digit-form and word-form matching number → no issue', () => {
    const w = written({
      summary: 'Managed 3 sites.',
      selectedAccomplishments: ['Operated three locations in the region.'],
    });
    const issues = checkIntraResumeConsistency(w);
    expect(issues).toHaveLength(0);
  });

  it('unknown scope noun (not in SCOPE_NOUN_MAP) → no issue', () => {
    const w = written({
      summary: 'Built five frameworks for enterprise deployment.',
      selectedAccomplishments: ['Authored seven frameworks during tenure.'],
    });
    // "framework" is not a scope noun in the map — avoid over-flagging
    // unfamiliar vocabulary.
    const issues = checkIntraResumeConsistency(w);
    expect(issues).toHaveLength(0);
  });

  it('empty written → no issues', () => {
    const w = written({});
    expect(checkIntraResumeConsistency(w)).toHaveLength(0);
  });

  it('aggregate "sites" vs specific "distribution centers" → no false positive (fixture-12 regression)', () => {
    // Seen in live fixture-12 run: summary "across 18 sites" (the aggregate
    // of 14 stores + 4 DCs) vs bullet "four distribution centers". The
    // scope-noun map previously put "sites" in the location bucket; this
    // test pins the regression by confirming the check no longer flags it.
    const w = written({
      summary:
        'Operations leader managing over $100M in inventory across 18 sites.',
      selectedAccomplishments: [
        'Directed a network of four distribution centers and fourteen stores across five states.',
      ],
    });
    const issues = checkIntraResumeConsistency(w);
    expect(issues).toHaveLength(0);
  });

  it('different nouns in the same family are not independent', () => {
    // "stores" and "branches" both canonicalize to "store"; treat as same.
    const w = written({
      summary: 'Led three branches.',
      selectedAccomplishments: ['Directed three stores across the state.'],
    });
    const issues = checkIntraResumeConsistency(w);
    expect(issues).toHaveLength(0);
  });
});

describe('checkIntraResumeConsistency — multiple contradictions', () => {
  it('three different numbers for the same canonical noun → one issue citing all', () => {
    const w = written({
      summary: 'Multi-site operations leader managing three facilities.',
      selectedAccomplishments: [
        'Oversaw four distribution centers during the 2023 expansion.',
        'Managed five warehouses by the end of the program.',
      ],
    });
    const issues = checkIntraResumeConsistency(w);
    expect(issues).toHaveLength(1);
    expect(issues[0].message).toMatch(/3/);
    expect(issues[0].message).toMatch(/4/);
    expect(issues[0].message).toMatch(/5/);
  });

  it('contradictions on two different canonical nouns → two issues', () => {
    const w = written({
      summary: 'Led 12 stores and 85 staff across the region.',
      selectedAccomplishments: [
        'Expanded the network to 15 stores while maintaining a team of 75 employees.',
      ],
    });
    const issues = checkIntraResumeConsistency(w);
    expect(issues).toHaveLength(2);
    const nouns = issues.map((i) => i.message.match(/'([^']+)'/)?.[1]).sort();
    expect(nouns).toEqual(['headcount', 'store']);
  });
});

describe('checkIntraResumeConsistency — two-word noun handling', () => {
  it('"distribution centers" (two-word) canonicalizes the same as "DCs"', () => {
    const w = written({
      summary: 'Led four DCs across the state.',
      selectedAccomplishments: [
        'Operated a network of three distribution centers during the fiscal year.',
      ],
    });
    const issues = checkIntraResumeConsistency(w);
    expect(issues).toHaveLength(1);
    expect(issues[0].message).toMatch(/location/);
  });
});
