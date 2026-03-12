/**
 * Referral Cross-Reference Service
 *
 * Cross-references job_matches with client_connections and referral_bonus_programs
 * to surface opportunities where the user has both a matching job AND a connection
 * at a company with a referral bonus program.
 */

import { supabaseAdmin } from '../supabase.js';
import logger from '../logger.js';
import type { ReferralOpportunity } from './types.js';

/**
 * Cross-references job_matches with client_connections and referral_bonus_programs
 * to surface opportunities where the user has both a matching job AND a connection
 * at a company with a referral bonus program.
 */
export async function crossReferenceReferralOpportunities(
  userId: string,
  options?: { limit?: number; offset?: number },
): Promise<ReferralOpportunity[]> {
  const limit = options?.limit ?? 50;
  const offset = options?.offset ?? 0;

  // Step 1: Get job matches where referral_available = true and status is actionable
  const { data: jobMatches, error: jobError } = await supabaseAdmin
    .from('job_matches')
    .select('*')
    .eq('user_id', userId)
    .eq('referral_available', true)
    .in('status', ['new', 'applied'])
    .order('match_score', { ascending: false, nullsFirst: false })
    .range(offset, offset + limit - 1);

  if (jobError || !jobMatches?.length) {
    if (jobError) {
      logger.error({ error: jobError.message, userId }, 'referral-cross-ref: job matches query failed');
    }
    return [];
  }

  // Step 2: Get unique company IDs from those matches
  const companyIds = [...new Set(jobMatches.map((j) => j.company_id))];

  // Step 3: Get referral bonus programs for those companies
  const { data: bonusPrograms } = await supabaseAdmin
    .from('referral_bonus_programs')
    .select('*')
    .in('company_id', companyIds);

  const bonusByCompany = new Map<
    string,
    { bonus_amount: string | null; bonus_currency: string | null; program_url: string | null }
  >();
  for (const bp of bonusPrograms ?? []) {
    bonusByCompany.set(bp.company_id, {
      bonus_amount: bp.bonus_amount,
      bonus_currency: bp.bonus_currency,
      program_url: bp.program_url,
    });
  }

  // Step 4: Get user's connections at those companies
  const { data: connections } = await supabaseAdmin
    .from('client_connections')
    .select('company_id, first_name, last_name, position')
    .eq('user_id', userId)
    .in('company_id', companyIds);

  const connectionsByCompany = new Map<
    string,
    { first_name: string; last_name: string; position: string | null }[]
  >();
  for (const conn of connections ?? []) {
    if (!conn.company_id) continue;
    const existing = connectionsByCompany.get(conn.company_id) ?? [];
    existing.push({ first_name: conn.first_name, last_name: conn.last_name, position: conn.position });
    connectionsByCompany.set(conn.company_id, existing);
  }

  // Step 5: Get company display names
  const { data: companies } = await supabaseAdmin
    .from('company_directory')
    .select('id, name_display')
    .in('id', companyIds);

  const companyNames = new Map<string, string>();
  for (const c of companies ?? []) {
    companyNames.set(c.id, c.name_display);
  }

  // Step 6: Assemble opportunities — only include where user has connections
  const opportunities: ReferralOpportunity[] = [];
  for (const job of jobMatches) {
    const conns = connectionsByCompany.get(job.company_id);
    if (!conns?.length) continue; // skip if no connections at this company

    const bonus = bonusByCompany.get(job.company_id);

    opportunities.push({
      job_match_id: job.id,
      job_title: job.title,
      job_url: job.url,
      job_location: job.location,
      match_score: job.match_score,
      company_id: job.company_id,
      company_name: companyNames.get(job.company_id) ?? 'Unknown',
      bonus_amount: bonus?.bonus_amount ?? null,
      bonus_currency: bonus?.bonus_currency ?? null,
      program_url: bonus?.program_url ?? null,
      connections: conns,
      connection_count: conns.length,
    });
  }

  logger.info(
    { userId, totalMatches: jobMatches.length, opportunities: opportunities.length },
    'referral-cross-ref: cross-reference complete',
  );

  return opportunities;
}
