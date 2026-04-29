/**
 * Job Finder Searcher — Tool definitions.
 *
 * 5 tools:
 * - search_career_pages: Discover job openings from supported public company pages
 * - generate_search_queries: Generate boolean search strings for job boards
 * - search_network_connections: Find network-adjacent opportunities
 * - deduplicate_results: Merge and deduplicate across all sources
 * - emit_transparency: Live progress updates
 */

import type { JobFinderTool, DiscoveredJob } from '../types.js';
import { scrapeCareerPages } from '../../../lib/ni/career-scraper.js';
import { getJobMatchesByUser } from '../../../lib/ni/job-matches-store.js';
import { getCompanySummary } from '../../../lib/ni/connections-store.js';
import { supabaseAdmin } from '../../../lib/supabase.js';
import logger from '../../../lib/logger.js';
import { createEmitTransparency } from '../../runtime/shared-tools.js';
import type { JobFinderState, JobFinderSSEEvent } from '../types.js';
import type { ATSPlatform } from '../../../lib/ni/types.js';

const SERPER_API_URL = 'https://google.serper.dev/search';
const SERPER_TIMEOUT_MS = 10_000;

/** Known ATS source labels written by the career scraper. */
const ATS_SOURCE_LABELS = new Set(['lever', 'greenhouse', 'workday', 'ashby', 'icims', 'serper']);

// ─── Tool: search_career_pages ──────────────────────────────────────

