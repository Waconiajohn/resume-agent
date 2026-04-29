/**
 * ATS Slug Enrichment — discovers ATS platform and slug for companies
 * that don't have them set, converting them from Tier 2 (Serper fallback)
 * to Tier 1 (direct ATS API) for future job scans.
 *
 * Flow: Serper query → parse first ATS URL → write platform+slug to company_directory.
 */

import { supabaseAdmin } from '../supabase.js';
import logger from '../logger.js';
import { DIRECT_ATS_SITE_QUERY } from '../ats-search-targets.js';
import type { ATSPlatform } from './types.js';

// ─── Types ───────────────────────────────────────────────────────────────────

export interface EnrichmentResult {
  enriched: boolean;
  platform?: ATSPlatform;
  slug?: string;
  reason?: string;
}

export interface BulkEnrichmentResult {
  enriched: number;
  skipped: number;
  errors: number;
  total: number;
}

// ─── Constants ───────────────────────────────────────────────────────────────

const SERPER_API_URL = 'https://google.serper.dev/search';
const REQUEST_TIMEOUT_MS = 10_000;
const INTER_COMPANY_DELAY_MS = 500;
const MAX_COMPANIES_PER_BATCH = 100;

// ─── URL Parsing ─────────────────────────────────────────────────────────────

/**
 * Parse a URL to extract ATS platform and slug.
 * Returns null if the URL doesn't match any known ATS pattern.
 */
export function parseATSFromUrl(url: string): { platform: ATSPlatform; slug: string } | null {
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return null;
  }

  const hostname = parsed.hostname.toLowerCase();
  const pathSegments = parsed.pathname.split('/').filter(Boolean);

  // Greenhouse: boards.greenhouse.io/{slug}/...
  if (hostname === 'boards.greenhouse.io' && pathSegments.length > 0) {
    return { platform: 'greenhouse', slug: pathSegments[0] };
  }

  // Lever: jobs.lever.co/{slug}/...
  if (hostname === 'jobs.lever.co' && pathSegments.length > 0) {
    return { platform: 'lever', slug: pathSegments[0] };
  }

  // Ashby: jobs.ashbyhq.com/{slug}/...
  if (hostname === 'jobs.ashbyhq.com' && pathSegments.length > 0) {
    return { platform: 'ashby', slug: pathSegments[0] };
  }

  // Workday: {tenant}.{server}.myworkdayjobs.com/.../cxs/{tenant}/{site}/...
  // Also matches direct URLs like {tenant}.wd5.myworkdayjobs.com/en-US/{site}
  if (hostname.endsWith('.myworkdayjobs.com')) {
    const tenant = hostname.split('.')[0];
    if (tenant) {
      // Try to extract site from path: look for segment after language code or directly
      // Common patterns: /en-US/{site}, /wday/cxs/{tenant}/{site}/jobs
      const cxsIndex = pathSegments.indexOf('cxs');
      if (cxsIndex !== -1 && pathSegments.length > cxsIndex + 2) {
        const site = pathSegments[cxsIndex + 2];
        return { platform: 'workday', slug: `${tenant}/${site}` };
      }
      // Fallback: skip language code segments (e.g., "en-US") and take the next
      const siteSegment = pathSegments.find((s) => !s.match(/^[a-z]{2}(-[A-Z]{2})?$/));
      if (siteSegment) {
        return { platform: 'workday', slug: `${tenant}/${siteSegment}` };
      }
      // Tenant-only slug is unusable — fetchWorkdayJobs requires {tenant}/{site}
      return null;
    }
  }

  // iCIMS: careers-{slug}.icims.com/... or jobs-{slug}.icims.com/...
  if (hostname.endsWith('.icims.com')) {
    const subdomain = hostname.replace('.icims.com', '');
    const prefixMatch = subdomain.match(/^(?:careers|jobs)-(.+)$/);
    if (prefixMatch) {
      return { platform: 'icims', slug: prefixMatch[1] };
    }
    // Bare subdomain: {slug}.icims.com
    if (subdomain && subdomain !== 'www') {
      return { platform: 'icims', slug: subdomain };
    }
  }

  // Recruitee: {slug}.recruitee.com
  if (hostname.endsWith('.recruitee.com')) {
    const slug = hostname.replace('.recruitee.com', '');
    if (slug && slug !== 'www') {
      return { platform: 'recruitee', slug };
    }
  }

  // Workable: apply.workable.com/{slug}
  if (hostname === 'apply.workable.com' && pathSegments.length > 0) {
    return { platform: 'workable', slug: pathSegments[0] };
  }

  // Personio: {slug}.jobs.personio.de or {slug}.jobs.personio.com
  if (hostname.endsWith('.jobs.personio.de') || hostname.endsWith('.jobs.personio.com')) {
    const slug = hostname.split('.')[0];
    if (slug) {
      return { platform: 'personio', slug };
    }
  }

  return null;
}

