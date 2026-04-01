# NI Scanner Restructure — Implementation Spec

Generated: 2026-04-01
Status: Review draft — DO NOT implement until approved

---

## 1. Current State Summary

### What Works
- **4 ATS API clients** (Lever, Greenhouse, Ashby, Workday) in `ats-clients.ts` — clean, tested, returning normalized `ATSJob[]`
- **Serper Google Jobs fallback** in `serper-job-search.ts` — functional now that `SERPER_API_KEY` is configured
- **Title matching** (`computeMatchScore`, `titleMatchesTargets`) — keyword overlap scoring with 40% threshold
- **Referral bonus detection** — regex-based pattern matching + DB lookup per company
- **Career scraper orchestration** (`scrapeCareerPages`) — iterates companies, dispatches to ATS or Serper, stores matches
- **Import service** — CSV pipeline + background career scrape trigger

### What's Broken
- **Job Finder integration is completely broken** — `search_career_pages` tool queries `company_directory` without `ats_platform` or `ats_slug`, so Tier 1 ATS API is never used. Then it filters results on `firecrawl_scrape | firecrawl_search | career_page_scraper` — source labels that no longer exist. Result: **zero jobs surface through Job Finder from NI scanning**.
- **Serper query is too narrow** — only searches 4 `site:` domains, missing iCIMS and broader career page hits
- **iCIMS has a type but no client** — `ATSPlatform` includes `'icims'`, `ScrapeSource` includes `'icims'`, parser accepts `icims.com` URLs, but `fetchFromATS()` returns `[]` for `case 'icims'` (falls to default)

### What's Dead Code
- `firecrawl_scrape` and `firecrawl_search` in `ScrapeSource` union — never produced by any current code path
- `_useApiFallback` parameter on `scrapeCareerPages()` — underscore-prefixed, unused
- `useApiFallback` parameter in `import-service.ts:runCareerScrape()` — passed through but ignored
- Firecrawl comment in `import-service.ts` line 119: "retried via Firecrawl search" — outdated
- `FirecrawlApp` import and usage in `job-finder/searcher/tools.ts:generate_search_queries` — Firecrawl dependency
- `firecrawl_search` in `DiscoveredJob.source` union in `job-finder/types.ts`
- `sourceBreakdown` initializer in `career-scraper.ts` includes `firecrawl_scrape` and `firecrawl_search` keys

---

## 2. Target Architecture

### Tier 1 — ATS Public APIs (Free, Structured)

Direct API calls to ATS platforms. Highest quality: structured JSON, full job data, no rate limits (public endpoints).

| Platform | Endpoint Pattern | Auth | Slug Format | Status |
|----------|-----------------|------|-------------|--------|
| Greenhouse | `boards-api.greenhouse.io/v1/boards/{slug}/jobs` | None | Company board name (e.g., `acme`) | Working |
| Lever | `api.lever.co/v0/postings/{slug}` | None | Company identifier (e.g., `netflix`) | Working |
| Ashby | `api.ashbyhq.com/posting-api/job-board/{slug}` | None | Company board name | Working |
| Workday | `{tenant}.{server}.myworkdayjobs.com/wday/cxs/{tenant}/{site}/jobs` | None | `{tenant}/{site}` (e.g., `microsoft/en-us`) | Working |
| iCIMS | `careers-{slug}.icims.com/jobs/search` | None | Company careers subdomain | **NEW — needs client** |

**How Workday works**: Uses an undocumented CXS (Candidate Experience Services) API. The slug format is `{tenant}/{site}`. It tries servers `wd5`, `wd1`, `wd3` sequentially. POST with `{ limit: 20, offset: 0, appliedFacets: {} }`.

**iCIMS API pattern**: iCIMS uses a JSON API at `https://careers-{company}.icims.com/jobs/search?ss=1&searchKeyword=&searchCategory=&searchLocation=&mode=json` or via their newer platform at `https://{company}.icims.com/jobs/search`. The response structure contains job objects with `title`, `url`, `location` fields. Needs research to confirm exact endpoint format — see Phase 2 prompt.

