import { describe, expect, it } from 'vitest';
import { buildCareerProfileSummary } from '../career-profile-summary';
import type { WhyMeStory, WhyMeSignals } from '../useWhyMeStory';

function makeStory(overrides: Partial<WhyMeStory> = {}): WhyMeStory {
  return {
    colleaguesCameForWhat: 'People pull me into ambiguous transformations where strategy and execution need to move together.',
    knownForWhat: 'I build operating rhythms that help cross-functional teams ship measurable change without drama.',
    whyNotMe: 'I do not have the exact title yet, but I have already led the same kind of scope in adjacent environments.',
    ...overrides,
  };
}

function makeSignals(overrides: Partial<WhyMeSignals> = {}): WhyMeSignals {
  return {
    clarity: 'green',
    alignment: 'green',
    differentiation: 'green',
    ...overrides,
  };
}

describe('buildCareerProfileSummary', () => {
  it('marks a strong profile as ready for execution work', () => {
    const summary = buildCareerProfileSummary(makeStory(), makeSignals(), 'strong');

    expect(summary.readinessLabel).toBe('Platform-ready');
    expect(summary.nextRecommendedRoom).toBe('resume');
    expect(summary.highlightPoints).toHaveLength(3);
  });

  it('keeps unfinished profiles focused on Career Profile completion', () => {
    const summary = buildCareerProfileSummary(
      makeStory({
        whyNotMe: '',
      }),
      makeSignals({
        differentiation: 'red',
      }),
      'refining',
    );

    expect(summary.readinessLabel).toBe('Needs refinement');
    expect(summary.nextRecommendedRoom).toBe('career-profile');
    expect(summary.focusAreas).toContain('Strengthen the proof of why you are a better-fit candidate.');
  });
});
