/**
 * Career Page Scanner — Network Intelligence
 *
 * Two-tier ATS-native job scanning strategy:
 *   1. Direct ATS API (Lever, Greenhouse, Workday, Ashby, iCIMS) — free, structured data
 *   2. Serper Google Jobs search fallback — for companies without known ATS
 *   Plus: title matching + referral bonus detection on all results
 *
 * Replaces the original scraper which returned 0% hit rate
 * on modern client-side-rendered ATS platforms.
 */

import { supabaseAdmin } from '../supabase.js';
import { insertJobMatch } from './job-matches-store.js';
import { fetchFromATS } from './ats-clients.js';
import { extractJobsFromCareerPage } from './json-ld-extractor.js';
import { searchJobsViaSerper } from './serper-job-search.js';
import { classifyWorkMode } from '../job-search/work-mode-classifier.js';
import { isWithinFreshnessWindow, normalizeJobPostedDate } from '../job-date.js';
import logger from '../logger.js';
import type { ATSJob, CompanyInfo, NiSearchContext, NiScrapeFilters, NiWorkMode, ScrapeResult, ScrapeSource } from './types.js';

// ─── Constants ────────────────────────────────────────────────────────────────

const REQUEST_DELAY_MS = 500;
const MAX_COMPANIES = 50;

// ─── Title matching ───────────────────────────────────────────────────────────

export function computeMatchScore(jobTitle: string, targetTitles: string[]): number {
  if (targetTitles.length === 0) return 50;
  const jobWords = new Set(jobTitle.toLowerCase().split(/\W+/).filter((w) => w.length > 2));
  let bestScore = 0;
  for (const target of targetTitles) {
    const targetWords = target.toLowerCase().split(/\W+/).filter((w) => w.length > 2);
    if (targetWords.length === 0) continue;
    const overlap = targetWords.filter((w) => jobWords.has(w)).length;
    const score = Math.round((overlap / targetWords.length) * 100);
    if (score > bestScore) bestScore = score;
  }
  return bestScore;
}

export function titleMatchesTargets(jobTitle: string, targetTitles: string[]): boolean {
  if (targetTitles.length === 0) return true;
  return computeMatchScore(jobTitle, targetTitles) >= 40;
}

// ─── Referral bonus detection ─────────────────────────────────────────────────

const REFERRAL_MENTION_PATTERNS: RegExp[] = [
  /referral\s+bonus/i,
  /referral\s+program/i,
  /employee\s+referral/i,
  /refer\s+a\s+friend/i,
  /referral\s+reward/i,
];

const AMOUNT_EXTRACTION_PATTERNS: RegExp[] = [
  /\$\s*(\d{1,3}(?:,\d{3})+)/,
  /\$\s*(\d+(?:\.\d+)?)\s*[kK]/,
  /\$\s*(\d{3,})/,
];

export function detectReferralBonusInText(
  text: string,
): { detected: boolean; amount?: string } {
  if (!text) return { detected: false };
  const hasMention = REFERRAL_MENTION_PATTERNS.some((p) => p.test(text));
  if (!hasMention) return { detected: false };

  for (const amountPattern of AMOUNT_EXTRACTION_PATTERNS) {
    const match = amountPattern.exec(text);
    if (match) {
      const rawValue = match[1];
      if (/[kK]/.test(match[0])) {
        const numeric = parseFloat(rawValue);
        if (!isNaN(numeric)) {
          return { detected: true, amount: `$${Math.round(numeric * 1_000).toLocaleString('en-US')}` };
        }
      }
      return { detected: true, amount: `$${rawValue}` };
    }
  }
  return { detected: true };
}

// ─── Referral bonus upsert ────────────────────────────────────────────────────

async function upsertDiscoveredBonus(
  companyId: string,
  amount: string | undefined,
  dataSource: string,
  programUrl?: string,
): Promise<boolean> {
  try {
    // Check if a program already exists
    const { data: existing } = await supabaseAdmin
      .from('referral_bonus_programs')
      .select('id, confidence')
      .eq('company_id', companyId)
      .limit(1)
      .maybeSingle();

    // Never overwrite high or medium confidence data
    if (existing && existing.confidence !== 'low') return false;

    // If existing low-confidence row and no new amount info, skip
    if (existing && !amount) return false;

    const row: Record<string, unknown> = {
      company_id: companyId,
      bonus_amount: amount ?? 'Available',
      bonus_currency: 'USD',
      confidence: 'low',
      data_source: dataSource,
      last_verified_at: new Date().toISOString(),
    };
    if (programUrl) row.program_url = programUrl;

    const { error } = await supabaseAdmin
      .from('referral_bonus_programs')
      .upsert(row, { onConflict: 'company_id' });

    if (error) {
      logger.debug({ error: error.message, companyId }, 'upsertDiscoveredBonus: failed');
      return false;
    }
    return true;
  } catch {
    return false;
  }
}