### Tier 2 — Serper Fallback (Paid, Less Structured)

Google search via Serper API for companies without known ATS metadata. Falls back here when:
- Company has no `ats_platform` set in `company_directory`
- Tier 1 ATS API returned 0 results

**Current query problems**:
1. Query uses exact quoted company name + exact quoted title + `careers` + only 4 `site:` domains
2. Missing `site:icims.com` in the query
3. Too narrow — misses companies with career pages on their own domain or on newer ATS platforms
4. The `careers` keyword in the query adds noise

**Proposed broader query**:
- Primary: `"{companyName}" jobs "{targetTitle}" (site:boards.greenhouse.io OR site:jobs.lever.co OR site:myworkdayjobs.com OR site:jobs.ashbyhq.com OR site:icims.com OR site:smartrecruiters.com)`
- Broader fallback (when primary returns 0): `"{companyName}" careers "{targetTitle}"` — drops `site:` restriction entirely, relies on parser to validate ATS domains

### Tier 3 — Firecrawl (Future, Not Built Now)

Raw URL scraping for career pages that don't expose a structured API. Not wired in — just define the interface so it plugs in later. See Section 5.

### ATS Slug Enrichment Pipeline (NEW — Highest Priority)

The biggest leverage point. Most companies in `company_directory` have `ats_platform IS NULL`. A one-time enrichment converts them from Tier 2 (Serper per-search) to Tier 1 (direct ATS API, free and structured).

**Strategy**:
1. For each company where `ats_platform IS NULL`:
   - Serper query: `"{company_name}" careers site:boards.greenhouse.io OR site:jobs.lever.co OR site:jobs.ashbyhq.com OR site:myworkdayjobs.com OR site:icims.com`
   - If a result matches a known ATS domain, parse the URL to extract platform + slug
   - Write `ats_platform` and `ats_slug` to `company_directory` permanently
2. This is a background batch job — not in the hot path of job scanning
3. Run once after CSV import, and on-demand via admin/route

**URL parsing examples**:
- `https://boards.greenhouse.io/acme/jobs/123` → platform: `greenhouse`, slug: `acme`
- `https://jobs.lever.co/netflix/abc-123` → platform: `lever`, slug: `netflix`
- `https://jobs.ashbyhq.com/notion` → platform: `ashby`, slug: `notion`
- `https://microsoft.wd5.myworkdayjobs.com/en-US/MSFTCareers` → platform: `workday`, slug: `microsoft/MSFTCareers`
- `https://careers-acme.icims.com/jobs/search` → platform: `icims`, slug: `acme`

---

## 3. Code Changes Required

### 3a. Dead Code Removal

| File | What to Remove | Lines |
|------|---------------|-------|
| `server/src/lib/ni/types.ts:234` | Remove `'firecrawl_scrape' \| 'firecrawl_search'` from `ScrapeSource` union | 234 |
| `server/src/lib/ni/career-scraper.ts:203-206` | Remove `firecrawl_scrape: 0, firecrawl_search: 0` from `initBreakdown` | 203-206 |
| `server/src/lib/ni/career-scraper.ts:234` | Remove `_useApiFallback` parameter from `scrapeCareerPages()` | 234 |
| `server/src/lib/ni/career-scraper.ts:248-249` | Remove `firecrawl_scrape: 0, firecrawl_search: 0` from `sourceBreakdown` | 248-249 |
| `server/src/lib/ni/import-service.ts:118-120` | Rewrite stale Firecrawl comment to reflect current three-tier strategy | 118-120 |
| `server/src/lib/ni/import-service.ts:126` | Remove `useApiFallback` parameter from `runCareerScrape()` | 126 |
| `server/src/lib/ni/import-service.ts:154` | Remove `useApiFallback` argument from `scrapeCareerPages()` call | 154 |
| `server/src/agents/job-finder/types.ts:34` | Remove `'firecrawl_search'` from `DiscoveredJob.source` union | 34 |
| `server/src/agents/job-finder/searcher/tools.ts:1` | Remove `FirecrawlApp` import | 1 |
| `server/src/agents/job-finder/searcher/tools.ts:129-131` | Fix source label filter (this is the critical integration bug) | 129-131 |

