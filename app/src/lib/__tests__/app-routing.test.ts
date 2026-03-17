import { describe, expect, it } from 'vitest';
import {
  getAppView,
  getLegacyWorkspaceRedirect,
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
    expect(resolveNavigationTarget('workspace')).toBe('/workspace');
    expect(resolveNavigationTarget('/dashboard')).toBe('/workspace?room=resume');
    expect(resolveNavigationTarget('/tools/linkedin')).toBe('/tools/linkedin');
    expect(resolveNavigationTarget('resume-v2')).toBe('/resume-builder/session');
  });
});
