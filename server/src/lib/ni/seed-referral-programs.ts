/**
 * Seed Referral Bonus Programs
 *
 * Populates the referral_bonus_programs table with known companies that pay
 * employee referral bonuses. Uses a lookup-or-create pattern against
 * company_directory so it is fully idempotent.
 */

import { supabaseAdmin } from '../supabase.js';
import logger from '../logger.js';

// ─── Company data ──────────────────────────────────────────────────────────────

interface ReferralSeedEntry {
  name: string;
  bonus_range: string;
  currency: 'USD';
  source: 'industry_data';
}

const REFERRAL_COMPANIES: ReferralSeedEntry[] = [
  // FAANG / Mega-cap tech
  { name: 'Google', bonus_range: '$2,000–$10,000', currency: 'USD', source: 'industry_data' },
  { name: 'Apple', bonus_range: '$2,500–$10,000', currency: 'USD', source: 'industry_data' },
  { name: 'Meta', bonus_range: '$5,000–$15,000', currency: 'USD', source: 'industry_data' },
  { name: 'Amazon', bonus_range: '$1,000–$5,000', currency: 'USD', source: 'industry_data' },
  { name: 'Microsoft', bonus_range: '$1,000–$10,000', currency: 'USD', source: 'industry_data' },
  { name: 'Netflix', bonus_range: '$5,000–$15,000', currency: 'USD', source: 'industry_data' },

  // Major tech
  { name: 'Salesforce', bonus_range: '$2,500–$10,000', currency: 'USD', source: 'industry_data' },
  { name: 'Adobe', bonus_range: '$2,000–$8,000', currency: 'USD', source: 'industry_data' },
  { name: 'Uber', bonus_range: '$2,500–$10,000', currency: 'USD', source: 'industry_data' },
  { name: 'Lyft', bonus_range: '$2,000–$8,000', currency: 'USD', source: 'industry_data' },
  { name: 'Airbnb', bonus_range: '$3,000–$10,000', currency: 'USD', source: 'industry_data' },
  { name: 'Stripe', bonus_range: '$5,000–$15,000', currency: 'USD', source: 'industry_data' },
  { name: 'Block', bonus_range: '$2,000–$8,000', currency: 'USD', source: 'industry_data' },
  { name: 'Coinbase', bonus_range: '$5,000–$15,000', currency: 'USD', source: 'industry_data' },
  { name: 'Robinhood', bonus_range: '$3,000–$10,000', currency: 'USD', source: 'industry_data' },
  { name: 'Snap', bonus_range: '$2,500–$8,000', currency: 'USD', source: 'industry_data' },
  { name: 'X', bonus_range: '$2,000–$7,500', currency: 'USD', source: 'industry_data' },
  { name: 'Pinterest', bonus_range: '$2,000–$7,500', currency: 'USD', source: 'industry_data' },
  { name: 'LinkedIn', bonus_range: '$2,500–$10,000', currency: 'USD', source: 'industry_data' },
  { name: 'Oracle', bonus_range: '$2,000–$8,000', currency: 'USD', source: 'industry_data' },
  { name: 'SAP', bonus_range: '$2,000–$7,500', currency: 'USD', source: 'industry_data' },
  { name: 'ServiceNow', bonus_range: '$3,000–$10,000', currency: 'USD', source: 'industry_data' },
  { name: 'Snowflake', bonus_range: '$5,000–$15,000', currency: 'USD', source: 'industry_data' },
  { name: 'Databricks', bonus_range: '$5,000–$15,000', currency: 'USD', source: 'industry_data' },
  { name: 'Palantir', bonus_range: '$3,000–$10,000', currency: 'USD', source: 'industry_data' },
  { name: 'Workday', bonus_range: '$2,500–$8,000', currency: 'USD', source: 'industry_data' },
  { name: 'VMware', bonus_range: '$2,000–$7,500', currency: 'USD', source: 'industry_data' },
  { name: 'Cisco', bonus_range: '$2,000–$7,500', currency: 'USD', source: 'industry_data' },
  { name: 'Intel', bonus_range: '$1,500–$6,000', currency: 'USD', source: 'industry_data' },
  { name: 'Nvidia', bonus_range: '$3,000–$12,000', currency: 'USD', source: 'industry_data' },
  { name: 'Qualcomm', bonus_range: '$2,000–$7,500', currency: 'USD', source: 'industry_data' },
  { name: 'IBM', bonus_range: '$1,500–$5,000', currency: 'USD', source: 'industry_data' },
  { name: 'Dell Technologies', bonus_range: '$1,500–$5,000', currency: 'USD', source: 'industry_data' },
  { name: 'HP', bonus_range: '$1,500–$5,000', currency: 'USD', source: 'industry_data' },
  { name: 'Splunk', bonus_range: '$3,000–$10,000', currency: 'USD', source: 'industry_data' },
  { name: 'Palo Alto Networks', bonus_range: '$3,000–$12,000', currency: 'USD', source: 'industry_data' },
  { name: 'CrowdStrike', bonus_range: '$3,000–$10,000', currency: 'USD', source: 'industry_data' },
  { name: 'Okta', bonus_range: '$2,500–$8,000', currency: 'USD', source: 'industry_data' },
  { name: 'Twilio', bonus_range: '$2,500–$8,000', currency: 'USD', source: 'industry_data' },
  { name: 'Zendesk', bonus_range: '$2,000–$7,500', currency: 'USD', source: 'industry_data' },
  { name: 'HubSpot', bonus_range: '$2,500–$8,000', currency: 'USD', source: 'industry_data' },
  { name: 'Atlassian', bonus_range: '$3,000–$10,000', currency: 'USD', source: 'industry_data' },
  { name: 'Dropbox', bonus_range: '$2,000–$7,500', currency: 'USD', source: 'industry_data' },
  { name: 'Box', bonus_range: '$2,000–$7,000', currency: 'USD', source: 'industry_data' },
  { name: 'DocuSign', bonus_range: '$2,000–$7,500', currency: 'USD', source: 'industry_data' },
  { name: 'Zoom', bonus_range: '$2,000–$7,500', currency: 'USD', source: 'industry_data' },
  { name: 'Slack', bonus_range: '$2,500–$8,000', currency: 'USD', source: 'industry_data' },
  { name: 'Intuit', bonus_range: '$2,000–$7,500', currency: 'USD', source: 'industry_data' },
  { name: 'Autodesk', bonus_range: '$2,000–$6,500', currency: 'USD', source: 'industry_data' },
  { name: 'Roblox', bonus_range: '$3,000–$10,000', currency: 'USD', source: 'industry_data' },
  { name: 'DoorDash', bonus_range: '$2,000–$8,000', currency: 'USD', source: 'industry_data' },
  { name: 'Instacart', bonus_range: '$2,000–$7,500', currency: 'USD', source: 'industry_data' },
  { name: 'Rivian', bonus_range: '$2,500–$8,000', currency: 'USD', source: 'industry_data' },
  { name: 'Tesla', bonus_range: '$2,500–$10,000', currency: 'USD', source: 'industry_data' },
  { name: 'SpaceX', bonus_range: '$2,500–$8,000', currency: 'USD', source: 'industry_data' },

  // Major finance / banking
  { name: 'JPMorgan Chase', bonus_range: '$2,000–$8,000', currency: 'USD', source: 'industry_data' },
  { name: 'Goldman Sachs', bonus_range: '$3,000–$12,000', currency: 'USD', source: 'industry_data' },
  { name: 'Morgan Stanley', bonus_range: '$2,500–$10,000', currency: 'USD', source: 'industry_data' },
  { name: 'Citigroup', bonus_range: '$2,000–$7,500', currency: 'USD', source: 'industry_data' },
  { name: 'Bank of America', bonus_range: '$1,500–$6,000', currency: 'USD', source: 'industry_data' },
  { name: 'Wells Fargo', bonus_range: '$1,500–$5,000', currency: 'USD', source: 'industry_data' },
  { name: 'Capital One', bonus_range: '$2,000–$8,000', currency: 'USD', source: 'industry_data' },
  { name: 'Fidelity Investments', bonus_range: '$2,000–$7,500', currency: 'USD', source: 'industry_data' },
  { name: 'Charles Schwab', bonus_range: '$2,000–$7,000', currency: 'USD', source: 'industry_data' },
  { name: 'BlackRock', bonus_range: '$3,000–$10,000', currency: 'USD', source: 'industry_data' },
  { name: 'Vanguard', bonus_range: '$1,500–$5,000', currency: 'USD', source: 'industry_data' },
  { name: 'American Express', bonus_range: '$2,000–$7,500', currency: 'USD', source: 'industry_data' },
  { name: 'Visa', bonus_range: '$2,500–$8,000', currency: 'USD', source: 'industry_data' },
  { name: 'Mastercard', bonus_range: '$2,500–$8,000', currency: 'USD', source: 'industry_data' },
  { name: 'PayPal', bonus_range: '$2,000–$7,500', currency: 'USD', source: 'industry_data' },
  { name: 'US Bank', bonus_range: '$1,500–$5,000', currency: 'USD', source: 'industry_data' },
  { name: 'TD Bank', bonus_range: '$1,500–$5,000', currency: 'USD', source: 'industry_data' },
  { name: 'PNC Financial', bonus_range: '$1,500–$5,000', currency: 'USD', source: 'industry_data' },
  { name: 'Ally Financial', bonus_range: '$2,000–$6,000', currency: 'USD', source: 'industry_data' },
  { name: 'Discover Financial', bonus_range: '$1,500–$5,500', currency: 'USD', source: 'industry_data' },

  // Big 4 consulting + strategy consulting
  { name: 'McKinsey', bonus_range: '$5,000–$20,000', currency: 'USD', source: 'industry_data' },
  { name: 'BCG', bonus_range: '$5,000–$20,000', currency: 'USD', source: 'industry_data' },
  { name: 'Bain', bonus_range: '$5,000–$20,000', currency: 'USD', source: 'industry_data' },
  { name: 'Deloitte', bonus_range: '$2,500–$10,000', currency: 'USD', source: 'industry_data' },
  { name: 'Accenture', bonus_range: '$2,000–$7,500', currency: 'USD', source: 'industry_data' },
  { name: 'PwC', bonus_range: '$2,000–$7,500', currency: 'USD', source: 'industry_data' },
  { name: 'EY', bonus_range: '$2,000–$7,500', currency: 'USD', source: 'industry_data' },
  { name: 'KPMG', bonus_range: '$2,000–$7,500', currency: 'USD', source: 'industry_data' },
  { name: 'Booz Allen Hamilton', bonus_range: '$2,500–$8,000', currency: 'USD', source: 'industry_data' },
  { name: 'Leidos', bonus_range: '$2,000–$7,500', currency: 'USD', source: 'industry_data' },
  { name: 'SAIC', bonus_range: '$2,000–$7,000', currency: 'USD', source: 'industry_data' },

  // Healthcare / insurance
  { name: 'UnitedHealth Group', bonus_range: '$1,500–$5,000', currency: 'USD', source: 'industry_data' },
  { name: 'CVS Health', bonus_range: '$1,500–$4,500', currency: 'USD', source: 'industry_data' },
  { name: 'Anthem', bonus_range: '$1,500–$5,000', currency: 'USD', source: 'industry_data' },
  { name: 'Cigna', bonus_range: '$1,500–$5,000', currency: 'USD', source: 'industry_data' },
  { name: 'HCA Healthcare', bonus_range: '$1,500–$4,500', currency: 'USD', source: 'industry_data' },
  { name: 'Kaiser Permanente', bonus_range: '$1,500–$5,000', currency: 'USD', source: 'industry_data' },
  { name: 'Humana', bonus_range: '$1,500–$5,000', currency: 'USD', source: 'industry_data' },
  { name: 'Aetna', bonus_range: '$1,500–$5,000', currency: 'USD', source: 'industry_data' },
  { name: 'Johnson & Johnson', bonus_range: '$2,000–$6,000', currency: 'USD', source: 'industry_data' },
  { name: 'Pfizer', bonus_range: '$2,000–$6,500', currency: 'USD', source: 'industry_data' },
  { name: 'Merck', bonus_range: '$2,000–$6,500', currency: 'USD', source: 'industry_data' },
  { name: 'AbbVie', bonus_range: '$2,000–$7,000', currency: 'USD', source: 'industry_data' },
  { name: 'Bristol Myers Squibb', bonus_range: '$2,000–$6,500', currency: 'USD', source: 'industry_data' },
  { name: 'Eli Lilly', bonus_range: '$2,000–$7,000', currency: 'USD', source: 'industry_data' },
  { name: 'Abbott Laboratories', bonus_range: '$1,500–$6,000', currency: 'USD', source: 'industry_data' },

  // Defense / aerospace
  { name: 'Lockheed Martin', bonus_range: '$2,000–$8,000', currency: 'USD', source: 'industry_data' },
  { name: 'Boeing', bonus_range: '$2,000–$7,500', currency: 'USD', source: 'industry_data' },
  { name: 'Raytheon Technologies', bonus_range: '$2,000–$7,500', currency: 'USD', source: 'industry_data' },
  { name: 'Northrop Grumman', bonus_range: '$2,000–$7,500', currency: 'USD', source: 'industry_data' },
  { name: 'General Dynamics', bonus_range: '$2,000–$7,000', currency: 'USD', source: 'industry_data' },
  { name: 'L3Harris Technologies', bonus_range: '$2,000–$6,500', currency: 'USD', source: 'industry_data' },
  { name: 'BAE Systems', bonus_range: '$1,500–$5,500', currency: 'USD', source: 'industry_data' },

  // Other Fortune 500 / large employers
  { name: 'Walmart', bonus_range: '$500–$3,000', currency: 'USD', source: 'industry_data' },
  { name: 'Target', bonus_range: '$500–$3,000', currency: 'USD', source: 'industry_data' },
  { name: 'Home Depot', bonus_range: '$500–$2,500', currency: 'USD', source: 'industry_data' },
  { name: 'General Electric', bonus_range: '$1,500–$5,500', currency: 'USD', source: 'industry_data' },
  { name: 'Exxon Mobil', bonus_range: '$2,000–$6,000', currency: 'USD', source: 'industry_data' },
  { name: 'Chevron', bonus_range: '$2,000–$6,000', currency: 'USD', source: 'industry_data' },
  { name: 'ExxonMobil', bonus_range: '$2,000–$6,000', currency: 'USD', source: 'industry_data' },
  { name: 'AT&T', bonus_range: '$1,000–$4,000', currency: 'USD', source: 'industry_data' },
  { name: 'Verizon', bonus_range: '$1,000–$4,000', currency: 'USD', source: 'industry_data' },
  { name: 'T-Mobile', bonus_range: '$1,000–$4,500', currency: 'USD', source: 'industry_data' },
  { name: '3M', bonus_range: '$1,500–$5,000', currency: 'USD', source: 'industry_data' },
  { name: 'Honeywell', bonus_range: '$1,500–$5,500', currency: 'USD', source: 'industry_data' },
  { name: 'Caterpillar', bonus_range: '$1,500–$5,000', currency: 'USD', source: 'industry_data' },
  { name: 'Deere & Company', bonus_range: '$1,500–$5,000', currency: 'USD', source: 'industry_data' },
  { name: 'FedEx', bonus_range: '$1,000–$3,500', currency: 'USD', source: 'industry_data' },
  { name: 'UPS', bonus_range: '$1,000–$3,500', currency: 'USD', source: 'industry_data' },
  { name: 'Walt Disney', bonus_range: '$1,500–$5,000', currency: 'USD', source: 'industry_data' },
  { name: 'Comcast', bonus_range: '$1,000–$4,000', currency: 'USD', source: 'industry_data' },
  { name: 'Nike', bonus_range: '$1,500–$5,000', currency: 'USD', source: 'industry_data' },
  { name: 'Starbucks', bonus_range: '$500–$2,500', currency: 'USD', source: 'industry_data' },
  { name: 'Procter & Gamble', bonus_range: '$2,000–$6,000', currency: 'USD', source: 'industry_data' },
  { name: 'Unilever', bonus_range: '$1,500–$5,000', currency: 'USD', source: 'industry_data' },
  { name: 'Kraft Heinz', bonus_range: '$1,500–$4,500', currency: 'USD', source: 'industry_data' },
  { name: 'Colgate-Palmolive', bonus_range: '$1,500–$5,000', currency: 'USD', source: 'industry_data' },
];