// ─── Referral bonus lookup ────────────────────────────────────────────────────

async function hasReferralProgram(companyId: string): Promise<boolean> {
  try {
    const { data, error } = await supabaseAdmin
      .from('referral_bonus_programs')
      .select('id')
      .eq('company_id', companyId)
      .limit(1)
      .single();
    if (error) return false;
    return !!data;
  } catch {
    return false;
  }
}

// ─── Per-company scanner ─────────────────────────────────────────────────────

interface CompanyScanResult {
  jobsFound: number;
  matchingJobs: number;
  referralAvailable: number;
  source: ScrapeSource;
  error?: string;
}

// ─── Post-fetch filtering ─────────────────────────────────────────────────────

interface ParsedLocationIntent {
  city: string | null;
  state: string | null;
}

function escapeRegex(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function parseLocationIntent(location: string | undefined): ParsedLocationIntent | null {
  const raw = location?.trim().toLowerCase();
  if (!raw) return null;

  const commaParts = raw.split(',').map((part) => part.trim()).filter(Boolean);
  const trailingState = raw.match(/(?:,|\s)([a-z]{2})$/)?.[1] ?? null;
  const state = commaParts.length > 1 && /^[a-z]{2}$/.test(commaParts[commaParts.length - 1] ?? '')
    ? commaParts[commaParts.length - 1]!
    : trailingState;
  const citySource = commaParts.length > 1
    ? commaParts.slice(0, -1).join(' ')
    : raw.replace(/(?:,|\s)[a-z]{2}$/, '').trim();
  const city = citySource.length > 0 && citySource !== state ? citySource : null;

  return city || state ? { city, state } : null;
}

function hasWholePlaceName(haystack: string, needle: string): boolean {
  return new RegExp(`(?:^|[^a-z])${escapeRegex(needle)}(?:$|[^a-z])`, 'i').test(haystack);
}

function hasStateToken(location: string, state: string): boolean {
  return new RegExp(`(?:^|[^a-z])${escapeRegex(state)}(?:$|[^a-z])`, 'i').test(location);
}

function locationMatchesIntent(jobLocation: string | null, intent: ParsedLocationIntent | null): boolean {
  if (!intent) return true;
  if (!jobLocation) return false; // unknown location cannot satisfy a city/state filter

  const normalized = jobLocation.toLowerCase();
  if (normalized.includes('remote')) return true; // remote is not tied to a city

  const cityMatches = intent.city ? hasWholePlaceName(normalized, intent.city) : true;
  const stateMatches = intent.state ? hasStateToken(normalized, intent.state) : true;

  if (intent.city && intent.state) {
    // If the job only says "Portland" without a state, keep it. If it says
    // "Portland, ME", do not let a city-only match pass for "Portland, OR".
    return cityMatches && (stateMatches || !/\b[a-z]{2}\b/i.test(normalized));
  }

  return cityMatches && stateMatches;
}

/**
 * Apply work-mode, location, and date filters to a raw job list.
 * Freshness is strict: when a posted-within filter is active, jobs with no
 * readable source posting date are excluded rather than guessed.
 */
function applyFilters(jobs: ATSJob[], filters: NiScrapeFilters): ATSJob[] {
  let result = jobs;

  // Work mode filter — applied before location so remote jobs aren't excluded
  // by a city-specific location filter when Remote is selected.
  const selectedModes = filters.work_modes?.length
    ? new Set<NiWorkMode>(filters.work_modes)
    : filters.remote_only
      ? new Set<NiWorkMode>(['remote'])
      : null;

  if (selectedModes && selectedModes.size < 3) {
    result = result.filter((job) => {
      const mode = classifyWorkMode(job.title, job.descriptionSnippet ?? '', job.location ?? undefined);
      return mode !== 'unknown' && selectedModes.has(mode);
    });
  }

  // Location filter — city/state-aware matching. Avoid substring matches such
  // as "OR" matching "New York".
  // "Remote" jobs always pass through (remote is not a place).
  const locationIntent = parseLocationIntent(filters.location);
  if (locationIntent) {
    result = result.filter((job) => locationMatchesIntent(job.location, locationIntent));
  }

  // Date filter — only applied when the job has a known postedOn date.
  if (filters.max_days_old > 0) {
    result = result.filter((job) => {
      return isWithinFreshnessWindow(job.postedOn, filters.max_days_old);
    });
  }

  return result;
}

async function scanCompany(
  company: CompanyInfo,
  targetTitles: string[],
  userId: string,
  searchContext: NiSearchContext,
  filters: NiScrapeFilters,
): Promise<CompanyScanResult> {
  const referral = await hasReferralProgram(company.id);
  let allJobs: ATSJob[] = [];
  let source: ScrapeSource = 'serper';

  // Tier 1: Direct ATS API (if platform + slug known)
  if (company.ats_platform && company.ats_slug) {
    try {
      allJobs = await fetchFromATS(company.ats_platform, company.ats_slug);
      source = company.ats_platform;
      if (allJobs.length > 0) {
        logger.info(
          { companyId: company.id, companyName: company.name, platform: company.ats_platform, jobCount: allJobs.length },
          'job-scanner: ATS API returned jobs',
        );
      }
    } catch (err) {
      logger.debug({ err, companyId: company.id, platform: company.ats_platform }, 'job-scanner: ATS API failed');
    }
  }

  // Tier 1.5: JSON-LD extraction from known career page URLs (if domain known)
  if (allJobs.length === 0 && company.domain) {
    try {
      const careerUrls = [
        `https://${company.domain}/careers`,
        `https://careers.${company.domain}`,
        `https://${company.domain}/jobs`,
      ];
      for (const careerUrl of careerUrls) {
        allJobs = await extractJobsFromCareerPage(careerUrl);
        if (allJobs.length > 0) {
          source = 'jsonld';
          logger.info(
            { companyId: company.id, companyName: company.name, jobCount: allJobs.length, careerUrl },
            'job-scanner: JSON-LD extraction found jobs',
          );
          break;
        }
      }
    } catch (err) {
      logger.debug({ err, companyId: company.id }, 'job-scanner: JSON-LD extraction failed');
    }
  }

  // Tier 2: Serper Google Jobs search fallback
  if (allJobs.length === 0) {
    try {
      allJobs = await searchJobsViaSerper(
        company.name,
        targetTitles,
        filters.location,
        filters.max_days_old,
        filters.radius_miles,
        filters.work_modes,
      );
      source = 'serper';
      if (allJobs.length > 0) {
        logger.info(
          { companyId: company.id, companyName: company.name, jobCount: allJobs.length },
          'job-scanner: Serper search found jobs',
        );
      }
    } catch (err) {
      logger.debug({ err, companyId: company.id }, 'job-scanner: Serper search failed');
    }
  }

  // Apply location / remote / date filters after all tiers have run
  allJobs = applyFilters(allJobs, filters);

  if (allJobs.length === 0) {
    return { jobsFound: 0, matchingJobs: 0, referralAvailable: 0, source };
  }

  // Passive referral bonus detection — scan job descriptions for bonus mentions
  if (!(await hasReferralProgram(company.id))) {
    for (const job of allJobs.slice(0, 10)) { // Check first 10 jobs max
      if (!job.descriptionSnippet) continue;
      const bonusResult = detectReferralBonusInText(job.descriptionSnippet);
      if (bonusResult.detected) {
        const inserted = await upsertDiscoveredBonus(
          company.id,
          bonusResult.amount,
          'job_posting_scan',
          job.url ?? undefined,
        );
        if (inserted) {
          logger.info(
            { companyId: company.id, companyName: company.name, amount: bonusResult.amount },
            'job-scanner: discovered referral bonus from job posting',
          );
        }
        break; // One detection per company is enough
      }
    }
  }

  // Filter to matching jobs and store
  const matchingJobs = allJobs.filter((j) => titleMatchesTargets(j.title, targetTitles));
  let storedCount = 0;

  for (const job of matchingJobs.slice(0, 20)) {
    const score = computeMatchScore(job.title, targetTitles);
    const remoteType = classifyWorkMode(
      job.title,
      job.descriptionSnippet ?? '',
      job.location ?? undefined,
    );
    const normalizedPostedOn = normalizeJobPostedDate(job.postedOn)?.toISOString();
    const inserted = await insertJobMatch(userId, {
      company_id: company.id,
      title: job.title,
      url: job.url || undefined,
      location: job.location || undefined,
      salary_range: job.salaryRange || undefined,
      description_snippet: job.descriptionSnippet || undefined,
      match_score: score,
      referral_available: referral,
      posted_on: normalizedPostedOn || undefined,
      scraped_at: new Date().toISOString(),
      metadata: {
        source: job.source,
        search_context: searchContext,
        remote_type: remoteType === 'unknown' ? null : remoteType,
      },
    });
    if (inserted) storedCount++;
  }

  return {
    jobsFound: allJobs.length,
    matchingJobs: storedCount,
    referralAvailable: referral && storedCount > 0 ? storedCount : 0,
    source,
  };
}

// ─── Public API: searchJobsByCompany ─────────────────────────────────────────

/**
 * Search for jobs at a specific company via Serper.
 * Returns summary counts only — for full DB storage use scrapeCareerPages().
 */
export async function searchJobsByCompany(
  companyName: string,
  targetTitles: string[],
  _userId: string,
): Promise<ScrapeResult> {
  const jobs = await searchJobsViaSerper(companyName, targetTitles);

  const initBreakdown: Record<ScrapeSource, number> = {
    lever: 0, greenhouse: 0, workday: 0, ashby: 0, icims: 0, recruitee: 0, workable: 0, personio: 0, jsonld: 0, serper: 0,
  };

  if (jobs.length === 0) {
    return {
      companiesScanned: 1, jobsFound: 0, matchingJobs: 0, referralAvailable: 0,
      errors: [], sourceBreakdown: initBreakdown,
    };
  }

  const matching = jobs.filter((j) => titleMatchesTargets(j.title, targetTitles));
  initBreakdown.serper = matching.length;

  return {
    companiesScanned: 1, jobsFound: jobs.length, matchingJobs: matching.length,
    referralAvailable: 0, errors: [], sourceBreakdown: initBreakdown,
  };
}

// ─── Public API: scrapeCareerPages ──────────────────────────────────────────

/**
 * Scan job listings for the given companies using a two-tier strategy:
 *   1. Direct ATS API (Lever, Greenhouse, Workday, Ashby, iCIMS) when ats_platform is known
 *   2. Serper Google Jobs search for the rest
 *
 * Matches against target titles and stores results via insertJobMatch().
 * Max 50 companies per run, 500ms delay between companies.
 */
export type ScrapeProgressCallback = (progress: {
  companies_scanned: number;
  jobs_found: number;
  matching_jobs: number;
  referral_available: number;
}) => void | Promise<void>;

export async function scrapeCareerPages(
  companies: CompanyInfo[],
  targetTitles: string[],
  userId: string,
  searchContext: NiSearchContext = 'network_connections',
  onProgress?: ScrapeProgressCallback,
  filters?: NiScrapeFilters,
): Promise<ScrapeResult> {
  const resolvedFilters: NiScrapeFilters = filters ?? { remote_only: false, max_days_old: 7 };
  const limited = companies.slice(0, MAX_COMPANIES);
  const errors: { company: string; error: string }[] = [];

  let companiesScanned = 0;
  let jobsFound = 0;
  let matchingJobs = 0;
  let referralAvailable = 0;
  const sourceBreakdown: Record<ScrapeSource, number> = {
    lever: 0, greenhouse: 0, workday: 0, ashby: 0, icims: 0, recruitee: 0, workable: 0, personio: 0, jsonld: 0, serper: 0,
  };

  for (let i = 0; i < limited.length; i++) {
    const company = limited[i];

    if (i > 0) {
      await new Promise<void>((resolve) => setTimeout(resolve, REQUEST_DELAY_MS));
    }

    logger.info(
      { companyId: company.id, companyName: company.name, userId, index: i, ats: company.ats_platform ?? 'none' },
      'job-scanner: scanning company',
    );

    try {
      const result = await scanCompany(company, targetTitles, userId, searchContext, resolvedFilters);
      companiesScanned++;
      jobsFound += result.jobsFound;
      matchingJobs += result.matchingJobs;
      referralAvailable += result.referralAvailable;
      if (result.matchingJobs > 0) {
        sourceBreakdown[result.source] = (sourceBreakdown[result.source] ?? 0) + result.matchingJobs;
      }
      if (result.error) {
        errors.push({ company: company.name, error: result.error });
      }
      await onProgress?.({ companies_scanned: companiesScanned, jobs_found: jobsFound, matching_jobs: matchingJobs, referral_available: referralAvailable });
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      logger.error({ error: msg, companyId: company.id, userId }, 'job-scanner: company scan threw');
      errors.push({ company: company.name, error: msg });
    }
  }

  return { companiesScanned, jobsFound, matchingJobs, referralAvailable, errors, sourceBreakdown };
}
