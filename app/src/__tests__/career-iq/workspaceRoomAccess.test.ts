import { describe, expect, it } from 'vitest';
import { isExposedWorkspaceRoom, resolveWorkspaceRoom, toExposedWorkspaceRoom } from '@/components/career-iq/workspaceRoomAccess';

describe('workspaceRoomAccess', () => {
  it('keeps core workspace rooms routable', () => {
    expect(toExposedWorkspaceRoom('resume')).toBe('resume');
    expect(toExposedWorkspaceRoom('salary-negotiation')).toBe('interview');
  });

  it('redirects legacy aliases into exposed rooms', () => {
    expect(toExposedWorkspaceRoom('personal-brand')).toBe('career-profile');
    expect(toExposedWorkspaceRoom('thank-you-note')).toBe('interview');
    expect(resolveWorkspaceRoom('network-intelligence')).toBe('networking');
    expect(resolveWorkspaceRoom('case-study')).toBe('career-profile');
  });

  it('keeps hidden rooms routable while hiding them from main nav', () => {
    expect(resolveWorkspaceRoom('financial')).toBe('financial');
    expect(toExposedWorkspaceRoom('networking')).toBe('networking');
    expect(toExposedWorkspaceRoom('financial')).toBe('dashboard');
  });

  it('promotes executive-bio to a first-class navigation target (Sprint D1)', () => {
    expect(resolveWorkspaceRoom('executive-bio')).toBe('executive-bio');
    expect(toExposedWorkspaceRoom('executive-bio')).toBe('executive-bio');
    expect(isExposedWorkspaceRoom('executive-bio')).toBe(true);
  });

  it('only marks exposed rooms as first-class navigation targets', () => {
    expect(isExposedWorkspaceRoom('resume')).toBe(true);
    expect(isExposedWorkspaceRoom('personal-brand')).toBe(false);
  });
});