const searchCareerPagesTool: JobFinderTool = {
  name: 'search_career_pages',
  description:
    'Discover openings from supported public career pages for companies in the user\'s Network Intelligence watchlist. ' +
    'Use only publicly reachable job pages and supported ATS endpoints; treat restricted, payment, challenge, or authentication flows as unavailable. ' +
    'Fetches target titles from ni_client_target_titles and companies from company_directory. ' +
    'Rate-limited to 50 companies per run. Results are stored in scratchpad as career_page_results.',
  model_tier: 'light',
  input_schema: {
    type: 'object',
    properties: {
      company_ids: {
        type: 'array',
        items: { type: 'string' },
        description: 'Optional list of specific company IDs to check. If omitted, uses all companies from user NI connections.',
      },
    },
    required: [],
  },
  async execute(input, ctx) {
    const state = ctx.getState();

    ctx.emit({
      type: 'transparency',
      stage: 'searching',
      message: 'Loading target job titles and company watchlist...',
    });

    // ─── Load target titles ───────────────────────────────────────
    let targetTitles: string[] = [];
    try {
      const { data: titleRows } = await supabaseAdmin
        .from('ni_client_target_titles')
        .select('title')
        .eq('user_id', state.user_id)
        .order('priority', { ascending: true })
        .limit(20);

      if (titleRows && titleRows.length > 0) {
        targetTitles = (titleRows as Array<{ title: string }>).map((r) => r.title);
      }
    } catch {
      // No target titles — scraper will use default keyword matching
    }

    // ─── Load companies to check ──────────────────────────────────
    let companiesToScrape: Array<{ id: string; name: string; domain: string | null; ats_platform?: ATSPlatform | null; ats_slug?: string | null }> = [];
    const requestedIds = Array.isArray(input.company_ids)
      ? (input.company_ids as string[])
      : [];

    try {
      let query = supabaseAdmin
        .from('company_directory')
        .select('id, name_display, domain, ats_platform, ats_slug')
        .not('domain', 'is', null)
        .limit(50);

      if (requestedIds.length > 0) {
        query = query.in('id', requestedIds);
      } else {
        // Use companies the user has connections at
        const summary = await getCompanySummary(state.user_id);
        const companyIds = summary
          .filter((s) => s.companyId !== null)
          .map((s) => s.companyId as string)
          .slice(0, 50);

        if (companyIds.length > 0) {
          query = query.in('id', companyIds);
        }
      }

      const { data: companies } = await query;
      if (companies) {
        companiesToScrape = (companies as Array<{ id: string; name_display: string; domain: string | null; ats_platform: string | null; ats_slug: string | null }>).map((c) => ({
          id: c.id,
          name: c.name_display,
          domain: c.domain,
          ats_platform: c.ats_platform as ATSPlatform | null,
          ats_slug: c.ats_slug,
        }));
      }
    } catch {
      return JSON.stringify({ success: false, error: 'Failed to load company list' });
    }

    if (companiesToScrape.length === 0) {
      ctx.emit({
        type: 'search_progress',
        source: 'career_page',
        jobs_found: 0,
        companies_scanned: 0,
      });
      ctx.scratchpad.career_page_results = [];
      return JSON.stringify({ success: true, jobs_found: 0, message: 'No companies available to check' });
    }

    ctx.emit({
      type: 'transparency',
      stage: 'searching',
      message: `Checking public company job pages for ${companiesToScrape.length} companies (this may take a moment)...`,
    });

    const scrapeResult = await scrapeCareerPages(companiesToScrape, targetTitles, state.user_id);

    // Retrieve scraped matches from DB to populate search_results
    const jobMatches = await getJobMatchesByUser(state.user_id, { status: 'new', limit: 200 });
    const careerPageJobs: DiscoveredJob[] = jobMatches
      .filter((m) => {
        const src = (m.metadata)?.source;
        return typeof src === 'string' && ATS_SOURCE_LABELS.has(src);
      })
      .map((m) => {
        const companyInfo = companiesToScrape.find((c) => c.id === m.company_id);
        return {
          title: m.title,
          company: companyInfo?.name ?? m.company_id,
          company_id: m.company_id,
          url: m.url ?? undefined,
          location: m.location ?? undefined,
          salary_range: m.salary_range ?? undefined,
          source: 'career_page' as const,
          match_score: m.match_score ?? undefined,
          description_snippet: m.description_snippet ?? undefined,
        };
      });

    ctx.scratchpad.career_page_results = careerPageJobs;

    ctx.emit({
      type: 'search_progress',
      source: 'career_page',
      jobs_found: careerPageJobs.length,
      companies_scanned: scrapeResult.companiesScanned,
    });

    ctx.emit({
      type: 'transparency',
      stage: 'searching',
      message: `Public company-job check complete — ${scrapeResult.companiesScanned} companies, ${careerPageJobs.length} matching jobs found`,
    });

    return JSON.stringify({
      success: true,
      companies_scanned: scrapeResult.companiesScanned,
      jobs_found: scrapeResult.jobsFound,
      matching_jobs: careerPageJobs.length,
      referral_available: scrapeResult.referralAvailable,
    });
  },
};

// ─── Tool: generate_search_queries ─────────────────────────────────

