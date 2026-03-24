/**
 * Career Page Scraper — Network Intelligence
 *
 * Fetches company career pages using native fetch (no Playwright).
 * Tries common career URL patterns, parses HTML for job listings,
 * matches against target titles, and stores results via insertJobMatch().
 */

import { supabaseAdmin } from '../supabase.js';
import { insertJobMatch } from './job-matches-store.js';
import logger from '../logger.js';
import { JSearchAdapter } from '../job-search/adapters/jsearch.js';
import { AdzunaAdapter } from '../job-search/adapters/adzuna.js';
import type { CompanyInfo, ScrapeResult, ScrapeSource } from './types.js';
import type { JobResult, SearchFilters } from '../job-search/types.js';

// ─── Constants ────────────────────────────────────────────────────────────────

const REQUEST_DELAY_MS = 2_000;
const MAX_COMPANIES = 50;
const FETCH_TIMEOUT_MS = 10_000;

/** Block private/loopback/link-local domains to prevent SSRF. */
function isPrivateDomain(domain: string): boolean {
  const lower = domain.toLowerCase();
  if (lower === 'localhost' || lower.endsWith('.local') || lower.endsWith('.internal')) return true;
  // Block raw IPs in private ranges
  const ipMatch = /^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/.exec(lower);
  if (ipMatch) {
    const [, a, b] = ipMatch.map(Number);
    if (a === 10) return true;                         // 10.0.0.0/8
    if (a === 172 && b >= 16 && b <= 31) return true;  // 172.16.0.0/12
    if (a === 192 && b === 168) return true;            // 192.168.0.0/16
    if (a === 127) return true;                         // 127.0.0.0/8
    if (a === 169 && b === 254) return true;            // 169.254.0.0/16
    if (a === 0) return true;                           // 0.0.0.0/8
  }
  return false;
}

/** Career page path patterns to try for each company domain. */
const CAREER_PATHS = ['/careers', '/jobs', '/careers/jobs', '/about/careers', '/en/careers'];

/** Common job board query patterns to append for filtered searches. */
const SEARCH_SUFFIXES = ['', '/search', '?type=professional', '?category=executive'];

// ─── HTML parsing ─────────────────────────────────────────────────────────────

interface ParsedJob {
  title: string;
  url: string;
  location: string;
}

/**
 * Simple regex-based HTML parser for job listings.
 * Looks for <a> tags that contain job-related text patterns.
 * This is intentionally lightweight — we're doing keyword matching, not full DOM parsing.
 */
function parseJobsFromHtml(html: string, baseUrl: string): ParsedJob[] {
  const jobs: ParsedJob[] = [];
  const seen = new Set<string>();

  // Match <a href="...">text</a> patterns — cover multi-line content
  const linkPattern = /<a\s+[^>]*href=["']([^"']+)["'][^>]*>([\s\S]*?)<\/a>/gi;

  let match: RegExpExecArray | null;
  while ((match = linkPattern.exec(html)) !== null) {
    const href = match[1];
    const innerText = match[2]
      .replace(/<[^>]+>/g, ' ')  // strip inner tags
      .replace(/\s+/g, ' ')
      .trim();

    if (!innerText || innerText.length < 4 || innerText.length > 200) continue;

    // Skip navigation links and non-job content
    if (/^(home|about|contact|blog|news|press|privacy|terms|login|sign)/i.test(innerText)) continue;

    // Must look like a job title: contains a role keyword
    const JOB_KEYWORDS = /\b(director|manager|engineer|analyst|specialist|coordinator|lead|head|chief|officer|president|vp|vice president|associate|consultant|advisor|executive)\b/i;
    if (!JOB_KEYWORDS.test(innerText)) continue;

    // Resolve relative URLs
    let resolvedUrl = href;
    if (href.startsWith('/')) {
      try {
        const base = new URL(baseUrl);
        resolvedUrl = `${base.origin}${href}`;
      } catch {
        resolvedUrl = href;
      }
    } else if (!href.startsWith('http')) {
      continue; // Skip anchors and javascript: links
    }

    const key = innerText.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);

    jobs.push({ title: innerText, url: resolvedUrl, location: '' });

    if (jobs.length >= 100) break; // Cap per page
  }

  return jobs;
}

// ─── Title matching ───────────────────────────────────────────────────────────

/**
 * Compute a simple keyword overlap score between a job title and target titles.
 * Returns 0-100.
 */