// ─── Helpers ───────────────────────────────────────────────────────────────────

/**
 * Look up or create a company_directory row by normalized name.
 * Returns the company id on success, null on error.
 */
async function lookupOrCreateCompany(name: string): Promise<string | null> {
  const nameNormalized = name.toLowerCase().trim();

  // Try exact lookup first
  const { data: existing, error: lookupError } = await supabaseAdmin
    .from('company_directory')
    .select('id')
    .eq('name_normalized', nameNormalized)
    .limit(1)
    .maybeSingle();

  if (lookupError) {
    logger.warn(
      { error: lookupError.message, name },
      'seed-referral-programs: lookup error',
    );
    return null;
  }

  if (existing) {
    return (existing as { id: string }).id;
  }

  // Create new entry
  const { data: created, error: insertError } = await supabaseAdmin
    .from('company_directory')
    .insert({
      name_normalized: nameNormalized,
      name_display: name,
      name_variants: [nameNormalized],
    })
    .select('id')
    .single();

  if (insertError) {
    // Race condition — another process inserted between our lookup and insert
    if (insertError.code === '23505') {
      const { data: raceExisting } = await supabaseAdmin
        .from('company_directory')
        .select('id')
        .eq('name_normalized', nameNormalized)
        .single();
      return (raceExisting as { id: string } | null)?.id ?? null;
    }
    logger.error(
      { error: insertError.message, name },
      'seed-referral-programs: insert company failed',
    );
    return null;
  }

  return (created as { id: string }).id;
}

