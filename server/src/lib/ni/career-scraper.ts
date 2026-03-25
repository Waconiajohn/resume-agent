/**
 * Career Page Scraper — Network Intelligence
 *
 * Powered entirely by Firecrawl (single API key, single dependency).
 *
 * Two-tier fallback per company:
 *   1. Firecrawl /scrape on career page URLs → parse markdown for job links
 *   2. Firecrawl /search with job discovery queries
 *
 * Matches against target titles and stores results via insertJobMatch().
 */

import { supabaseAdmin } from '../supabase.js';
import { insertJobMatch } from './job-matches-store.js';
import logger from '../logger.js';
import type { CompanyInfo, ScrapeResult, ScrapeSource } from './types.js';

// ─── Constants ────────────────────────────────────────────────────────────────

const REQUEST_DELAY_MS = 2_000;
const MAX_COMPANIES = 50;
const FIRECRAWL_TIMEOUT_MS = 30_000;
const FIRECRAWL_API_URL = 'https://api.firecrawl.dev/v1';

/** Block private/loopback/link-local domains to prevent SSRF. */
function isPrivateDomain(domain: string): boolean {
  const lower = domain.toLowerCase();
  if (lower === 'localhost' || lower.endsWith('.local') || lower.endsWith('.internal')) return true;
  const ipMatch = /^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/.exec(lower);
  if (ipMatch) {
    const [, a, b] = ipMatch.map(Number);
    if (a === 10) return true;
    if (a === 172 && b >= 16 && b <= 31) return true;
    if (a === 192 && b === 168) return true;
    if (a === 127) return true;
    if (a === 169 && b === 254) return true;
    if (a === 0) return true;
  }
  return false;
}

/** Career page path patterns to try for each company domain. */
const CAREER_PATHS = ['/careers', '/jobs', '/careers/jobs', '/about/careers', '/en/careers'];

/** Role keywords used to identify job titles in scraped content. */
const JOB_KEYWORDS = /\b(director|manager|engineer|analyst|specialist|coordinator|lead|head|chief|officer|president|vp|vice president|associate|consultant|advisor|executive|developer|architect|designer)\b/i;

// ─── Firecrawl API helpers ──────────────────────────────────────────────────

function firecrawlHeaders(): Record<string, string> {
  return {
    'Content-Type': 'application/json',
    Authorization: `Bearer ${process.env.FIRECRAWL_API_KEY}`,
  };
}

interface FirecrawlScrapeResponse {
  success?: boolean;
  data?: { markdown?: string };
}

interface FirecrawlSearchResult {
  url?: string;
  title?: string;
  description?: string;
}

interface FirecrawlSearchResponse {
  success?: boolean;
  data?: FirecrawlSearchResult[];
}

// ─── Markdown parsing ─────────────────────────────────────────────────────────

interface ParsedJob {
  title: string;
  url: string;
  location: string;
}

/**
 * Parse job listings from Firecrawl markdown output.
 * Looks for [text](url) link patterns that contain job-title keywords.
 */
function parseJobsFromMarkdown(markdown: string, baseUrl: string): ParsedJob[] {
  const jobs: ParsedJob[] = [];
  const seen = new Set<string>();

  const linkPattern = /\[([^\]]+)\]\(([^)]+)\)/g;

  let match: RegExpExecArray | null;
  while ((match = linkPattern.exec(markdown)) !== null) {
    const text = match[1].replace(/\s+/g, ' ').trim();
    const href = match[2];

    if (!text || text.length < 4 || text.length > 200) continue;
    if (/^(home|about|contact|blog|news|press|privacy|terms|login|sign)/i.test(text)) continue;
    if (!JOB_KEYWORDS.test(text)) continue;

    let resolvedUrl = href;
    if (href.startsWith('/')) {
      try {
        resolvedUrl = `${new URL(baseUrl).origin}${href}`;
      } catch {
        resolvedUrl = href;
      }
    } else if (!href.startsWith('http')) {
      continue;
    }

    const key = text.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);

    jobs.push({ title: text, url: resolvedUrl, location: '' });
    if (jobs.length >= 100) break;
  }

  return jobs;
}

// ─── Title matching ───────────────────────────────────────────────────────────