const generateSearchQueriesTool: JobFinderTool = {
  name: 'generate_search_queries',
  description:
    'Search public job-posting pages matching the candidate\'s target titles and location via Serper. ' +
    'Only use public search results and publicly reachable posting pages. ' +
    'Stores discovered jobs in scratchpad as web_search_results.',
  model_tier: 'light',
  input_schema: {
    type: 'object',
    properties: {
      resume_text: {
        type: 'string',
        description: 'Full text of the candidate\'s resume. Used to extract target titles if none are set.',
      },
    },
    required: ['resume_text'],
  },
  async execute(input, ctx) {
    const resumeText = String(input.resume_text ?? '');
    if (resumeText.length < 50) {
      return JSON.stringify({ success: false, error: 'resume_text too short to extract search terms' });
    }

    const apiKey = process.env.SERPER_API_KEY;
    if (!apiKey) {
      return JSON.stringify({ success: false, error: 'SERPER_API_KEY not configured' });
    }

    ctx.emit({
      type: 'transparency',
      stage: 'searching',
      message: 'Searching public job-posting pages for matching openings...',
    });

    const state = ctx.getState();

    // Collect target titles from shared context
    const sharedTargetRole = state.shared_context?.targetRole;
    const positioningStrategy = state.platform_context?.positioning_strategy;
    const targetTitles: string[] = [];
    const seenTitles = new Set<string>();
    const pushTargetTitle = (value: unknown) => {
      if (typeof value !== 'string') return;
      const trimmed = value.trim();
      if (!trimmed) return;
      const key = trimmed.toLowerCase();
      if (seenTitles.has(key)) return;
      seenTitles.add(key);
      targetTitles.push(trimmed);
    };

    pushTargetTitle(sharedTargetRole?.roleTitle);

    if (positioningStrategy && typeof positioningStrategy === 'object') {
      const ps = positioningStrategy;
      if (Array.isArray(ps.target_titles)) {
        for (const title of ps.target_titles.filter((t): t is string => typeof t === 'string').slice(0, 10)) {
          pushTargetTitle(title);
        }
      }
      pushTargetTitle(ps.target_role);
    }

    // If no target titles from context, fall back to a generic search
    if (targetTitles.length === 0) {
      targetTitles.push('executive');
    }

    const location = (sharedTargetRole as Record<string, unknown> | undefined)?.location;
    const locationStr = typeof location === 'string' ? location : '';

    const allJobs: DiscoveredJob[] = [];
    const seen = new Set<string>();

    for (const title of targetTitles.slice(0, 5)) {
      const query = locationStr ? `${title} jobs ${locationStr}` : `${title} jobs`;
      try {
        const res = await fetch(SERPER_API_URL, {
          method: 'POST',
          headers: {
            'X-API-KEY': apiKey,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({ q: query, num: 10 }),
          signal: AbortSignal.timeout(SERPER_TIMEOUT_MS),
        });

        if (!res.ok) {
          logger.debug({ status: res.status, query }, 'Serper web search returned non-OK');
          continue;
        }

        const data = (await res.json()) as { organic?: Array<{ title?: string; link?: string; snippet?: string }> };
        for (const item of data.organic ?? []) {
          if (!item.title || !item.link) continue;
          const key = item.title.toLowerCase();
          if (seen.has(key)) continue;
          seen.add(key);

          allJobs.push({
            title: item.title,
            company: 'Unknown',
            url: item.link,
            source: 'serper' as const,
            description_snippet: item.snippet ?? undefined,
          });
        }
      } catch {
        // Individual query failure — continue with remaining titles
      }
    }

    ctx.scratchpad.web_search_results = allJobs;

    ctx.emit({
      type: 'transparency',
      stage: 'searching',
      message: `Web search complete — ${allJobs.length} job pages found for ${targetTitles.length} target titles`,
    });

    return JSON.stringify({
      success: true,
      jobs_found: allJobs.length,
      target_titles_searched: targetTitles.slice(0, 5),
      location: locationStr || 'any',
    });
  },
};

// ─── Tool: search_network_connections ──────────────────────────────

const searchNetworkConnectionsTool: JobFinderTool = {
  name: 'search_network_connections',
  description:
    'Find job opportunities at companies where the user has LinkedIn connections. ' +
    'Cross-references existing job_matches with client_connections to surface network-adjacent openings. ' +
    'Results stored in scratchpad as network_results.',
  model_tier: 'light',
  input_schema: {
    type: 'object',
    properties: {},
    required: [],
  },
  async execute(_input, ctx) {
    const state = ctx.getState();

    ctx.emit({
      type: 'transparency',
      stage: 'searching',
      message: 'Finding opportunities at companies where you have connections...',
    });

    // Load existing job matches from DB
    const jobMatches = await getJobMatchesByUser(state.user_id, { limit: 200 });

    if (jobMatches.length === 0) {
      ctx.scratchpad.network_results = [];
      ctx.emit({
        type: 'search_progress',
        source: 'network',
        jobs_found: 0,
      });
      return JSON.stringify({ success: true, network_jobs_found: 0, message: 'No job matches found in database' });
    }

    // Get company summary to determine which companies have connections
    const companySummary = await getCompanySummary(state.user_id);
    const companiesWithConnections = new Map<string, { count: number; positions: string[] }>();
    for (const s of companySummary) {
      if (s.companyId) {
        companiesWithConnections.set(s.companyId, {
          count: s.connectionCount,
          positions: s.topPositions,
        });
      }
    }

    // Cross-reference job matches with connection companies
    const networkJobs: DiscoveredJob[] = [];
    for (const match of jobMatches) {
      const connectionInfo = companiesWithConnections.get(match.company_id);
      if (connectionInfo && connectionInfo.count > 0) {
        networkJobs.push({
          title: match.title,
          company: match.company_id, // will be resolved by dedup tool
          company_id: match.company_id,
          url: match.url ?? undefined,
          location: match.location ?? undefined,
          salary_range: match.salary_range ?? undefined,
          source: 'network' as const,
          match_score: match.match_score ?? undefined,
          description_snippet: match.description_snippet ?? undefined,
        });
      }
    }

    ctx.scratchpad.network_results = networkJobs;

    ctx.emit({
      type: 'search_progress',
      source: 'network',
      jobs_found: networkJobs.length,
    });

    ctx.emit({
      type: 'transparency',
      stage: 'searching',
      message: `Network search complete — ${networkJobs.length} jobs at companies where you have connections`,
    });

    return JSON.stringify({
      success: true,
      network_jobs_found: networkJobs.length,
      companies_with_connections: companiesWithConnections.size,
    });
  },
};

// ─── Tool: deduplicate_results ──────────────────────────────────────

const deduplicateResultsTool: JobFinderTool = {
  name: 'deduplicate_results',
  description:
    'Merge results from all search sources (career_page_results, search_queries, network_results) ' +
    'from scratchpad. Deduplicates by title+company (case-insensitive). ' +
    'Stores the consolidated list in scratchpad as all_results and updates pipeline state.',
  model_tier: 'light',
  input_schema: {
    type: 'object',
    properties: {},
    required: [],
  },
  async execute(_input, ctx) {
    const careerPageResults = (ctx.scratchpad.career_page_results as DiscoveredJob[] | undefined) ?? [];
    const networkResults = (ctx.scratchpad.network_results as DiscoveredJob[] | undefined) ?? [];
    const webSearchResults = (ctx.scratchpad.web_search_results as DiscoveredJob[] | undefined) ?? [];

    // Combine all sources
    const allJobs = [...careerPageResults, ...networkResults, ...webSearchResults];

    // Deduplicate by title+company (case-insensitive)
    const seen = new Set<string>();
    const deduplicated: DiscoveredJob[] = [];

    for (const job of allJobs) {
      const key = `${job.title.toLowerCase().trim()}::${job.company.toLowerCase().trim()}`;
      if (!seen.has(key)) {
        seen.add(key);
        deduplicated.push(job);
      }
    }

    ctx.scratchpad.all_results = deduplicated;

    // Update pipeline state
    ctx.updateState({ search_results: deduplicated });

    ctx.emit({
      type: 'transparency',
      stage: 'searching',
      message: `Results consolidated — ${deduplicated.length} unique jobs from ${allJobs.length} total (${allJobs.length - deduplicated.length} duplicates removed)`,
    });

    return JSON.stringify({
      success: true,
      total_before_dedup: allJobs.length,
      unique_results: deduplicated.length,
      duplicates_removed: allJobs.length - deduplicated.length,
      by_source: {
        career_page: careerPageResults.length,
        network: networkResults.length,
        web_search: webSearchResults.length,
      },
    });
  },
};

// ─── Exports ────────────────────────────────────────────────────────

export const searcherTools: JobFinderTool[] = [
  searchCareerPagesTool,
  generateSearchQueriesTool,
  searchNetworkConnectionsTool,
  deduplicateResultsTool,
  createEmitTransparency<JobFinderState, JobFinderSSEEvent>({ prefix: 'Searcher: ' }),
];