### 3b. iCIMS Client Implementation

Add to `ats-clients.ts` following the existing Lever/Greenhouse/Ashby/Workday pattern:

```typescript
// New: iCIMS client
export async function fetchICIMSJobs(slug: string): Promise<ATSJob[]> { ... }
```

Add `case 'icims': return fetchICIMSJobs(slug);` to `fetchFromATS()` dispatcher.

**Research needed**: The exact iCIMS public job board API endpoint format. Known patterns:
- `https://careers-{slug}.icims.com/jobs/search?mode=json`
- `https://{slug}.icims.com/jobs/search?in_iframe=1&mode=json`
- Some iCIMS instances use `https://jobs-{slug}.icims.com/`

The implementation should try the most common pattern first, fall back to alternatives if the response isn't valid JSON.

### 3c. Serper Query Fix

In `serper-job-search.ts`:

1. **Add iCIMS to query `site:` clause** (line 78):
   ```
   site:boards.greenhouse.io OR site:jobs.lever.co OR site:myworkdayjobs.com OR site:jobs.ashbyhq.com OR site:icims.com
   ```

2. **Remove the `careers` keyword** from `buildQuery()` — it adds noise and the `site:` clause already constrains to ATS domains

3. **Consider adding SmartRecruiters** (`site:jobs.smartrecruiters.com`) — popular ATS not currently covered

4. **Fix query format** — current format: `"Company" "Title" careers (site:...)`. Proposed: `"Company" "Title" (site:...)` — drop `careers`, keep quoted names

5. **Add iCIMS to `ATS_DOMAINS` array** — already present (`icims.com`), but add `careers-` subdomain pattern: `careers-.*.icims.com`

### 3d. ATS Slug Enrichment Pipeline

**New file**: `server/src/lib/ni/ats-enrichment.ts`

```typescript
/**
 * ATS Slug Enrichment — discovers ATS platform and slug for companies
 * that don't have them set, converting them from Tier 2 (Serper) to
 * Tier 1 (direct ATS API) for future job scans.
 */

/** Discover ATS platform and slug for a single company via Serper search. */
export async function enrichCompanyATS(
  companyId: string,
  companyName: string,
): Promise<{ platform: ATSPlatform; slug: string } | null>

/** Run bulk enrichment for all companies a user has connections at. */
export async function runBulkEnrichment(
  userId: string,
): Promise<{ enriched: number; skipped: number; errors: number }>
```

**Serper query for discovery**: `"{companyName}" careers (site:boards.greenhouse.io OR site:jobs.lever.co OR site:jobs.ashbyhq.com OR site:myworkdayjobs.com OR site:icims.com)`

**URL parsing logic** — extract platform + slug from URL hostname + pathname:
- `boards.greenhouse.io/{slug}` → `{ platform: 'greenhouse', slug }`
- `jobs.lever.co/{slug}` → `{ platform: 'lever', slug }`
- `jobs.ashbyhq.com/{slug}` → `{ platform: 'ashby', slug }`
- `{tenant}.{server}.myworkdayjobs.com/.../{site}` → `{ platform: 'workday', slug: '{tenant}/{site}' }`
- `careers-{slug}.icims.com` → `{ platform: 'icims', slug }`

**Database update**: `UPDATE company_directory SET ats_platform = $1, ats_slug = $2 WHERE id = $3`

**Rate limiting**: 500ms between Serper calls (same as career scraper). Process max 100 companies per batch.

**Trigger points**:
1. After CSV import completes (fire-and-forget in `import-service.ts`)
2. On-demand via new route endpoint

### 3e. Job Finder Integration Fix

Two bugs in `server/src/agents/job-finder/searcher/tools.ts`:

