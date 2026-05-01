import type { AuthUser } from '../middleware/auth.js';
import { supabaseAdmin } from './supabase.js';
import logger from './logger.js';

export type AuthProvider = 'supabase' | 'clerk' | 'workos' | 'manual';
export type B2BOrgRole = 'owner' | 'admin' | 'coach' | 'employee';
export type B2BMembershipStatus = 'invited' | 'active' | 'suspended' | 'removed';

export interface PlatformIdentity {
  canonical_user_id: string;
  auth_provider: AuthProvider;
  provider_subject: string;
  email: string;
}

export interface B2BOrgMembership {
  id: string;
  org_id: string;
  user_id: string | null;
  email: string;
  role: B2BOrgRole;
  status: B2BMembershipStatus;
  auth_provider: AuthProvider;
  provider_subject: string | null;
  seat_id: string | null;
}

const MEMBER_SELECT = [
  'id',
  'org_id',
  'user_id',
  'email',
  'role',
  'status',
  'auth_provider',
  'provider_subject',
  'seat_id',
].join(', ');

export function normalizeIdentityEmail(email: string | null | undefined): string {
  return (email ?? '').trim().toLowerCase();
}

export function buildSupabaseIdentity(user: AuthUser): PlatformIdentity {
  return {
    canonical_user_id: user.id,
    auth_provider: 'supabase',
    provider_subject: user.id,
    email: normalizeIdentityEmail(user.email),
  };
}

export async function recordSupabaseIdentity(user: AuthUser): Promise<void> {
  const identity = buildSupabaseIdentity(user);
  if (!identity.email) return;

  try {
    const { error } = await supabaseAdmin
      .from('platform_auth_identities')
      .upsert(
        {
          canonical_user_id: identity.canonical_user_id,
          auth_provider: identity.auth_provider,
          provider_subject: identity.provider_subject,
          email: identity.email,
        },
        { onConflict: 'auth_provider,provider_subject' },
      );

    if (error) {
      logger.warn(
        { userId: user.id, code: error.code, message: error.message },
        'auth-context: failed to record Supabase identity',
      );
    }
  } catch (err) {
    logger.warn(
      { userId: user.id, err: err instanceof Error ? err.message : String(err) },
      'auth-context: identity bridge unavailable',
    );
  }
}

export async function getB2BOrgMembershipForUser(
  user: Pick<AuthUser, 'id' | 'email'>,
  orgId: string,
): Promise<B2BOrgMembership | null> {
  try {
    const { data: byUser, error: byUserError } = await supabaseAdmin
      .from('b2b_organization_members')
      .select(MEMBER_SELECT)
      .eq('org_id', orgId)
      .eq('user_id', user.id)
      .maybeSingle();

    if (byUserError) {
      logger.warn(
        { userId: user.id, orgId, code: byUserError.code, message: byUserError.message },
        'auth-context: membership lookup by user failed',
      );
    }

    if (byUser) return byUser as unknown as B2BOrgMembership;

    const email = normalizeIdentityEmail(user.email);
    if (!email) return null;

    const { data: byEmail, error: byEmailError } = await supabaseAdmin
      .from('b2b_organization_members')
      .select(MEMBER_SELECT)
      .eq('org_id', orgId)
      .eq('email', email)
      .maybeSingle();

    if (byEmailError) {
      logger.warn(
        { userId: user.id, orgId, code: byEmailError.code, message: byEmailError.message },
        'auth-context: membership lookup by email failed',
      );
    }

    return (byEmail as unknown as B2BOrgMembership | null) ?? null;
  } catch (err) {
    logger.warn(
      { userId: user.id, orgId, err: err instanceof Error ? err.message : String(err) },
      'auth-context: B2B membership bridge unavailable',
    );
    return null;
  }
}

export function membershipAllowsRole(
  membership: B2BOrgMembership | null,
  allowedRoles: readonly B2BOrgRole[],
): boolean {
  return membership?.status === 'active' && allowedRoles.includes(membership.role);
}
