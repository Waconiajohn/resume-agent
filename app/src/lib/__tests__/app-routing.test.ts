import { describe, expect, it } from 'vitest';
import {
  getAppView,
  getLegacyToolRedirect,
  getLegacyWorkspaceRedirect,
  getNormalizedWorkspaceRedirect,
  getToolSlugFromPath,
  getWorkspaceRoomFromSearch,
  resolveNavigationTarget,
} from '../app-routing';

describe('app-routing', () => {
  it('maps current paths to stable app views', () => {
    expect(getAppView('/workspace')).toBe('workspace');
    expect(getAppView('/tools/linkedin')).toBe('tools');
    expect(getAppView('/resume-builder/session')).toBe('resume-v2');
    expect(getAppView('/coach')).toBe('coach');
    expect(getAppView('/')).toBe('sales');
  });

  it('reads tool slugs and workspace rooms from URLs', () => {
    expect(getToolSlugFromPath('/tools/linkedin')).toBe('linkedin');
    expect(getToolSlugFromPath('/tools')).toBeUndefined();
    expect(getWorkspaceRoomFromSearch('?room=resume')).toBe('resume');
    expect(getWorkspaceRoomFromSearch('')).toBeUndefined();
  });

  it('normalizes legacy redirects and navigation targets', () => {
    expect(getLegacyWorkspaceRedirect('?room=career-profile')).toBe('/workspace?room=career-profile');
    expect(getLegacyWorkspaceRedirect('')).toBe('/workspace');
    expect(getNormalizedWorkspaceRedirect('?room=salary-negotiation')).toBe('/workspace?room=interview&focus=negotiation');
    expect(getNormalizedWorkspaceRedirect('?room=personal-brand&job=123')).toBe('/workspace?room=career-profile&job=123');
    expect(getNormalizedWorkspaceRedirect('?room=network-intelligence')).toBe('/workspace?room=networking');
    expect(getNormalizedWorkspaceRedirect('?room=case-study')).toBe('/workspace?room=executive-bio&focus=case-study');
    expect(getNormalizedWorkspaceRedirect('?room=resume')).toBeNull();
    expect(getLegacyToolRedirect('linkedin')).toBe('/workspace?room=linkedin');
    expect(getLegacyToolRedirect('cover-letter')).toBe('/workspace?room=resume&focus=cover-letter');
    expect(resolveNavigationTarget('workspace')).toBe('/workspace');
    expect(resolveNavigationTarget('tools')).toBe('/workspace');
    expect(resolveNavigationTarget('/dashboard')).toBe('/workspace');
    expect(resolveNavigationTarget('/tools/linkedin')).toBe('/workspace?room=linkedin');
    expect(resolveNavigationTarget('resume-v2')).toBe('/resume-builder/session');
    expect(resolveNavigationTarget('/resume-builder/session')).toBe('/resume-builder/session');
  });
});
