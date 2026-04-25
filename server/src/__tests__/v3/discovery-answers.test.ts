import { describe, expect, it } from 'vitest';
import { appendDiscoveryAnswersToResumeText } from '../../v3/pipeline/discovery-answers.js';

describe('appendDiscoveryAnswersToResumeText', () => {
  it('returns the original resume when there are no usable answers', () => {
    const resume = 'Michael Donovan\nVP Operations resume text';

    expect(appendDiscoveryAnswersToResumeText(resume, undefined)).toBe(resume);
    expect(appendDiscoveryAnswersToResumeText(resume, [])).toBe(resume);
    expect(
      appendDiscoveryAnswersToResumeText(resume, [
        { requirement: 'SAP experience', question: 'SAP?', answer: '   ' },
      ]),
    ).toBe(resume);
  });

  it('appends candidate answers as a clearly labeled source section', () => {
    const result = appendDiscoveryAnswersToResumeText('Resume text', [
      {
        requirement: 'SAP experience',
        question: 'Have you worked directly in SAP?',
        answer: 'Used SAP MM reports weekly during the 2021 inventory migration.',
        level: 'candidate_discovery_needed',
        risk: 'high',
        sourceSignal: 'Oracle ERP rollout',
        recommendedFraming: 'Treat as adjacent ERP until SAP is confirmed.',
      },
    ]);

    expect(result).toContain('DISCOVERY ANSWERS PROVIDED BY CANDIDATE');
    expect(result).toContain('Requirement: SAP experience');
    expect(result).toContain('Question: Have you worked directly in SAP?');
    expect(result).toContain('Answer: Used SAP MM reports weekly');
    expect(result).toContain('Evidence level before answer: candidate_discovery_needed');
    expect(result).toContain('Original risk: high');
    expect(result).toContain('Original source signal: Oracle ERP rollout');
  });
});
