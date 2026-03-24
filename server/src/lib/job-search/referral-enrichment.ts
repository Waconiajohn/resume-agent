/**
 * Referral Bonus Enrichment — matches job company names to referral_bonus_programs.
 *
 * Uses normalizeCompanyName() to clean company names, then looks up company_ids
 * in company_directory, and fetches referral bonus records for those companies.
 *
 * Returns a Map<originalCompanyName, ReferralBonusInfo> — only companies with
 * referral programs are included in the map.
 *
 * This is always a non-blocking, best-effort enrichment.
 */

import { supabaseAdmin } from '../supabase.js';
import { normalizeCompanyName } from '../ni/company-normalizer.js';
import logger from '../logger.js';

export interface ReferralBonusInfo {
  bonus_amount: string | null;
  bonus_entry: string | null;
  bonus_mid: string | null;
  bonus_senior: string | null;
  bonus_executive: string | null;
  program_url: string | null;
  confidence: string | null;
}

type CompanyDirectoryRow = {
  id: string;
  name_normalized: string;
};

type ReferralBonusProgramRow = {
  company_id: string;
  bonus_amount: string | null;
  bonus_entry: string | null;
  bonus_mid: string | null;
  bonus_senior: string | null;
  bonus_executive: string | null;
  program_url: string | null;
  confidence: string | null;
};

/**
 * Enriches a list of company names with referral bonus data.
 *
 * @param companyNames - Raw company names as returned by job search adapters
 * @returns Map of original company name (as provided) to ReferralBonusInfo
 */
export async function enrichWithReferralBonuses(
  companyNames: string[],
): Promise<Map<string, ReferralBonusInfo>> {
  const result = new Map<string, ReferralBonusInfo>();

  if (companyNames.length === 0) return result;

  // Step 1: Normalize names and build lookup maps
  // normalizedName (lowercased) → original company name (first occurrence wins)
  const normalizedToOriginal = new Map<string, string>();
  for (const name of companyNames) {
    const normalized = normalizeCompanyName(name).toLowerCase();
    if (normalized && !normalizedToOriginal.has(normalized)) {
      normalizedToOriginal.set(normalized, name);
    }
  }

  const normalizedNames = [...normalizedToOriginal.keys()];
  if (normalizedNames.length === 0) return result;

  try {
    // Step 2: Query company_directory by normalized name
    const { data: companyRows, error: companyError } = await supabaseAdmin
      .from('company_directory')
      .select('id, name_normalized')
      .in('name_normalized', normalizedNames);

    if (companyError) {
      logger.warn(
        { error: companyError.message },
        'referral-enrichment: company_directory query failed',
      );
      return result;
    }

    const rows = (companyRows ?? []) as CompanyDirectoryRow[];
    if (rows.length === 0) return result;

    // Build company_id → normalized name map and collect ids
    const companyIdToNormalized = new Map<string, string>();
    for (const row of rows) {
      companyIdToNormalized.set(row.id, row.name_normalized);
    }
    const companyIds = [...companyIdToNormalized.keys()];

    // Step 3: Query referral_bonus_programs for those company_ids
    const { data: bonusRows, error: bonusError } = await supabaseAdmin
      .from('referral_bonus_programs')
      .select(
        'company_id, bonus_amount, bonus_entry, bonus_mid, bonus_senior, bonus_executive, program_url, confidence',
      )
      .in('company_id', companyIds);

    if (bonusError) {
      logger.warn(
        { error: bonusError.message },
        'referral-enrichment: referral_bonus_programs query failed',
      );
      return result;
    }

    const bonusProgramRows = (bonusRows ?? []) as ReferralBonusProgramRow[];
    if (bonusProgramRows.length === 0) return result;

    // Step 4: Map results back to original company names
    for (const bonus of bonusProgramRows) {
      const normalizedName = companyIdToNormalized.get(bonus.company_id);
      if (!normalizedName) continue;

      const originalName = normalizedToOriginal.get(normalizedName);
      if (!originalName) continue;

      result.set(originalName, {
        bonus_amount: bonus.bonus_amount ?? null,
        bonus_entry: bonus.bonus_entry ?? null,
        bonus_mid: bonus.bonus_mid ?? null,
        bonus_senior: bonus.bonus_senior ?? null,
        bonus_executive: bonus.bonus_executive ?? null,
        program_url: bonus.program_url ?? null,
        confidence: bonus.confidence ?? null,
      });
    }

    logger.info(
      {
        inputCount: companyNames.length,
        matchedCompanies: rows.length,
        referralMatches: result.size,
      },
      'referral-enrichment: complete',
    );
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    logger.warn({ error: message }, 'referral-enrichment: unexpected error');
  }

  return result;
}
