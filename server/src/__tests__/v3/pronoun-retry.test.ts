// Unit tests for post-write pronoun detection (Fix 4, 2026-04-19).
// The detector is pure (no LLM); these tests cover the regex + "who"
// heuristic end-to-end.

import { describe, expect, it } from 'vitest';
import {
  BANNED_PRONOUNS,
  buildPronounRetryAddendum,
  detectBannedPronouns,
} from '../../v3/write/pronoun-retry.js';

describe('detectBannedPronouns — personal pronouns', () => {
  it('flags banned personal pronouns as whole-word matches', () => {
    expect(detectBannedPronouns('She directed a team.').found).toContain('she');
    expect(detectBannedPronouns('He led the migration.').found).toContain('he');
    expect(detectBannedPronouns('Her platform strategy...').found).toContain('her');
    expect(detectBannedPronouns('Their KPI framework...').found).toContain('their');
    expect(detectBannedPronouns('I delivered $26M.').found).toContain('i');
    expect(detectBannedPronouns('My work included...').found).toContain('my');
  });

  it('returns empty list on clean text', () => {
    expect(detectBannedPronouns('Led a team of 85 engineers.').found).toEqual([]);
    expect(detectBannedPronouns('Delivered $26M in ROI by standardizing CI/CD.').found).toEqual([]);
  });

  it('is case-insensitive', () => {
    expect(detectBannedPronouns('SHE led the team').found).toContain('she');
    expect(detectBannedPronouns('HER team shipped').found).toContain('her');
  });

  it('does not flag common-noun homographs of banned words', () => {
    // "us" in "campus" or "minus" should not count.
    expect(detectBannedPronouns('Led campus deployments.').found).toEqual([]);
  });

  it('deduplicates multiple occurrences of the same pronoun', () => {
    const result = detectBannedPronouns('She led the team. She shipped.');
    const sheCount = result.found.filter((p) => p === 'she').length;
    expect(sheCount).toBe(1);
  });
});

describe('detectBannedPronouns — "who" heuristic', () => {
  it('flags "who" when it opens a framing sentence about the candidate', () => {
    const txt = 'Operations executive who consolidates multi-site networks through automation.';
    expect(detectBannedPronouns(txt).found).toContain('who');
  });

  it('does NOT flag "who" when preceded by a plural-noun referent', () => {
    const txt = 'Built a platform for customers who purchased the premium tier.';
    expect(detectBannedPronouns(txt).found).not.toContain('who');
  });

  it('does NOT flag "who" when preceded by "teams"', () => {
    const txt = 'Led engineering teams who shipped quarterly releases across three continents.';
    expect(detectBannedPronouns(txt).found).not.toContain('who');
  });

  it('flags "who" at the start of later sentences too', () => {
    const txt =
      'Delivered $26M in savings. Operations executive who scales multi-site networks.';
    expect(detectBannedPronouns(txt).found).toContain('who');
  });

  it('does not flag "who" buried deep in a sentence', () => {
    // "who" at char 120 of a sentence won't be flagged by the 80-char head rule.
    const txt =
      'Led a large-scale modernization program across the organization over several years working with stakeholders who owned the downstream systems.';
    expect(detectBannedPronouns(txt).found).not.toContain('who');
  });
});

describe('buildPronounRetryAddendum', () => {
  it('mentions every pronoun found in the first call', () => {
    const addendum = buildPronounRetryAddendum(['her', 'who']);
    expect(addendum).toContain('"her"');
    expect(addendum).toContain('"who"');
  });

  it('includes the em-dash framing example', () => {
    const addendum = buildPronounRetryAddendum(['who']);
    expect(addendum).toContain('Multi-site consolidator — transforms');
  });
});

describe('BANNED_PRONOUNS list integrity', () => {
  it('contains the core third-person feminine/masculine pronouns', () => {
    for (const p of ['she', 'her', 'hers', 'he', 'him', 'his']) {
      expect(BANNED_PRONOUNS.has(p)).toBe(true);
    }
  });

  it('contains first-person pronouns', () => {
    for (const p of ['i', 'me', 'my', 'we', 'us', 'our']) {
      expect(BANNED_PRONOUNS.has(p)).toBe(true);
    }
  });

  it('does NOT contain "who"', () => {
    // "who" has its own heuristic branch; keeping it out of BANNED_PRONOUNS
    // prevents it from being flagged unconditionally.
    expect(BANNED_PRONOUNS.has('who')).toBe(false);
  });
});