function computeMatchScore(jobTitle: string, targetTitles: string[]): number {
  if (targetTitles.length === 0) return 50; // default if no targets

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

function titleMatchesTargets(jobTitle: string, targetTitles: string[]): boolean {
  if (targetTitles.length === 0) return true; // no filter — take everything
  return computeMatchScore(jobTitle, targetTitles) >= 40;
}

// ─── Referral bonus detection ─────────────────────────────────────────────────

/**
 * Regex patterns that signal a referral bonus mention in job description text.
 * Listed in decreasing specificity — the first match wins for amount extraction.
 */
const REFERRAL_MENTION_PATTERNS: RegExp[] = [
  /referral\s+bonus/i,
  /referral\s+program/i,
  /employee\s+referral/i,
  /refer\s+a\s+friend/i,
  /referral\s+reward/i,
];

/**
 * Patterns used to extract a dollar amount from text near a referral mention.
 * Tries to capture "$X,XXX", "$XK", "$X.XK" style values.
 */
const AMOUNT_EXTRACTION_PATTERNS: RegExp[] = [
  /\$\s*(\d{1,3}(?:,\d{3})+)/,      // $X,XXX or $XX,XXX
  /\$\s*(\d+(?:\.\d+)?)\s*[kK]/,    // $5K, $10k, $7.5k
  /\$\s*(\d{3,})/,                   // $5000 bare digits
];

/**
 * Detect whether a job description text mentions a referral bonus program
 * and attempt to extract the dollar amount if present.
 *
 * @param text - Raw job description or posting text
 * @returns `{ detected: true, amount?: string }` or `{ detected: false }`
 */
export function detectReferralBonusInText(
  text: string,
): { detected: boolean; amount?: string } {
  if (!text) return { detected: false };

  const hasMention = REFERRAL_MENTION_PATTERNS.some((pattern) => pattern.test(text));
  if (!hasMention) return { detected: false };

  // Attempt to extract a dollar amount from the surrounding text
  for (const amountPattern of AMOUNT_EXTRACTION_PATTERNS) {
    const match = amountPattern.exec(text);
    if (match) {
      const rawValue = match[1];
      // Normalize "K" shorthand amounts to full dollar values
      if (/[kK]/.test(match[0])) {
        const numeric = parseFloat(rawValue);
        if (!isNaN(numeric)) {
          const dollars = Math.round(numeric * 1_000);
          return { detected: true, amount: `$${dollars.toLocaleString('en-US')}` };
        }
      }
      return { detected: true, amount: `$${rawValue}` };
    }
  }

  return { detected: true };
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

// ─── API-based company search helpers ────────────────────────────────────────

const API_SEARCH_FILTERS: SearchFilters = {
  datePosted: '30d',
};

/**
 * Map a JobResult array from a search adapter into the ParsedJob format used
 * by the rest of the scraper pipeline.
 */
function jobResultsToParsedJobs(results: JobResult[]): ParsedJob[] {
  const seen = new Set<string>();
  const jobs: ParsedJob[] = [];

  for (const r of results) {
    const key = `${r.title.toLowerCase()}|${r.location?.toLowerCase() ?? ''}`;
    if (seen.has(key)) continue;
    seen.add(key);

    jobs.push({
      title: r.title,
      url: r.apply_url ?? '',
      location: r.location ?? '',
    });
  }

  return jobs;
}

/**
 * Search JSearch API for jobs at a specific company by name.
 * Returns empty array when JSEARCH_API_KEY is missing or on any error.
 */
async function searchJobsByCompanyViaJSearch(
  companyName: string,
  targetTitles: string[],
): Promise<ParsedJob[]> {
  if (!process.env.JSEARCH_API_KEY) {
    logger.warn({ companyName }, 'career-scraper: JSEARCH_API_KEY not set — skipping JSearch fallback');
    return [];
  }

  try {
    const adapter = new JSearchAdapter();

    const queries = targetTitles.length > 0
      ? targetTitles.map((t) => `"${t}" at "${companyName}"`)
      : [`jobs at "${companyName}"`];

    const allResults: JobResult[] = [];
    for (const query of queries.slice(0, 3)) { // cap at 3 queries per company
      const results = await adapter.search(query, '', API_SEARCH_FILTERS);
      // Only keep results that actually match the target company
      const filtered = results.filter((r) =>
        r.company.toLowerCase().includes(companyName.toLowerCase()) ||
        companyName.toLowerCase().includes(r.company.toLowerCase()),
      );
      allResults.push(...filtered);
    }

    return jobResultsToParsedJobs(allResults);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    logger.warn({ companyName, error: message }, 'career-scraper: JSearch company search failed');
    return [];
  }
}

/**
 * Search Adzuna API for jobs at a specific company by name.
 * Returns empty array when ADZUNA credentials are missing or on any error.
 */
async function searchJobsByCompanyViaAdzuna(
  companyName: string,
  targetTitles: string[],
): Promise<ParsedJob[]> {
  if (!process.env.ADZUNA_APP_ID || !process.env.ADZUNA_API_KEY) {
    logger.warn({ companyName }, 'career-scraper: Adzuna credentials not set — skipping Adzuna fallback');
    return [];
  }

  try {
    const adapter = new AdzunaAdapter();

    const queries = targetTitles.length > 0
      ? targetTitles.map((t) => `${t} ${companyName}`)
      : [companyName];

    const allResults: JobResult[] = [];
    for (const query of queries.slice(0, 3)) { // cap at 3 queries per company
      const results = await adapter.search(query, '', API_SEARCH_FILTERS);
      // Only keep results that actually match the target company
      const filtered = results.filter((r) =>
        r.company.toLowerCase().includes(companyName.toLowerCase()) ||
        companyName.toLowerCase().includes(r.company.toLowerCase()),
      );
      allResults.push(...filtered);
    }

    return jobResultsToParsedJobs(allResults);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    logger.warn({ companyName, error: message }, 'career-scraper: Adzuna company search failed');
    return [];
  }
}

/**
 * Public API: search for jobs at a specific company using JSearch then Adzuna as fallback.
 * This is the three-tier fallback chain exposed for direct use by other callers.
 */
export async function searchJobsByCompany(
  companyName: string,
  targetTitles: string[],
  _userId: string,
): Promise<ScrapeResult> {
  let jobs = await searchJobsByCompanyViaJSearch(companyName, targetTitles);
  let source: ScrapeSource = 'jsearch_api';

  if (jobs.length === 0) {
    jobs = await searchJobsByCompanyViaAdzuna(companyName, targetTitles);
    source = 'adzuna_api';
  }

  if (jobs.length === 0) {
    return {
      companiesScanned: 1,
      jobsFound: 0,
      matchingJobs: 0,
      referralAvailable: 0,
      errors: [],
      sourceBreakdown: { career_page: 0, jsearch_api: 0, adzuna_api: 0 },
    };
  }

  // This function returns summary counts only. Callers that need per-job DB
  // storage should use scrapeCareerPages(), which passes a real company_id.
  const matchingJobs = jobs.filter((j) => titleMatchesTargets(j.title, targetTitles));

  return {
    companiesScanned: 1,
    jobsFound: jobs.length,
    matchingJobs: matchingJobs.length,
    referralAvailable: 0,
    errors: [],
    sourceBreakdown: {
      career_page: 0,
      jsearch_api: source === 'jsearch_api' ? matchingJobs.length : 0,
      adzuna_api: source === 'adzuna_api' ? matchingJobs.length : 0,
    },
  };
}

// ─── Per-company scraper ──────────────────────────────────────────────────────

interface CompanyScrapeResult {
  jobsFound: number;
  matchingJobs: number;
  referralAvailable: number;
  source: ScrapeSource;
  error?: string;
}

async function scrapeCompany(
  company: CompanyInfo,
  targetTitles: string[],
  userId: string,
  useApiFallback: boolean,
): Promise<CompanyScrapeResult> {
  if (!company.domain) {
    return { jobsFound: 0, matchingJobs: 0, referralAvailable: 0, source: 'career_page', error: 'No domain' };
  }

  if (isPrivateDomain(company.domain)) {
    return { jobsFound: 0, matchingJobs: 0, referralAvailable: 0, source: 'career_page', error: 'Blocked private domain' };
  }

  const baseUrl = `https://${company.domain}`;
  const referral = await hasReferralProgram(company.id);

  let allJobs: ParsedJob[] = [];
  let source: ScrapeSource = 'career_page';

  // Tier 1: regex scrape of career pages
  outer: for (const path of CAREER_PATHS) {
    for (const suffix of SEARCH_SUFFIXES) {
      const url = `${baseUrl}${path}${suffix}`;
      try {
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);

        let response: Response;
        try {
          response = await fetch(url, {
            signal: controller.signal,
            headers: {
              'User-Agent': 'Mozilla/5.0 (compatible; ResumeAgentBot/1.0)',
              'Accept': 'text/html,application/xhtml+xml',
            },
            redirect: 'follow',
          });
        } finally {
          clearTimeout(timeoutId);
        }

        if (!response.ok) continue;

        const contentType = response.headers.get('content-type') ?? '';
        if (!contentType.includes('text/html')) continue;

        const html = await response.text();
        const jobs = parseJobsFromHtml(html, url);

        if (jobs.length > 0) {
          allJobs = jobs;
          break outer;
        }
      } catch {
        // Network error or timeout — try next path
        continue;
      }
    }
  }

  // Tier 2: JSearch API fallback when regex scraping found nothing
  if (allJobs.length === 0 && useApiFallback) {
    const jsearchResults = await searchJobsByCompanyViaJSearch(company.name, targetTitles);
    if (jsearchResults.length > 0) {
      allJobs = jsearchResults;
      source = 'jsearch_api';
      logger.info(
        { companyId: company.id, companyName: company.name, jobCount: allJobs.length },
        'career-scraper: JSearch fallback found jobs',
      );
    }
  }

  // Tier 3: Adzuna API fallback when JSearch also found nothing
  if (allJobs.length === 0 && useApiFallback) {
    const adzunaResults = await searchJobsByCompanyViaAdzuna(company.name, targetTitles);
    if (adzunaResults.length > 0) {
      allJobs = adzunaResults;
      source = 'adzuna_api';
      logger.info(
        { companyId: company.id, companyName: company.name, jobCount: allJobs.length },
        'career-scraper: Adzuna fallback found jobs',
      );
    }
  }

  if (allJobs.length === 0) {
    return { jobsFound: 0, matchingJobs: 0, referralAvailable: 0, source };
  }

  // Filter to matching jobs and store
  const matchingJobs = allJobs.filter((j) => titleMatchesTargets(j.title, targetTitles));
  let storedCount = 0;

  for (const job of matchingJobs.slice(0, 20)) { // cap at 20 per company
    const score = computeMatchScore(job.title, targetTitles);
    const inserted = await insertJobMatch(userId, {
      company_id: company.id,
      title: job.title,
      url: job.url || undefined,
      location: job.location || undefined,
      match_score: score,
      referral_available: referral,
      scraped_at: new Date().toISOString(),
      metadata: { source },
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

// ─── Public API ───────────────────────────────────────────────────────────────

/**
 * Scrape career pages for the given companies, match against target titles,
 * and store results via insertJobMatch().
 *
 * Three-tier fallback per company: regex scrape → JSearch API → Adzuna API.
 * API fallback is enabled by default and skipped when useApiFallback=false.
 *
 * Rate-limited to 2-second delay between companies.
 * Max 50 companies per scrape run.
 */
export async function scrapeCareerPages(
  companies: CompanyInfo[],
  targetTitles: string[],
  userId: string,
  useApiFallback = true,
): Promise<ScrapeResult> {
  const limited = companies.slice(0, MAX_COMPANIES);
  const errors: { company: string; error: string }[] = [];

  let companiesScanned = 0;
  let jobsFound = 0;
  let matchingJobs = 0;
  let referralAvailable = 0;
  const sourceBreakdown: Record<ScrapeSource, number> = {
    career_page: 0,
    jsearch_api: 0,
    adzuna_api: 0,
  };

  for (let i = 0; i < limited.length; i++) {
    const company = limited[i];

    if (i > 0) {
      await new Promise<void>((resolve) => setTimeout(resolve, REQUEST_DELAY_MS));
    }

    logger.info(
      { companyId: company.id, companyName: company.name, userId, index: i },
      'career-scraper: scraping company',
    );

    try {
      const result = await scrapeCompany(company, targetTitles, userId, useApiFallback);
      companiesScanned++;
      jobsFound += result.jobsFound;
      matchingJobs += result.matchingJobs;
      referralAvailable += result.referralAvailable;
      if (result.matchingJobs > 0) {
        sourceBreakdown[result.source] += result.matchingJobs;
      }

      if (result.error) {
        errors.push({ company: company.name, error: result.error });
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      logger.error({ error: msg, companyId: company.id, userId }, 'career-scraper: company scrape threw');
      errors.push({ company: company.name, error: msg });
    }
  }

  return { companiesScanned, jobsFound, matchingJobs, referralAvailable, errors, sourceBreakdown };
}
