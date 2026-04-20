// Unit tests for post-write forbidden-phrase detection (Ship 2026-04-20).
// The detector is pure (no LLM); these tests cover the regex set against
// every recurrence from the UX-test fixtures that motivated the feature.

import { describe, expect, it } from 'vitest';
import {
  FORBIDDEN_PHRASES,
  buildForbiddenPhraseRetryAddendum,
  detectForbiddenPhrases,
} from '../../v3/write/forbidden-phrase-retry.js';

describe('detectForbiddenPhrases — recurring UX-test tells', () => {
  it('flags "with a track record" (jessica-boquist summary)', () => {
    const text =
      'SaaS product growth and retention leader with a track record scaling multi-product portfolios.';
    expect(detectForbiddenPhrases(text).foundIds).toContain('track-record');
  });

  it('flags "with a track record of" (joel-hough summary adjacent phrasing)', () => {
    const text = 'Multi-site operations leader with a track record of scaling distribution networks.';
    expect(detectForbiddenPhrases(text).foundIds).toContain('track-record');
  });

  it('flags "brings a track record of"', () => {
    const text = 'Brings a track record of P&L ownership across four portfolios.';
    expect(detectForbiddenPhrases(text).foundIds).toContain('track-record');
  });

  it('flags "proven track record"', () => {
    const text = 'Proven track record of scaling SaaS products.';
    expect(detectForbiddenPhrases(text).foundIds).toContain('proven-track-record');
  });

  it('flags "Orchestrated" as a bullet verb (jessica-boquist accomplishment 5)', () => {
    const text =
      'Orchestrated the development and implementation of complex behavior-driven ecommerce programs.';
    expect(detectForbiddenPhrases(text).foundIds).toContain('orchestrated');
  });

  it('flags "Spearheaded" and "Leveraged" as bullet verbs', () => {
    expect(detectForbiddenPhrases('Spearheaded a modernization initiative.').foundIds)
      .toContain('spearheaded');
    expect(detectForbiddenPhrases('Leveraged the JTBD framework.').foundIds)
      .toContain('leveraged');
  });

  it('flags "utilizing" and "utilize" (jessica-boquist bullet 4)', () => {
    const a = 'Achieved 97% annual retention by utilizing the JTBD framework.';
    const b = 'Will utilize cross-functional teams to deliver.';
    expect(detectForbiddenPhrases(a).foundIds).toContain('utilize');
    expect(detectForbiddenPhrases(b).foundIds).toContain('utilize');
  });

  it('flags "transformative" / "transformational" as an adjective', () => {
    const a = 'Led cross-functional teams through transformative growth.';
    const b = 'Drove transformational change across four portfolios.';
    expect(detectForbiddenPhrases(a).foundIds).toContain('transformative');
    expect(detectForbiddenPhrases(b).foundIds).toContain('transformative');
  });

  it('flags "thought leader" / "thought leadership" (jessica-boquist Johnson Controls)', () => {
    const a = 'Positioning OpenBlue Workplace as a thought leader in the industry.';
    const b = 'Established thought leadership in AI-driven workflow.';
    expect(detectForbiddenPhrases(a).foundIds).toContain('thought-leader');
    expect(detectForbiddenPhrases(b).foundIds).toContain('thought-leader');
  });

  it('flags "results-driven"', () => {
    expect(detectForbiddenPhrases('Results-driven executive.').foundIds)
      .toContain('results-driven');
    expect(detectForbiddenPhrases('Results driven executive.').foundIds)
      .toContain('results-driven');
  });

  it('flags "passion for excellence" / "passionate about"', () => {
    expect(detectForbiddenPhrases('Passion for excellence in product delivery.').foundIds)
      .toContain('passion-for-excellence');
    expect(detectForbiddenPhrases('Passionate about building teams.').foundIds)
      .toContain('passion-for-excellence');
  });

  it('flags "driving operational excellence"', () => {
    const text = 'Directed four portfolios while driving operational excellence across regions.';
    expect(detectForbiddenPhrases(text).foundIds).toContain('driving-operational-excellence');
  });

  it('flags "setting the standard for" / "raising the bar"', () => {
    expect(detectForbiddenPhrases('Setting the standard for compliance.').foundIds)
      .toContain('setting-the-standard');
    expect(detectForbiddenPhrases('Raising the bar on execution.').foundIds)
      .toContain('setting-the-standard');
  });

  it('flags "establishing a culture of [anything]"', () => {
    expect(
      detectForbiddenPhrases('Establishing a culture of accountability.').foundIds,
    ).toContain('establishing-a-culture');
    expect(
      detectForbiddenPhrases('Fostering an environment of continuous learning.').foundIds,
    ).toContain('establishing-a-culture');
    expect(
      detectForbiddenPhrases('Building a foundation for long-term growth.').foundIds,
    ).toContain('establishing-a-culture');
  });

  it('flags "expanding brand reach" and "market penetration"', () => {
    expect(detectForbiddenPhrases('Expanding brand reach across three regions.').foundIds)
      .toContain('brand-reach');
    expect(detectForbiddenPhrases('Achieved market penetration in 18 new markets.').foundIds)
      .toContain('brand-reach');
  });

  it('flags "translating X into actionable Y"', () => {
    const text = 'Translating strategy into actionable initiatives across the org.';
    expect(detectForbiddenPhrases(text).foundIds).toContain('translating-actionable');
  });
});

