import { supabaseAdmin } from '../supabase.js';
import type { BonusCompanySearchResult, ReferralBonusProgramRow } from './types.js';

interface CompanyDirectorySearchRow {
  id: string;
  name_display: string;
  domain: string | null;
  headquarters: string | null;
  industry: string | null;
}

function parseBonusNumbers(value: string | null): number[] {
  if (!value) return [];

  const normalized = value.replace(/,/g, '');
  const matches = [...normalized.matchAll(/\$?\s*(\d+(?:\.\d+)?)\s*([kK])?/g)];

  return matches
    .map((match) => {
      const base = Number.parseFloat(match[1] ?? '');
      if (!Number.isFinite(base)) return null;
      return match[2] ? Math.round(base * 1_000) : Math.round(base);
    })
    .filter((value): value is number => value !== null);
}

function deriveBonusMetrics(row: ReferralBonusProgramRow): {
  bonusDisplay: string | null;
  bonusAmountMin: number | null;
  bonusAmountMax: number | null;
} {
  const rankedDisplays = [
    row.bonus_executive,
    row.bonus_senior,
    row.bonus_mid,
    row.bonus_entry,
    row.bonus_amount,
  ].filter((value): value is string => typeof value === 'string' && value.trim().length > 0);

  const amounts = [
    ...parseBonusNumbers(row.bonus_amount),
    ...parseBonusNumbers(row.bonus_entry),
    ...parseBonusNumbers(row.bonus_mid),
    ...parseBonusNumbers(row.bonus_senior),
    ...parseBonusNumbers(row.bonus_executive),
  ];

  return {
    bonusDisplay: rankedDisplays[0] ?? null,
    bonusAmountMin: amounts.length > 0 ? Math.min(...amounts) : null,
    bonusAmountMax: amounts.length > 0 ? Math.max(...amounts) : null,
  };
}

export async function getBonusSearchCompanies(options?: {
  minBonus?: number;
  limit?: number;
}): Promise<BonusCompanySearchResult[]> {
  const minBonus = Math.max(0, options?.minBonus ?? 1_000);
  const limit = Math.min(Math.max(1, options?.limit ?? 50), 200);

  const { data: bonusRows, error: bonusError } = await supabaseAdmin
    .from('referral_bonus_programs')
    .select(
      'company_id, bonus_amount, bonus_currency, bonus_entry, bonus_mid, bonus_senior, bonus_executive, confidence, program_url',
    );

  if (bonusError) {
    throw new Error(bonusError.message);
  }

  const filteredPrograms = ((bonusRows ?? []) as ReferralBonusProgramRow[])
    .map((row) => {
      const metrics = deriveBonusMetrics(row);
      return {
        row,
        ...metrics,
      };
    })
    .filter((entry) => (entry.bonusAmountMax ?? 0) >= minBonus)
    .sort((a, b) => (b.bonusAmountMax ?? 0) - (a.bonusAmountMax ?? 0));

  if (filteredPrograms.length === 0) {
    return [];
  }

  const companyIds = [...new Set(filteredPrograms.map((entry) => entry.row.company_id))].slice(0, limit);
  const { data: companyRows, error: companyError } = await supabaseAdmin
    .from('company_directory')
    .select('id, name_display, domain, headquarters, industry')
    .in('id', companyIds);

  if (companyError) {
    throw new Error(companyError.message);
  }

  const companyMap = new Map(
    ((companyRows ?? []) as CompanyDirectorySearchRow[]).map((row) => [row.id, row]),
  );

  return filteredPrograms
    .filter((entry) => companyMap.has(entry.row.company_id))
    .slice(0, limit)
    .map((entry) => {
      const company = companyMap.get(entry.row.company_id) as CompanyDirectorySearchRow;
      return {
        company_id: company.id,
        company_name: company.name_display,
        domain: company.domain,
        headquarters: company.headquarters,
        industry: company.industry,
        bonus_display: entry.bonusDisplay,
        bonus_currency: entry.row.bonus_currency,
        bonus_amount_min: entry.bonusAmountMin,
        bonus_amount_max: entry.bonusAmountMax,
        confidence: entry.row.confidence,
        program_url: entry.row.program_url,
      };
    });
}