function computeMatchScore(jobTitle: string, targetTitles: string[]): number {
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

function titleMatchesTargets(jobTitle: string, targetTitles: string[]): boolean {
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

// ─── Firecrawl scrape (tier 1) ──────────────────────────────────────────────

/**
 * Scrape a single URL via Firecrawl and return the markdown content.
 * Returns null when the API key is missing, the request fails, or the page has no content.
 */
async function scrapeUrlViaFirecrawl(url: string): Promise<string | null> {
  if (!process.env.FIRECRAWL_API_KEY) return null;

  try {
    const response = await fetch(`${FIRECRAWL_API_URL}/scrape`, {
      method: 'POST',
      headers: firecrawlHeaders(),
      body: JSON.stringify({ url, formats: ['markdown'] }),
      signal: AbortSignal.timeout(FIRECRAWL_TIMEOUT_MS),
    });

    if (!response.ok) {
      logger.debug({ url, status: response.status }, 'career-scraper: Firecrawl scrape non-OK');
      return null;
    }

    const data = (await response.json()) as FirecrawlScrapeResponse;
    if (!data.success || !data.data?.markdown) return null;
    return data.data.markdown;
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    logger.debug({ url, error: message }, 'career-scraper: Firecrawl scrape error');
    return null;
  }
}

// ─── Firecrawl search (tier 2) ──────────────────────────────────────────────

/**
 * Search for jobs at a specific company via Firecrawl web search.
 * Builds queries like "VP Operations jobs Acme Corp" and maps results to ParsedJob[].
 */
async function searchJobsViaFirecrawl(
  companyName: string,
  targetTitles: string[],
): Promise<ParsedJob[]> {
  if (!process.env.FIRECRAWL_API_KEY) {
    logger.warn({ companyName }, 'career-scraper: FIRECRAWL_API_KEY not set — skipping search fallback');
    return [];
  }

  try {
    const queries =
      targetTitles.length > 0
        ? targetTitles.map((t) => `${t} jobs ${companyName}`)
        : [`jobs at ${companyName}`];

    const allJobs: ParsedJob[] = [];
    const seen = new Set<string>();

    for (const query of queries.slice(0, 3)) {
      const response = await fetch(`${FIRECRAWL_API_URL}/search`, {
        method: 'POST',
        headers: firecrawlHeaders(),
        body: JSON.stringify({ query, limit: 10 }),
        signal: AbortSignal.timeout(FIRECRAWL_TIMEOUT_MS),
      });

      if (!response.ok) continue;

      const data = (await response.json()) as FirecrawlSearchResponse;
      if (!data.success || !data.data) continue;

      for (const result of data.data) {
        if (!result.title || !result.url) continue;
        const key = result.title.toLowerCase();
        if (seen.has(key)) continue;
        seen.add(key);

        allJobs.push({
          title: result.title,
          url: result.url,
          location: '',
        });
      }
    }

    return allJobs;
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    logger.warn({ companyName, error: message }, 'career-scraper: Firecrawl search failed');
    return [];
  }
}

// ─── Public API: searchJobsByCompany ─────────────────────────────────────────

/**
 * Search for jobs at a specific company via Firecrawl web search.
 * Returns summary counts only — callers that need per-job DB storage
 * should use scrapeCareerPages() which passes a real company_id.
 */
export async function searchJobsByCompany(
  companyName: string,
  targetTitles: string[],
  _userId: string,
): Promise<ScrapeResult> {
  const jobs = await searchJobsViaFirecrawl(companyName, targetTitles);

  if (jobs.length === 0) {
    return {
      companiesScanned: 1,
      jobsFound: 0,
      matchingJobs: 0,
      referralAvailable: 0,
      errors: [],
      sourceBreakdown: { firecrawl_scrape: 0, firecrawl_search: 0 },
    };
  }

  const matching = jobs.filter((j) => titleMatchesTargets(j.title, targetTitles));

  return {
    companiesScanned: 1,
    jobsFound: jobs.length,
    matchingJobs: matching.length,
    referralAvailable: 0,
    errors: [],
    sourceBreakdown: { firecrawl_scrape: 0, firecrawl_search: matching.length },
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
  useSearchFallback: boolean,
): Promise<CompanyScrapeResult> {
  if (!company.domain) {
    return { jobsFound: 0, matchingJobs: 0, referralAvailable: 0, source: 'firecrawl_scrape', error: 'No domain' };
  }

  if (isPrivateDomain(company.domain)) {
    return { jobsFound: 0, matchingJobs: 0, referralAvailable: 0, source: 'firecrawl_scrape', error: 'Blocked private domain' };
  }

  const baseUrl = `https://${company.domain}`;
  const referral = await hasReferralProgram(company.id);

  let allJobs: ParsedJob[] = [];
  let source: ScrapeSource = 'firecrawl_scrape';

  // Tier 1: Firecrawl scrape of career pages
  for (const path of CAREER_PATHS) {
    const url = `${baseUrl}${path}`;
    const markdown = await scrapeUrlViaFirecrawl(url);
    if (markdown) {
      const jobs = parseJobsFromMarkdown(markdown, url);
      if (jobs.length > 0) {
        allJobs = jobs;
        logger.info(
          { companyId: company.id, companyName: company.name, path, jobCount: jobs.length },
          'career-scraper: Firecrawl scrape found jobs',
        );
        break;
      }
    }
  }

  // Tier 2: Firecrawl search fallback
  if (allJobs.length === 0 && useSearchFallback) {
    const searchResults = await searchJobsViaFirecrawl(company.name, targetTitles);
    if (searchResults.length > 0) {
      allJobs = searchResults;
      source = 'firecrawl_search';
      logger.info(
        { companyId: company.id, companyName: company.name, jobCount: allJobs.length },
        'career-scraper: Firecrawl search fallback found jobs',
      );
    }
  }

  if (allJobs.length === 0) {
    return { jobsFound: 0, matchingJobs: 0, referralAvailable: 0, source };
  }

  // Filter to matching jobs and store
  const matchingJobs = allJobs.filter((j) => titleMatchesTargets(j.title, targetTitles));
  let storedCount = 0;

  for (const job of matchingJobs.slice(0, 20)) {
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
 * Two-tier fallback per company: Firecrawl scrape → Firecrawl search.
 * Search fallback is enabled by default and skipped when useApiFallback=false.
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
    firecrawl_scrape: 0,
    firecrawl_search: 0,
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