**Bug 1 — Missing ATS data in company query** (lines 74-77):
```typescript
// CURRENT (broken):
.select('id, name_display, domain')

// FIX:
.select('id, name_display, domain, ats_platform, ats_slug')
```

And update the map function (lines 97-101) to pass `ats_platform` and `ats_slug` through to the `CompanyInfo` objects.

**Bug 2 — Stale source label filter** (lines 129-131):
```typescript
// CURRENT (broken — filters out ALL current results):
.filter((m) => {
  const src = (m.metadata as Record<string, unknown>)?.source;
  return src === 'firecrawl_scrape' || src === 'firecrawl_search' || src === 'career_page_scraper';
})

// FIX — accept current source labels:
.filter((m) => {
  const src = (m.metadata as Record<string, unknown>)?.source;
  return src === 'lever' || src === 'greenhouse' || src === 'workday' || src === 'ashby' || src === 'icims' || src === 'serper';
})
```

**Bug 3 — `generate_search_queries` tool still uses Firecrawl** (lines 173-289):
This entire tool depends on `@mendable/firecrawl-js`. It should be rewritten to use Serper for web job search, or removed and replaced with a Serper-based search tool.

### 3f. Career Scraper Restructure

Clean up the tier fallback in `career-scraper.ts`:

1. Remove `_useApiFallback` parameter
2. Clean up `sourceBreakdown` type to remove stale sources
3. Add logging for which tier was used per company
4. Consider adding a Tier 0 check: if `ats_platform` is set but `ats_slug` is missing, attempt enrichment before scanning

The core `scanCompany()` flow is sound — just needs dead code removed and source types cleaned up.

---

## 4. Phased Task Prompts

### Phase 1 Prompt: Dead Code Cleanup

```
TASK: Remove all stale Firecrawl references and dead parameters from the NI scanner module.

FILES TO MODIFY:
1. server/src/lib/ni/types.ts (line 234)
   - Remove 'firecrawl_scrape' | 'firecrawl_search' from ScrapeSource union
   - Final type: 'lever' | 'greenhouse' | 'workday' | 'ashby' | 'icims' | 'serper'

2. server/src/lib/ni/career-scraper.ts
   - Line 234: Remove _useApiFallback parameter from scrapeCareerPages() signature
   - Lines 203-206 and 248-249: Remove firecrawl_scrape and firecrawl_search from
     all sourceBreakdown initializers (2 locations: searchJobsByCompany and scrapeCareerPages)

3. server/src/lib/ni/import-service.ts
   - Lines 118-120: Rewrite comment from "When useApiFallback=true (default), companies
     that return zero regex results will be retried via Firecrawl search." to:
     "Scans company career pages using three-tier strategy: ATS API → Serper fallback.
     Results are stored in job_matches and reflected in the scrape log."
   - Line 126: Remove useApiFallback parameter from runCareerScrape() signature
   - Line 154: Remove useApiFallback argument from scrapeCareerPages() call

4. server/src/agents/job-finder/types.ts (line 34)
   - Remove 'firecrawl_search' from DiscoveredJob.source union
   - Add 'serper' to the union: 'career_page' | 'boolean_search' | 'serper' | 'network'

DO NOT CHANGE:
- ats-clients.ts (no changes needed)
- serper-job-search.ts (no changes needed in this phase)
- Any test files (update tests after code changes)
- Do not remove the 'icims' type from ScrapeSource or ATSPlatform — it stays for Phase 2

AFTER CODE CHANGES:
- Run: cd server && npx tsc --noEmit (must pass)
- Run: cd server && npx vitest run src/__tests__/ni-career-scraper.test.ts
- Fix any test failures caused by removed types/parameters
- Update CHANGELOG.md

ACCEPTANCE CRITERIA:
- [ ] No references to 'firecrawl_scrape' or 'firecrawl_search' in ni/ directory (except test fixtures if needed)
- [ ] No _useApiFallback or useApiFallback parameters anywhere in ni/ directory
- [ ] No Firecrawl comments in import-service.ts
- [ ] ScrapeSource type has exactly: 'lever' | 'greenhouse' | 'workday' | 'ashby' | 'icims' | 'serper'
- [ ] DiscoveredJob.source has: 'career_page' | 'boolean_search' | 'serper' | 'network'
- [ ] tsc passes for both app and server
- [ ] Existing ni-career-scraper tests pass (update assertions if needed)
```

