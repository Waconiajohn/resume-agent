import { describe, expect, it } from 'vitest';

import {
  resolveInterviewLabRouteState,
  resolveInterviewLabSessionTargets,
} from '@/components/career-iq/interview-lab/interviewLabRouting';

describe('interviewLabRouting', () => {
  it('routes plan focus into documents with the ninety-day-plan view', () => {
    expect(resolveInterviewLabRouteState('plan')).toEqual({
      activeSection: 'documents',
      documentsView: 'ninety_day_plan',
      followUpView: 'overview',
    });
  });

  it('routes thank-you focus into the follow-up thank-you view', () => {
    expect(resolveInterviewLabRouteState('thank-you')).toEqual({
      activeSection: 'follow_up',
      documentsView: 'overview',
      followUpView: 'thank_you',
    });
  });

  it('falls back to the prep overview for unknown focus values', () => {
    expect(resolveInterviewLabRouteState('not-a-real-focus')).toEqual({
      activeSection: 'prep',
      documentsView: 'overview',
      followUpView: 'overview',
    });
  });

  it('maps saved asset sessions to the matching interview-lab tool only', () => {
    expect(resolveInterviewLabSessionTargets('negotiation', 'session-123')).toEqual({
      negotiationSessionId: 'session-123',
    });
    expect(resolveInterviewLabSessionTargets('plan', 'session-456')).toEqual({
      planSessionId: 'session-456',
    });
  });
});
