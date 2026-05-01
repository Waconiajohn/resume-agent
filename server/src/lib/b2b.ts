/**
 * B2B Outplacement — data access layer
 * Phase 7, Story 7-1
 *
 * Owns CRUD for the four B2B tables:
 *   b2b_organizations, b2b_contracts, b2b_employee_cohorts, b2b_seats
 *
 * Privacy boundary: aggregate metrics only at the org/cohort level.
 * No personal resume content, session transcripts, or AI output is
 * exposed through any function in this file.
 *
 * All queries use supabaseAdmin (service role) — the admin portal is
 * entirely server-side. The only exception is the RLS policy on b2b_seats
 * that lets an authenticated employee read their own seat record.
 */

import { supabaseAdmin } from './supabase.js';
import logger from './logger.js';
import type { AuthProvider, B2BMembershipStatus, B2BOrgRole } from './auth-context.js';
import { normalizeIdentityEmail } from './auth-context.js';

// ─── Types ────────────────────────────────────────────────────────────────────

export interface B2BOrganization {
  id: string;
  name: string;
  slug: string;
  logo_url: string | null;
  primary_color: string;
  secondary_color: string;
  custom_welcome_message: string | null;
  custom_resources: Array<{ title: string; url: string; description: string }>;
  sso_provider: 'okta' | 'azure_ad' | 'google' | null;
  sso_config: Record<string, unknown>;
  admin_email: string;
  admin_name: string;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

export type ContractTier = 'standard' | 'plus' | 'concierge';
export type ContractStatus = 'active' | 'paused' | 'terminated' | 'expired';
export type SeatStatus = 'provisioned' | 'active' | 'completed' | 'expired';

export interface B2BOrganizationMember {
  id: string;
  org_id: string;
  user_id: string | null;
  email: string;
  role: B2BOrgRole;
  status: B2BMembershipStatus;
  auth_provider: AuthProvider;
  provider_subject: string | null;
  seat_id: string | null;
  created_at: string;
  updated_at: string;
}

export interface B2BContract {
  id: string;
  org_id: string;
  tier: ContractTier;
  price_per_seat_cents: number;
  total_seats: number;
  used_seats: number;
  start_date: string;
  end_date: string | null;
  sla_response_hours: number;
  includes_human_coach: boolean;
  status: ContractStatus;
  created_at: string;
  updated_at: string;
}

export interface B2BSeat {
  id: string;
  org_id: string;
  contract_id: string;
  user_id: string | null;
  employee_email: string;
  employee_name: string | null;
  cohort_id: string | null;
  status: SeatStatus;
  provisioned_at: string;
  activated_at: string | null;
  completed_at: string | null;
  last_login_at: string | null;
  total_sessions: number;
  agents_used: string[];
  created_at: string;
  updated_at: string;
}

export interface B2BCohort {
  id: string;
  org_id: string;
  name: string;
  description: string | null;
  total_employees: number;
  active_employees: number;
  placed_employees: number;
  avg_days_to_placement: number | null;
  created_at: string;
  updated_at: string;
}

// ─── Organization CRUD ────────────────────────────────────────────────────────

export async function createOrganization(input: {
  name: string;
  slug: string;
  admin_email: string;
  admin_name: string;
  logo_url?: string;
  primary_color?: string;
  secondary_color?: string;
  custom_welcome_message?: string;
}): Promise<B2BOrganization | null> {
  const { data, error } = await supabaseAdmin
    .from('b2b_organizations')
    .insert(input)
    .select()
    .single();

  if (error) {
    logger.warn({ error: error.message }, 'B2B: failed to create organization');
    return null;
  }
  return data as B2BOrganization;
}

export async function getOrganization(orgId: string): Promise<B2BOrganization | null> {
  const { data, error } = await supabaseAdmin
    .from('b2b_organizations')
    .select('*')
    .eq('id', orgId)
    .single();

  if (error) return null;
  return data as B2BOrganization;
}

export async function getOrganizationBySlug(slug: string): Promise<B2BOrganization | null> {
  const { data, error } = await supabaseAdmin
    .from('b2b_organizations')
    .select('*')
    .eq('slug', slug)
    .single();

  if (error) return null;
  return data as B2BOrganization;
}

export async function updateOrganization(
  orgId: string,
  updates: Partial<
    Pick<
      B2BOrganization,
      | 'name'
      | 'logo_url'
      | 'primary_color'
      | 'secondary_color'
      | 'custom_welcome_message'
      | 'custom_resources'
      | 'is_active'
    >
  >,
): Promise<B2BOrganization | null> {
  const { data, error } = await supabaseAdmin
    .from('b2b_organizations')
    .update(updates)
    .eq('id', orgId)
    .select()
    .single();

  if (error) {
    logger.warn({ error: error.message, orgId }, 'B2B: failed to update organization');
    return null;
  }
  return data as B2BOrganization;
}

// ─── Organization Memberships ────────────────────────────────────────────────

export async function createOrganizationMember(input: {
  org_id: string;
  email: string;
  role: B2BOrgRole;
  status?: B2BMembershipStatus;
  user_id?: string | null;
  auth_provider?: AuthProvider;
  provider_subject?: string | null;
  seat_id?: string | null;
}): Promise<B2BOrganizationMember | null> {
  const normalizedEmail = normalizeIdentityEmail(input.email);
  if (!normalizedEmail) {
    logger.warn({ orgId: input.org_id, role: input.role }, 'B2B: cannot create member without email');
    return null;
  }

  try {
    const { data, error } = await supabaseAdmin
      .from('b2b_organization_members')
      .insert({
        org_id: input.org_id,
        user_id: input.user_id ?? null,
        email: normalizedEmail,
        role: input.role,
        status: input.status ?? 'invited',
        auth_provider: input.auth_provider ?? 'manual',
        provider_subject: input.provider_subject ?? null,
        seat_id: input.seat_id ?? null,
      })
      .select()
      .single();

    if (error) {
      logger.warn(
        { orgId: input.org_id, email: normalizedEmail, code: error.code, message: error.message },
        'B2B: failed to create organization member',
      );
      return null;
    }

    return data as B2BOrganizationMember;
  } catch (err) {
    logger.warn(
      { orgId: input.org_id, email: normalizedEmail, err: err instanceof Error ? err.message : String(err) },
      'B2B: organization membership bridge unavailable',
    );
    return null;
  }
}

// ─── Contract CRUD ────────────────────────────────────────────────────────────

export async function createContract(input: {
  org_id: string;
  tier: ContractTier;
  price_per_seat_cents: number;
  total_seats: number;
  start_date: string;
  end_date?: string;
  sla_response_hours?: number;
  includes_human_coach?: boolean;
}): Promise<B2BContract | null> {
  const { data, error } = await supabaseAdmin
    .from('b2b_contracts')
    .insert(input)
    .select()
    .single();

  if (error) {
    logger.warn({ error: error.message, orgId: input.org_id }, 'B2B: failed to create contract');
    return null;
  }
  return data as B2BContract;
}

export async function getActiveContract(orgId: string): Promise<B2BContract | null> {
  const { data, error } = await supabaseAdmin
    .from('b2b_contracts')
    .select('*')
    .eq('org_id', orgId)
    .eq('status', 'active')
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error) return null;
  return data as B2BContract | null;
}

