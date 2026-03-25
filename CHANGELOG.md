# Changelog

## 2026-03-24

### Changed — Firecrawl replaces JSearch, Adzuna, and regex HTML parser

**Career scraper** (`server/src/lib/ni/career-scraper.ts`):
- Tier 1: Firecrawl SDK `scrape()` on career page URLs replaces the brittle regex HTML parser (handles JS-rendered pages)
- Tier 2: Firecrawl SDK `search()` with job discovery queries replaces the JSearch + Adzuna two-API fallback chain
- `scrapeCareerPages()` signature unchanged — no caller changes needed
- Single env var: `FIRECRAWL_API_KEY` (was `JSEARCH_API_KEY` + `ADZUNA_APP_ID` + `ADZUNA_API_KEY`)

**Job finder agent** (`server/src/agents/job-finder/searcher/tools.ts`):
- `generate_search_queries` tool now calls Firecrawl search directly instead of generating LinkedIn/Indeed/Google boolean strings
- Results flow into the existing dedup pipeline alongside career page and network results

**Job search service** (`server/src/lib/job-search/job-search-service.ts`):
- `runSearchPipeline()` uses single `FirecrawlAdapter` instead of `[JSearchAdapter, AdzunaAdapter]`

### Removed
- `server/src/lib/job-search/adapters/jsearch.ts` — JSearch/RapidAPI adapter
- `server/src/lib/job-search/adapters/adzuna.ts` — Adzuna adapter
- `server/src/__tests__/job-search-jsearch-adapter.test.ts`
- `server/src/__tests__/job-search-adzuna-adapter.test.ts`
- All references to `JSEARCH_API_KEY`, `ADZUNA_APP_ID`, `ADZUNA_API_KEY`

### Added
- `@mendable/firecrawl-js` SDK dependency
- `server/src/lib/job-search/adapters/firecrawl.ts` — Firecrawl `SearchAdapter` for the job search service