### Phase 2 Prompt: iCIMS Client

```
TASK: Add iCIMS client implementation to ats-clients.ts, following the existing
Lever/Greenhouse/Ashby/Workday pattern.

FILES TO MODIFY:
1. server/src/lib/ni/ats-clients.ts
   - Add fetchICIMSJobs(slug: string): Promise<ATSJob[]> function
   - Add 'icims' case to fetchFromATS() dispatcher (line 172, currently falls to default)

RESEARCH FIRST:
Before implementing, use web search to confirm the current iCIMS public job board
API endpoint pattern. Known patterns to investigate:
- https://careers-{slug}.icims.com/jobs/search?mode=json
- https://{slug}.icims.com/jobs/search?in_iframe=1&mode=json
- Some companies use custom subdomains

The slug in company_directory.ats_slug should be the company's iCIMS identifier
(the subdomain prefix, e.g., "acme" for careers-acme.icims.com).

IMPLEMENTATION PATTERN (follow existing clients):
- 10s request timeout via AbortSignal.timeout
- Try/catch returning [] on any error
- logger.debug on failure
- Return normalized ATSJob[] with source: 'icims'
- If iCIMS response format varies, try 2-3 known URL patterns before returning []

DO NOT CHANGE:
- career-scraper.ts (no changes needed)
- serper-job-search.ts (no changes needed)
- import-service.ts (no changes needed)
- types.ts ('icims' is already in ATSPlatform and ScrapeSource)

AFTER CODE CHANGES:
- Add test cases to ni-career-scraper.test.ts for iCIMS dispatch
- Run: cd server && npx tsc --noEmit
- Run: cd server && npx vitest run
- Update CHANGELOG.md

ACCEPTANCE CRITERIA:
- [ ] fetchICIMSJobs(slug) function exists and returns ATSJob[]
- [ ] fetchFromATS('icims', slug) dispatches to fetchICIMSJobs
- [ ] At least 2 test cases: successful fetch and error handling
- [ ] tsc passes
- [ ] All existing tests still pass
```

### Phase 3 Prompt: Serper Query Fix

```
TASK: Broaden the Serper Google Jobs search query and fix the ATS domain
coverage to match what the parser accepts.

FILES TO MODIFY:
1. server/src/lib/ni/serper-job-search.ts
   - buildQuery() function (line 75-80):
     * Add site:icims.com to the site: clause
     * Remove the 'careers' keyword — the site: clause already constrains to ATS domains
     * Current: "Company" "Title" careers (site:boards.greenhouse.io OR site:jobs.lever.co OR site:myworkdayjobs.com OR site:jobs.ashbyhq.com)
     * Target:  "Company" "Title" (site:boards.greenhouse.io OR site:jobs.lever.co OR site:myworkdayjobs.com OR site:jobs.ashbyhq.com OR site:icims.com)

   - ATS_DOMAINS array (lines 97-107):
     * Verify all queried domains are in the parser array (they are)
     * The parser already accepts icims.com — just ensure the query now also
       targets it

CONSIDER BUT DO NOT IMPLEMENT YET:
- Adding SmartRecruiters (site:jobs.smartrecruiters.com) — save for future
- A two-pass strategy (narrow ATS-only query, then broader query) — save for future
- These are noted here for awareness but are out of scope

DO NOT CHANGE:
- career-scraper.ts
- ats-clients.ts
- import-service.ts
- types.ts

AFTER CODE CHANGES:
- Run: cd server && npx tsc --noEmit
- Add a unit test for buildQuery output to verify the new format
- Run: cd server && npx vitest run
- Update CHANGELOG.md

ACCEPTANCE CRITERIA:
- [ ] buildQuery output includes site:icims.com
- [ ] buildQuery output does NOT include the word 'careers'
- [ ] ATS_DOMAINS parser array covers all domains in the query
- [ ] At least 1 new test verifying query format
- [ ] tsc passes
- [ ] All existing tests pass
```