// ─── Seat Management ──────────────────────────────────────────────────────────

export async function provisionSeats(
  orgId: string,
  contractId: string,
  employees: Array<{ email: string; name?: string; cohort_id?: string }>,
): Promise<{ provisioned: number; errors: string[] } | { error: string; status: number }> {
  // Fix 4: Verify contract belongs to this org
  const { data: contract, error: contractError } = await supabaseAdmin
    .from('b2b_contracts')
    .select('id, org_id, total_seats, used_seats, status')
    .eq('id', contractId)
    .single();

  if (contractError || !contract) {
    return { error: 'Contract not found', status: 404 };
  }
  if (contract.org_id !== orgId) {
    return { error: 'Contract does not belong to this organization', status: 403 };
  }
  if (contract.status !== 'active') {
    return { error: 'Contract is not active', status: 400 };
  }

  // Fix 5: Pre-check capacity before inserting
  if (contract.used_seats + employees.length > contract.total_seats) {
    return {
      error: `Capacity exceeded: ${contract.total_seats - contract.used_seats} seats remaining, ${employees.length} requested`,
      status: 400,
    };
  }

  const errors: string[] = [];
  let provisioned = 0;

  for (const emp of employees) {
    const { error } = await supabaseAdmin.from('b2b_seats').insert({
      org_id: orgId,
      contract_id: contractId,
      employee_email: emp.email,
      employee_name: emp.name ?? null,
      cohort_id: emp.cohort_id ?? null,
      status: 'provisioned',
    });

    if (error) {
      errors.push(`${emp.email}: ${error.message}`);
    } else {
      provisioned++;
    }
  }

  // Refresh used_seats on the contract to match actual row count.
  // Direct count avoids race conditions from concurrent provisioning batches.
  if (provisioned > 0) {
    const { count } = await supabaseAdmin
      .from('b2b_seats')
      .select('*', { count: 'exact', head: true })
      .eq('contract_id', contractId);

    if (count !== null) {
      await supabaseAdmin
        .from('b2b_contracts')
        .update({ used_seats: count })
        .eq('id', contractId);
    }
  }

  return { provisioned, errors };
}

