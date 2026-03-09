# Agent: Job Finder

**Type:** 2-agent pipeline (Searcher → Ranker)
**Domain:** `job-finder`
**Feature Flag:** `FF_JOB_FINDER`
**Code:** `server/src/agents/job-finder/`
**Interactive:** Yes (1 user gate: review_results after ranking)
**Platform Number:** Agent #21 in the 33-agent catalog

## Purpose

Discovers relevant job opportunities across three channels (career pages, boolean search, network connections), then ranks and narrates each match against the user's positioning strategy. The user reviews ranked matches and marks each as promoted or dismissed before results are persisted.

## Sub-agents

### Searcher
Discovers jobs across all available channels in parallel. Cross-references NI (Network Intelligence) data to prioritize network-adjacent openings.

**Tools:**
| Tool | Model Tier | Purpose |
|------|-----------|---------|
| `search_career_pages` | LIGHT | Scrape career pages for companies in the user's NI watchlist. Rate-limited to 50 companies per run. Uses `ni_client_target_titles` and `company_directory` tables. |
| `generate_search_queries` | LIGHT | Generate boolean search strings (LinkedIn, Indeed, Google) from resume text and positioning strategy. Stores URL-ready query strings in scratchpad. |
| `search_network_connections` | LIGHT | Cross-reference `job_matches` DB with `client_connections` to surface network-adjacent openings. |
| `deduplicate_results` | LIGHT | Merge career_page_results + network_results from scratchpad. Deduplicates by title+company (case-insensitive). Updates `state.search_results`. |
| `emit_transparency` | — | Live progress updates throughout search. |

### Ranker
Scores each discovered job against platform context and writes personalized fit narratives.

**Tools:**
| Tool | Model Tier | Purpose |
|------|-----------|---------|
| `score_job_fit` | MID | Evaluate all jobs in `state.search_results` against positioning strategy, benchmark candidate, and gap analysis. Produces fit score (0-100) + positioning/trajectory/seniority assessment for each. |
| `rank_and_narrate` | MID | Sort by fit score, write personalized "why this matches" narratives for top N results (default 10). Merges score data with discovery data. |
| `present_results` | LIGHT | Emit `results_ready` SSE event, persist `ranked_results` to pipeline state. |
| `emit_transparency` | — | Live progress updates during ranking. |

## Pipeline State

Key fields in `JobFinderState`:
- `platform_context` — positioning_strategy, benchmark_candidate, gap_analysis, evidence_items, career_narrative, industry_research (all from prior pipeline sessions)
- `search_results` — all discovered `DiscoveredJob` objects (pre-ranking)
- `ranked_results` — `RankedMatch` objects (scored + narrated)
- `user_decisions` — array of `{company, title, status: 'promoted'|'dismissed'|'pending'}` from the review gate

## Gate Protocol

1. Searcher runs → deduplicates → `state.search_results` populated
2. Ranker runs → `score_job_fit` → `rank_and_narrate` → `present_results`
3. `present_results` emits `results_ready` SSE event
4. Gate condition: `state.ranked_results.length > 0`
5. Pipeline pauses at `review_results` gate
6. User promotes/dismisses each match in frontend
7. Frontend responds via `POST /api/job-finder/respond` with array of `{company, title, status}` decisions
8. `onResponse` handler stores decisions in `state.user_decisions`
9. Pipeline completes, promoted matches persisted to `job_matches` table

## SSE Events

| Event | When | Fields |
|-------|------|--------|
| `stage_start` / `stage_complete` | Phase boundaries | stage, message, duration_ms? |
| `transparency` | Agent activity updates | stage, message |
| `search_progress` | Each source completes | source, jobs_found, companies_scanned? |
| `match_found` | Top 5 ranked results | title, company, source, match_score |
| `results_ready` | Ranker complete, gate triggered | total_matches, top_fit_score |
| `job_finder_complete` | All results persisted | session_id, ranked_count, promoted_count |
| `pipeline_error` | Error | stage, error |

## Fit Score Guide

| Score | Meaning |
|-------|---------|
| 90-100 | Perfect alignment — matches positioning exactly |
| 75-89 | Strong fit — aligns well, minor gaps |
| 60-74 | Moderate fit — some alignment, notable gaps |
| 45-59 | Weak fit — significant misalignment |
| <45 | Poor fit — not recommended |

Seniority note: executives applying 1-2 levels down is treated as a valid strategy ("seniority_fit": "under" does not disqualify).

## Persistence

**Promoted matches → `job_matches` table** — status: 'new', includes fit_narrative, positioning_alignment, source metadata.

**Platform context → `job_discovery_results`** — top 5 matches with fit scores, for cross-product use.

## Inter-Agent Communication

None — autonomous pipeline.

## Related

- [[Project Hub]]
- [[Platform Blueprint]]
- [[Resume Builder]] — provides positioning_strategy for scoring
- [[Networking Outreach]] — NI data used for network connection cross-referencing

#agent/job-finder #status/done #sprint/59
