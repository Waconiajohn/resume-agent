/**
 * @vitest-environment jsdom
 */

import { describe, expect, it } from 'vitest';
import {
  buildAuthScopedStorageKey,
  buildAuthScopedSessionStorageKey,
  decodeUserIdFromAccessToken,
  normalizeStorageUserId,
  removeLocalStorageKeysWithPrefix,
} from '@/lib/auth-scoped-storage';

function makeAccessToken(userId: string): string {
  const payload = btoa(JSON.stringify({ sub: userId }))
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/g, '');
  return `header.${payload}.signature`;
}

describe('auth-scoped storage helpers', () => {
  it('falls back to the anonymous scope when no user id is present', () => {
    expect(normalizeStorageUserId(null)).toBe('anon');
    expect(buildAuthScopedStorageKey('careeriq_interview_history', null)).toBe('careeriq_interview_history:anon');
  });

  it('builds scoped keys with item identifiers', () => {
    expect(buildAuthScopedStorageKey('resume-agent:v2-draft', 'user-1', 'session-99'))
      .toBe('resume-agent:v2-draft:user-1:session-99');
    expect(buildAuthScopedSessionStorageKey('coach_recommendation', 'user-1'))
      .toBe('coach_recommendation:user-1');
  });

  it('decodes the user id from a JWT access token payload', () => {
    expect(decodeUserIdFromAccessToken(makeAccessToken('user-42'))).toBe('user-42');
  });

  it('returns null for malformed access tokens', () => {
    expect(decodeUserIdFromAccessToken('not-a-jwt')).toBeNull();
  });

  it('removes only localStorage entries with the requested prefix', () => {
    window.localStorage.setItem('scope:user-1:item-1', 'one');
    window.localStorage.setItem('scope:user-1:item-2', 'two');
    window.localStorage.setItem('scope:user-2:item-1', 'three');

    removeLocalStorageKeysWithPrefix('scope:user-1:');

    expect(window.localStorage.getItem('scope:user-1:item-1')).toBeNull();
    expect(window.localStorage.getItem('scope:user-1:item-2')).toBeNull();
    expect(window.localStorage.getItem('scope:user-2:item-1')).toBe('three');
  });
});