export async function getOrgSeats(
  orgId: string,
  status?: SeatStatus,
  limit?: number,
  offset?: number,
): Promise<B2BSeat[]> {
  let query = supabaseAdmin
    .from('b2b_seats')
    .select('*')
    .eq('org_id', orgId)
    .order('created_at', { ascending: false });

  if (status !== undefined) {
    query = query.eq('status', status);
  }

  if (limit !== undefined && offset !== undefined) {
    query = query.range(offset, offset + limit - 1);
  }

  const { data, error } = await query;
  if (error) {
    logger.warn({ error: error.message, orgId }, 'B2B: failed to get seats');
    return [];
  }
  return (data ?? []) as B2BSeat[];
}

export async function activateSeat(seatId: string, userId: string): Promise<'ok' | 'not_found' | 'wrong_status'> {
  // First check if seat exists
  const { data: seat, error: lookupError } = await supabaseAdmin
    .from('b2b_seats')
    .select('id, org_id, employee_email, status')
    .eq('id', seatId)
    .maybeSingle();

  if (lookupError || !seat) {
    return 'not_found';
  }
  if (seat.status !== 'provisioned') {
    return 'wrong_status';
  }

  const { error } = await supabaseAdmin
    .from('b2b_seats')
    .update({
      user_id: userId,
      status: 'active',
      activated_at: new Date().toISOString(),
    })
    .eq('id', seatId)
    .eq('status', 'provisioned');

  if (error) {
    logger.warn({ error: error.message, seatId, userId }, 'B2B: failed to activate seat');
    return 'not_found';
  }

  if (typeof seat.org_id === 'string' && typeof seat.employee_email === 'string') {
    await createOrganizationMember({
      org_id: seat.org_id,
      user_id: userId,
      email: seat.employee_email,
      role: 'employee',
      status: 'active',
      auth_provider: 'supabase',
      provider_subject: userId,
      seat_id: seatId,
    });
  }

  return 'ok';
}

// ─── Cohort Management ────────────────────────────────────────────────────────

export async function createCohort(input: {
  org_id: string;
  name: string;
  description?: string;
}): Promise<B2BCohort | null> {
  const { data, error } = await supabaseAdmin
    .from('b2b_employee_cohorts')
    .insert(input)
    .select()
    .single();

  if (error) {
    logger.warn({ error: error.message, orgId: input.org_id }, 'B2B: failed to create cohort');
    return null;
  }
  return data as B2BCohort;
}

export async function getOrgCohorts(orgId: string): Promise<B2BCohort[]> {
  const { data, error } = await supabaseAdmin
    .from('b2b_employee_cohorts')
    .select('*')
    .eq('org_id', orgId)
    .order('created_at', { ascending: false });

  if (error) return [];
  return (data ?? []) as B2BCohort[];
}

// ─── Aggregate Metrics (Admin Dashboard — NO personal content) ────────────────

export interface OrgEngagementMetrics {
  total_seats: number;
  active_seats: number;
  completed_seats: number;
  avg_sessions_per_user: number;
  agents_used_distribution: Record<string, number>;
  inactive_7_days: number;
}

export async function getOrgEngagementMetrics(orgId: string): Promise<OrgEngagementMetrics> {
  const seats = await getOrgSeats(orgId);
  const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();

  const active = seats.filter(s => s.status === 'active');
  const completed = seats.filter(s => s.status === 'completed');
  const totalSessions = active.reduce((sum, s) => sum + s.total_sessions, 0);

  // Build agent usage distribution across all seats in the org
  const agentDist: Record<string, number> = {};
  for (const seat of seats) {
    for (const agent of seat.agents_used) {
      agentDist[agent] = (agentDist[agent] ?? 0) + 1;
    }
  }

  // Active seats with no login in the past 7 days (stall detection for coaches)
  const inactive = active.filter(
    s => !s.last_login_at || s.last_login_at < sevenDaysAgo,
  ).length;

  return {
    total_seats: seats.length,
    active_seats: active.length,
    completed_seats: completed.length,
    avg_sessions_per_user: active.length > 0 ? Math.round(totalSessions / active.length) : 0,
    agents_used_distribution: agentDist,
    inactive_7_days: inactive,
  };
}