// ─── Single Company Enrichment ───────────────────────────────────────────────

/**
 * Discover ATS platform and slug for a single company via Serper search.
 * Writes to company_directory on success.
 */
export async function enrichCompanyATS(
  companyId: string,
  companyName: string,
): Promise<EnrichmentResult> {
  const apiKey = process.env.SERPER_API_KEY;
  if (!apiKey) {
    return { enriched: false, reason: 'SERPER_API_KEY not configured' };
  }

  const query = `"${companyName}" careers (${DIRECT_ATS_SITE_QUERY})`;

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
      return { enriched: false, reason: `Serper returned ${res.status}` };
    }

    const data = (await res.json()) as { organic?: { link?: string }[] };
    const results = data.organic ?? [];

    // Find the first result that maps to a known ATS
    for (const result of results) {
      if (!result.link) continue;
      const atsInfo = parseATSFromUrl(result.link);
      if (atsInfo) {
        // Write to company_directory
        const { error } = await supabaseAdmin
          .from('company_directory')
          .update({
            ats_platform: atsInfo.platform,
            ats_slug: atsInfo.slug,
          })
          .eq('id', companyId);

        if (error) {
          logger.warn({ companyId, error }, 'ats-enrichment: failed to write ATS info');
          return { enriched: false, reason: `DB write failed: ${error.message}` };
        }

        logger.info(
          { companyId, companyName, platform: atsInfo.platform, slug: atsInfo.slug },
          'ats-enrichment: company enriched',
        );
        return { enriched: true, platform: atsInfo.platform, slug: atsInfo.slug };
      }
    }

    return { enriched: false, reason: 'No ATS URL found in search results' };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    logger.debug({ err: msg, companyId }, 'ats-enrichment: search failed');
    return { enriched: false, reason: msg };
  }
}

// ─── Bulk Enrichment ─────────────────────────────────────────────────────────

/**
 * Run enrichment for all companies a user has connections at
 * where ats_platform IS NULL. Max 100 per batch, 500ms between calls.
 */
export async function runBulkEnrichment(userId: string): Promise<BulkEnrichmentResult> {
  // Get company IDs the user has connections at
  const { data: connections, error: connErr } = await supabaseAdmin
    .from('client_connections')
    .select('company_id')
    .eq('user_id', userId)
    .not('company_id', 'is', null);

  if (connErr || !connections) {
    logger.warn({ userId, error: connErr }, 'ats-enrichment: failed to fetch user connections');
    return { enriched: 0, skipped: 0, errors: 0, total: 0 };
  }

  const companyIds = [...new Set(
    (connections as { company_id: string | null }[])
      .map((c) => c.company_id)
      .filter((id): id is string => id !== null),
  )];

  if (companyIds.length === 0) {
    return { enriched: 0, skipped: 0, errors: 0, total: 0 };
  }

  // Fetch companies that need enrichment (ats_platform IS NULL)
  const { data: companies, error: compErr } = await supabaseAdmin
    .from('company_directory')
    .select('id, name_display')
    .in('id', companyIds)
    .is('ats_platform', null)
    .limit(MAX_COMPANIES_PER_BATCH);

  if (compErr || !companies) {
    logger.warn({ userId, error: compErr }, 'ats-enrichment: failed to fetch companies');
    return { enriched: 0, skipped: 0, errors: 0, total: 0 };
  }

  const toEnrich = companies as { id: string; name_display: string }[];

  if (toEnrich.length === 0) {
    return { enriched: 0, skipped: 0, errors: 0, total: 0 };
  }

  logger.info(
    { userId, companiesToEnrich: toEnrich.length },
    'ats-enrichment: starting bulk enrichment',
  );

  let enriched = 0;
  let skipped = 0;
  let errors = 0;

  for (let i = 0; i < toEnrich.length; i++) {
    if (i > 0) {
      await new Promise<void>((resolve) => setTimeout(resolve, INTER_COMPANY_DELAY_MS));
    }

    const company = toEnrich[i];
    try {
      const result = await enrichCompanyATS(company.id, company.name_display);
      if (result.enriched) {
        enriched++;
      } else {
        skipped++;
      }
    } catch (err) {
      errors++;
      logger.debug(
        { err, companyId: company.id },
        'ats-enrichment: company enrichment threw',
      );
    }
  }

  logger.info(
    { userId, total: toEnrich.length, enriched, skipped, errors },
    'ats-enrichment: bulk enrichment complete',
  );

  return { enriched, skipped, errors, total: toEnrich.length };
}
