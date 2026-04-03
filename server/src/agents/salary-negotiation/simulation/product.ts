/**
 * Negotiation Simulation Product — ProductConfig implementation.
 *
 * Single-agent pipeline (Employer only). Gate-based: the employer presents
 * a negotiation position once per round, pauses for the candidate to respond,
 * evaluates the response, and moves to the next round.
 *
 * Full mode:     4 rounds covering the complete negotiation arc
 * Practice mode: 3 rounds (initial offer, base pushback, final counter)
 *
 * Results are ephemeral — no DB persistence. The simulation_complete SSE
 * event carries the full summary to the frontend.
 */

import type { ProductConfig } from '../../runtime/product-config.js';
import { employerConfig } from './employer/agent.js';
import type { NegotiationSimulationState, NegotiationSimulationSSEEvent } from './types.js';

export type NegotiationSimulationMode = 'full' | 'practice';

export function createNegotiationSimulationProductConfig(): ProductConfig<
  NegotiationSimulationState,
  NegotiationSimulationSSEEvent
> {
  return {
    domain: 'negotiation-simulation',

    agents: [
      {
        name: 'employer',
        config: employerConfig,
        stageMessage: {
          startStage: 'simulation',
          start: 'Starting your negotiation simulation...',
          complete: 'Simulation complete — reviewing your performance',
        },
        onComplete: (scratchpad, state) => {
          if (Array.isArray(scratchpad.evaluations) && state.evaluations.length === 0) {
            state.evaluations = scratchpad.evaluations as NegotiationSimulationState['evaluations'];
          }
          if (Array.isArray(scratchpad.rounds_presented) && state.rounds_presented.length === 0) {
            state.rounds_presented = scratchpad.rounds_presented as NegotiationSimulationState['rounds_presented'];
          }
        },
      },
    ],

    createInitialState: (sessionId, userId, input) => {
      const mode: NegotiationSimulationMode =
        input.mode === 'practice' ? 'practice' : 'full';
      const maxRounds = mode === 'practice' ? 3 : 4;

      return {
        session_id: sessionId,
        user_id: userId,
        current_stage: 'simulation',
        max_rounds: maxRounds,
        rounds_presented: [],
        evaluations: [],
        current_round_index: 0,
        offer_context: {
          company: String(input.offer_company ?? ''),
          role: String(input.offer_role ?? ''),
          base_salary: input.offer_base_salary != null ? Number(input.offer_base_salary) : undefined,
          total_comp: input.offer_total_comp != null ? Number(input.offer_total_comp) : undefined,
          equity_details: input.offer_equity_details ? String(input.offer_equity_details) : undefined,
        },
        market_research: input.market_research as NegotiationSimulationState['market_research'],
        leverage_points: input.leverage_points as NegotiationSimulationState['leverage_points'],
        candidate_targets: input.candidate_targets as NegotiationSimulationState['candidate_targets'],
        platform_context: input.platform_context as NegotiationSimulationState['platform_context'],
        shared_context: input.shared_context as NegotiationSimulationState['shared_context'],
      };
    },

    buildAgentMessage: (agentName, state, input) => {
      if (agentName !== 'employer') return '';

      const mode = (input.mode === 'practice' ? 'practice' : 'full') as NegotiationSimulationMode;

      const parts: string[] = [];

      if (mode === 'full') {
        parts.push(
          `Conduct a full negotiation simulation with ${state.max_rounds} rounds. ` +
          `Cover the complete arc: initial offer, base pushback, equity/signing bonus leverage, and final counter.`,
          '',
          `For each round follow this exact sequence:`,
          `  generate_employer_position → present_position_to_user → evaluate_response`,
          '',
          `After all ${state.max_rounds} rounds are complete, call emit_transparency with ` +
          `a summary of overall performance (average score, round where the candidate was strongest). ` +
          `The system will generate the final summary automatically.`,
        );
      } else {
        parts.push(
          `Conduct a focused practice simulation with ${state.max_rounds} rounds.`,
          '',
          `Sequence:`,
          `  Round 1: generate_employer_position (type: initial_offer_delivery) → present_position_to_user → evaluate_response`,
          `  Round 2: generate_employer_position (type: pushback_base_cap) → present_position_to_user → evaluate_response`,
          `  Round 3: generate_employer_position (type: final_counter) → present_position_to_user → evaluate_response`,
          '',
          `Provide detailed evaluation feedback — this is a focused practice session so the candidate ` +
          `wants to understand exactly how to improve each response.`,
        );
      }

      // Offer context
      parts.push('', '## Offer Details');
      parts.push(`Company: ${state.offer_context.company}`);
      parts.push(`Role: ${state.offer_context.role}`);
      if (state.offer_context.base_salary != null) {
        parts.push(`Base Salary: $${state.offer_context.base_salary.toLocaleString()}`);
      }
      if (state.offer_context.total_comp != null) {
        parts.push(`Total Comp: $${state.offer_context.total_comp.toLocaleString()}`);
      }
      if (state.offer_context.equity_details) {
        parts.push(`Equity: ${state.offer_context.equity_details}`);
      }

      return parts.join('\n');
    },

    finalizeResult: (state, _input, emit) => {
      const evaluations = state.evaluations;
      const totalRounds = evaluations.length;

      let overallScore = 0;
      const allStrengths: string[] = [];
      const allImprovements: string[] = [];

      if (totalRounds > 0) {
        overallScore = Math.round(
          evaluations.reduce((sum, e) => sum + e.overall_score, 0) / totalRounds,
        );

        for (const e of evaluations) {
          for (const s of e.strengths) {
            if (!allStrengths.includes(s)) allStrengths.push(s);
          }
          for (const imp of e.improvements) {
            if (!allImprovements.includes(imp)) allImprovements.push(imp);
          }
        }
      }

      const excellentCount = evaluations.filter((e) => e.outcome === 'excellent').length;
      const goodCount = evaluations.filter((e) => e.outcome === 'good').length;

      let outcomeSummary: string;
      if (overallScore >= 85) {
        outcomeSummary = `${excellentCount} excellent, ${goodCount} good round${goodCount !== 1 ? 's' : ''} — strong negotiation posture throughout`;
      } else if (overallScore >= 65) {
        outcomeSummary = `${goodCount} solid round${goodCount !== 1 ? 's' : ''} with clear opportunities to sharpen`;
      } else {
        outcomeSummary = `Foundations in place — focused work on data-backed specificity will move the needle most`;
      }

      let coachingTakeaway: string;
      if (overallScore >= 85) {
        coachingTakeaway =
          'You negotiated with confidence and collaboration. In a real conversation, this approach ' +
          'would build goodwill while still advancing your interests. Focus on maintaining this ' +
          'calibration when the pressure is real.';
      } else if (overallScore >= 65) {
        coachingTakeaway =
          'Solid foundation. The biggest lift will come from leading with specific numbers and market ' +
          'data earlier in each response — vague asks are easy for employers to deflect. ' +
          'Practice saying the number out loud before the real conversation.';
      } else if (overallScore >= 45) {
        coachingTakeaway =
          'Work on two things before the real conversation: (1) always acknowledge what the employer ' +
          'said before countering — it keeps the tone collaborative, and (2) prepare 2-3 specific ' +
          'numbers you will say verbatim. Improvising numbers under pressure rarely goes well.';
      } else {
        coachingTakeaway =
          'The core gap is specificity. Vague responses ("I was hoping for more") give the employer ' +
          'nothing to work with and signal low preparation. Spend 30 minutes before the real ' +
          'conversation writing out exact phrases for each scenario. Then practice saying them aloud.';
      }

      const summary: NegotiationSimulationState['final_summary'] = {
        overall_score: overallScore,
        total_rounds: totalRounds,
        outcome_summary: outcomeSummary,
        strengths: allStrengths.slice(0, 4),
        areas_for_improvement: allImprovements.slice(0, 4),
        coaching_takeaway: coachingTakeaway,
      };

      state.final_summary = summary;

      emit({
        type: 'simulation_complete',
        session_id: state.session_id,
        summary,
      });

      return { summary, evaluations };
    },

    // No DB persistence — simulations are ephemeral
    persistResult: undefined,

    emitError: (stage, error, emit) => {
      emit({ type: 'pipeline_error', stage, error });
    },
  };
}
