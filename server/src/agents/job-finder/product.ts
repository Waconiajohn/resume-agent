/**
 * Job Finder Product — ProductConfig implementation.
 *
 * Agent #21: 2-agent pipeline (Searcher → Ranker) that discovers job openings
 * across career pages, network connections, and boolean search queries, then
 * ranks and narrates each match against the user's positioning strategy.
 *
 * Has 1 interactive gate (review_results) after the Ranker so the user can
 * promote or dismiss matches before they're persisted to job_matches.
 */

import type { ProductConfig } from '../runtime/product-config.js';
import { searcherConfig } from './searcher/agent.js';
import { rankerConfig } from './ranker/agent.js';
import type { JobFinderState, JobFinderSSEEvent, RankedMatch, JobDecision } from './types.js';
import { supabaseAdmin } from '../../lib/supabase.js';
import { upsertUserContext } from '../../lib/platform-context.js';
import logger from '../../lib/logger.js';
import { getToneGuidanceFromInput, getDistressFromInput } from '../../lib/emotional-baseline.js';

// FF_JOB_FINDER is used by the route — imported from feature-flags.ts directly there.

export function createJobFinderProductConfig(): ProductConfig<JobFinderState, JobFinderSSEEvent> {
  return {
    domain: 'job-finder',

    agents: [
      {
        name: 'searcher',
        config: searcherConfig,
        stageMessage: {
          startStage: 'searching',
          start: 'Searching for relevant job opportunities...',
          complete: 'Search complete — results ready for ranking',
        },
        onComplete: (scratchpad, state) => {
          // Transfer deduplicated results from scratchpad to state if not already set by tool
          const allResults = scratchpad.all_results as RankedMatch[] | undefined;
          if (allResults && state.search_results.length === 0) {
            state.search_results = allResults;
          }
        },
      },
      {
        name: 'ranker',
        config: rankerConfig,
        stageMessage: {
          startStage: 'ranking',
          start: 'Scoring and ranking matches against your positioning strategy...',
          complete: 'Ranking complete — top matches ready for review',
        },
        gates: [
          {
            name: 'review_results',
            condition: (state) => state.ranked_results.length > 0,
            onResponse: (response, state) => {
              // Parse user decisions (dismissed/promoted) from gate response
              const decisions = response as Array<{ company: string; title: string; status: string }> | undefined;
              if (Array.isArray(decisions)) {
                state.user_decisions = decisions.map((d) => ({
                  company: String(d.company ?? ''),
                  title: String(d.title ?? ''),
                  status: (d.status === 'promoted' || d.status === 'dismissed' ? d.status : 'pending') as JobDecision['status'],
                }));
              }
            },
          },
        ],
        onComplete: (scratchpad, state) => {
          // Transfer ranked results from scratchpad to state if not already set by tool
          const rankedResults = scratchpad.ranked_results as RankedMatch[] | undefined;
          if (rankedResults && state.ranked_results.length === 0) {
            state.ranked_results = rankedResults;
          }
        },
      },
    ],

    createInitialState: (sessionId, userId, input) => ({
      session_id: sessionId,
      user_id: userId,
      current_stage: 'searching',
      platform_context: input.platform_context as JobFinderState['platform_context'],
      search_results: [],
      ranked_results: [],
      user_decisions: [],
    }),

    buildAgentMessage: (agentName, state, input) => {
      if (agentName === 'searcher') {
        const platformCtx = state.platform_context;
        const resumeText = String(input.resume_text ?? '');

        const parts = [
          'Discover job opportunities for this executive candidate across all available channels.',
          '',
        ];

        if (platformCtx?.career_profile) {
          parts.push(
            '## Career Profile',
            JSON.stringify(platformCtx.career_profile, null, 2),
            '',
          );
        }

        // NI data summary
        const hasNiData = !!platformCtx;
        if (hasNiData) {
          parts.push('## Available Data', 'Platform context available — use for targeting:');
          if (platformCtx?.positioning_strategy) {
            const ps = platformCtx.positioning_strategy as Record<string, unknown>;
            if (typeof ps.target_role === 'string') {
              parts.push(`- Target role: ${ps.target_role}`);
            }
            if (Array.isArray(ps.target_titles)) {
              parts.push(`- Target titles: ${(ps.target_titles as string[]).join(', ')}`);
            }
            if (typeof ps.target_industry === 'string') {
              parts.push(`- Target industry: ${ps.target_industry}`);
            }
          }
          parts.push('');
        }

        parts.push(
          '## Strategy',
          'Check whether network connections (NI) and company watchlist data are available.',
          'Prioritize network-adjacent opportunities, then career page scraping, then boolean search.',
          '',
        );

        if (resumeText.length > 50) {
          parts.push(
            '## Resume (for boolean search generation)',
            resumeText.slice(0, 5000),
            '',
          );
        }

        // Distress resources — first agent only
        const distress = getDistressFromInput(input);
        if (distress) {
          parts.push('', '## Support Resources', distress.message);
          for (const r of distress.resources) {
            parts.push(`- **${r.name}**: ${r.description} (${r.contact})`);
          }
        }

        const toneGuidance = getToneGuidanceFromInput(input);
        if (toneGuidance) {
          parts.push(toneGuidance);
        }

        return parts.join('\n');
      }

      if (agentName === 'ranker') {
        const jobCount = state.search_results.length;

        const parts = [
          `Score and rank ${jobCount} discovered job opportunities against this candidate's positioning.`,
          '',
          '## Jobs to Rank',
          ...state.search_results.slice(0, 20).map((j, i) =>
            `${i + 1}. "${j.title}" at ${j.company} [${j.source}]${j.location ? ` — ${j.location}` : ''}`,
          ),
        ];

        if (state.search_results.length > 20) {
          parts.push(`... and ${state.search_results.length - 20} more`);
        }

        parts.push('', 'Call score_job_fit, then rank_and_narrate (max_results: 10), then present_results.');

        const toneGuidance = getToneGuidanceFromInput(input);
        if (toneGuidance) {
          parts.push(toneGuidance);
        }

        return parts.join('\n');
      }

      return '';
    },

    finalizeResult: (state, _input, emit) => {
      const promotedCount = state.user_decisions.filter((d) => d.status === 'promoted').length;

      emit({
        type: 'job_finder_complete',
        session_id: state.session_id,
        ranked_count: state.ranked_results.length,
        promoted_count: promotedCount,
      });

      return {
        ranked_results: state.ranked_results,
        search_results: state.search_results,
        user_decisions: state.user_decisions,
        total_discovered: state.search_results.length,
        total_ranked: state.ranked_results.length,
        promoted_count: promotedCount,
      };
    },

    persistResult: async (state, result, _input) => {
      const data = result as {
        ranked_results: RankedMatch[];
        user_decisions: JobDecision[];
      };

      // Upsert job discovery results to platform context
      try {
        await upsertUserContext(
          state.user_id,
          'job_discovery_results' as Parameters<typeof upsertUserContext>[1],
          {
            total_discovered: state.search_results.length,
            total_ranked: state.ranked_results.length,
            top_matches: data.ranked_results.slice(0, 5).map((m) => ({
              title: m.title,
              company: m.company,
              fit_score: m.fit_score,
              source: m.source,
            })),
            search_completed_at: new Date().toISOString(),
          },
          'job-finder',
          state.session_id,
        );
      } catch (err) {
        logger.warn(
          { error: err instanceof Error ? err.message : String(err), userId: state.user_id },
          'Job finder: failed to upsert job_discovery_results context (non-fatal)',
        );
      }

      // Persist promoted matches to job_matches table with status 'applied'
      const promoted = data.user_decisions.filter((d) => d.status === 'promoted');
      if (promoted.length > 0) {
        for (const decision of promoted) {
          const match = data.ranked_results.find(
            (m) => m.title === decision.title && m.company === decision.company,
          );
          if (!match) continue;

          try {
            await supabaseAdmin
              .from('job_matches')
              .upsert(
                {
                  user_id: state.user_id,
                  company_id: match.company_id ?? match.company,
                  title: match.title,
                  url: match.url ?? null,
                  location: match.location ?? null,
                  salary_range: match.salary_range ?? null,
                  match_score: match.fit_score,
                  status: 'new',
                  metadata: {
                    source: match.source,
                    fit_narrative: match.fit_narrative,
                    positioning_alignment: match.positioning_alignment,
                    promoted_at: new Date().toISOString(),
                  },
                },
                { onConflict: 'user_id,company_id,title' },
              );
          } catch (err) {
            logger.warn(
              { error: err instanceof Error ? err.message : String(err), userId: state.user_id, title: match.title },
              'Job finder: failed to persist promoted match (non-fatal)',
            );
          }
        }
      }
    },

    validateAfterAgent: (agentName, state) => {
      if (agentName === 'searcher') {
        if (!state.search_results || state.search_results.length === 0) {
          throw new Error('Searcher did not produce any search results');
        }
      }
      if (agentName === 'ranker') {
        if (!state.ranked_results || state.ranked_results.length === 0) {
          throw new Error('Ranker did not produce ranked results');
        }
      }
    },

    emitError: (stage, error, emit) => {
      emit({ type: 'pipeline_error', stage, error });
    },
  };
}