### Phase 4 Prompt: ATS Slug Enrichment Pipeline

```
TASK: Create a new ATS enrichment module that discovers ATS platform and slug
for companies that don't have them set. This converts companies from Tier 2
(Serper per-search) to Tier 1 (direct ATS API, free and structured).

NEW FILE: server/src/lib/ni/ats-enrichment.ts

FUNCTIONS TO IMPLEMENT:

1. parseATSFromUrl(url: string): { platform: ATSPlatform; slug: string } | null
   - Parse a URL to extract ATS platform and slug
   - Handle these patterns:
     * boards.greenhouse.io/{slug}/... → greenhouse, slug
     * jobs.lever.co/{slug}/... → lever, slug
     * jobs.ashbyhq.com/{slug}/... → ashby, slug
     * {tenant}.{server}.myworkdayjobs.com/.../cxs/{tenant}/{site}/... → workday, {tenant}/{site}
     * careers-{slug}.icims.com/... → icims, slug
   - Return null if URL doesn't match any known ATS pattern

2. enrichCompanyATS(companyId: string, companyName: string): Promise<EnrichmentResult>
   - Use searchJobsViaSerper() logic but with a discovery-focused query:
     "{companyName}" careers (site:boards.greenhouse.io OR site:jobs.lever.co OR
     site:jobs.ashbyhq.com OR site:myworkdayjobs.com OR site:icims.com)
   - Call Serper API directly (reuse the pattern from serper-job-search.ts)
   - Parse first matching URL to extract platform + slug
   - Write to company_directory: UPDATE SET ats_platform, ats_slug WHERE id = companyId
   - Return { enriched: true, platform, slug } or { enriched: false, reason: string }

3. runBulkEnrichment(userId: string): Promise<BulkEnrichmentResult>
   - Query company_directory for companies the user has connections at
     WHERE ats_platform IS NULL
   - Process up to 100 companies with 500ms delay between Serper calls
   - Call enrichCompanyATS() for each
   - Return { enriched: number, skipped: number, errors: number, total: number }

TYPES TO ADD (in the same file or in types.ts):
- EnrichmentResult: { enriched: boolean; platform?: ATSPlatform; slug?: string; reason?: string }
- BulkEnrichmentResult: { enriched: number; skipped: number; errors: number; total: number }

INTEGRATION POINTS (modify existing files):
- server/src/lib/ni/import-service.ts: After CSV import completes successfully
  (after the normalizeCompanyBatch fire-and-forget on line 77), add another
  fire-and-forget call to runBulkEnrichment(userId). This should happen AFTER
  normalization completes so company_directory records exist.

DO NOT CHANGE:
- career-scraper.ts (enrichment is separate from scanning)
- ats-clients.ts (no changes needed)
- serper-job-search.ts (enrichment has its own Serper query)

AFTER CODE CHANGES:
- Write unit tests in server/src/__tests__/ni-ats-enrichment.test.ts
  * Test parseATSFromUrl with all 5 ATS patterns + non-ATS URLs
  * Test enrichCompanyATS with mocked Serper response
  * Test runBulkEnrichment with mocked DB + Serper
- Run: cd server && npx tsc --noEmit
- Run: cd server && npx vitest run
- Update CHANGELOG.md

ACCEPTANCE CRITERIA:
- [ ] parseATSFromUrl correctly extracts platform+slug for all 5 ATS domains
- [ ] parseATSFromUrl returns null for non-ATS URLs
- [ ] enrichCompanyATS calls Serper, parses result, writes to company_directory
- [ ] runBulkEnrichment processes companies with ats_platform IS NULL
- [ ] runBulkEnrichment has 500ms rate limiting between calls
- [ ] import-service.ts triggers enrichment after CSV import
- [ ] At least 10 unit tests covering happy path and edge cases
- [ ] tsc passes
- [ ] All existing tests pass
```

