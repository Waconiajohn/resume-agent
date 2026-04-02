/**
 * Referral Bonus Discovery — discovers referral bonus programs via Serper search.
 *
 * Searches Google for referral bonus/program pages at companies that don't
 * already have a row in referral_bonus_programs. When found, upserts with
 * confidence: 'low' (never overwrites seeded high/medium data).
 */

import { supabaseAdmin } from '../supabase.js';
import { detectReferralBonusInText } from './career-scraper.js';
import logger from '../logger.js';

const SERPER_API_URL = 'https://google.serper.dev/search';
const REQUEST_TIMEOUT_MS = 10_000;
const INTER_COMPANY_DELAY_MS = 500;
const MAX_COMPANIES_PER_BATCH = 200;

export interface BonusDiscoveryResult {
  discovered: number;
  skipped: number;
  errors: number;
  total: number;
}

/**
 * Discover referral bonus for a single company via Serper search.
 */
export async function discoverBonusForCompany(
  companyId: string,
  companyName: string,
): Promise<{ discovered: boolean; amount?: string; programUrl?: string; reason?: string }> {
  const apiKey = process.env.SERPER_API_KEY;
  if (!apiKey) {
    return { discovered: false, reason: 'SERPER_API_KEY not configured' };
  }

  // Check if company already has a bonus program
  const { data: existing } = await supabaseAdmin
    .from('referral_bonus_programs')
    .select('id, confidence')
    .eq('company_id', companyId)
    .limit(1)
    .maybeSingle();

  if (existing && (existing as { confidence: string }).confidence !== 'low') {
    return { discovered: false, reason: 'Already has high/medium confidence bonus data' };
  }

  const query = `"${companyName}" ("referral bonus" OR "employee referral program" OR "refer a friend") "$"`;

  try {
    const res = await fetch(SERPER_API_URL, {
      method: 'POST',
      headers: {
        'X-API-KEY': apiKey,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ q: query, num: 5 }),
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    });

    if (!res.ok) {
      return { discovered: false, reason: `Serper returned ${res.status}` };
    }

    const data = (await res.json()) as { organic?: { link?: string; snippet?: string; title?: string }[] };
    const results = data.organic ?? [];

    // Check each result for bonus mentions
    for (const result of results) {
      const textToCheck = [result.snippet, result.title].filter(Boolean).join(' ');
      const bonusResult = detectReferralBonusInText(textToCheck);

      if (bonusResult.detected) {
        // Upsert the bonus program
        const row: Record<string, unknown> = {
          company_id: companyId,
          bonus_amount: bonusResult.amount ?? 'Available',
          bonus_currency: 'USD',
          confidence: 'low',
          data_source: 'serper_discovery',
          last_verified_at: new Date().toISOString(),
        };
        if (result.link) row.program_url = result.link;

        const { error } = await supabaseAdmin
          .from('referral_bonus_programs')
          .upsert(row, { onConflict: 'company_id' });

        if (error) {
          logger.warn({ companyId, error: error.message }, 'bonus-discovery: upsert failed');
          return { discovered: false, reason: `DB write failed: ${error.message}` };
        }

        logger.info(
          { companyId, companyName, amount: bonusResult.amount, url: result.link },
          'bonus-discovery: company bonus discovered',
        );
        return { discovered: true, amount: bonusResult.amount, programUrl: result.link ?? undefined };
      }
    }

    return { discovered: false, reason: 'No bonus mentions found in search results' };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    logger.debug({ err: msg, companyId }, 'bonus-discovery: search failed');
    return { discovered: false, reason: msg };
  }
}

/**
 * Run bonus discovery for all companies in company_directory that don't have
 * a referral_bonus_programs row. Max 200 per batch, 500ms between calls.
 */
export async function runBulkBonusDiscovery(): Promise<BonusDiscoveryResult> {
  // Get all company IDs that already have bonus programs
  const { data: existingPrograms } = await supabaseAdmin
    .from('referral_bonus_programs')
    .select('company_id');

  const existingIds = new Set(
    ((existingPrograms ?? []) as { company_id: string }[]).map((r) => r.company_id),
  );

  // Get companies without bonus programs — fetch extra to account for filtering
  const { data: companies, error: compErr } = await supabaseAdmin
    .from('company_directory')
    .select('id, name_display')
    .limit(MAX_COMPANIES_PER_BATCH + existingIds.size);

  if (compErr || !companies) {
    logger.warn({ error: compErr }, 'bonus-discovery: failed to fetch companies');
    return { discovered: 0, skipped: 0, errors: 0, total: 0 };
  }

  const toDiscover = (companies as { id: string; name_display: string }[])
    .filter((c) => !existingIds.has(c.id))
    .slice(0, MAX_COMPANIES_PER_BATCH);

  if (toDiscover.length === 0) {
    return { discovered: 0, skipped: 0, errors: 0, total: 0 };
  }

  logger.info(
    { companiesToCheck: toDiscover.length },
    'bonus-discovery: starting bulk discovery',
  );

  let discovered = 0;
  let skipped = 0;
  let errors = 0;

  for (let i = 0; i < toDiscover.length; i++) {
    if (i > 0) {
      await new Promise<void>((resolve) => setTimeout(resolve, INTER_COMPANY_DELAY_MS));
    }

    const company = toDiscover[i];
    try {
      const result = await discoverBonusForCompany(company.id, company.name_display);
      if (result.discovered) {
        discovered++;
        console.log(
          `  [found] ${company.name_display} — ${result.amount ?? 'Available'}${result.programUrl ? ` (${result.programUrl})` : ''}`,
        );
      } else {
        skipped++;
      }
    } catch (err) {
      errors++;
      logger.debug({ err, companyId: company.id }, 'bonus-discovery: company threw');
    }

    if ((i + 1) % 50 === 0) {
      console.log(`  ... ${i + 1}/${toDiscover.length} checked (${discovered} discovered)`);
    }
  }

  logger.info(
    { total: toDiscover.length, discovered, skipped, errors },
    'bonus-discovery: bulk discovery complete',
  );

  return { discovered, skipped, errors, total: toDiscover.length };
}
