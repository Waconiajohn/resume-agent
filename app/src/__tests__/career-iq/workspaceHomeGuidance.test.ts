import { describe, expect, it } from 'vitest';
import { deriveWorkspaceHomeGuidance } from '@/components/career-iq/workspaceHomeGuidance';

describe('workspaceHomeGuidance', () => {
  it('sends new users to Career Profile first', () => {
    const guidance = deriveWorkspaceHomeGuidance({
      dashboardState: 'new-user',
      hasResumeSessions: false,
      sessionCount: 0,
    });

    expect(guidance.primary.room).toBe('career-profile');
    expect(guidance.secondary).toBeUndefined();
  });

  it('sends ready users without saved work to Resume Builder first', () => {
    const guidance = deriveWorkspaceHomeGuidance({
      dashboardState: 'strong',
      hasResumeSessions: false,
      sessionCount: 0,
    });

    expect(guidance.primary.room).toBe('resume');
    expect(guidance.secondary?.room).toBe('jobs');
  });

  it('uses a coach-backed live-search step when saved work already exists', () => {
    const guidance = deriveWorkspaceHomeGuidance({
      dashboardState: 'strong',
      hasResumeSessions: true,
      sessionCount: 3,
      coachRecommendation: {
        action: 'Review the live pipeline and choose the role closest to interview.',
        product: 'job search',
        room: 'jobs',
        urgency: 'immediate',
        phase: 'active_search',
        phase_label: 'Active Search',
        rationale: 'The user already has strong assets and should work the live pipeline.',
      },
    });

    expect(guidance.primary.room).toBe('jobs');
    expect(guidance.secondary?.room).toBe('resume');
    expect(guidance.coachLine).toContain('Review the live pipeline');
  });
});