// ─── Public API ────────────────────────────────────────────────────────────────

/**
 * Seed the referral_bonus_programs table with known companies.
 *
 * Idempotent — safe to run multiple times. Uses upsert on company_id so
 * re-runs update the bonus_amount and source without creating duplicates.
 */
export async function seedReferralBonusPrograms(): Promise<void> {
  logger.info(
    { total: REFERRAL_COMPANIES.length },
    'seed-referral-programs: starting seed',
  );

  let companiesProcessed = 0;
  let companiesCreated = 0;
  let programsUpserted = 0;
  let errors = 0;

  for (const entry of REFERRAL_COMPANIES) {
    try {
      const companyId = await lookupOrCreateCompany(entry.name);

      if (!companyId) {
        logger.warn({ name: entry.name }, 'seed-referral-programs: could not resolve company id, skipping');
        errors++;
        companiesProcessed++;
        continue;
      }

      // Determine if this was a newly created company (no existing referral row)
      const { data: existingProgram } = await supabaseAdmin
        .from('referral_bonus_programs')
        .select('id')
        .eq('company_id', companyId)
        .limit(1)
        .maybeSingle();

      const isNew = !existingProgram;

      // Upsert the referral program row keyed on company_id
      const { error: upsertError } = await supabaseAdmin
        .from('referral_bonus_programs')
        .upsert(
          {
            company_id: companyId,
            bonus_amount: entry.bonus_range,
            bonus_currency: entry.currency,
            source: entry.source,
          },
          { onConflict: 'company_id' },
        );

      if (upsertError) {
        logger.error(
          { error: upsertError.message, name: entry.name },
          'seed-referral-programs: upsert failed',
        );
        errors++;
      } else {
        programsUpserted++;
        if (isNew) companiesCreated++;
      }

      companiesProcessed++;
    } catch (err) {
      logger.error(
        { error: err instanceof Error ? err.message : String(err), name: entry.name },
        'seed-referral-programs: unexpected error processing company',
      );
      errors++;
      companiesProcessed++;
    }
  }

  logger.info(
    {
      companiesProcessed,
      companiesCreated,
      programsUpserted,
      errors,
    },
    'seed-referral-programs: seed complete',
  );
}
