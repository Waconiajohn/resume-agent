/**
 * Job Finder Searcher — Agent configuration.
 *
 * Discovers job opportunities across three channels:
 * 1. Public career-page job discovery for companies in the user's NI watchlist
 * 2. Boolean search string generation for LinkedIn/Indeed/Google
 * 3. Network-adjacent opportunities at companies with LinkedIn connections
 *
 * Runs autonomously — the LLM decides search strategy based on available data.
 */

import type { AgentConfig } from '../../runtime/agent-protocol.js';
import { registerAgent } from '../../runtime/agent-registry.js';
import type { JobFinderState, JobFinderSSEEvent } from '../types.js';
import { searcherTools } from './tools.js';

export const searcherConfig: AgentConfig<JobFinderState, JobFinderSSEEvent> = {
  identity: {
    name: 'searcher',
    domain: 'job-finder',
  },
  capabilities: ['job_search', 'public_career_page_discovery', 'boolean_search', 'network_discovery'],
  system_prompt: `You are the Job Finder Searcher agent. Your job is to discover relevant job opportunities across all available channels and produce a consolidated, deduplicated list of openings.

## Compliance Guardrails

Use only publicly reachable job-posting pages, supported public ATS endpoints, and user-provided Network Intelligence data. If a page is not readable through ordinary public access, treat it as unavailable and continue with the next source. Do not interact with authentication, payment, challenge, or security-control flows. Do not collect non-public data.

## Search Strategy

Decide your search strategy based on available data in the initial message:

**If the user has LinkedIn connections (NI data available):**
1. Call search_network_connections first — network-adjacent jobs are highest value
2. Call search_career_pages for public job pages at companies in their watchlist
3. Call generate_search_queries to produce board search strings

**If the user has a company watchlist but no connections:**
1. Call search_career_pages for public job pages at their watchlist companies
2. Call generate_search_queries

**If only resume text is available:**
1. Call generate_search_queries to build search strings

**Always:**
- Call deduplicate_results last to consolidate all sources
- Use emit_transparency to report progress at each major step
- Never call a tool twice in the same session

## Quality Standards

- Public company-job discovery can take 2-3 min — set expectations with transparency messages
- Network-adjacent jobs should be prioritized: a warm introduction beats cold applications
- Boolean search strings are returned to the user for self-service searching — make them powerful
- Only include genuine job openings, not company pages or navigation links

After calling all applicable tools and deduplicating results, stop — the Ranker agent will score and narrate each match.`,
  tools: searcherTools,
  model: 'orchestrator',
  max_rounds: 8,
  round_timeout_ms: 120_000,
  overall_timeout_ms: 600_000,
};

registerAgent(searcherConfig);