describe('detectForbiddenPhrases — clean text should not flag', () => {
  it('does not flag "operational" on its own', () => {
    expect(detectForbiddenPhrases('Improved operational efficiency by 28%.').foundIds).toEqual([]);
  });

  it('does not flag "record" in a non-"track record" context', () => {
    expect(detectForbiddenPhrases('Set a quarterly sales record of $32M.').foundIds).toEqual([]);
  });

  it('does not flag "transform" as a verb', () => {
    // "transform" should pass; only transformative/transformational are banned.
    expect(detectForbiddenPhrases('Transformed the PM function.').foundIds).toEqual([]);
  });

  it('does not flag "thought" in a non-leader context', () => {
    expect(detectForbiddenPhrases('Worked through a thought experiment.').foundIds).toEqual([]);
  });

  it('does not flag "culture" in a concrete outcome', () => {
    expect(detectForbiddenPhrases('Shifted engineering culture via code review practice.').foundIds)
      .toEqual([]);
  });

  it('returns empty for pure-numeric, specific bullet text', () => {
    const text =
      'Delivered a $32M automation program across five sites and ten production lines, achieving 19% margin above target and 94% on-time delivery.';
    expect(detectForbiddenPhrases(text).foundIds).toEqual([]);
  });
});

describe('detectForbiddenPhrases — deduplication + ordering', () => {
  it('deduplicates repeated matches of the same phrase id', () => {
    const text =
      'Orchestrated launch one. Orchestrated launch two. Orchestrated launch three.';
    const result = detectForbiddenPhrases(text);
    expect(result.foundIds.filter((id) => id === 'orchestrated')).toHaveLength(1);
  });

  it('surfaces all distinct ids when multiple categories hit', () => {
    const text =
      'Results-driven executive with a track record orchestrated across regions.';
    const ids = detectForbiddenPhrases(text).foundIds;
    expect(ids).toContain('results-driven');
    expect(ids).toContain('track-record');
    expect(ids).toContain('orchestrated');
  });
});

describe('buildForbiddenPhraseRetryAddendum', () => {
  it('names every phrase found and includes a replacement example', () => {
    const addendum = buildForbiddenPhraseRetryAddendum(['orchestrated', 'track-record']);
    expect(addendum).toContain('"Orchestrated"');
    expect(addendum).toContain('"track record"');
    // Example framing from the registry should appear.
    expect(addendum).toMatch(/Led \/ Delivered \/ Ran/);
  });

  it('renders with bullet-point formatting', () => {
    const addendum = buildForbiddenPhraseRetryAddendum(['utilize']);
    expect(addendum).toContain('  • ');
    expect(addendum).toContain('RETRY — forbidden-phrase violation');
  });
});

describe('FORBIDDEN_PHRASES registry integrity', () => {
  it('has unique ids', () => {
    const ids = FORBIDDEN_PHRASES.map((p) => p.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('every pattern is case-insensitive', () => {
    for (const p of FORBIDDEN_PHRASES) {
      expect(p.pattern.flags).toContain('i');
    }
  });
});
