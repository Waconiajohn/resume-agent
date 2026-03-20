import { describe, expect, it } from 'vitest';
import { isExposedWorkspaceRoom, toExposedWorkspaceRoom } from '@/components/career-iq/workspaceRoomAccess';

describe('workspaceRoomAccess', () => {
  it('keeps core workspace rooms routable', () => {
    expect(toExposedWorkspaceRoom('resume')).toBe('resume');
    expect(toExposedWorkspaceRoom('salary-negotiation')).toBe('salary-negotiation');
  });

  it('redirects legacy aliases into exposed rooms', () => {
    expect(toExposedWorkspaceRoom('personal-brand')).toBe('career-profile');
    expect(toExposedWorkspaceRoom('thank-you-note')).toBe('interview');
  });

  it('hides weak workspace rooms from direct entry', () => {
    expect(toExposedWorkspaceRoom('executive-bio')).toBe('dashboard');
    expect(toExposedWorkspaceRoom('networking')).toBe('dashboard');
    expect(toExposedWorkspaceRoom('financial')).toBe('dashboard');
  });

  it('only marks exposed rooms as first-class navigation targets', () => {
    expect(isExposedWorkspaceRoom('resume')).toBe(true);
    expect(isExposedWorkspaceRoom('executive-bio')).toBe(false);
    expect(isExposedWorkspaceRoom('personal-brand')).toBe(false);
  });
});
