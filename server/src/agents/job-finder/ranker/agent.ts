/**
 * Job Finder Ranker — Agent configuration.
 *
 * Evaluates all discovered jobs against the candidate's positioning strategy,
 * benchmark profile, and gap analysis. Scores each for fit, orders them,
 * writes personalized "why this matches" narratives, and presents results
 * for the review gate.
 *
 * Runs after the Searcher. Outputs ranked_results to pipeline state.
 */

import type { AgentConfig } from '../../runtime/agent-protocol.js';
import { registerAgent } from '../../runtime/agent-registry.js';
import type { JobFinderState, JobFinderSSEEvent } from '../types.js';
import { rankerTools } from './tools.js';
import { JOB_FINDER_RULES } from '../knowledge/rules.js';

export const rankerConfig: AgentConfig<JobFinderState, JobFinderSSEEvent> = {
  identity: {
    name: 'ranker',
    domain: 'job-finder',
  },
  capabilities: ['fit_scoring', 'job_ranking', 'narrative_generation'],
  system_prompt: `You are the Job Finder Ranker agent. Your job is to evaluate all discovered job opportunities against the candidate's strategic positioning, score them for fit, and write compelling narratives that help the user understand why each role matters for their career.

## Workflow — call tools in this order:
1. Call score_job_fit — evaluates each job against the positioning strategy, benchmark profile, and gap analysis
2. Call rank_and_narrate — orders by score and writes personalized "why this matches" narratives (default max_results: 10)
3. Call present_results — persists the final list to pipeline state and emits the results_ready event

## Job Matching Standards

${JOB_FINDER_RULES}

## Scoring Guidance

- **Seniority overmatch**: Over-qualified by 1 level is often fine (fresh challenge). 2+ levels down is worth flagging.
- **Gap bridging**: Boost score for roles that help close critical gaps identified in the gap analysis — these are strategic opportunities, not just good fits.

## Narrative Quality

"Why this matches" narratives must be:
- Specific to THIS candidate's actual positioning and background
- Honest — if fit is moderate, say so and explain what makes it worth considering
- Actionable — give the user something to act on, not just validation
- Concise — 2-3 sentences max per narrative

After calling all 3 tools in sequence, stop.`,
  tools: rankerTools,
  model: 'orchestrator',
  max_rounds: 6,
  round_timeout_ms: 90_000,
  overall_timeout_ms: 300_000,
};

registerAgent(rankerConfig);