### Phase 5 Prompt: Job Finder Integration Fix + Career Scraper Cleanup

```
TASK: Fix the broken Job Finder → NI Scanner integration so that job matches
actually surface through the Job Finder agent. Also clean up the career scraper
generate_search_queries tool to remove Firecrawl dependency.

FILES TO MODIFY:

1. server/src/agents/job-finder/searcher/tools.ts

   Bug 1 — Missing ATS data (line 76):
   CURRENT: .select('id, name_display, domain')
   FIX:     .select('id, name_display, domain, ats_platform, ats_slug')

   Update the map function (lines 97-101) to include ats_platform and ats_slug:
   CURRENT: companiesToScrape = companies.map(c => ({ id, name, domain }))
   FIX:     companiesToScrape = companies.map(c => ({ id, name, domain, ats_platform, ats_slug }))

   Bug 2 — Stale source label filter (lines 129-131):
   CURRENT: src === 'firecrawl_scrape' || src === 'firecrawl_search' || src === 'career_page_scraper'
   FIX:     src === 'lever' || src === 'greenhouse' || src === 'workday' || src === 'ashby' || src === 'icims' || src === 'serper'

   Bug 3 — generate_search_queries tool (lines 173-289):
   This tool imports and uses FirecrawlApp. Replace the Firecrawl-based search with
   Serper-based web search:
   - Remove FirecrawlApp import (line 1)
   - Rewrite the tool to use Serper API (process.env.SERPER_API_KEY) for web search
   - Use the same Serper API pattern as serper-job-search.ts but with broader queries
     (not constrained to ATS domains — this is a general web job search)
   - Query format: "{targetTitle} jobs {location}" — no site: restriction
   - Parse Serper organic results into DiscoveredJob[]
   - Update tool description to reference Serper instead of Firecrawl
   - If SERPER_API_KEY is not configured, return { success: false, error: 'SERPER_API_KEY not configured' }

2. server/src/agents/job-finder/searcher/tools.ts — type of companiesToScrape
   Update the local type to include ats_platform and ats_slug so it satisfies
   CompanyInfo from ni/types.ts:
   CURRENT: Array<{ id: string; name: string; domain: string | null }>
   FIX:     Array<{ id: string; name: string; domain: string | null; ats_platform?: string | null; ats_slug?: string | null }>

3. Check if @mendable/firecrawl-js can be removed from package.json
   - Search for any other imports of firecrawl-js in the codebase
   - If this is the only consumer, note it for removal (but don't remove the
     dependency in this phase — just flag it)

DO NOT CHANGE:
- career-scraper.ts (already cleaned up in Phase 1)
- ats-clients.ts (no changes needed)
- serper-job-search.ts (no changes needed)
- import-service.ts (no changes needed)
- types.ts (already cleaned up in Phase 1)

AFTER CODE CHANGES:
- Run: cd server && npx tsc --noEmit (MUST pass — the stale filter types will
  have changed in Phase 1)
- Run: cd server && npx vitest run
- Manually verify: the source filter now accepts 'lever', 'greenhouse', etc.
- Update CHANGELOG.md

ACCEPTANCE CRITERIA:
- [ ] company_directory query includes ats_platform and ats_slug
- [ ] companiesToScrape objects include ats_platform and ats_slug
- [ ] Source filter accepts: lever, greenhouse, workday, ashby, icims, serper
- [ ] Source filter does NOT reference: firecrawl_scrape, firecrawl_search, career_page_scraper
- [ ] generate_search_queries uses Serper API instead of FirecrawlApp
- [ ] No FirecrawlApp import in tools.ts
- [ ] tsc passes for both app and server
- [ ] All tests pass
```

---

## 5. Firecrawl Interface Stub

