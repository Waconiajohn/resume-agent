/**
 * Lock-down tests for the shared auth-event types.
 *
 * The types live in app/src/types/auth-events.ts and must stay in
 * sync with the CHECK constraint on public.auth_audit_log (see the
 * 20260426000001_auth_audit_log + 20260426000004_auth_audit_log_signed_in_failed
 * migrations) AND with server/src/lib/auth-events.ts.
 *
 * If you add a new event type, all three places must learn about it
 * or one of these assertions will break first.
 */

import { describe, it, expect } from 'vitest';
import { AUTH_EVENT_TYPES, AUTH_EVENT_LABELS } from '@/types/auth-events';

describe('auth-events shared types', () => {
  it('every type has a friendly label', () => {
    for (const t of AUTH_EVENT_TYPES) {
      expect(AUTH_EVENT_LABELS[t]).toBeTruthy();
    }
  });

  it('label keys are exactly the type set (no orphan labels, no missing)', () => {
    const labelKeys = Object.keys(AUTH_EVENT_LABELS).sort();
    const typeList = [...AUTH_EVENT_TYPES].sort();
    expect(labelKeys).toEqual(typeList);
  });

  it('contains the canonical event types the audit log accepts', () => {
    // This list mirrors the CHECK constraint on public.auth_audit_log;
    // editing one without the other will break audit-log inserts.
    expect([...AUTH_EVENT_TYPES].sort()).toEqual([
      'mfa_challenge_failed',
      'mfa_challenge_passed',
      'mfa_enrolled',
      'password_changed',
      'password_recovery_started',
      'signed_in',
      'signed_in_failed',
      'signed_out',
      'user_updated',
    ]);
  });
});
