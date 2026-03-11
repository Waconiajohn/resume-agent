/**
 * Salary Negotiation Agent Product — ProductConfig implementation.
 *
 * Agent #15: 2-agent pipeline (Market Researcher → Negotiation Strategist) that
 * researches compensation benchmarks, identifies leverage points, designs negotiation
 * strategy, generates talking points and scenarios, and produces a negotiation prep report.
 * Autonomous — no user gates. Full negotiation strategy delivered at once.
 */

import type { ProductConfig } from '../runtime/product-config.js';
import { researcherConfig } from './researcher/agent.js';
import { strategistConfig } from './strategist/agent.js';
import type { SalaryNegotiationState, SalaryNegotiationSSEEvent } from './types.js';
import { supabaseAdmin } from '../../lib/supabase.js';
import logger from '../../lib/logger.js';
import { getToneGuidanceFromInput, getDistressFromInput } from '../../lib/emotional-baseline.js';

export function createSalaryNegotiationProductConfig(): ProductConfig<SalaryNegotiationState, SalaryNegotiationSSEEvent> {
  return {
    domain: 'salary-negotiation',

    agents: [
      {
        name: 'researcher',
        config: researcherConfig,
        stageMessage: {
          startStage: 'research',
          start: 'Researching compensation benchmarks and market position...',
          complete: 'Research complete — market data and leverage points identified',
        },
        onComplete: (scratchpad, state) => {
          if (scratchpad.market_research && !state.market_research) {
            state.market_research = scratchpad.market_research as SalaryNegotiationState['market_research'];
          }
          if (scratchpad.leverage_points && !state.leverage_points) {
            state.leverage_points = scratchpad.leverage_points as SalaryNegotiationState['leverage_points'];
          }
          if (scratchpad.total_comp_breakdown && !state.total_comp_breakdown) {
            state.total_comp_breakdown = scratchpad.total_comp_breakdown as SalaryNegotiationState['total_comp_breakdown'];
          }
          if (scratchpad.resume_data && !state.resume_data) {
            state.resume_data = scratchpad.resume_data as SalaryNegotiationState['resume_data'];
          }
        },
      },
      {
        name: 'strategist',
        config: strategistConfig,
        stageMessage: {
          startStage: 'strategy',
          start: 'Designing your negotiation strategy and talking points...',
          complete: 'Strategy ready — review your negotiation numbers before finalizing',
        },
        onComplete: (scratchpad, state, emit) => {
          if (scratchpad.negotiation_strategy) {
            state.negotiation_strategy = scratchpad.negotiation_strategy as SalaryNegotiationState['negotiation_strategy'];
          }
          if (Array.isArray(scratchpad.talking_points)) {
            state.talking_points = scratchpad.talking_points as SalaryNegotiationState['talking_points'];
          }
          if (Array.isArray(scratchpad.scenarios)) {
            state.scenarios = scratchpad.scenarios as SalaryNegotiationState['scenarios'];
          }
          if (scratchpad.final_report && typeof scratchpad.final_report === 'string') {
            state.final_report = scratchpad.final_report;
          }
          if (typeof scratchpad.quality_score === 'number') {
            state.quality_score = scratchpad.quality_score;
          }

          // Emit strategy data for review panel before the gate blocks
          if (state.negotiation_strategy) {
            emit({
              type: 'strategy_review_ready',
              session_id: state.session_id,
              opening_position: state.negotiation_strategy.opening_position,
              walk_away_point: state.negotiation_strategy.walk_away_point,
              batna: state.negotiation_strategy.batna,
              approach: state.negotiation_strategy.approach,
              market_p50: state.market_research?.salary_range?.p50,
              market_p75: state.market_research?.salary_range?.p75,
              data_confidence: state.market_research?.data_confidence,
            });
            emit({ type: 'pipeline_gate', gate: 'strategy_review' });
          }
        },
        gates: [
          {
            name: 'strategy_review',
            condition: (state) => !!state.negotiation_strategy,
            onResponse: (response, state) => {
              if (response === true || response === 'approved') {
                state.revision_feedback = undefined;
              } else if (response && typeof response === 'object') {
                const resp = response as Record<string, unknown>;
                if (typeof resp.feedback === 'string') {
                  state.revision_feedback = resp.feedback;
                } else {
                  state.revision_feedback = undefined;
                }
                // Merge edited dollar amounts if provided
                if (state.negotiation_strategy) {
                  if (typeof resp.opening_position === 'string') {
                    state.negotiation_strategy = {
                      ...state.negotiation_strategy,
                      opening_position: resp.opening_position,
                    };
                  }
                  if (typeof resp.walk_away_point === 'string') {
                    state.negotiation_strategy = {
                      ...state.negotiation_strategy,
                      walk_away_point: resp.walk_away_point,
                    };
                  }
                  if (typeof resp.batna === 'string') {
                    state.negotiation_strategy = {
                      ...state.negotiation_strategy,
                      batna: resp.batna,
                    };
                  }
                }
              }
            },
            requiresRerun: (state) => !!state.revision_feedback,
          },
        ],
      },
    ],

    createInitialState: (sessionId, userId, input) => ({
      session_id: sessionId,
      user_id: userId,
      current_stage: 'research',
      offer_details: input.offer_details as SalaryNegotiationState['offer_details'],
      current_compensation: input.current_compensation as SalaryNegotiationState['current_compensation'],
      target_context: {
        target_role: String(input.target_role ?? ''),
        target_industry: String(input.target_industry ?? ''),
        target_seniority: String(input.target_seniority ?? ''),
      },
      platform_context: input.platform_context as SalaryNegotiationState['platform_context'],
    }),

    buildAgentMessage: (agentName, state, input) => {
      if (agentName === 'researcher') {
        const parts = [
          'Research compensation benchmarks and identify negotiation leverage for this candidate.',
          '',
          '## Resume',
          String(input.resume_text ?? ''),
          '',
          '## Offer Details',
          `Company: ${state.offer_details.company}`,
          `Role: ${state.offer_details.role}`,
        ];

        if (state.offer_details.base_salary != null) {
          parts.push(`Base Salary: $${state.offer_details.base_salary.toLocaleString()}`);
        }
        if (state.offer_details.total_comp != null) {
          parts.push(`Total Comp: $${state.offer_details.total_comp.toLocaleString()}`);
        }
        if (state.offer_details.equity_details) {
          parts.push(`Equity: ${state.offer_details.equity_details}`);
        }
        if (state.offer_details.other_details) {
          parts.push(`Other: ${state.offer_details.other_details}`);
        }

        if (state.current_compensation) {
          parts.push('', '## Current Compensation');
          if (state.current_compensation.base_salary != null) {
            parts.push(`Base Salary: $${state.current_compensation.base_salary.toLocaleString()}`);
          }
          if (state.current_compensation.total_comp != null) {
            parts.push(`Total Comp: $${state.current_compensation.total_comp.toLocaleString()}`);
          }
          if (state.current_compensation.equity) {
            parts.push(`Equity: ${state.current_compensation.equity}`);
          }
        }

        if (state.target_context) {
          parts.push('', '## Target Context');
          if (state.target_context.target_role) parts.push(`Target Role: ${state.target_context.target_role}`);
          if (state.target_context.target_industry) parts.push(`Target Industry: ${state.target_context.target_industry}`);
          if (state.target_context.target_seniority) parts.push(`Target Seniority: ${state.target_context.target_seniority}`);
        }

        if (state.platform_context) {
          if (state.platform_context.why_me_story) {
            parts.push('', '## Why-Me Narrative', state.platform_context.why_me_story);
          }
          if (state.platform_context.positioning_strategy) {
            parts.push('', '## Positioning Strategy', JSON.stringify(state.platform_context.positioning_strategy, null, 2));
          }
        }

        parts.push(
          '',
          'Call tools in order: research_compensation, analyze_market_position, identify_leverage_points, assess_total_comp.',
        );

        // Distress resources — first agent only
        const distress = getDistressFromInput(input);
        if (distress) {
          parts.push('', '## Support Resources', distress.message);
          for (const r of distress.resources) {
            parts.push(`- **${r.name}**: ${r.description} (${r.contact})`);
          }
        }

        // Emotional baseline tone adaptation
        const toneGuidance = getToneGuidanceFromInput(input);
        if (toneGuidance) {
          parts.push(toneGuidance);
        }

        return parts.join('\n');
      }

      if (agentName === 'strategist') {
        const parts = [
          'Design a comprehensive negotiation strategy and build the full preparation package.',
          '',
          'Follow this workflow exactly:',
          '1. Call design_strategy to create the overall negotiation approach',
          '2. Call write_talking_points to generate evidence-backed talking points',
          '3. Call simulate_scenario THREE times:',
          '   - scenario_type="initial_offer_response"',
          '   - scenario_type="counter_offer"',
          '   - scenario_type="final_negotiation"',
          '4. Call write_counter_response to create counter-offer templates',
          '5. Call assemble_negotiation_prep to produce the final report',
          '',
          'Do NOT skip any step or scenario type.',
        ];

        // If the user requested revisions at the strategy review gate, include feedback
        if (state.revision_feedback) {
          parts.push(
            '',
            '## User Revision Requested',
            `The user reviewed the negotiation strategy and requested the following changes: "${state.revision_feedback}"`,
            'Adjust your strategy, talking points, and scenarios to incorporate this feedback, then call assemble_negotiation_prep with the updated content.',
          );
        }

        // Emotional baseline tone adaptation
        const toneGuidance = getToneGuidanceFromInput(input);
        if (toneGuidance) {
          parts.push(toneGuidance);
        }

        return parts.join('\n');
      }

      return '';
    },

    finalizeResult: (state, _input, emit) => {
      emit({
        type: 'negotiation_complete',
        session_id: state.session_id,
        report: state.final_report ?? '',
        quality_score: state.quality_score ?? 0,
        scenarios: state.scenarios,
        talking_points: state.talking_points,
        market_research: state.market_research,
        leverage_points: state.leverage_points,
        negotiation_strategy: state.negotiation_strategy,
      });

      return {
        report: state.final_report,
        quality_score: state.quality_score,
        scenarios: state.scenarios,
        talking_points: state.talking_points,
        market_research: state.market_research,
        leverage_points: state.leverage_points,
        negotiation_strategy: state.negotiation_strategy,
      };
    },

    persistResult: async (state, result) => {
      const data = result as {
        report: string;
        quality_score: number;
        market_research: unknown;
        scenarios: unknown;
        talking_points: unknown;
      };

      try {
        await supabaseAdmin
          .from('salary_negotiation_reports')
          .insert({
            user_id: state.user_id,
            offer_company: state.offer_details.company,
            offer_role: state.offer_details.role,
            target_industry: state.target_context?.target_industry ?? '',
            report_markdown: data.report,
            quality_score: data.quality_score,
            market_research: data.market_research,
            leverage_points: state.leverage_points,
            scenarios: data.scenarios,
            talking_points: data.talking_points,
            negotiation_strategy: state.negotiation_strategy,
          });
      } catch (err) {
        logger.warn(
          { error: err instanceof Error ? err.message : String(err), userId: state.user_id },
          'Salary negotiation: failed to persist report (non-fatal)',
        );
      }
    },

    validateAfterAgent: (agentName, state) => {
      if (agentName === 'researcher') {
        if (!state.market_research) {
          throw new Error('Researcher did not produce market research');
        }
      }
      if (agentName === 'strategist') {
        if (!state.final_report) {
          throw new Error('Strategist did not produce a final report');
        }
      }
    },

    emitError: (stage, error, emit) => {
      emit({ type: 'pipeline_error', stage, error });
    },
  };
}
