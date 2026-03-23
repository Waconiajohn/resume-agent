import { describe, expect, it } from 'vitest';

import {
  buildRequirementClarifyingQuestion,
  buildRequirementFallbackQuestion,
  buildRequirementFallbackResponse,
  buildRequirementInterviewQuestion,
  buildRequirementInterviewQuestionLookingFor,
  buildRequirementInterviewQuestionRationale,
  buildRequirementProofAction,
  detectRequirementCoachingFamilies,
  getRequirementCoachingPolicySnapshot,
  isGenericClarifyingQuestion,
  looksLikeRequirementRewrite,
  looksLikeTargetedRequirementQuestion,
} from '../contracts/requirement-coaching-policy.js';

describe('requirement coaching policy', () => {
  it('classifies metrics requirements and provides targeted coaching', () => {
    const requirement = 'Develop and track performance metrics';

    expect(detectRequirementCoachingFamilies(requirement)).toContain('metrics');
    expect(buildRequirementClarifyingQuestion(requirement)).toContain('Which metrics or scorecards did you personally track');
    expect(buildRequirementProofAction(requirement, true)).toContain('If you have this experience, add one concrete example showing which metrics or scorecards');
  });

  it('uses evidence-aware fallback questions for partial proof', () => {
    const question = buildRequirementFallbackQuestion({
      requirement: 'Develop and track performance metrics',
      classification: 'partial',
      evidence: ['Tracked weekly throughput metrics and improved fill rate by 14% across the platform.'],
      jobDescriptionExcerpt: 'Develop and track performance metrics',
    });

    expect(question).toContain('Your resume already shows "Tracked weekly throughput metrics');
    expect(question).toContain('Which metrics or scorecards did you personally track');
  });

  it('builds prefixed interview questions for upstream coaching without inventing scripts', () => {
    const question = buildRequirementInterviewQuestion({
      requirement: 'Build and develop operations leadership pipeline',
      evidenceSnippet: 'Developed plant managers and promoted two site leaders into regional roles.',
      companyReference: 'VP Operations at Acme',
    });

    expect(question).toContain('Your resume already shows "Developed plant managers');
    expect(question).toContain('How many people did you lead, hire, coach, or promote');
  });

  it('provides shared rationale and looking-for guidance for interview questions', () => {
    expect(buildRequirementInterviewQuestionRationale('Develop and track performance metrics')).toContain('review cadence');
    expect(buildRequirementInterviewQuestionLookingFor('Develop and track performance metrics')).toContain('Named metrics');
    expect(buildRequirementInterviewQuestionLookingFor('PMP certification required', true)).toContain('credential');
  });

  it('builds missing-proof fallback responses without drafting unsupported language', () => {
    const response = buildRequirementFallbackResponse({
      requirement: 'Lead post-acquisition integration workstreams',
      classification: 'missing',
      evidence: [],
    });

    expect(response).toContain('does not show direct proof');
    expect(response).toContain('before I should draft resume language');
  });

  it('rejects label-style rewrites and accepts grounded resume lines', () => {
    expect(looksLikeRequirementRewrite('Related performance metrics expertise')).toBe(false);
    expect(looksLikeRequirementRewrite('Tracked weekly performance scorecards that improved fill rate by 14% across the network.')).toBe(true);
  });

  it('rejects generic questions and accepts targeted requirement questions', () => {
    const requirement = 'Develop and track performance metrics';

    expect(looksLikeTargetedRequirementQuestion('Tell me about any experience you have related to developing and tracking performance metrics.', requirement)).toBe(false);
    expect(looksLikeTargetedRequirementQuestion('Which metrics or scorecards did you personally track, how often did you review them, and what decision or improvement did they drive?', requirement)).toBe(true);
    expect(isGenericClarifyingQuestion('Can you tell me more about this requirement?')).toBe(true);
  });

  it('provides a policy snapshot without turning the module into a scripted workflow', () => {
    const snapshot = getRequirementCoachingPolicySnapshot('Operate successfully in a PE-backed environment');

    expect(snapshot.primaryFamily).toBe('peBacked');
    expect(snapshot.families).toContain('peBacked');
    expect(snapshot.clarifyingQuestion).toContain('PE-backed environment');
    expect(snapshot.proofActionDirect).toContain('value-creation result');
    expect(snapshot.rationale).toContain('operating context');
    expect(snapshot.lookingFor).toContain('Private-equity operating context');
  });
});