Define the interface that a future Firecrawl integration would implement. This goes in `types.ts` alongside the existing types — not wired into any implementation yet.

```typescript
/**
 * Career Page Scraper Interface — pluggable scraper for raw URL → jobs extraction.
 *
 * Tier 3 of the scanning strategy. Not implemented yet — this interface
 * defines the contract so a Firecrawl (or Playwright, or Puppeteer) adapter
 * can be plugged in later without changing the career scraper orchestration.
 */
export interface CareerPageScraper {
  /** Unique identifier for this scraper implementation */
  readonly name: string;

  /**
   * Scrape a company's career page URL and extract job listings.
   *
   * @param careerPageUrl - The URL to scrape (e.g., "https://acme.com/careers")
   * @param targetTitles - Optional title filters to apply during extraction
   * @returns Normalized job listings found on the page
   */
  scrapeCareerPage(
    careerPageUrl: string,
    targetTitles?: string[],
  ): Promise<ATSJob[]>;

  /**
   * Check if this scraper can handle the given URL.
   * Used for routing — e.g., Firecrawl handles most URLs, but a
   * Playwright scraper might be needed for SPAs.
   */
  canHandle(url: string): boolean;
}
```

This interface would be consumed in `career-scraper.ts` as a Tier 3 fallback:
```typescript
// Future usage (not implemented now):
// if (allJobs.length === 0 && company.domain && scraper) {
//   allJobs = await scraper.scrapeCareerPage(`https://${company.domain}/careers`, targetTitles);
//   source = scraper.name as ScrapeSource;
// }
```

---

## 6. Testing Checklist

### Phase 1: Dead Code Cleanup
- [ ] `cd server && npx tsc --noEmit` passes
- [ ] `cd server && npx vitest run src/__tests__/ni-career-scraper.test.ts` passes
- [ ] `grep -r 'firecrawl' server/src/lib/ni/` returns zero results
- [ ] `grep -r 'useApiFallback\|use_api_fallback' server/src/lib/ni/` returns zero results

### Phase 2: iCIMS Client
- [ ] `cd server && npx tsc --noEmit` passes
- [ ] New iCIMS test cases pass
- [ ] Manual test: `fetchICIMSJobs('some-known-icims-company')` returns jobs (if a known slug exists in seed data)

### Phase 3: Serper Query Fix
- [ ] `cd server && npx tsc --noEmit` passes
- [ ] Query format test verifies `site:icims.com` present and `careers` keyword absent
- [ ] Manual test: search for a company known to use iCIMS and verify results return

### Phase 4: ATS Slug Enrichment
- [ ] `cd server && npx tsc --noEmit` passes
- [ ] `parseATSFromUrl` tests cover all 5 ATS patterns + edge cases
- [ ] `enrichCompanyATS` test verifies DB write with mocked Serper
- [ ] `runBulkEnrichment` test verifies batch processing with rate limiting
- [ ] Manual test: run enrichment for a user with connections, verify `company_directory` rows get `ats_platform`/`ats_slug` populated

### Phase 5: Job Finder Integration Fix
- [ ] `cd server && npx tsc --noEmit` passes
- [ ] `cd app && npx tsc --noEmit` passes
- [ ] Source filter test verifies current source labels accepted
- [ ] Manual test: run Job Finder search_career_pages tool → verify job matches have `source: 'lever'` etc. in metadata
- [ ] Manual test: verify matches actually appear in the deduplicated results
- [ ] `grep -r 'firecrawl' server/src/agents/job-finder/` returns zero results (only generate_search_queries had it)

### Edge Cases to Watch
- Company with `ats_platform: 'icims'` but no working iCIMS endpoint — should gracefully fall to Serper
- Serper API key missing — all Serper-dependent features return [] gracefully
- Company name with special characters in Serper query — proper URL encoding
- Workday slug parsing — tenant/site split is tricky (multiple slashes possible)
- Rate limiting — 500ms delay between companies, 100 max per enrichment batch
- Enrichment writes to `company_directory` — verify RLS allows the service role to write
